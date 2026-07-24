import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';

interface RepairerMI {
  accepted: number;
  availableNow: number;
  timeToAccept: { avgHours: number | null; sampleSize: number };
  financial: { repairValueHandledPence: number; matchFeesPaidPence: number };
  trend: { month: string; accepted: number }[];
  generatedAt: string;
}

const gbp = (p: number) => `£${(p / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
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

export function MIPage() {
  const { data, isLoading } = useQuery({ queryKey: ['repairer-mi'], queryFn: () => api.get<RepairerMI>('/api/v1/repairer/mi') });
  const maxTrend = Math.max(1, ...(data?.trend.map((t) => t.accepted) ?? [1]));

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Your performance</h1>
      {isLoading || !data ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Jobs accepted" value={data.accepted} tone="text-emerald-600" />
            <Stat label="Matching you now" value={data.availableNow} tone="text-indigo-600" />
            <Stat label={`Avg time to accept (${data.timeToAccept.sampleSize})`} value={fmtHours(data.timeToAccept.avgHours)} />
            <Stat label="Repair value handled" value={gbp(data.financial.repairValueHandledPence)} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Match fees paid" value={gbp(data.financial.matchFeesPaidPence)} tone="text-gray-900" />
          </div>

          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Jobs accepted — last 12 months</h2>
            <Card>
              <CardBody>
                <div className="flex items-end gap-2 h-40">
                  {data.trend.map((t) => (
                    <div key={t.month} className="flex-1 flex flex-col items-center gap-1">
                      <div title={`${t.accepted} accepted`} className="w-full bg-emerald-500 rounded-t" style={{ height: `${(t.accepted / maxTrend) * 100}%` }} />
                      <span className="text-[10px] text-gray-400">{t.month.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </section>

          <p className="text-xs text-gray-400">Generated {new Date(data.generatedAt).toLocaleString('en-GB')}</p>
        </div>
      )}
    </Layout>
  );
}
