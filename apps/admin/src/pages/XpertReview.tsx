import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { quoteFromPanels, getActiveScheme } from '@corexpert/core';

// Active warranty scheme, selected at build time (must match the API's WARRANTY_SCHEME).
const scheme = getActiveScheme(import.meta.env['VITE_WARRANTY_SCHEME']);
import type { TriageResult, DamagePanel, FraudAssessment } from '@corexpert/core';

const FRAUD_BAND_STYLE: Record<'MEDIUM' | 'HIGH', string> = {
  MEDIUM: 'border-amber-300 bg-amber-50',
  HIGH: 'border-red-300 bg-red-50',
};
const FRAUD_PILL_STYLE: Record<'MEDIUM' | 'HIGH', string> = {
  MEDIUM: 'bg-amber-500 text-white',
  HIGH: 'bg-red-600 text-white',
};

/** Fraud-risk badge + itemised reasons shown when the case is flagged. */
function FraudPanel({ assessment }: { assessment: FraudAssessment }) {
  const band = assessment.band as 'MEDIUM' | 'HIGH';

  // The same signal can fire once per image (e.g. all 4 photos predate the
  // incident). Group by reason code so the Xpert sees one line per signal, with
  // the affected images listed once.
  const grouped = Object.values(
    assessment.reasons.reduce<Record<string, { detail: string; images: string[] }>>((acc, r) => {
      const g = (acc[r.code] ??= { detail: r.detail, images: [] });
      if (r.imageType) g.images.push(r.imageType.replace(/_/g, ' ').toLowerCase());
      return acc;
    }, {}),
  );

  return (
    <Card className={`border-2 ${FRAUD_BAND_STYLE[band]}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">⚠ Fraud risk</h2>
          <span className={`text-xs font-bold px-2 py-1 rounded ${FRAUD_PILL_STYLE[band]}`}>
            {band} · {assessment.score}/100
          </span>
        </div>
      </CardHeader>
      <CardBody>
        <p className="text-sm text-gray-700 mb-3">
          This case was flagged and referred for review. Signals are indicative, not proof —
          use them to guide your assessment.
        </p>
        <ul className="space-y-1.5">
          {grouped.map((g, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-gray-400">•</span>
              <span>
                {g.detail}
                {g.images.length > 0 && (
                  <span className="text-gray-500"> ({g.images.join(', ')})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        {assessment.notRun.length > 0 && (
          <p className="text-xs text-gray-500 mt-3">
            Checks that couldn't run: {assessment.notRun.map((c) => c.replace(/_/g, ' ').toLowerCase()).join(', ')}.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

interface CaseData {
  caseId: string;
  referenceNo: string;
  status: string;
  vehicle?: { registrationNo: string; make: string; model: string; year: number; colour: string };
  images: { imageType: string; s3Key: string; url?: string }[];
  triageResult?: TriageResult;
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

export function XpertReviewPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const [decision, setDecision] = useState<'APPROVED' | 'ADJUSTED' | 'REJECTED'>('APPROVED');
  const [notes, setNotes] = useState('');
  const [pricePounds, setPricePounds] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['xpert-case', caseId],
    queryFn: () => api.get<CaseData>(`/api/v1/xpert/cases/${caseId}`),
    enabled: !!caseId,
  });

  // Matrix suggestion from the current panels — the Xpert can accept or override.
  const matrixSuggestionPence = data?.triageResult
    ? quoteFromPanels(data.triageResult.panels.map((p) => ({ panelName: p.panelName })), scheme.matrix).total
    : 0;

  // Prefill the price with the matrix suggestion once the case loads.
  useEffect(() => {
    if (data?.triageResult) setPricePounds((matrixSuggestionPence / 100).toFixed(2));
  }, [data, matrixSuggestionPence]);

  const reviewMutation = useMutation({
    mutationFn: (payload: { decision: string; notes: string; overrideCost?: number }) =>
      api.post(`/api/v1/xpert/cases/${caseId}/review`, payload),
    onSuccess: () => navigate('/xpert/queue'),
  });

  if (isLoading) {
    return <Layout><div className="text-center py-12 text-gray-500">Loading case...</div></Layout>;
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="text-center py-12 text-red-500">
          {error instanceof Error ? error.message : 'Case not found'}
        </div>
      </Layout>
    );
  }

  const triage = data.triageResult;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Xpert Review: {data.referenceNo}</h1>
        {(() => {
          const v = data.vehicle;
          const main = [v?.year, v?.make, v?.model].filter(Boolean).join(' ');
          const colour = v?.colour;
          const label = colour ? (main ? `${main} (${colour})` : colour) : main;
          return label ? <p className="text-gray-500 mb-6">{label}</p> : null;
        })()}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Images */}
          <Card>
            <CardHeader><h2 className="font-semibold">Damage Images</h2></CardHeader>
            <CardBody>
              {data.images.length === 0 ? (
                <p className="text-sm text-gray-500">No images available</p>
              ) : (
                <div className="space-y-3">
                  {data.images.map((img, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-2">
                      <p className="text-xs text-gray-500 mb-1">
                        {img.imageType.replace(/_/g, ' ')}
                      </p>
                      {img.url ? (
                        <img
                          src={img.url}
                          alt={img.imageType.replace(/_/g, ' ')}
                          className="rounded w-full max-h-80 object-contain bg-gray-100"
                        />
                      ) : (
                        <div className="bg-gray-100 rounded h-40 flex items-center justify-center text-sm text-gray-400">
                          Image unavailable: {img.s3Key.split('/').pop()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Right: Triage results + review form */}
          <div className="space-y-6">
            {triage?.fraudAssessment && triage.fraudAssessment.band !== 'LOW' && (
              <FraudPanel assessment={triage.fraudAssessment} />
            )}

            {triage && (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <h2 className="font-semibold">AI Triage Result</h2>
                    <span className="text-lg font-bold">{formatPence(triage.totalEstimatedCost)}</span>
                  </div>
                </CardHeader>
                <CardBody>
                  <div className="grid grid-cols-3 gap-3 text-center text-sm mb-4">
                    <div>
                      <p className="font-bold">{triage.overallConfidence}</p>
                      <p className="text-xs text-gray-500">Confidence</p>
                    </div>
                    <div>
                      <p className="font-bold">{triage.panels.length}</p>
                      <p className="text-xs text-gray-500">Panels</p>
                    </div>
                    <div>
                      <p className="font-bold">{triage.eligibility?.verdict ?? '—'}</p>
                      <p className="text-xs text-gray-500">Eligibility</p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-700 mb-4">{triage.summary}</p>

                  <div className="space-y-2">
                    {triage.panels.map((panel: DamagePanel, i: number) => (
                      <div key={i} className="border border-gray-100 rounded p-2 text-xs">
                        <div className="flex justify-between">
                          <span className="font-medium">
                            {panel.panelName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                          {panel.sizeEstimateCm !== undefined && (
                            <span className="text-gray-500">~{panel.sizeEstimateCm}cm</span>
                          )}
                        </div>
                        <div className="text-gray-500">
                          {panel.damageType.replace(/_/g, ' ')} | {panel.severity} | {panel.repairMethod.replace(/_/g, ' ')} | {Math.round(panel.confidenceScore * 100)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            )}

            <Card>
              <CardHeader><h2 className="font-semibold">Your Review</h2></CardHeader>
              <CardBody>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Decision</label>
                    <div className="flex gap-2">
                      {(['APPROVED', 'ADJUSTED', 'REJECTED'] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDecision(d)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                            decision === d
                              ? d === 'APPROVED'
                                ? 'bg-green-100 border-green-300 text-green-700'
                                : d === 'ADJUSTED'
                                ? 'bg-yellow-100 border-yellow-300 text-yellow-700'
                                : 'bg-red-100 border-red-300 text-red-700'
                              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  {decision !== 'REJECTED' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Price (£)
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">£</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={pricePounds}
                          onChange={(e) => setPricePounds(e.target.value)}
                          className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => setPricePounds((matrixSuggestionPence / 100).toFixed(2))}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          Reset to matrix
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Matrix suggestion: {formatPence(matrixSuggestionPence)} (inc VAT). Override as needed.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Add review notes..."
                    />
                  </div>

                  {reviewMutation.isError && (
                    <p className="text-sm text-red-600">
                      {reviewMutation.error instanceof Error ? reviewMutation.error.message : 'Review failed'}
                    </p>
                  )}

                  <Button
                    loading={reviewMutation.isPending}
                    onClick={() =>
                      reviewMutation.mutate({
                        decision,
                        notes,
                        ...(decision !== 'REJECTED'
                          ? { overrideCost: Math.round(parseFloat(pricePounds || '0') * 100) }
                          : {}),
                      })
                    }
                    className="w-full"
                  >
                    Submit Review
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
