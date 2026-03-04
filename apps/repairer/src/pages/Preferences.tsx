import { useState, useEffect, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface RepairerPreferences {
  maxDistanceMiles: number;
  minLabourRate: number;
  vehicleSizes: string[];
  repairMethods: string[];
  notifyByEmail: boolean;
}

const VEHICLE_SIZES = ['SMALL', 'MEDIUM', 'LARGE', 'VAN', 'SUV'];
const REPAIR_METHODS = [
  'SMART_REPAIR',
  'PDR',
  'PANEL_REPLACEMENT',
  'FULL_RESPRAY',
  'SPOT_REPAIR',
  'BLEND_AND_POLISH',
  'HEADLIGHT_RESTORATION',
  'BUMPER_REPAIR',
];

export function PreferencesPage() {
  const queryClient = useQueryClient();
  const [maxDistance, setMaxDistance] = useState(25);
  const [minRate, setMinRate] = useState(3500);
  const [sizes, setSizes] = useState<string[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [notifyEmail, setNotifyEmail] = useState(true);
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
                    {size}
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
                    {method.replace(/_/g, ' ')}
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
