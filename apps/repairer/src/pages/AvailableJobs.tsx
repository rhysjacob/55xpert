import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { InfoTip } from '../components/ui/InfoTip';
import { useNow, formatDuration } from '../lib/time';
import { INDICATIVE_COST_DISCLAIMER } from '../lib/copy';

interface Job {
  jobId: string;
  vehicleSummary: { make: string; model: string; year: number; vehicleSize: string };
  damageSummary: string;
  indicativeCost: number;
  introductionFee: number;
  repairMethods: string[];
  location: { postcode?: string };
  publishedAt: string;
  expiresAt: string;
  /** True when a faster repairer already accepted — shown greyed out (TRX-53). */
  taken?: boolean;
  /** 'exact' = in your coverage; 'nearby' = nearest-area fallback (TRX-12/13). */
  matchType?: 'exact' | 'nearby';
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

/** Live "how long a job has been live" timer + expiry countdown (TRX-54). */
function LiveTimer({ publishedAt, expiresAt, now }: { publishedAt: string; expiresAt: string; now: number }) {
  const liveFor = formatDuration(now - new Date(publishedAt).getTime());
  const msLeft = new Date(expiresAt).getTime() - now;
  const expired = msLeft <= 0;
  // Flag urgency in the last two hours so a fastest-finger repairer moves.
  const urgent = !expired && msLeft < 2 * 3_600_000;
  return (
    <span className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
        Live for {liveFor}
      </span>
      <span className={expired ? 'text-gray-400' : urgent ? 'text-red-600 font-medium' : 'text-gray-500'}>
        \u00B7 {expired ? 'Expiring' : `Expires in ${formatDuration(msLeft)}`}
      </span>
    </span>
  );
}

export function AvailableJobsPage() {
  const now = useNow();
  const { data, isLoading } = useQuery({
    queryKey: ['available-jobs'],
    queryFn: () => api.get<{ items: Job[] }>('/api/v1/jobs'),
  });

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Available Jobs</h1>

      {isLoading ? (
        <p className="text-gray-500">Loading jobs...</p>
      ) : !data?.items.length ? (
        <Card>
          <CardBody>
            <p className="text-center text-gray-500 py-8">
              No open jobs on the Xchange right now. Check back later.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.items.map((job) => {
            const card = (
              <Card className={job.taken ? 'opacity-60' : 'hover:shadow-md transition-shadow'}>
                <CardBody>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-gray-900">
                          {job.vehicleSummary.year} {job.vehicleSummary.make} {job.vehicleSummary.model}
                        </h3>
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                          {job.vehicleSummary.vehicleSize}
                        </span>
                        {job.taken ? (
                          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded font-medium">
                            Taken
                          </span>
                        ) : job.matchType === 'nearby' ? (
                          <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded">
                            Nearby
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{job.damageSummary}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {job.repairMethods.map((method) => (
                          <span
                            key={method}
                            className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded"
                          >
                            {method.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-lg font-bold text-gray-900">{formatPence(job.indicativeCost)}</p>
                      <p className="text-xs text-gray-500">
                        Indicative cost
                        <InfoTip text={INDICATIVE_COST_DISCLAIMER} />
                      </p>
                      <p className="text-xs text-emerald-600 mt-1">
                        Fee: {formatPence(job.introductionFee)}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                    <span>{job.location.postcode}</span>
                    <LiveTimer publishedAt={job.publishedAt} expiresAt={job.expiresAt} now={now} />
                  </div>
                </CardBody>
              </Card>
            );
            // A taken job is greyed out and not clickable — a faster finger won it.
            return job.taken ? (
              <div key={job.jobId} className="cursor-default">{card}</div>
            ) : (
              <Link key={job.jobId} to={`/jobs/${job.jobId}`}>{card}</Link>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
