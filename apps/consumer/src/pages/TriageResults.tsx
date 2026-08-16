import { useParams, Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { humanize, compareImageSlot, imageTypeLabel } from '@corexpert/core';
import { HeadingMotif } from '../branding/BrandMotif';
import { useBrand } from '../branding/useBrand';
import type { TriageResult, DamagePanel, TriageConfidence } from '@corexpert/core';

interface TriageResponse {
  caseId: string;
  referenceNo: string;
  status: string;
  warrantyCompanyId?: string;
  vehicle?: { make?: string; model?: string; year?: number };
  triageResult: TriageResult | null;
  siteAllocationRequestedAt?: string;
  images?: { imageType: string; url: string }[];
}

const CONFIDENCE_COLORS: Record<TriageConfidence, string> = {
  HIGH: 'text-green-600',
  MEDIUM: 'text-yellow-600',
  LOW: 'text-red-600',
};

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

/**
 * What a referred case says to the consumer.
 *
 * The neutral default is a status: an Xpert is looking at it. A warranty company
 * that handles referrals in its own network instead gets its own wording plus a
 * hand-off it can act on — offered only when the case actually belongs to that
 * company, since a user can open any portal but a case has one tenant.
 */
function ReferralNotice({
  caseId,
  warrantyCompanyId,
  requestedAt,
}: {
  caseId: string;
  warrantyCompanyId?: string;
  requestedAt?: string;
}) {
  const brand = useBrand();
  const queryClient = useQueryClient();

  const requestAllocation = useMutation({
    mutationFn: () => api.post(`/api/v1/cases/${caseId}/site-allocation`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['triage', caseId] }),
  });

  const tenantMatches =
    brand.warrantyCompanyId !== undefined && brand.warrantyCompanyId === warrantyCompanyId;
  if (!brand.referral || !tenantMatches) {
    return (
      <>
        <p className="font-semibold text-yellow-800">Sent to an Xpert for review</p>
        <p className="text-sm text-yellow-700 mt-1">
          We need a specialist to confirm this one before quoting. Reasons:
        </p>
      </>
    );
  }

  if (requestedAt) {
    return (
      <>
        <p className="font-semibold text-yellow-800">{brand.referral.requestedTitle}</p>
        <p className="text-sm text-yellow-700 mt-1">{brand.referral.requestedDetail}</p>
        <p className="text-sm text-yellow-700 mt-2">Why this was referred:</p>
      </>
    );
  }

  return (
    <>
      <p className="font-semibold text-yellow-800">
        {brand.referral.before}
        <button
          type="button"
          onClick={() => requestAllocation.mutate()}
          disabled={requestAllocation.isPending}
          className="underline underline-offset-2 hover:no-underline disabled:no-underline disabled:opacity-60"
        >
          {requestAllocation.isPending ? 'Sending…' : brand.referral.linkText}
        </button>
        {brand.referral.after}
      </p>
      {requestAllocation.isError && (
        <p className="text-sm text-red-700 mt-1">
          {requestAllocation.error instanceof Error
            ? requestAllocation.error.message
            : "That didn't go through. Please try again."}
        </p>
      )}
      <p className="text-sm text-yellow-700 mt-2">Why this was referred:</p>
    </>
  );
}

/**
 * What a published case says to the consumer.
 *
 * The default names the marketplace, because for a consumer-submitted case that
 * is genuinely what happened — the job went out to the network. A warranty
 * company whose own repairers take the work describes it in its own terms, and
 * "The Repair Xchange" is a name their customer has no reason to have heard of.
 * Tenant-gated like the referral copy, for the same reason.
 */
function PublishedNotice({ warrantyCompanyId }: { warrantyCompanyId?: string }) {
  const brand = useBrand();
  const tenantMatches =
    brand.warrantyCompanyId !== undefined && brand.warrantyCompanyId === warrantyCompanyId;

  return (
    <p className="text-center text-on-app-success font-medium">
      {brand.publishedNotice && tenantMatches
        ? brand.publishedNotice
        : 'Automatically published to The Repair Xchange — repairers can now see this job.'}
    </p>
  );
}

