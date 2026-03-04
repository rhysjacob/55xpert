import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import type { TriageResult, DamagePanel } from '@corexpert/core';

interface CaseData {
  caseId: string;
  referenceNo: string;
  status: string;
  vehicle?: { registrationNo: string; make: string; model: string; year: number; colour: string };
  images: { imageType: string; s3Key: string }[];
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

  const { data, isLoading, error } = useQuery({
    queryKey: ['xpert-case', caseId],
    queryFn: () => api.get<CaseData>(`/api/v1/xpert/cases/${caseId}`),
    enabled: !!caseId,
  });

  const reviewMutation = useMutation({
    mutationFn: (payload: { decision: string; notes: string }) =>
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
        <p className="text-gray-500 mb-6">
          {data.vehicle?.year} {data.vehicle?.make} {data.vehicle?.model} ({data.vehicle?.colour})
        </p>

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
                      <div className="bg-gray-100 rounded h-40 flex items-center justify-center text-sm text-gray-400">
                        Image: {img.s3Key.split('/').pop()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Right: Triage results + review form */}
          <div className="space-y-6">
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
                      <p className="font-bold">{triage.totalLabourHours.toFixed(1)}h</p>
                      <p className="text-xs text-gray-500">Labour</p>
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
                          <span>{formatPence(panel.subtotal)}</span>
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
                    onClick={() => reviewMutation.mutate({ decision, notes })}
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
