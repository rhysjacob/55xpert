import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';

interface Job {
  jobId: string;
  status: string;
  vehicleSummary: { make: string; model: string; year: number };
  damageSummary: string;
  indicativeCost: number;
  acceptedAt?: string;
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

export function MyJobsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-jobs'],
    queryFn: () => api.get<{ items: Job[] }>('/api/v1/repairer/jobs'),
  });

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Jobs</h1>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : !data?.items.length ? (
        <Card>
          <CardBody>
            <p className="text-center text-gray-500 py-8">
              You haven't accepted any jobs yet.{' '}
              <Link to="/jobs" className="text-emerald-600 hover:underline">
                Browse available jobs
              </Link>
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.items.map((job) => (
            <Link key={job.jobId} to={`/jobs/${job.jobId}/details`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardBody>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {job.vehicleSummary.year} {job.vehicleSummary.make} {job.vehicleSummary.model}
                      </h3>
                      <p className="text-sm text-gray-500">{job.damageSummary}</p>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={job.status} />
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {formatPence(job.indicativeCost)}
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
