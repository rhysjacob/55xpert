import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UK_POSTCODE_AREAS } from '@corexpert/core';
import { api } from '../lib/api-client';
import { Card, CardBody } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

const BUSINESS_TYPES = ['Independent Repairer', 'Mobile Repairer', 'Group / Multi-site', 'Specialist'];
const SERVICES: { value: string; label: string }[] = [
  { value: 'SMART', label: 'SMART' }, { value: 'BODYSHOP', label: 'Bodyshop' },
  { value: 'ALLOY', label: 'Alloy' }, { value: 'GLASS', label: 'Glass' },
  { value: 'EV', label: 'EV' }, { value: 'ADAS', label: 'ADAS' },
  { value: 'COSMETIC', label: 'Cosmetic' }, { value: 'STRUCTURAL', label: 'Structural' },
  { value: 'MOBILE', label: 'Mobile' }, { value: 'PAINT', label: 'Paint' },
];
const RADIUS = [{ label: 'n/a', v: 0 }, { label: '5 miles', v: 5 }, { label: '10 miles', v: 10 }, { label: '15 miles', v: 15 }, { label: '20 miles', v: 20 }, { label: '25+ miles', v: 25 }];
const PREFERRED = ['Cosmetic', 'Bodyshop', 'Mobile', 'Alloy', 'Glass', 'EV', 'ADAS'];
const EQUIPMENT = ['Power Source', 'Pin Puller', 'Glue Puller', 'Flat Liner', 'Canopy', 'Groundsheet'];

const STEP_LABELS = ['Business', 'Coverage', 'Capabilities', 'Operational', 'Mobile units', 'Confirm'];

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** District (SW1A, SK6) or area (SK) — matches the district first, then area. */
const COVERAGE_RE = /^[A-Z]{1,2}([0-9][A-Z0-9]?)?$/;

/**
 * District-first coverage selector: type a district (e.g. SK6) for precise
 * coverage, or bulk-add a whole area (SK). Districts match the outward code
 * exactly; a whole area covers all of its districts. Matching falls back from
 * district → area (see core evaluateMatch).
 */
