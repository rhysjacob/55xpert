import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PANEL_NAMES, MatrixPaintCategory, MATRIX_CATEGORY_LABELS, MATRIX_CHARGE_KEYS, SCHEMES } from '@corexpert/core';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

// ---- Types (mirror core's WarrantyCompanyScheme, matrix amounts in pence) ----
interface EligibilityRules {
  maxDamagedPanels: number; excludedPanels: string[]; maxDamageCm: number;
  damageSizeBorderlineCm: number; minSizeConfidence: number;
  referOnReplace: boolean; referOnSevere: boolean; totalLossThresholdPct: number;
}
type PaintPrices = Partial<Record<string, number>>;
interface MatrixConfig {
  version: string; vatRate: number;
  panelMatrix: Record<string, PaintPrices>;
  bumperMatrix: PaintPrices; mirrorCoverPrice: number;
  charges: Record<string, number>;
  adasCalibrationUplift: number; commercialServiceCharge: number;
}
interface Scheme { eligibility: EligibilityRules; matrix: MatrixConfig }
interface Company { warrantyCompanyId: string; name: string; status: string; scheme: Scheme }

const CATS = Object.values(MatrixPaintCategory);
const humanPanel = (p: string) => p.replace(/_/g, ' ');
const humanKey = (k: string) => k.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const poundsStr = (pence?: number) => (pence == null || Number.isNaN(pence) ? '' : (pence / 100).toFixed(2));
const penceFrom = (s: string): number | undefined => {
  const t = s.trim();
  if (t === '') return undefined;
  const n = Math.round(parseFloat(t) * 100);
  return Number.isFinite(n) ? n : undefined;
};

