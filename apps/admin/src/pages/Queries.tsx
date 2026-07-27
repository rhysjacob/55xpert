import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

type Status = 'OPEN' | 'ANSWERED' | 'CLOSED';
interface JobQuery {
  queryId: string;
  jobId: string;
  repairerName?: string;
  vehicle?: string;
  status: Status;
  question: string;
  response?: string;
  createdAt: string;
  answeredAt?: string;
}

const STATUS_STYLE: Record<Status, string> = {
  OPEN: 'bg-amber-100 text-amber-800',
  ANSWERED: 'bg-emerald-100 text-emerald-800',
  CLOSED: 'bg-gray-100 text-gray-600',
};

export function QueriesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'ALL' | Status>('OPEN');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-queries'],
    queryFn: () => api.get<{ items: JobQuery[] }>('/api/v1/admin/queries'),
  });
  const items = useMemo(
    () => (data?.items ?? []).filter((q) => filter === 'ALL' || q.status === filter),
    [data, filter],
  );
  const openCount = (data?.items ?? []).filter((q) => q.status === 'OPEN').length;

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Expert queries</h1>
      <p className="text-sm text-gray-500 mb-6">Repairers who've referred an accepted job to an expert (TRX-57). Reply here — the repairer is emailed and sees your answer on the job. The match fee stands; this is help, not a cancellation.</p>

      <div className="flex gap-2 mb-4">
        {(['OPEN', 'ANSWERED', 'CLOSED', 'ALL'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f}{f === 'OPEN' && openCount ? ` (${openCount})` : ''}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : items.length === 0 ? (
        <Card><CardBody><p className="text-sm text-gray-400">No {filter !== 'ALL' ? filter.toLowerCase() : ''} queries.</p></CardBody></Card>
      ) : (
        <div className="space-y-3">
          {items.map((q) => <QueryCard key={q.queryId} query={q} onChange={() => qc.invalidateQueries({ queryKey: ['admin-queries'] })} />)}
        </div>
      )}
    </Layout>
  );
}

function QueryCard({ query, onChange }: { query: JobQuery; onChange: () => void }) {
  const [response, setResponse] = useState(query.response ?? '');
  const respond = useMutation({
    mutationFn: (body: { response?: string; status?: Status }) => api.patch(`/api/v1/admin/queries/${query.queryId}`, body),
    onSuccess: onChange,
  });

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">{query.repairerName ?? 'Repairer'}</span>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[query.status]}`}>{query.status}</span>
              {query.vehicle && <span className="text-xs text-gray-400">{query.vehicle}</span>}
            </div>
            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{query.question}</p>
            <p className="text-xs text-gray-400 mt-1">Raised {new Date(query.createdAt).toLocaleString('en-GB')}{query.answeredAt ? ` · answered ${new Date(query.answeredAt).toLocaleString('en-GB')}` : ''}</p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={2} maxLength={4000}
            placeholder="Reply to the repairer…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <div className="flex items-center gap-2">
            <Button size="sm" loading={respond.isPending && respond.variables?.response !== undefined} disabled={!response.trim()}
              onClick={() => respond.mutate({ response })}>Send reply</Button>
            {query.status !== 'CLOSED' && (
              <Button size="sm" variant="secondary" onClick={() => respond.mutate({ status: 'CLOSED' })}>Close</Button>
            )}
            {query.status === 'CLOSED' && (
              <Button size="sm" variant="ghost" onClick={() => respond.mutate({ status: 'OPEN' })}>Reopen</Button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
