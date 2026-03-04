import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import type { TriageResult, DamagePanel } from '@corexpert/core';

interface CaseData {
  caseId: string;
  referenceNo: string;
  status: string;
  userId: string;
  postcode: string;
  incidentDate: string;
  incidentNotes: string;
  vehicle?: { registrationNo: string; make: string; model: string; year: number; colour: string };
  images: { imageType: string; s3Key: string }[];
  triageResult?: TriageResult;
  xpertReviews?: { reviewId: string; decision: string; notes: string; reviewedAt: string }[];
  createdAt: string;
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

function PanelRow({ panel }: { panel: DamagePanel }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex justify-between items-start mb-1">
        <p className="font-medium text-gray-900">
          {panel.panelName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </p>
        <span className="text-sm font-medium">{formatPence(panel.subtotal)}</span>
      </div>
      <p className="text-sm text-gray-500 mb-2">{panel.description}</p>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="bg-gray-100 px-2 py-0.5 rounded">{panel.damageType.replace(/_/g, ' ')}</span>
        <span className="bg-gray-100 px-2 py-0.5 rounded">{panel.severity}</span>
        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
          {panel.repairMethod.replace(/_/g, ' ')}
        </span>
        <span className={`px-2 py-0.5 rounded ${
          panel.confidenceScore >= 0.8 ? 'bg-green-100 text-green-700' :
          panel.confidenceScore >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {Math.round(panel.confidenceScore * 100)}%
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

export function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-case', caseId],
    queryFn: () => api.get<CaseData>(`/api/v1/cases/${caseId}`),
    enabled: !!caseId,
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

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{data.referenceNo}</h1>
            <p className="text-gray-500">Case ID: {data.caseId}</p>
          </div>
          <StatusBadge status={data.status} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader><h2 className="font-semibold">Vehicle</h2></CardHeader>
            <CardBody>
              {data.vehicle ? (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">Reg:</span> {data.vehicle.registrationNo}</div>
                  <div><span className="text-gray-500">Make:</span> {data.vehicle.make}</div>
                  <div><span className="text-gray-500">Model:</span> {data.vehicle.model}</div>
                  <div><span className="text-gray-500">Year:</span> {data.vehicle.year}</div>
                  <div><span className="text-gray-500">Colour:</span> {data.vehicle.colour}</div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No vehicle data</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><h2 className="font-semibold">Incident</h2></CardHeader>
            <CardBody>
              <div className="space-y-2 text-sm">
                <div><span className="text-gray-500">Postcode:</span> {data.postcode ?? '-'}</div>
                <div><span className="text-gray-500">Date:</span> {data.incidentDate ?? '-'}</div>
                <div><span className="text-gray-500">Notes:</span> {data.incidentNotes ?? '-'}</div>
                <div><span className="text-gray-500">Images:</span> {data.images?.length ?? 0} uploaded</div>
                <div><span className="text-gray-500">Created:</span> {new Date(data.createdAt).toLocaleString()}</div>
              </div>
            </CardBody>
          </Card>
        </div>

        {data.triageResult && (
          <>
            <Card className="mb-6">
              <CardHeader><h2 className="font-semibold">Triage Summary</h2></CardHeader>
              <CardBody>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-4">
                  <div>
                    <p className="text-xl font-bold">{formatPence(data.triageResult.totalEstimatedCost)}</p>
                    <p className="text-xs text-gray-500">Total cost</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold">{data.triageResult.panels.length}</p>
                    <p className="text-xs text-gray-500">Panels</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold">{data.triageResult.overallConfidence}</p>
                    <p className="text-xs text-gray-500">Confidence</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold">{data.triageResult.totalLabourHours.toFixed(1)}h</p>
                    <p className="text-xs text-gray-500">Labour</p>
                  </div>
                </div>
                <p className="text-sm text-gray-700">{data.triageResult.summary}</p>
                {data.triageResult.requiresXpertReview && (
                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded p-2 text-sm text-yellow-800">
                    Flagged for Xpert review
                  </div>
                )}
              </CardBody>
            </Card>

            <Card className="mb-6">
              <CardHeader><h2 className="font-semibold">Panel Breakdown</h2></CardHeader>
              <CardBody className="space-y-3">
                {data.triageResult.panels.map((panel, i) => (
                  <PanelRow key={i} panel={panel} />
                ))}
              </CardBody>
            </Card>
          </>
        )}

        {data.xpertReviews && data.xpertReviews.length > 0 && (
          <Card className="mb-6">
            <CardHeader><h2 className="font-semibold">Xpert Reviews</h2></CardHeader>
            <CardBody className="space-y-3">
              {data.xpertReviews.map((review) => (
                <div key={review.reviewId} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <StatusBadge status={review.decision} />
                    <span className="text-xs text-gray-500">
                      {new Date(review.reviewedAt).toLocaleString()}
                    </span>
                  </div>
                  {review.notes && <p className="text-sm text-gray-600 mt-1">{review.notes}</p>}
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </div>
    </Layout>
  );
}
