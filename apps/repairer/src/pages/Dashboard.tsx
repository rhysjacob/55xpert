import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';

interface Job {
  jobId: string;
  vehicleSummary: { make: string; model: string; year: number };
  damageSummary: string;
  indicativeCost: number;
  status: string;
  publishedAt: string;
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

export function DashboardPage() {
  const { data: myJobs } = useQuery({
    queryKey: ['my-jobs'],
    queryFn: () => api.get<{ items: Job[] }>('/api/v1/repairer/jobs'),
  });

  const { data: openJobs } = useQuery({
    queryKey: ['open-jobs'],
    queryFn: () => api.get<{ items: Job[] }>('/api/v1/jobs?limit=5'),
  });

  const activeCount = myJobs?.items.filter((j) => j.status === 'ACCEPTED').length ?? 0;
  const completedCount = myJobs?.items.filter((j) => j.status === 'COMPLETED').length ?? 0;

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardBody>
            <p className="text-3xl font-bold text-emerald-600">{activeCount}</p>
            <p className="text-sm text-gray-500">Active jobs</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-3xl font-bold text-gray-900">{completedCount}</p>
            <p className="text-sm text-gray-500">Completed jobs</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-3xl font-bold text-blue-600">{openJobs?.items.length ?? 0}</p>
            <p className="text-sm text-gray-500">Available jobs</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Latest Available Jobs</h2>
              <Link to="/jobs">
                <Button variant="ghost" size="sm">View all</Button>
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            {!openJobs?.items.length ? (
              <p className="text-sm text-gray-500">No jobs available right now.</p>
            ) : (
              <div className="space-y-3">
                {openJobs.items.slice(0, 5).map((job) => (
                  <Link
                    key={job.jobId}
                    to={`/jobs/${job.jobId}`}
                    className="block border border-gray-200 rounded-lg p-3 hover:bg-gray-50"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900">
                          {job.vehicleSummary.make} {job.vehicleSummary.model}
                        </p>
                        <p className="text-sm text-gray-500">{job.damageSummary}</p>
                      </div>
                      <span className="text-sm font-medium text-emerald-600">
                        {formatPence(job.indicativeCost)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">My Active Jobs</h2>
              <Link to="/my-jobs">
                <Button variant="ghost" size="sm">View all</Button>
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            {!myJobs?.items.filter((j) => j.status === 'ACCEPTED').length ? (
              <p className="text-sm text-gray-500">No active jobs.</p>
            ) : (
              <div className="space-y-3">
                {myJobs.items
                  .filter((j) => j.status === 'ACCEPTED')
                  .slice(0, 5)
                  .map((job) => (
                    <Link
                      key={job.jobId}
                      to={`/jobs/${job.jobId}/details`}
                      className="block border border-gray-200 rounded-lg p-3 hover:bg-gray-50"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900">
                            {job.vehicleSummary.make} {job.vehicleSummary.model}
                          </p>
                          <p className="text-sm text-gray-500">{job.damageSummary}</p>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>
                    </Link>
                  ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