function PanelRow({ panel }: { panel: DamagePanel }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-medium text-gray-900">
            {panel.panelName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </p>
          <p className="text-sm text-gray-500">{panel.description}</p>
        </div>
        {panel.sizeEstimateCm !== undefined && (
          <span className="text-sm text-gray-500">~{panel.sizeEstimateCm}cm</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="bg-gray-100 px-2 py-1 rounded">{humanize(panel.damageType)}</span>
        <span className="bg-gray-100 px-2 py-1 rounded">{humanize(panel.severity)}</span>
        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
          {humanize(panel.repairMethod)}
        </span>
        <span className={`px-2 py-1 rounded ${
          panel.confidenceScore >= 0.8 ? 'bg-green-100 text-green-700' :
          panel.confidenceScore >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {Math.round(panel.confidenceScore * 100)}% confidence
        </span>
      </div>
    </div>
  );
}

export function TriageResultsPage() {
  const { caseId } = useParams<{ caseId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['triage', caseId],
    queryFn: () => api.get<TriageResponse>(`/api/v1/cases/${caseId}/triage`),
    enabled: !!caseId,
    // The AI assessment runs asynchronously; poll until it completes or fails.
    refetchInterval: (query) =>
      query.state.data?.status === 'TRIAGE_PENDING' ? 3000 : false,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="text-center py-12 text-on-app-muted">Loading triage results...</div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="text-center py-12 text-on-app-danger">
          {error instanceof Error ? error.message : 'Failed to load results'}
        </div>
      </Layout>
    );
  }

  // Assessment still running — keep the user informed while the query polls.
  if (data.status === 'TRIAGE_PENDING' || !data.triageResult) {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center py-16">
          <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 spinner-track border-t-brand" />
          <h1 className="text-xl font-semibold text-on-app">Analysing your photos</h1>
          <p className="mt-2 text-on-app-muted">
            Our AI is assessing the damage and estimating repair costs. This usually
            takes under a minute &mdash; the results will appear here automatically.
          </p>
        </div>
      </Layout>
    );
  }

  if (data.status === 'TRIAGE_FAILED') {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center py-16">
          <h1 className="text-xl font-semibold text-on-app">Assessment failed</h1>
          <p className="mt-2 text-on-app-muted">
            Something went wrong while analysing your photos. Please try submitting
            the case for assessment again.
          </p>
          <Link to="/" className="mt-6 inline-block">
            <Button variant="secondary">Back to Dashboard</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const { triageResult } = data;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold text-on-app">
              <HeadingMotif />
              Assessment Results
            </h1>
            <p className="text-on-app-muted mt-1">
              {data.referenceNo} | {data.vehicle?.make} {data.vehicle?.model}
            </p>
          </div>
          <StatusBadge status={data.status} />
        </div>

        {/* Eligibility verdict banners */}
        {triageResult.eligibility?.verdict === 'INELIGIBLE' && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="font-semibold text-red-800">We're unable to take on this repair</p>
            <p className="text-sm text-red-700 mt-1">
              This damage falls outside what we repair, so no price has been generated. Reasons:
            </p>
            <ul className="mt-2 list-disc list-inside text-sm text-red-700 space-y-1">
              {triageResult.eligibility.reasons
                .filter((r) => r.verdict === 'INELIGIBLE')
                .map((r, i) => <li key={i}>{r.detail}</li>)}
            </ul>
          </div>
        )}
        {triageResult.eligibility?.verdict === 'REFER' && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <ReferralNotice
              caseId={data.caseId}
              warrantyCompanyId={data.warrantyCompanyId}
              requestedAt={data.siteAllocationRequestedAt}
            />
            <ul className="mt-2 list-disc list-inside text-sm text-yellow-700 space-y-1">
              {triageResult.eligibility.reasons
                .filter((r) => r.verdict === 'REFER')
                .map((r, i) => <li key={i}>{r.detail}</li>)}
            </ul>
          </div>
        )}

        {/* Summary card */}
        <Card className="mb-6">
          <CardBody>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {triageResult.eligibility?.verdict === 'ELIGIBLE'
                    ? formatPence(triageResult.totalEstimatedCost)
                    : '—'}
                </p>
                <p className="text-xs text-gray-500">
                  {triageResult.eligibility?.verdict === 'ELIGIBLE' ? 'Fixed matrix price (inc VAT)' : 'No price'}
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {new Set(triageResult.panels.map((p) => p.panelName)).size}
                </p>
                <p className="text-xs text-gray-500">Panels affected</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${CONFIDENCE_COLORS[triageResult.overallConfidence]}`}>
                  {triageResult.overallConfidence}
                </p>
                <p className="text-xs text-gray-500">AI confidence</p>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Matrix price breakdown */}
        {triageResult.eligibility?.verdict === 'ELIGIBLE' && triageResult.priceLineItems && (
          <Card className="mb-6">
            <CardHeader><h2 className="font-semibold">Price Breakdown (matrix, ex VAT)</h2></CardHeader>
            <CardBody className="space-y-1">
              {triageResult.priceLineItems.map((li, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-600">{li.label}</span>
                  <span className="font-medium">{formatPence(li.amount)}</span>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {/* Damage photos */}
        {data.images && data.images.length > 0 && (
          <Card className="mb-6">
            <CardHeader><h2 className="font-semibold">Your Photos</h2></CardHeader>
            <CardBody>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[...data.images]
                  .sort((a, b) => compareImageSlot(a.imageType, b.imageType))
                  .map((img, i) => (
                    <div key={i}>
                      <img
                        src={img.url}
                        alt={imageTypeLabel(img.imageType)}
                        className="rounded-lg w-full h-40 object-cover bg-gray-100"
                      />
                      <p className="text-xs text-gray-500 mt-1">{imageTypeLabel(img.imageType)}</p>
                    </div>
                  ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* AI summary */}
        <Card className="mb-6">
          <CardHeader><h2 className="font-semibold">AI Summary</h2></CardHeader>
          <CardBody>
            <p className="text-gray-700">{triageResult.summary}</p>
          </CardBody>
        </Card>

        {/* Panel breakdown */}
        <Card className="mb-6">
          <CardHeader><h2 className="font-semibold">Damage Breakdown</h2></CardHeader>
          <CardBody className="space-y-3">
            {triageResult.panels.map((panel, i) => (
              <PanelRow key={i} panel={panel} />
            ))}
          </CardBody>
        </Card>

        {/* Outcome is automatic — no publish action for the consumer. */}
        <div className="flex flex-col items-center gap-3">
          {data.status === 'PUBLISHED' && (
            <PublishedNotice warrantyCompanyId={data.warrantyCompanyId} />
          )}
          <Link to="/">
            <Button variant="secondary">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