function CoverageSelect({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('');
  const query = q.trim().toUpperCase().replace(/\s+/g, '');
  const valid = COVERAGE_RE.test(query);
  const areaPart = query.replace(/[0-9].*$/, '');
  const areaSuggestions = useMemo(
    () => (areaPart ? UK_POSTCODE_AREAS.filter((a) => a.startsWith(areaPart)).slice(0, 8) : []),
    [areaPart],
  );

  const add = (raw: string) => {
    const e = raw.trim().toUpperCase().replace(/\s+/g, '');
    if (e && COVERAGE_RE.test(e) && !selected.includes(e)) onChange([...selected, e]);
    setQ('');
  };

  return (
    <div>
      <Input
        label="Coverage postcodes"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && valid) { e.preventDefault(); add(query); }
        }}
        placeholder="Type a district (e.g. SK6) or area (SK), then Enter"
      />
      {query.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {valid && (
            <button type="button" onClick={() => add(query)}
              className="text-xs font-medium bg-emerald-600 text-white px-2.5 py-1 rounded hover:bg-emerald-700">
              Add {query}
            </button>
          )}
          {areaSuggestions.map((a) => (
            <button key={a} type="button" onClick={() => add(a)}
              className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded hover:bg-gray-200">
              All {a}
            </button>
          ))}
          {!valid && areaSuggestions.length === 0 && (
            <span className="text-xs text-gray-400">Enter a valid postcode area or district.</span>
          )}
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {selected.map((a) => (
            <button key={a} type="button" onClick={() => onChange(selected.filter((x) => x !== a))}
              className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full hover:bg-emerald-200">
              {a} ✕
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500 mt-2">
        Type a district (e.g. SK6) for precise coverage, or add a whole area (SK) to cover all its
        districts. Jobs match your districts first, then widen to your area.
      </p>
    </div>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
      <span>{label}</span>
    </label>
  );
}

function YesNo({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex gap-1">
        {[{ l: 'Yes', v: true }, { l: 'No', v: false }].map((o) => (
          <button key={o.l} type="button" onClick={() => onChange(o.v)}
            className={`text-xs px-3 py-1 rounded ${value === o.v ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  // Section A
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessType, setBusinessType] = useState('');
  // Section B
  const [coverageAreas, setCoverageAreas] = useState<string[]>([]);
  const [radius, setRadius] = useState<number>(0);
  // Section C
  const [services, setServices] = useState<string[]>([]);
  // Section D
  const [preferredJobTypes, setPreferredJobTypes] = useState<string[]>([]);
  const [dailyCapacity, setDailyCapacity] = useState<number>(1);
  const [capsEnabled, setCapsEnabled] = useState(false);
  const [capsId, setCapsId] = useState('');
  // Section E
  const [mobileCount, setMobileCount] = useState(0);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [equipmentOther, setEquipmentOther] = useState('');
  const [fullyEquipped, setFullyEquipped] = useState<boolean>();
  const [yearRound, setYearRound] = useState<boolean>();
  const [needsDriveway, setNeedsDriveway] = useState<boolean>();
  const [carParkRoadside, setCarParkRoadside] = useState<boolean>();
  const [mobileNotes, setMobileNotes] = useState('');
  // Section F
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      api.put<{ nextStep?: string }>('/api/v1/repairer/onboarding', {
        businessName,
        contactName: contactName || undefined,
        phone: phone || undefined,
        businessType,
        coverageAreas,
        travelRadiusMiles: radius > 0 ? radius : undefined,
        services,
        preferredJobTypes,
        dailyCapacity,
        capsEnabled,
        capsId: capsEnabled && capsId ? capsId : undefined,
        mobileUnits: mobileCount > 0 ? {
          count: mobileCount, equipment, equipmentOther: equipmentOther || undefined,
          fullyEquipped, yearRound, needsDriveway, carParkRoadside, notes: mobileNotes || undefined,
        } : undefined,
        accuracyConfirmed,
        termsAccepted,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['repairer-org'] });
      // Proceed to secure card entry via the Stripe subscription flow.
      try {
        const { checkoutUrl } = await api.post<{ checkoutUrl?: string }>('/api/v1/repairer/subscription');
        if (checkoutUrl) { window.location.href = checkoutUrl; return; }
      } catch { /* fall through to billing */ }
      navigate('/billing?onboarded=1');
    },
  });

  const canNext = [
    businessName.trim() && businessType,      // step 0
    coverageAreas.length > 0,                 // step 1
    true,                                     // step 2 (services optional)
    true,                                     // step 3
    true,                                     // step 4
    accuracyConfirmed && termsAccepted,       // step 5
  ][step];

  const next = () => setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-emerald-600">Repair XChange</h1>
          <p className="text-gray-500 mt-1">Set up your account — about 3 minutes</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between mb-6">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex-1 flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                i < step ? 'bg-emerald-600 text-white' : i === step ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500' : 'bg-gray-200 text-gray-500'
              }`}>{i < step ? '✓' : i + 1}</div>
              <span className={`text-[10px] mt-1 ${i === step ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>{label}</span>
            </div>
          ))}
        </div>

        <Card>
          <CardBody>
            {step === 0 && (
              <Step title="Business basics">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input label="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
                  <Input label="Primary contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </div>
                <Input label="Phone number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44…" />
                <SelectField label="Business type" value={businessType} onChange={setBusinessType} options={BUSINESS_TYPES} />
              </Step>
            )}

            {step === 1 && (
              <Step title="Coverage area">
                <CoverageSelect selected={coverageAreas} onChange={setCoverageAreas} />
                <SelectField label="Travel radius" value={String(radius)}
                  onChange={(v) => setRadius(Number(v))}
                  options={RADIUS.map((r) => r.label)}
                  valueForOption={(label) => String(RADIUS.find((r) => r.label === label)?.v ?? 0)} />
              </Step>
            )}

            {step === 2 && (
              <Step title="Repair capabilities" hint="Tick everything you offer.">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SERVICES.map((s) => (
                    <CheckRow key={s.value} label={s.label} checked={services.includes(s.value)}
                      onChange={() => setServices(toggle(services, s.value))} />
                  ))}
                </div>
              </Step>
            )}

            {step === 3 && (
              <Step title="Operational preferences">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Preferred job types</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PREFERRED.map((p) => (
                      <CheckRow key={p} label={p} checked={preferredJobTypes.includes(p)}
                        onChange={() => setPreferredJobTypes(toggle(preferredJobTypes, p))} />
                    ))}
                  </div>
                </div>
                <SelectField label="Daily capacity" value={String(dailyCapacity)}
                  onChange={(v) => setDailyCapacity(Number(v))}
                  options={Array.from({ length: 10 }, (_, i) => String(i + 1))} />
                <div className="pt-2">
                  <YesNo label="CAPS enabled?" value={capsEnabled} onChange={setCapsEnabled} />
                  {capsEnabled && <Input label="CAPS ID" value={capsId} onChange={(e) => setCapsId(e.target.value)} />}
                </div>
              </Step>
            )}

            {step === 4 && (
              <Step title="Mobile units" hint="Only if you run mobile units — otherwise leave at 0.">
                <SelectField label="Number of mobile units" value={String(mobileCount)}
                  onChange={(v) => setMobileCount(Number(v))}
                  options={Array.from({ length: 11 }, (_, i) => String(i))} />
                {mobileCount > 0 && (
                  <>
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Van equipment</p>
                      <div className="grid grid-cols-2 gap-2">
                        {EQUIPMENT.map((e) => (
                          <CheckRow key={e} label={e} checked={equipment.includes(e)} onChange={() => setEquipment(toggle(equipment, e))} />
                        ))}
                      </div>
                      <Input label="Other equipment" value={equipmentOther} onChange={(e) => setEquipmentOther(e.target.value)} className="mt-2" />
                    </div>
                    <div className="border-t border-gray-100 pt-3 space-y-1">
                      <YesNo label="Fully equipped to complete repairs independently?" value={fullyEquipped} onChange={setFullyEquipped} />
                      <YesNo label="Operate year-round?" value={yearRound} onChange={setYearRound} />
                      <YesNo label="Require customer driveway access?" value={needsDriveway} onChange={setNeedsDriveway} />
                      <YesNo label="Operate in car parks / roadside?" value={carParkRoadside} onChange={setCarParkRoadside} />
                    </div>
                    <Input label="Notes (optional)" value={mobileNotes} onChange={(e) => setMobileNotes(e.target.value)} />
                  </>
                )}
              </Step>
            )}

            {step === 5 && (
              <Step title="Confirm & continue">
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 text-sm text-gray-600 space-y-1">
                  <p><span className="text-gray-900 font-medium">{businessName || '—'}</span> · {businessType || '—'}</p>
                  <p>Coverage: {coverageAreas.join(', ') || '—'}{radius > 0 ? ` · +${radius} mi` : ''}</p>
                  <p>Capabilities: {services.length ? services.map((s) => SERVICES.find((x) => x.value === s)?.label).join(', ') : '—'}</p>
                </div>
                <CheckRow label="I confirm all information provided is accurate." checked={accuracyConfirmed} onChange={setAccuracyConfirmed} />
                <CheckRow label="I have read and accept the Terms & Conditions." checked={termsAccepted} onChange={setTermsAccepted} />
                <p className="text-xs text-gray-500">
                  Next you'll enter card details for your monthly subscription and match fees. Payment is handled
                  securely by Stripe — we never see or store your card number (PCI-DSS compliant).
                </p>
                {submit.isError && <p className="text-sm text-red-600">Something went wrong — please check your details and try again.</p>}
              </Step>
            )}

            {/* Nav */}
            <div className="flex justify-between mt-6 pt-4 border-t border-gray-100">
              <Button variant="secondary" onClick={back} disabled={step === 0 || submit.isPending}>Back</Button>
              {step < STEP_LABELS.length - 1 ? (
                <Button onClick={next} disabled={!canNext}>Continue</Button>
              ) : (
                <Button onClick={() => submit.mutate()} disabled={!canNext} loading={submit.isPending}>
                  Complete &amp; continue to payment
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Step({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {hint && <p className="text-sm text-gray-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function SelectField({ label, value, onChange, options, valueForOption }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; valueForOption?: (o: string) => string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
        <option value="" disabled>Select…</option>
        {options.map((o) => {
          const v = valueForOption ? valueForOption(o) : o;
          return <option key={o} value={v}>{o}</option>;
        })}
      </select>
    </div>
  );
}
