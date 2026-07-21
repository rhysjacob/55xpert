import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';

interface XpertCase {
  caseId: string;
  referenceNo: string;
  status: string;
  vehicle?: { make?: string; model?: string; year?: number };
  triageResult?: {
    overallConfidence: string;
    totalEstimatedCost: number;
    panels: { panelName: string }[];
    fraudAssessment?: { band: 'LOW' | 'MEDIUM' | 'HIGH'; score: number };
  };
  createdAt: string;
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

export function XpertQueuePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['xpert-cases'],
    queryFn: () => api.get<{ items: XpertCase[] }>('/api/v1/xpert/cases'),
  });

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Xpert Review Queue</h1>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : !data?.items.length ? (
        <Card>
          <CardBody>
            <p className="text-center text-gray-500 py-8">No cases awaiting review.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.items.map((c) => (
            <Link key={c.caseId} to={`/xpert/cases/${c.caseId}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardBody>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-gray-900">{c.referenceNo}</h3>
                        <StatusBadge status={c.status} />
                        {c.triageResult?.fraudAssessment &&
                          c.triageResult.fraudAssessment.band !== 'LOW' && (
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded ${
                                c.triageResult.fraudAssessment.band === 'HIGH'
                                  ? 'bg-red-600 text-white'
                                  : 'bg-amber-500 text-white'
                              }`}
                            >
                              ⚠ Fraud {c.triageResult.fraudAssessment.band}
                            </span>
                          )}
                      </div>
                      <p className="text-sm text-gray-600">
                        {c.vehicle ? `${c.vehicle.year} ${c.vehicle.make} ${c.vehicle.model}` : 'No vehicle'}
                      </p>
                      {c.triageResult && (
                        <p className="text-xs text-gray-500 mt-1">
                          {c.triageResult.panels.length} panels | Confidence: {c.triageResult.overallConfidence}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {c.triageResult && (
                        <p className="font-bold text-gray-900">
                          {formatPence(c.triageResult.totalEstimatedCost)}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
