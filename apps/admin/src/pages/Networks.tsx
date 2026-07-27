import { useMemo } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';

interface Company { warrantyCompanyId: string; name: string; status: string }
interface Org { organisationId: string; name: string; status: string }
interface Link { warrantyCompanyId: string; organisationId: string; enabled: boolean }

/**
 * Company ↔ repairer network matrix (TRX-23). Each cell is one pairing:
 *   green ✓  = linked & enabled (jobs from this company reach this repairer)
 *   red ✕    = explicitly excluded (link exists but disabled)
 *   grey +   = not linked
 * Clicking cycles enabled → excluded → enabled; a not-linked cell links+enables.
 * Admin-only (warranty companies can't self-edit).
 */
export function NetworksPage() {
  const qc = useQueryClient();
  const companiesQ = useQuery({ queryKey: ['admin-warranty-companies'], queryFn: () => api.get<{ items: Company[] }>('/api/v1/admin/warranty-companies') });
  const orgsQ = useQuery({ queryKey: ['admin-organisations'], queryFn: () => api.get<{ items: Org[] }>('/api/v1/admin/organisations') });

  const companies = useMemo(() => [...(companiesQ.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [companiesQ.data]);
  const orgs = useMemo(() => [...(orgsQ.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [orgsQ.data]);

  // One network fetch per company (columns).
  const networkResults = useQueries({
    queries: companies.map((c) => ({
      queryKey: ['network', c.warrantyCompanyId],
      queryFn: () => api.get<{ items: Link[] }>(`/api/v1/admin/warranty-companies/${c.warrantyCompanyId}/network`),
    })),
  });

  // state[`${companyId}:${orgId}`] = true (enabled) | false (excluded) | undefined (not linked)
  const state = useMemo(() => {
    const m = new Map<string, boolean>();
    networkResults.forEach((r, i) => {
      const companyId = companies[i]?.warrantyCompanyId;
      if (!companyId) return;
      for (const link of r.data?.items ?? []) m.set(`${companyId}:${link.organisationId}`, link.enabled);
    });
    return m;
  }, [networkResults, companies]);

  const toggle = useMutation({
    mutationFn: ({ companyId, organisationId, enabled }: { companyId: string; organisationId: string; enabled: boolean }) =>
      api.put(`/api/v1/admin/warranty-companies/${companyId}/network`, { organisationId, enabled }),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['network', v.companyId] }),
  });

  const loading = companiesQ.isLoading || orgsQ.isLoading;

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Company ↔ repairer networks</h1>
      <p className="text-sm text-gray-500 mb-4">Which repairers each warranty company's jobs can reach. A job only reaches a repairer that's <strong>linked and enabled</strong> for that company. Click a cell to link, exclude, or re-enable a pairing. Warranty companies can't edit this themselves.</p>

      <div className="flex flex-wrap items-center gap-4 mb-6 text-xs text-gray-500">
        <span className="flex items-center gap-1"><Cell state={true} /> enabled</span>
        <span className="flex items-center gap-1"><Cell state={false} /> excluded</span>
        <span className="flex items-center gap-1"><Cell state={undefined} /> not linked</span>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : companies.length === 0 || orgs.length === 0 ? (
        <Card><CardBody><p className="text-sm text-gray-400">{companies.length === 0 ? 'No warranty companies yet — onboard one on the Companies page.' : 'No repairer organisations yet.'}</p></CardBody></Card>
      ) : (
        <Card>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white text-left font-medium text-gray-500 p-2 border-b border-gray-100">Repairer</th>
                    {companies.map((c) => (
                      <th key={c.warrantyCompanyId} className="p-2 border-b border-gray-100 font-medium text-gray-700 whitespace-nowrap align-bottom">
                        <span className="block max-w-[120px] truncate" title={c.name}>{c.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => (
                    <tr key={o.organisationId} className="hover:bg-gray-50">
                      <td className="sticky left-0 bg-white p-2 border-b border-gray-50 text-gray-800 whitespace-nowrap">
                        <span className="block max-w-[220px] truncate" title={o.name}>{o.name}</span>
                        {o.status !== 'ACTIVE' && <span className="ml-1 text-[10px] text-gray-400">({o.status})</span>}
                      </td>
                      {companies.map((c) => {
                        const key = `${c.warrantyCompanyId}:${o.organisationId}`;
                        const cur = state.get(key);
                        const pending = toggle.isPending && toggle.variables?.companyId === c.warrantyCompanyId && toggle.variables?.organisationId === o.organisationId;
                        // enabled → exclude; excluded/none → enable
                        const next = cur === true ? false : true;
                        return (
                          <td key={c.warrantyCompanyId} className="p-2 border-b border-gray-50 text-center">
                            <button
                              disabled={pending}
                              onClick={() => toggle.mutate({ companyId: c.warrantyCompanyId, organisationId: o.organisationId, enabled: next })}
                              className={pending ? 'opacity-40' : ''}
                              title={cur === true ? 'Enabled — click to exclude' : cur === false ? 'Excluded — click to enable' : 'Not linked — click to link'}
                            >
                              <Cell state={cur} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </Layout>
  );
}

function Cell({ state }: { state: boolean | undefined }) {
  if (state === true) return <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 font-bold">✓</span>;
  if (state === false) return <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-red-100 text-red-700 font-bold">✕</span>;
  return <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-gray-400">+</span>;
}
