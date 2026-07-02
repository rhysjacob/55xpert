import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';

interface ModelOption {
  id: string;
  label: string;
  note?: string;
  provider: string;
  estCostPerCasePence: number;
}

interface ModelConfigResponse {
  debugEnabled: boolean;
  activeModel: string;
  envDefault: string;
  availableModels: ModelOption[];
  tokenProfile?: { inputTokens: number; outputTokens: number };
}

export function ModelConfigPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState('');
  const [saved, setSaved] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['model-config'],
    queryFn: () => api.get<ModelConfigResponse>('/api/v1/admin/model-config'),
  });

  useEffect(() => {
    if (data) setSelected(data.activeModel);
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.put<ModelConfigResponse>('/api/v1/admin/model-config', { activeModel: selected }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['model-config'] });
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const toggleDebug = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put<ModelConfigResponse>('/api/v1/admin/model-config', { debugEnabled: enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['model-config'] }),
  });

  if (isLoading) return <Layout><div className="text-center py-12 text-gray-500">Loading…</div></Layout>;
  if (error || !data) {
    return <Layout><div className="text-center py-12 text-red-500">{error instanceof Error ? error.message : 'Failed to load'}</div></Layout>;
  }

  const effectiveModel = data.debugEnabled ? data.activeModel : data.envDefault;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">AI Model (Debug)</h1>
        <p className="text-gray-500 mb-6">Switch the model used for AI triage. Only takes effect while the debug feature toggle is on.</p>

        <Card className="mb-6">
          <CardBody>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Debug mode</p>
                <p className={`text-lg font-semibold ${data.debugEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                  {data.debugEnabled ? 'ENABLED' : 'DISABLED'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm text-gray-500">Currently used for triage</p>
                  <p className="text-sm font-mono text-gray-800">{effectiveModel}</p>
                </div>
                <Button
                  variant={data.debugEnabled ? 'secondary' : 'primary'}
                  loading={toggleDebug.isPending}
                  onClick={() => toggleDebug.mutate(!data.debugEnabled)}
                >
                  {data.debugEnabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>
            {!data.debugEnabled && (
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                Debug mode is off — triage uses the deploy default (<span className="font-mono">{data.envDefault}</span>).
                Click <span className="font-medium">Enable</span> to override the model below.
              </div>
            )}
            {toggleDebug.isError && (
              <p className="mt-2 text-sm text-red-600">{toggleDebug.error.message}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold">Select model</h2></CardHeader>
          <CardBody className="space-y-4">
            <div className="space-y-2">
              {[...data.availableModels].sort((a, b) => a.estCostPerCasePence - b.estCostPerCasePence).map((m) => (
                <label
                  key={m.id}
                  className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${
                    selected === m.id ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200'
                  } ${data.debugEnabled ? '' : 'opacity-50 cursor-not-allowed'}`}
                >
                  <input
                    type="radio"
                    name="model"
                    className="mt-1"
                    value={m.id}
                    checked={selected === m.id}
                    disabled={!data.debugEnabled}
                    onChange={() => setSelected(m.id)}
                  />
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium text-gray-900">{m.label}</p>
                      <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                        ~{m.estCostPerCasePence.toFixed(2)}p / case
                      </span>
                    </div>
                    {m.note && <p className="text-xs text-gray-500">{m.note}</p>}
                    <p className="text-xs font-mono text-gray-400">{m.id}</p>
                  </div>
                </label>
              ))}
            </div>
            {data.tokenProfile && (
              <p className="text-xs text-gray-400">
                Estimate assumes a typical assessment of ~{data.tokenProfile.inputTokens.toLocaleString()} input +
                {' '}{data.tokenProfile.outputTokens.toLocaleString()} output tokens (≈4 images + JSON). Actual token
                usage is logged per triage.
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={() => save.mutate()}
                loading={save.isPending}
                disabled={!data.debugEnabled || selected === data.activeModel}
              >
                Save
              </Button>
              {saved && <span className="text-sm text-green-600">Saved — new triages will use this model.</span>}
              {save.isError && <span className="text-sm text-red-600">{save.error.message}</span>}
            </div>
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
