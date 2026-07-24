import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MarketingLayout, PageHero } from '../../components/marketing/MarketingLayout';
import { api } from '../../lib/api-client';
import { Card, CardBody } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

const ORG_TYPES = ['Warranty Provider', 'Accident Management Company', 'Fleet / Leasing', 'Broker', 'MGA', 'Insurer', 'Other'];
const ROLES = ['Operations', 'Claims', 'Customer Experience', 'Commercial', 'Technical', 'Other'];
const INTERESTS = [
  'Image ingestion & AI triage',
  'FraudLens authenticity checking',
  'Repair deployment',
  'Pricing alignment',
  'White-label reporting',
  'Integration with existing systems',
  'API creation',
  'Pilot programme',
  'Full commercial rollout',
];
const VOLUMES = ['0–100', '100–500', '500–1,000', '1,000+'];
const COVERAGE = ['UK Nationwide', 'Regional', 'Specific postcodes'];

/** Section heading with a subtle rule. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">{label}</legend>
      {children}
    </fieldset>
  );
}

function Select({ label, value, onChange, options, required }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <option value="" disabled>Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function CheckGroup({ options, selected, onToggle }: {
  options: string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={selected.includes(o)} onChange={() => onToggle(o)}
            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
          <span>{o}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Customer register-interest form (warranty / fleet / broker / insurer / MGA).
 * NOTE: no lead-capture backend yet — on submit this validates and shows the
 * confirmation. Wiring it to SES / a leads table is a follow-up.
 */
export function RegisterInterestPage() {
  const [orgName, setOrgName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [orgType, setOrgType] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [volume, setVolume] = useState('');
  const [coverage, setCoverage] = useState('');
  const [postcodes, setPostcodes] = useState('');
  const [nextSteps, setNextSteps] = useState<string[]>([]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = useMutation({
    mutationFn: () =>
      api.post('/api/v1/leads', {
        type: 'REGISTER_INTEREST',
        name: contactName,
        email,
        phone: phone || undefined,
        organisation: orgName,
        data: { tradingName, orgType, role, interests, volume, coverage, postcodes, nextSteps },
      }),
  });
  const submitted = submit.isSuccess;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.mutate();
  };

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Register interest"
        title="Explore The Repair XChange"
        subtitle="For warranty providers, fleets, brokers, insurers and MGAs. Tell us a little about your organisation and we'll be in touch."
      />

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <Card>
          <CardBody>
            {submitted ? (
              <div className="text-center py-10">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-2xl">✓</div>
                <h3 className="text-xl font-semibold text-gray-900 mt-4">Thank you</h3>
                <p className="text-gray-600 mt-2">A member of our team will contact you within 24 hours.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-10">
                <Section label="Organisation details">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input label="Organisation name" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
                    <Input label="Trading name (if different)" value={tradingName} onChange={(e) => setTradingName(e.target.value)} />
                  </div>
                  <Select label="Organisation type" value={orgType} onChange={setOrgType} options={ORG_TYPES} required />
                </Section>

                <Section label="Contact information">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input label="Primary contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} required />
                    <Input label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input label="Phone number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44…" />
                    <Select label="Role" value={role} onChange={setRole} options={ROLES} />
                  </div>
                </Section>

                <Section label="Your interest">
                  <p className="text-sm text-gray-600 -mt-1">What are you looking to explore?</p>
                  <CheckGroup options={INTERESTS} selected={interests} onToggle={(v) => toggle(interests, setInterests, v)} />
                </Section>

                <Section label="Volume & coverage (optional)">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Select label="Estimated monthly repair volume" value={volume} onChange={setVolume} options={VOLUMES} />
                    <Select label="Coverage" value={coverage} onChange={setCoverage} options={COVERAGE} />
                  </div>
                  {coverage === 'Specific postcodes' && (
                    <Input label="Specific postcodes" value={postcodes} onChange={(e) => setPostcodes(e.target.value)} placeholder="e.g. SW, M1, BB…" />
                  )}
                </Section>

                <Section label="Next steps">
                  <CheckGroup
                    options={['I would like a call back', 'I would like a demo', 'I would like to discuss integration']}
                    selected={nextSteps}
                    onToggle={(v) => toggle(nextSteps, setNextSteps, v)}
                  />
                </Section>

                {submit.isError && (
                  <p className="text-sm text-red-600">Sorry — something went wrong. Please try again.</p>
                )}
                <Button type="submit" size="lg" className="w-full" loading={submit.isPending}>Submit interest</Button>
              </form>
            )}
          </CardBody>
        </Card>
      </section>
    </MarketingLayout>
  );
}
