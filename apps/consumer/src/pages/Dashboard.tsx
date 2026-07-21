import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import type { Case } from '@corexpert/core';

interface CaseListResponse {
  items: Case[];
  cursor: string | null;
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['cases'],
    queryFn: () => api.get<CaseListResponse>('/api/v1/cases'),
  });

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Assessments</h1>
        <Link to="/cases/new">
          <Button>Start New Assessment</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : !data?.items.length ? (
        <Card>
          <CardBody className="text-center py-12">
            <p className="text-gray-500 mb-4">No assessments yet</p>
            <Link to="/cases/new">
              <Button>Start Your First Assessment</Button>
            </Link>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.items.map((c) => (
            <Link key={c.caseId} to={`/cases/${c.caseId}/triage`}>
              <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                <CardBody>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900">{c.referenceNo}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {c.vehicle?.make} {c.vehicle?.model} {c.vehicle?.year ?? ''}
                        {c.vehicle?.registrationNo ? ` (${c.vehicle.registrationNo})` : ''}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Created {new Date(c.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  {c.triageResult && (
                    <p className="text-sm text-gray-600 mt-3">
                      Estimated cost: {'\u00A3'}{(c.triageResult.totalEstimatedCost / 100).toFixed(2)}
                    </p>
                  )}
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
