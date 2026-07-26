import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

type ComplaintStatus = 'OPEN' | 'JUSTIFIED' | 'UNJUSTIFIED';
type ComplaintSource = 'WARRANTY_COMPANY' | 'CUSTOMER_DIRECT';

interface Complaint {
  complaintId: string;
  organisationId: string;
  repairerName: string;
  source: ComplaintSource;
  status: ComplaintStatus;
  note: string;
  createdAt: string;
  resolvedAt?: string;
}
interface Org { organisationId: string; name: string; status: string }

const STATUS_STYLE: Record<ComplaintStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-800',
  JUSTIFIED: 'bg-red-100 text-red-800',
  UNJUSTIFIED: 'bg-gray-100 text-gray-600',
};
const SOURCE_LABEL: Record<ComplaintSource, string> = {
  WARRANTY_COMPANY: 'Warranty company',
  CUSTOMER_DIRECT: 'Customer direct',
};

function StatusPill({ status }: { status: ComplaintStatus }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>{status}</span>;
}

export function ComplaintsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'ALL' | ComplaintStatus>('ALL');
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-complaints'],
    queryFn: () => api.get<{ items: Complaint[] }>('/api/v1/admin/complaints'),
  });
  const { data: orgData } = useQuery({
    queryKey: ['admin-organisations'],
    queryFn: () => api.get<{ items: Org[] }>('/api/v1/admin/organisations'),
  });

  const items = useMemo(
    () => (data?.items ?? []).filter((c) => filter === 'ALL' || c.status === filter),
    [data, filter],
  );

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ComplaintStatus }) =>
      api.patch(`/api/v1/admin/complaints/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-complaints'] }),
  });

  const counts = useMemo(() => {
    const all = data?.items ?? [];
    return {
      total: all.length,
      open: all.filter((c) => c.status === 'OPEN').length,
      justified: all.filter((c) => c.status === 'JUSTIFIED').length,
      unjustified: all.filter((c) => c.status === 'UNJUSTIFIED').length,
    };
  }, [data]);

  return (
    <Layout>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Complaints</h1>
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : 'Log a complaint'}</Button>
      </div>
      <p className="text-sm text-gray-500 mb-6">Complaints raised against repairers — by a warranty company or a customer direct. Mark each justified or unjustified to feed the complaints MI.</p>

      {showForm && <ComplaintForm orgs={orgData?.items ?? []} onDone={() => { setShowForm(false); void qc.invalidateQueries({ queryKey: ['admin-complaints'] }); }} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-6">
        <Card><CardBody><p className="text-2xl font-bold text-gray-900">{counts.total}</p><p className="text-sm text-gray-500">Total</p></CardBody></Card>
        <Card><CardBody><p className="text-2xl font-bold text-amber-600">{counts.open}</p><p className="text-sm text-gray-500">Open (unassessed)</p></CardBody></Card>
        <Card><CardBody><p className="text-2xl font-bold text-red-600">{counts.justified}</p><p className="text-sm text-gray-500">Justified</p></CardBody></Card>
        <Card><CardBody><p className="text-2xl font-bold text-gray-500">{counts.unjustified}</p><p className="text-sm text-gray-500">Unjustified</p></CardBody></Card>
      </div>

      <div className="flex gap-2 mb-4">
        {(['ALL', 'OPEN', 'JUSTIFIED', 'UNJUSTIFIED'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{f}</button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : items.length === 0 ? (
        <Card><CardBody><p className="text-sm text-gray-400">No complaints{filter !== 'ALL' ? ` with status ${filter}` : ''}.</p></CardBody></Card>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <Card key={c.complaintId}>
              <CardBody>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{c.repairerName}</span>
                      <StatusPill status={c.status} />
                      <span className="text-xs text-gray-400">{SOURCE_LABEL[c.source]}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{c.note}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Logged {new Date(c.createdAt).toLocaleString('en-GB')}
                      {c.resolvedAt ? ` · assessed ${new Date(c.resolvedAt).toLocaleString('en-GB')}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="sm" variant={c.status === 'JUSTIFIED' ? 'danger' : 'secondary'}
                      loading={setStatus.isPending && setStatus.variables?.id === c.complaintId && setStatus.variables?.status === 'JUSTIFIED'}
                      onClick={() => setStatus.mutate({ id: c.complaintId, status: 'JUSTIFIED' })}>Justified</Button>
                    <Button size="sm" variant="secondary"
                      loading={setStatus.isPending && setStatus.variables?.id === c.complaintId && setStatus.variables?.status === 'UNJUSTIFIED'}
                      onClick={() => setStatus.mutate({ id: c.complaintId, status: 'UNJUSTIFIED' })}>Unjustified</Button>
                    {c.status !== 'OPEN' && (
                      <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setStatus.mutate({ id: c.complaintId, status: 'OPEN' })}>reopen</button>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}

function ComplaintForm({ orgs, onDone }: { orgs: Org[]; onDone: () => void }) {
  const [organisationId, setOrganisationId] = useState('');
  const [source, setSource] = useState<ComplaintSource>('WARRANTY_COMPANY');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post('/api/v1/admin/complaints', { organisationId, source, note }),
    onSuccess: onDone,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to log complaint'),
  });

  const sorted = useMemo(() => [...orgs].sort((a, b) => a.name.localeCompare(b.name)), [orgs]);

  return (
    <Card>
      <CardBody>
        <form onSubmit={(e) => { e.preventDefault(); setError(null); if (organisationId && note.trim()) create.mutate(); }} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Repairer</label>
              <select value={organisationId} onChange={(e) => setOrganisationId(e.target.value)} required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select a repairer…</option>
                {sorted.map((o) => <option key={o.organisationId} value={o.organisationId}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <select value={source} onChange={(e) => setSource(e.target.value as ComplaintSource)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="WARRANTY_COMPANY">Warranty company</option>
                <option value="CUSTOMER_DIRECT">Customer direct</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Complaint detail</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} required rows={3} maxLength={4000}
              placeholder="What was the complaint about?"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onDone}>Cancel</Button>
            <Button type="submit" size="sm" loading={create.isPending} disabled={!organisationId || !note.trim()}>Log complaint</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
