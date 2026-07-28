import { useState, useEffect, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { RepairMethod, VehicleSize, humanize } from '@corexpert/core';

interface RepairerPreferences {
  maxDistanceMiles: number;
  minLabourRate: number;
  vehicleSizes: string[];
  repairMethods: string[];
  notifyByEmail: boolean;
  notifyByWhatsApp?: boolean;
  whatsappNumber?: string;
}

// Driven from the shared enums so the options always match what the API accepts
// and what jobs are tagged with (was a stale hand-written list pre-dating the
// matrix/eligibility work).
const VEHICLE_SIZES = Object.values(VehicleSize);
const REPAIR_METHODS = Object.values(RepairMethod);

export function PreferencesPage() {
  const queryClient = useQueryClient();
  const [maxDistance, setMaxDistance] = useState(25);
  const [minRate, setMinRate] = useState(3500);
  const [sizes, setSizes] = useState<string[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [success, setSuccess] = useState('');

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => api.get<RepairerPreferences>('/api/v1/repairer/preferences'),
  });

  useEffect(() => {
    if (prefs) {
      setMaxDistance(prefs.maxDistanceMiles);
      setMinRate(prefs.minLabourRate);
      setSizes(prefs.vehicleSizes ?? []);
      setMethods(prefs.repairMethods ?? []);
      setNotifyEmail(prefs.notifyByEmail ?? true);
      setNotifyWhatsApp(prefs.notifyByWhatsApp ?? false);
      setWhatsappNumber(prefs.whatsappNumber ?? '');
    }
  }, [prefs]);

  const mutation = useMutation({
    mutationFn: (data: RepairerPreferences) =>
      api.put('/api/v1/repairer/preferences', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] });
      setSuccess('Preferences saved.');
      setTimeout(() => setSuccess(''), 3000);
    },
  });

  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      maxDistanceMiles: maxDistance,
      minLabourRate: minRate,
      vehicleSizes: sizes,
      repairMethods: methods,
      notifyByEmail: notifyEmail,
      notifyByWhatsApp: notifyWhatsApp,
      whatsappNumber: whatsappNumber.trim(),
    });
  };

  if (isLoading) {
    return <Layout><div className="text-center py-12 text-gray-500">Loading...</div></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Job Preferences</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><h2 className="font-semibold">Distance & Rate</h2></CardHeader>
            <CardBody className="space-y-4">
              <Input
                label={`Maximum distance (${maxDistance} miles)`}
                type="range"
                min={5}
                max={100}
                value={maxDistance}
                onChange={(e) => setMaxDistance(Number(e.target.value))}
              />
              <Input
                label="Minimum labour rate (pence/hour)"
                type="number"
                value={minRate}
                onChange={(e) => setMinRate(Number(e.target.value))}
                min={0}
                step={100}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader><h2 className="font-semibold">Vehicle Sizes</h2></CardHeader>
            <CardBody>
              <div className="flex flex-wrap gap-2">
                {VEHICLE_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => toggleItem(sizes, size, setSizes)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      sizes.includes(size)
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {humanize(size)}
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><h2 className="font-semibold">Repair Methods</h2></CardHeader>
            <CardBody>
              <div className="flex flex-wrap gap-2">
                {REPAIR_METHODS.map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => toggleItem(methods, method, setMethods)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      methods.includes(method)
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {humanize(method)}
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><h2 className="font-semibold">Notifications</h2></CardHeader>
            <CardBody>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">
                  Notify me by email when matching jobs are posted
                </span>
              </label>

              <div className="pt-3 mt-3 border-t border-gray-100 space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={notifyWhatsApp}
                    onChange={(e) => setNotifyWhatsApp(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">
                    Also send me job alerts on WhatsApp
                  </span>
                </label>
                {notifyWhatsApp && (
                  <Input
                    label="WhatsApp number"
                    type="tel"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="+44 7700 900123"
                  />
                )}
                <p className="text-xs text-gray-400">
                  By opting in you consent to receive job alerts on WhatsApp. WhatsApp alerts go live once our
                  WhatsApp Business number is active — until then you'll continue to receive them by email.
                </p>
              </div>
            </CardBody>
          </Card>

          {mutation.isError && (
            <p className="text-sm text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : 'Save failed'}
            </p>
          )}
          {success && <p className="text-sm text-green-600">{success}</p>}

          <Button type="submit" loading={mutation.isPending}>
            Save preferences
          </Button>
        </form>
      </div>
    </Layout>
  );
}
