import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PANEL_NAMES } from '@corexpert/core';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

interface EligibilityRules {
  maxDamagedPanels: number;
  excludedPanels: string[];
  maxDamageCm: number;
  damageSizeBorderlineCm: number;
  minSizeConfidence: number;
  referOnReplace: boolean;
  referOnSevere: boolean;
  totalLossThresholdPct: number;
}
interface Scheme { eligibility: EligibilityRules; matrix: { version: string } & Record<string, unknown> }
interface Company { warrantyCompanyId: string; name: string; status: string; scheme: Scheme }

const humanPanel = (p: string) => p.replace(/_/g, ' ');

function NumberField({ label, value, onChange, step = 1, min, max, suffix }: {
  label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; suffix?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      <span className="flex items-center gap-2">
        <input type="number" value={value} step={step} min={min} max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
      </span>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

export function SchemeRulesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-warranty-companies'],
    queryFn: () => api.get<{ items: Company[] }>('/api/v1/admin/warranty-companies'),
  });

  const companies = useMemo(() => [...(data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const [selectedId, setSelectedId] = useState('');
  const selected = companies.find((c) => c.warrantyCompanyId === selectedId);

  const [rules, setRules] = useState<EligibilityRules | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to the first company; reset the form whenever the selection changes.
  useEffect(() => {
    if (!selectedId && companies[0]) setSelectedId(companies[0].warrantyCompanyId);
  }, [companies, selectedId]);
  useEffect(() => {
    setRules(selected ? { ...selected.scheme.eligibility, excludedPanels: [...selected.scheme.eligibility.excludedPanels] } : null);
    setSaved(false);
    setError(null);
  }, [selectedId, selected]);

  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/admin/warranty-companies/${selectedId}`, {
      scheme: { eligibility: rules, matrix: selected!.scheme.matrix },
    }),
    onSuccess: () => { setSaved(true); void qc.invalidateQueries({ queryKey: ['admin-warranty-companies'] }); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Save failed'),
  });

  const patch = (p: Partial<EligibilityRules>) => { setRules((r) => (r ? { ...r, ...p } : r)); setSaved(false); };
  const togglePanel = (panel: string) => {
    if (!rules) return;
    const has = rules.excludedPanels.includes(panel);
    patch({ excludedPanels: has ? rules.excludedPanels.filter((p) => p !== panel) : [...rules.excludedPanels, panel] });
  };

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Scheme rules</h1>
      <p className="text-sm text-gray-500 mb-6">Refine a warranty company's work-acceptance rules as edge cases surface — e.g. exclude glass, tighten the size limit, or adjust the total-loss threshold. Changes apply to new triage immediately, no deploy.</p>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : companies.length === 0 ? (
        <Card><CardBody><p className="text-sm text-gray-400">No warranty companies yet. Onboard one first (the ingestion/tenant API), then its rules can be edited here.</p></CardBody></Card>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-500">Company</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {companies.map((c) => <option key={c.warrantyCompanyId} value={c.warrantyCompanyId}>{c.name}{c.status !== 'ACTIVE' ? ` (${c.status})` : ''}</option>)}
            </select>
            {selected && <span className="text-xs text-gray-400">matrix {selected.scheme.matrix.version} · price editing is TRX-76</span>}
          </div>

          {rules && selected && (
            <>
              <Card>
                <CardBody>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Excluded panels <span className="normal-case font-normal text-gray-400">— never worked on (checked = excluded)</span></h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {PANEL_NAMES.map((panel) => {
                      const excluded = rules.excludedPanels.includes(panel);
                      return (
                        <label key={panel} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${excluded ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          <input type="checkbox" checked={excluded} onChange={() => togglePanel(panel)} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                          <span className="capitalize">{humanPanel(panel)}</span>
                        </label>
                      );
                    })}
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Thresholds</h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    <NumberField label="Max damaged panels" value={rules.maxDamagedPanels} min={1} onChange={(n) => patch({ maxDamagedPanels: n })} />
                    <NumberField label="Max damage size" value={rules.maxDamageCm} min={0} suffix="cm" onChange={(n) => patch({ maxDamageCm: n })} />
                    <NumberField label="Borderline band (± around max)" value={rules.damageSizeBorderlineCm} min={0} suffix="cm" onChange={(n) => patch({ damageSizeBorderlineCm: n })} />
                    <NumberField label="Min size confidence" value={rules.minSizeConfidence} step={0.05} min={0} max={1} onChange={(n) => patch({ minSizeConfidence: n })} />
                    <NumberField label="Total-loss threshold (TRX-6)" value={rules.totalLossThresholdPct} min={0} max={100} suffix="% of value" onChange={(n) => patch({ totalLossThresholdPct: n })} />
                  </div>
                  <div className="flex flex-wrap gap-6 mt-5 pt-5 border-t border-gray-100">
                    <Toggle label="Refer full REPLACE to an Xpert" checked={rules.referOnReplace} onChange={(b) => patch({ referOnReplace: b })} />
                    <Toggle label="Refer SEVERE damage to an Xpert" checked={rules.referOnSevere} onChange={(b) => patch({ referOnSevere: b })} />
                  </div>
                </CardBody>
              </Card>

              <div className="flex items-center gap-3">
                <Button onClick={() => { setError(null); save.mutate(); }} loading={save.isPending}>Save rules</Button>
                {saved && <span className="text-sm text-emerald-600">Saved — applies to new triage now.</span>}
                {error && <span className="text-sm text-red-600">{error}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </Layout>
  );
}
