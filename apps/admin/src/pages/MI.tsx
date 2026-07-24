import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';

interface LeaderRow { repairerId: string; name: string; accepted: number; avgHours: number }
interface MI {
  funnel: { received: number; processed: number; referred: number; rejected: number; published: number; open: number; accepted: number; expired: number; completed: number };
  trend: { month: string; received: number; published: number; accepted: number }[];
  timeToAccept: { avgHours: number | null; sampleSize: number };
  financial: { estimatedRepairValuePence: number; platformFeeEarnedPence: number };
  leaderboards: { byVolume: LeaderRow[]; bySpeed: LeaderRow[] };
  repairerCount: number;
  generatedAt: string;
}

const gbp = (pence: number) => `£${(pence / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
const fmtHours = (h: number | null) => (h == null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : `${h} h`);

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card>
      <CardBody>
        <p className={`text-2xl font-bold ${tone}`}>{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </CardBody>
    </Card>
  );
}

function Leaderboard({ title, rows, metric }: { title: string; rows: LeaderRow[]; metric: 'accepted' | 'avgHours' }) {
  return (
    <Card>
      <CardBody>
        <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400">No data yet.</p>
        ) : (
          <ol className="space-y-1">
            {rows.map((r, i) => (
              <li key={r.repairerId} className="flex justify-between text-sm">
                <span className="text-gray-700"><span className="text-gray-400 mr-2">{i + 1}.</span>{r.name}</span>
                <span className="font-medium text-gray-900">
                  {metric === 'accepted' ? `${r.accepted} jobs` : `${fmtHours(r.avgHours)} avg`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

export function MIPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-mi'], queryFn: () => api.get<MI>('/api/v1/admin/mi') });

  const maxTrend = Math.max(1, ...(data?.trend.flatMap((t) => [t.received, t.published, t.accepted]) ?? [1]));

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Management information</h1>
      {isLoading || !data ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-8">
          {/* Funnel */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Job funnel</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <Stat label="Received" value={data.funnel.received} tone="text-indigo-600" />
              <Stat label="Processed" value={data.funnel.processed} />
              <Stat label="Referred to Xpert" value={data.funnel.referred} tone="text-amber-600" />
              <Stat label="Rejected" value={data.funnel.rejected} tone="text-red-600" />
              <Stat label="Published" value={data.funnel.published} />
              <Stat label="Open" value={data.funnel.open} />
              <Stat label="Accepted" value={data.funnel.accepted} tone="text-emerald-600" />
              <Stat label="Expired" value={data.funnel.expired} />
              <Stat label="Completed" value={data.funnel.completed} />
              <Stat label="Repairers" value={data.repairerCount} />
            </div>
          </section>

          {/* Financial + time-to-accept */}
          <section className="grid gap-4 sm:grid-cols-3">
            <Stat label="Est. repair value processed" value={gbp(data.financial.estimatedRepairValuePence)} tone="text-gray-900" />
            <Stat label="Platform fee earned" value={gbp(data.financial.platformFeeEarnedPence)} tone="text-emerald-600" />
            <Stat label={`Avg time to accept (${data.timeToAccept.sampleSize})`} value={fmtHours(data.timeToAccept.avgHours)} />
          </section>

          {/* Trend */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">12-month trend</h2>
            <Card>
              <CardBody>
                <div className="flex items-end gap-2 h-40">
                  {data.trend.map((t) => (
                    <div key={t.month} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end justify-center gap-0.5 flex-1">
                        <div title={`Received ${t.received}`} className="w-1/3 bg-indigo-300 rounded-t" style={{ height: `${(t.received / maxTrend) * 100}%` }} />
                        <div title={`Published ${t.published}`} className="w-1/3 bg-sky-400 rounded-t" style={{ height: `${(t.published / maxTrend) * 100}%` }} />
                        <div title={`Accepted ${t.accepted}`} className="w-1/3 bg-emerald-500 rounded-t" style={{ height: `${(t.accepted / maxTrend) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400">{t.month.slice(5)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-indigo-300 inline-block rounded" /> Received</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-sky-400 inline-block rounded" /> Published</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 inline-block rounded" /> Accepted</span>
                </div>
              </CardBody>
            </Card>
          </section>

          {/* Leaderboards */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Repairer leaderboards</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Leaderboard title="Most jobs accepted" rows={data.leaderboards.byVolume} metric="accepted" />
              <Leaderboard title="Fastest to accept (≥2 jobs)" rows={data.leaderboards.bySpeed} metric="avgHours" />
            </div>
          </section>

          <p className="text-xs text-gray-400">Generated {new Date(data.generatedAt).toLocaleString('en-GB')}</p>
        </div>
      )}
    </Layout>
  );
}
