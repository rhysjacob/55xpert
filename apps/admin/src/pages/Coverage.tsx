import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';

interface AreaRow { area: string; demand: number; supply: number; uncovered: boolean }
interface Coverage {
  areas: AreaRow[];
  totals: { areasWithDemand: number; uncoveredAreas: number; totalDemand: number; activeRepairers: number };
  generatedAt: string;
}

function Tile({ row, max }: { row: AreaRow; max: number }) {
  const intensity = max > 0 ? row.demand / max : 0;
  const bg = `rgba(79,70,229,${(0.08 + 0.92 * intensity).toFixed(2)})`;
  const light = intensity > 0.45;
  return (
    <div
      className={`relative rounded-lg p-2 text-center border ${row.uncovered ? 'border-red-500 border-2' : 'border-gray-200'}`}
      style={{ backgroundColor: row.demand > 0 ? bg : '#f9fafb' }}
      title={`${row.area}: ${row.demand} jobs · ${row.supply} repairer${row.supply === 1 ? '' : 's'} covering${row.uncovered ? ' · UNCOVERED' : ''}`}
    >
      <p className={`text-sm font-bold ${light ? 'text-white' : 'text-gray-900'}`}>{row.area}</p>
      <p className={`text-[11px] ${light ? 'text-indigo-50' : 'text-gray-500'}`}>{row.demand}·{row.supply}</p>
      {row.uncovered && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">!</span>}
    </div>
  );
}

export function CoveragePage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-coverage'], queryFn: () => api.get<Coverage>('/api/v1/admin/coverage') });
  const max = Math.max(1, ...(data?.areas.map((a) => a.demand) ?? [1]));

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Coverage heatmap</h1>
      <p className="text-sm text-gray-500 mb-6">Job demand vs repairer coverage by UK postcode area. Each tile shows <span className="font-mono">demand·supply</span>; a red ring marks an area with demand but no repairer covering it.</p>

      {isLoading || !data ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card><CardBody><p className="text-2xl font-bold text-indigo-600">{data.totals.totalDemand}</p><p className="text-sm text-gray-500">Total job demand</p></CardBody></Card>
            <Card><CardBody><p className="text-2xl font-bold text-gray-900">{data.totals.areasWithDemand}</p><p className="text-sm text-gray-500">Areas with demand</p></CardBody></Card>
            <Card><CardBody><p className="text-2xl font-bold text-red-600">{data.totals.uncoveredAreas}</p><p className="text-sm text-gray-500">Uncovered areas</p></CardBody></Card>
            <Card><CardBody><p className="text-2xl font-bold text-emerald-600">{data.totals.activeRepairers}</p><p className="text-sm text-gray-500">Active repairers</p></CardBody></Card>
          </div>

          {data.areas.length === 0 ? (
            <Card><CardBody><p className="text-gray-400 text-center py-6">No demand or coverage data yet.</p></CardBody></Card>
          ) : (
            <Card>
              <CardBody>
                <div className="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-12 gap-2">
                  {data.areas.map((row) => <Tile key={row.area} row={row} max={max} />)}
                </div>
                <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(79,70,229,0.15)' }} /> low demand</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(79,70,229,1)' }} /> high demand</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-red-500" /> uncovered</span>
                  <span className="ml-auto font-mono">demand·supply</span>
                </div>
              </CardBody>
            </Card>
          )}
          <p className="text-xs text-gray-400">Generated {new Date(data.generatedAt).toLocaleString('en-GB')}</p>
        </div>
      )}
    </Layout>
  );
}
