import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';

interface AreaRow { area: string; demand: number; supply: number; uncovered: boolean }
interface RepairerPoint { lat: number; lng: number; name: string; radiusKm?: number }
interface Coverage {
  areas: AreaRow[];
  points: { jobs: [number, number][]; repairers: RepairerPoint[] };
  totals: { areasWithDemand: number; uncoveredAreas: number; totalDemand: number; activeRepairers: number };
  generatedAt: string;
}

/** Leaflet map: job demand as a heat layer, repairer bases + coverage radius as markers. */
function CoverageMap({ jobs, repairers }: { jobs: [number, number][]; repairers: RepairerPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([54.5, -3], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    layers.clearLayers();

    // Job demand → heat layer.
    if (jobs.length) {
      const heat = (L as unknown as { heatLayer: (pts: [number, number][], opts: object) => L.Layer })
        .heatLayer(jobs, { radius: 28, blur: 20, minOpacity: 0.35, max: 3 });
      layers.addLayer(heat);
    }

    // Repairer bases → markers + coverage-radius circles.
    for (const r of repairers) {
      if (r.radiusKm) {
        layers.addLayer(L.circle([r.lat, r.lng], {
          radius: r.radiusKm * 1000, color: '#059669', weight: 1, fillColor: '#059669', fillOpacity: 0.06,
        }));
      }
      layers.addLayer(
        L.circleMarker([r.lat, r.lng], { radius: 6, color: '#065f46', weight: 2, fillColor: '#10b981', fillOpacity: 0.9 })
          .bindPopup(`<strong>${r.name}</strong>${r.radiusKm ? `<br/>covers ~${r.radiusKm} km` : ''}`),
      );
    }

    // Fit to the data if we have any points.
    const all: L.LatLngExpression[] = [...jobs, ...repairers.map((r) => [r.lat, r.lng] as [number, number])];
    if (all.length) map.fitBounds(L.latLngBounds(all).pad(0.3), { maxZoom: 10 });
  }, [jobs, repairers]);

  return <div ref={containerRef} className="h-[460px] w-full rounded-lg z-0" />;
}

export function CoveragePage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-coverage'], queryFn: () => api.get<Coverage>('/api/v1/admin/coverage') });
  const max = Math.max(1, ...(data?.areas.map((a) => a.demand) ?? [1]));

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Coverage heatmap</h1>
      <p className="text-sm text-gray-500 mb-6">Job demand (heat) vs repairer coverage (green markers + radius) across the UK.</p>

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

          <Card>
            <CardBody>
              <CoverageMap jobs={data.points.jobs} repairers={data.points.repairers} />
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: 'radial-gradient(circle, #ef4444, #f59e0b, #3b82f6)' }} /> job demand (heat)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-emerald-800" /> repairer base + coverage radius</span>
                {data.points.jobs.length === 0 && <span className="text-amber-600">No geocoded jobs yet — run the geocode backfill to populate the heat layer.</span>}
              </div>
            </CardBody>
          </Card>

          {/* Area breakdown */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">By postcode area <span className="font-mono normal-case text-gray-400">(demand·supply)</span></h2>
            <Card>
              <CardBody>
                <div className="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-12 gap-2">
                  {data.areas.map((row) => {
                    const intensity = max > 0 ? row.demand / max : 0;
                    const light = intensity > 0.45;
                    return (
                      <div key={row.area}
                        className={`relative rounded-lg p-2 text-center border ${row.uncovered ? 'border-red-500 border-2' : 'border-gray-200'}`}
                        style={{ backgroundColor: row.demand > 0 ? `rgba(79,70,229,${(0.08 + 0.92 * intensity).toFixed(2)})` : '#f9fafb' }}
                        title={`${row.area}: ${row.demand} jobs · ${row.supply} covering${row.uncovered ? ' · UNCOVERED' : ''}`}>
                        <p className={`text-sm font-bold ${light ? 'text-white' : 'text-gray-900'}`}>{row.area}</p>
                        <p className={`text-[11px] ${light ? 'text-indigo-50' : 'text-gray-500'}`}>{row.demand}·{row.supply}</p>
                        {row.uncovered && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">!</span>}
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          </section>

          <p className="text-xs text-gray-400">Generated {new Date(data.generatedAt).toLocaleString('en-GB')}</p>
        </div>
      )}
    </Layout>
  );
}
