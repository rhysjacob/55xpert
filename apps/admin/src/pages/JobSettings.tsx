import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';

interface JobSettingsResponse {
  paymentGraceMinutes: number;
  defaultMinutes: number;
  minMinutes: number;
  maxMinutes: number;
}

/** Render minutes as a human duration, e.g. 90 -> "1h 30m". */
function humanDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

export function JobSettingsPage() {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['job-settings'],
    queryFn: () => api.get<JobSettingsResponse>('/api/v1/admin/job-settings'),
  });

  useEffect(() => {
    if (data) setValue(String(data.paymentGraceMinutes));
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.put<JobSettingsResponse>('/api/v1/admin/job-settings', {
        paymentGraceMinutes: Number(value),
      }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['job-settings'] });
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (isLoading) return <Layout><div className="text-center py-12 text-gray-500">Loading…</div></Layout>;
  if (error || !data) {
    return <Layout><div className="text-center py-12 text-red-500">{error instanceof Error ? error.message : 'Failed to load'}</div></Layout>;
  }

  const parsed = Number(value);
  const outOfRange =
    !Number.isInteger(parsed) || parsed < data.minMinutes || parsed > data.maxMinutes;
  const unchanged = parsed === data.paymentGraceMinutes;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Job Settings</h1>
        <p className="text-gray-500 mb-6">
          Marketplace rules for The Repair Xchange.
        </p>

        <Card className="mb-6">
          <CardHeader><h2 className="font-semibold">Payment grace period</h2></CardHeader>
          <CardBody>
            <p className="text-sm text-gray-600 mb-4">
              How long a repairer has to pay the introduction fee after accepting a job.
              Once it lapses, the job returns to the Xchange for anyone to accept — including
              the original repairer. Applies to jobs already accepted, since the deadline is
              measured from acceptance each time the sweep runs.
            </p>

            <div className="flex items-end gap-3">
              <div>
                <label htmlFor="grace" className="block text-sm text-gray-500 mb-1">Minutes</label>
                <input
                  id="grace"
                  type="number"
                  min={data.minMinutes}
                  max={data.maxMinutes}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-32 border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <Button
                onClick={() => save.mutate()}
                disabled={outOfRange || unchanged || save.isPending}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
              {saved && <span className="text-sm text-emerald-600 pb-2">Saved</span>}
            </div>

            <p className="text-xs text-gray-500 mt-2">
              {outOfRange
                ? `Must be a whole number between ${data.minMinutes} and ${data.maxMinutes} minutes.`
                : `Currently ${humanDuration(data.paymentGraceMinutes)} · default ${humanDuration(data.defaultMinutes)} · sweep runs every 5 minutes.`}
            </p>

            {save.error instanceof Error && (
              <p className="text-sm text-red-500 mt-2">{save.error.message}</p>
            )}
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