// ---- Small field components ----
function NumberField({ label, value, onChange, step = 1, min, max, suffix }: {
  label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; suffix?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      <span className="flex items-center gap-2">
        <input type="number" value={value} step={step} min={min} max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
      </span>
    </label>
  );
}
function PriceInput({ value, onChange }: { value?: number; onChange: (pence: number | undefined) => void }) {
  return (
    <span className="relative inline-flex items-center">
      <span className="absolute left-2 text-xs text-gray-400">£</span>
      <input type="number" step="0.01" min="0" value={poundsStr(value)} onChange={(e) => onChange(penceFrom(e.target.value))}
        className="w-24 rounded-lg border border-gray-300 pl-5 pr-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
    </span>
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
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [tab, setTab] = useState<'eligibility' | 'matrix'>('eligibility');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);

  useEffect(() => { if (!selectedId && companies[0]) setSelectedId(companies[0].warrantyCompanyId); }, [companies, selectedId]);
  useEffect(() => {
    setScheme(selected ? structuredClone(selected.scheme) : null);
    setSaved(false); setError(null);
  }, [selectedId, selected]);

  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/admin/warranty-companies/${selectedId}`, { scheme }),
    onSuccess: () => { setSaved(true); void qc.invalidateQueries({ queryKey: ['admin-warranty-companies'] }); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Save failed'),
  });

  const elig = scheme?.eligibility;
  const matrix = scheme?.matrix;
  const patchElig = (p: Partial<EligibilityRules>) => { setScheme((s) => (s ? { ...s, eligibility: { ...s.eligibility, ...p } } : s)); setSaved(false); };
  const patchMatrix = (p: Partial<MatrixConfig>) => { setScheme((s) => (s ? { ...s, matrix: { ...s.matrix, ...p } } : s)); setSaved(false); };
  const setPanelCell = (row: string, cat: string, pence: number | undefined) => {
    if (!matrix) return;
    const rowPrices = { ...(matrix.panelMatrix[row] ?? {}) };
    if (pence == null) delete rowPrices[cat]; else rowPrices[cat] = pence;
    patchMatrix({ panelMatrix: { ...matrix.panelMatrix, [row]: rowPrices } });
  };
  const setBumperCell = (cat: string, pence: number | undefined) => {
    if (!matrix) return;
    const b = { ...matrix.bumperMatrix };
    if (pence == null) delete b[cat]; else b[cat] = pence;
    patchMatrix({ bumperMatrix: b });
  };
  const togglePanel = (panel: string) => {
    if (!elig) return;
    const has = elig.excludedPanels.includes(panel);
    patchElig({ excludedPanels: has ? elig.excludedPanels.filter((p) => p !== panel) : [...elig.excludedPanels, panel] });
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Warranty companies</h1>
        <Button size="sm" onClick={() => setShowOnboard((s) => !s)}>{showOnboard ? 'Close' : 'Onboard company'}</Button>
      </div>
      <p className="text-sm text-gray-500 mb-6">Onboard a warranty company and author its ruleset — eligibility rules (e.g. exclude glass, damage-size limit) and its pricing matrix. Changes apply to new triage immediately; saving bumps the matrix version so stored quotes stay reproducible.</p>

      {showOnboard && <OnboardForm onDone={(id) => { setShowOnboard(false); void qc.invalidateQueries({ queryKey: ['admin-warranty-companies'] }); if (id) setSelectedId(id); }} />}

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : companies.length === 0 ? (
        <Card><CardBody><p className="text-sm text-gray-400">No warranty companies yet. Use “Onboard company” to create one from a template.</p></CardBody></Card>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-gray-500">Company</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {companies.map((c) => <option key={c.warrantyCompanyId} value={c.warrantyCompanyId}>{c.name}{c.status !== 'ACTIVE' ? ` (${c.status})` : ''}</option>)}
            </select>
            {matrix && <span className="text-xs text-gray-400">matrix version {matrix.version}</span>}
          </div>

          {scheme && elig && matrix && (
            <>
              <div className="flex gap-2 border-b border-gray-200">
                {(['eligibility', 'matrix'] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {t === 'eligibility' ? 'Eligibility rules' : 'Pricing matrix'}
                  </button>
                ))}
              </div>

              {tab === 'eligibility' && (
                <div className="space-y-6">
                  <Card><CardBody>
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Excluded panels <span className="normal-case font-normal text-gray-400">— never worked on</span></h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {PANEL_NAMES.map((panel) => {
                        const excluded = elig.excludedPanels.includes(panel);
                        return (
                          <label key={panel} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${excluded ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                            <input type="checkbox" checked={excluded} onChange={() => togglePanel(panel)} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                            <span className="capitalize">{humanPanel(panel)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </CardBody></Card>
                  <Card><CardBody>
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Thresholds</h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                      <NumberField label="Max damaged panels" value={elig.maxDamagedPanels} min={1} onChange={(n) => patchElig({ maxDamagedPanels: n })} />
                      <NumberField label="Max damage size" value={elig.maxDamageCm} min={0} suffix="cm" onChange={(n) => patchElig({ maxDamageCm: n })} />
                      <NumberField label="Borderline band (±)" value={elig.damageSizeBorderlineCm} min={0} suffix="cm" onChange={(n) => patchElig({ damageSizeBorderlineCm: n })} />
                      <NumberField label="Min size confidence" value={elig.minSizeConfidence} step={0.05} min={0} max={1} onChange={(n) => patchElig({ minSizeConfidence: n })} />
                      <NumberField label="Total-loss threshold" value={elig.totalLossThresholdPct} min={0} max={100} suffix="% of value" onChange={(n) => patchElig({ totalLossThresholdPct: n })} />
                    </div>
                    <div className="flex flex-wrap gap-6 mt-5 pt-5 border-t border-gray-100">
                      <Toggle label="Refer full REPLACE to an Xpert" checked={elig.referOnReplace} onChange={(b) => patchElig({ referOnReplace: b })} />
                      <Toggle label="Refer SEVERE damage to an Xpert" checked={elig.referOnSevere} onChange={(b) => patchElig({ referOnSevere: b })} />
                    </div>
                  </CardBody></Card>
                </div>
              )}

              {tab === 'matrix' && (
                <div className="space-y-6">
                  <Card><CardBody>
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Rates & uplifts</h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                      <NumberField label="VAT rate" value={Math.round(matrix.vatRate * 1000) / 10} step={0.5} min={0} max={100} suffix="%" onChange={(n) => patchMatrix({ vatRate: n / 100 })} />
                      <NumberField label="ADAS calibration uplift" value={Math.round(matrix.adasCalibrationUplift * 1000) / 10} step={0.5} min={0} suffix="%" onChange={(n) => patchMatrix({ adasCalibrationUplift: n / 100 })} />
                      <label className="block"><span className="block text-sm font-medium text-gray-700 mb-1">Mirror cover</span><PriceInput value={matrix.mirrorCoverPrice} onChange={(p) => patchMatrix({ mirrorCoverPrice: p ?? 0 })} /></label>
                      <label className="block"><span className="block text-sm font-medium text-gray-700 mb-1">Commercial service charge</span><PriceInput value={matrix.commercialServiceCharge} onChange={(p) => patchMatrix({ commercialServiceCharge: p ?? 0 })} /></label>
                    </div>
                  </CardBody></Card>

                  <Card><CardBody>
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Panel matrix <span className="normal-case font-normal text-gray-400">— price by panel count × paint category (blank = not offered)</span></h2>
                    <div className="overflow-x-auto mt-3">
                      <table className="text-sm">
                        <thead><tr className="text-left text-gray-400"><th className="py-2 pr-4 font-medium">Panels</th>{CATS.map((c) => <th key={c} className="py-2 px-2 font-medium">{MATRIX_CATEGORY_LABELS[c]}</th>)}</tr></thead>
                        <tbody>
                          {(['1', '2', '3', '4'] as const).map((row) => (
                            <tr key={row} className="border-t border-gray-50">
                              <td className="py-2 pr-4 font-medium text-gray-700">{row}</td>
                              {CATS.map((c) => <td key={c} className="py-2 px-2"><PriceInput value={matrix.panelMatrix[row]?.[c]} onChange={(p) => setPanelCell(row, c, p)} /></td>)}
                            </tr>
                          ))}
                          <tr className="border-t border-gray-100">
                            <td className="py-2 pr-4 font-medium text-gray-700">Bumper</td>
                            {CATS.map((c) => <td key={c} className="py-2 px-2"><PriceInput value={matrix.bumperMatrix[c]} onChange={(p) => setBumperCell(c, p)} /></td>)}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </CardBody></Card>

                  <Card><CardBody>
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Charges</h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {MATRIX_CHARGE_KEYS.map((k) => (
                        <label key={k} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-gray-600">{humanKey(k)}</span>
                          <PriceInput value={matrix.charges[k]} onChange={(p) => patchMatrix({ charges: { ...matrix.charges, [k]: p ?? 0 } })} />
                        </label>
                      ))}
                    </div>
                  </CardBody></Card>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={() => { setError(null); save.mutate(); }} loading={save.isPending}>Save ruleset</Button>
                {saved && <span className="text-sm text-emerald-600">Saved — matrix version bumped; applies to new triage now.</span>}
                {error && <span className="text-sm text-red-600">{error}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </Layout>
  );
}

function OnboardForm({ onDone }: { onDone: (id?: string) => void }) {
  const [name, setName] = useState('');
  const [seed, setSeed] = useState(Object.keys(SCHEMES)[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.post<{ company: Company }>('/api/v1/admin/warranty-companies', { name, seedFromSchemeId: seed }),
    onSuccess: (r) => onDone(r.company?.warrantyCompanyId),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to onboard'),
  });
  return (
    <Card>
      <CardBody>
        <form onSubmit={(e) => { e.preventDefault(); setError(null); if (name.trim() && seed) create.mutate(); }} className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]"><Input label="Company name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Warranty Ltd" /></div>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Seed ruleset from</span>
            <select value={seed} onChange={(e) => setSeed(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {Object.entries(SCHEMES).map(([id, s]) => <option key={id} value={id}>{(s as { name: string }).name}</option>)}
            </select>
          </label>
          <Button type="submit" size="sm" loading={create.isPending} disabled={!name.trim()}>Onboard</Button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </form>
      </CardBody>
    </Card>
  );
}
