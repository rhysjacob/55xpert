import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import type { TriageResult, DamagePanel, TriageConfidence } from '@corexpert/core';

interface TriageResponse {
  caseId: string;
  referenceNo: string;
  status: string;
  vehicle?: { make?: string; model?: string; year?: number };
  triageResult: TriageResult | null;
}

const CONFIDENCE_COLORS: Record<TriageConfidence, string> = {
  HIGH: 'text-green-600',
  MEDIUM: 'text-yellow-600',
  LOW: 'text-red-600',
};

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
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
        <span className="text-sm font-medium text-gray-900">{formatPence(panel.subtotal)}</span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="bg-gray-100 px-2 py-1 rounded">{panel.damageType.replace(/_/g, ' ')}</span>
        <span className="bg-gray-100 px-2 py-1 rounded">{panel.severity}</span>
        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
          {panel.repairMethod.replace(/_/g, ' ')}
        </span>
        <span className={`px-2 py-1 rounded ${
          panel.confidenceScore >= 0.8 ? 'bg-green-100 text-green-700' :
          panel.confidenceScore >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {Math.round(panel.confidenceScore * 100)}% confidence
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-500">
        <span>Labour: {formatPence(panel.labourCost)} ({panel.labourHours}h)</span>
        <span>Parts: {formatPence(panel.partsCost)}</span>
        <span>Paint: {formatPence(panel.paintCost)}</span>
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
        <div className="text-center py-12 text-gray-500">Loading triage results...</div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="text-center py-12 text-red-500">
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
          <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <h1 className="text-xl font-semibold text-gray-900">Analysing your photos</h1>
          <p className="mt-2 text-gray-500">
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
          <h1 className="text-xl font-semibold text-gray-900">Assessment failed</h1>
          <p className="mt-2 text-gray-500">
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
            <h1 className="text-2xl font-bold text-gray-900">Assessment Results</h1>
            <p className="text-gray-500 mt-1">
              {data.referenceNo} | {data.vehicle?.make} {data.vehicle?.model}
            </p>
          </div>
          <StatusBadge status={data.status} />
        </div>

        {/* Summary card */}
        <Card className="mb-6">
          <CardBody>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatPence(triageResult.totalEstimatedCost)}
                </p>
                <p className="text-xs text-gray-500">Total estimated cost</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {triageResult.panels.length}
                </p>
                <p className="text-xs text-gray-500">Panels affected</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${CONFIDENCE_COLORS[triageResult.overallConfidence]}`}>
                  {triageResult.overallConfidence}
                </p>
                <p className="text-xs text-gray-500">AI confidence</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {triageResult.totalLabourHours.toFixed(1)}h
                </p>
                <p className="text-xs text-gray-500">Labour hours</p>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* AI summary */}
        <Card className="mb-6">
          <CardHeader><h2 className="font-semibold">AI Summary</h2></CardHeader>
          <CardBody>
            <p className="text-gray-700">{triageResult.summary}</p>
            {triageResult.requiresXpertReview && (
              <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  This assessment has been flagged for expert review. An Xpert will verify the results.
                </p>
              </div>
            )}
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

        {/* Actions */}
        {(data.status === 'TRIAGE_COMPLETE') && (
          <div className="flex justify-center gap-4">
            <Link to="/">
              <Button variant="secondary">Back to Dashboard</Button>
            </Link>
            <Link to={`/cases/${caseId}/publish`}>
              <Button>Publish to Repair Xchange</Button>
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
