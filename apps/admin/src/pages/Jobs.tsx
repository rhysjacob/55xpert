import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';

interface Job {
  jobId: string;
  caseId: string;
  status: string;
  vehicleSummary: { make: string; model: string; year: number };
  indicativeCost: number;
  introductionFee: number;
  publishedAt: string;
  acceptance?: { repairerId: string; acceptedAt: string };
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

export function JobsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-jobs'],
    queryFn: () => api.get<{ items: Job[] }>('/api/v1/admin/jobs'),
  });

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">All Jobs</h1>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : !data?.items.length ? (
        <Card>
          <CardBody>
            <p className="text-center text-gray-500 py-8">No jobs found.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Job ID</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Vehicle</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Cost</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Fee</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Published</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Accepted</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((job) => (
                <tr key={job.jobId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-gray-700 font-mono text-xs">
                    {job.jobId.slice(0, 8)}...
                  </td>
                  <td className="py-3 px-4 text-gray-700">
                    {job.vehicleSummary.make} {job.vehicleSummary.model}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {formatPence(job.indicativeCost)}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {formatPence(job.introductionFee)}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-500">
                    {new Date(job.publishedAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-500">
                    {job.acceptance?.acceptedAt
                      ? new Date(job.acceptance.acceptedAt).toLocaleDateString()
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
