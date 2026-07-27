import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { toCsv, downloadCsv } from '../lib/csv';

interface Job {
  jobId: string;
  caseId?: string;
  status: string;
  vehicleSummary: { make: string; model: string; year: number; vehicleSize?: string };
  damageSummary: string;
  indicativeCost: number;
  introductionFee?: number;
  repairMethods?: string[];
  location?: { postcode?: string };
  publishedAt?: string;
  acceptance?: { acceptedAt?: string };
  acceptedAt?: string;
}

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

const poundsFromPence = (pence?: number): string => (pence == null ? '' : (pence / 100).toFixed(2));

/** Flatten accepted jobs to CSV rows for the repairer's own DMS (TRX-58). */
function jobsToCsv(jobs: Job[]): string {
  const headers = [
    'Job ID', 'Case ID', 'Accepted at', 'Status', 'Year', 'Make', 'Model', 'Vehicle size',
    'Postcode', 'Repair methods', 'Indicative cost (GBP)', 'Introduction fee (GBP)', 'Damage summary',
  ];
  const rows = jobs.map((j) => [
    j.jobId,
    j.caseId ?? '',
    j.acceptance?.acceptedAt ?? j.acceptedAt ?? '',
    j.status,
    j.vehicleSummary?.year ?? '',
    j.vehicleSummary?.make ?? '',
    j.vehicleSummary?.model ?? '',
    j.vehicleSummary?.vehicleSize ?? '',
    j.location?.postcode ?? '',
    (j.repairMethods ?? []).join('; '),
    poundsFromPence(j.indicativeCost),
    poundsFromPence(j.introductionFee),
    j.damageSummary ?? '',
  ]);
  return toCsv(headers, rows);
}

export function MyJobsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-jobs'],
    queryFn: () => api.get<{ items: Job[] }>('/api/v1/repairer/jobs'),
  });

  const jobs = data?.items ?? [];

  const handleDownload = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`accepted-jobs-${stamp}.csv`, jobsToCsv(jobs));
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Jobs</h1>
        {jobs.length > 0 && (
          <Button variant="secondary" size="sm" onClick={handleDownload}>Download CSV</Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : !jobs.length ? (
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
          {jobs.map((job) => (
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
