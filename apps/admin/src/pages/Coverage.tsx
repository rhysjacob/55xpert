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
interface DistrictMaps {
  demand: Record<string, number>;
  districtSupply: Record<string, number>;
  areaSupply: Record<string, number>;
}
interface Coverage {
  areas: AreaRow[];
  districts: DistrictMaps;
  points: { jobs: [number, number][]; repairers: RepairerPoint[] };
  totals: { areasWithDemand: number; uncoveredAreas: number; totalDemand: number; activeRepairers: number };
  generatedAt: string;
}

const areaOf = (district: string): string => district.match(/^[A-Z]{1,2}/)?.[0] ?? district;

/**
 * Leaflet choropleth. The primary layer is the REAL postcode-district polygons
 * (vendored GeoJSON, one file per area under /postcode-districts). Each district
 * is shaded green where a repairer covers it, red where there's demand and no
 * coverage, and faint grey otherwise. Job locations underlay as a heat cloud;
 * repairer bases + their (fallback) travel radius sit on top as light markers.
 */
function CoverageMap({ areas, districts, jobs, repairers }: {
  areas: AreaRow[];
  districts: DistrictMaps;
  jobs: [number, number][];
  repairers: RepairerPoint[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([54.5, -3], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap · boundaries: Wikipedia (CC BY-SA)',
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
    let cancelled = false;
    layers.clearLayers();

    // Job demand → heat underlay.
    if (jobs.length) {
      const heat = (L as unknown as { heatLayer: (pts: [number, number][], opts: object) => L.Layer })
        .heatLayer(jobs, { radius: 26, blur: 20, minOpacity: 0.3, max: 3 });
      layers.addLayer(heat);
    }

    const supplyOf = (d: string) => (districts.districtSupply[d] ?? 0) + (districts.areaSupply[areaOf(d)] ?? 0);

    // Real district polygons → the primary choropleth. Fetch only the areas we
    // actually have demand/supply for (each is a small file); ignore any missing.
    const areaCodes = [...new Set(areas.map((a) => a.area))];
    void Promise.all(
      areaCodes.map(async (code) => {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}postcode-districts/${code}.geojson`);
          if (!res.ok) return null;
          return (await res.json()) as GeoJSON.FeatureCollection;
        } catch {
          return null;
        }
      }),
    ).then((collections) => {
      if (cancelled || !mapRef.current) return;
      const bounds = L.latLngBounds([]);
      for (const fc of collections) {
        if (!fc) continue;
        const layer = L.geoJSON(fc, {
          style: (feature) => {
            const d = (feature?.properties?.['name'] as string | undefined) ?? '';
            const supply = supplyOf(d);
            const demand = districts.demand[d] ?? 0;
            const covered = supply > 0;
            const fillColor = covered ? '#10b981' : demand > 0 ? '#ef4444' : '#94a3b8';
            const fillOpacity = covered ? 0.5 : demand > 0 ? 0.55 : 0.12;
            return { color: '#475569', weight: 1, fillColor, fillOpacity };
          },
          onEachFeature: (feature, lyr) => {
            const d = (feature.properties?.['name'] as string | undefined) ?? '';
            const supply = supplyOf(d);
            const demand = districts.demand[d] ?? 0;
            const covered = supply > 0;
            lyr.bindPopup(
              `<strong>${d}</strong><br/>${demand} job${demand === 1 ? '' : 's'} · ${supply} repairer${supply === 1 ? '' : 's'} covering${covered ? '' : '<br/><em>uncovered</em>'}`,
            );
            lyr.bindTooltip(d, { permanent: false, direction: 'center', className: 'area-label' });
          },
        });
        layer.addTo(layers);
        bounds.extend(layer.getBounds());
      }

      // Repairer bases → light markers + faint travel-radius circle (fallback signal).
      for (const r of repairers) {
        if (r.radiusKm) {
          layers.addLayer(L.circle([r.lat, r.lng], {
            radius: r.radiusKm * 1000, color: '#64748b', weight: 1, dashArray: '4', fillColor: '#64748b', fillOpacity: 0.03,
          }));
        }
        layers.addLayer(
          L.circleMarker([r.lat, r.lng], { radius: 4, color: '#1e293b', weight: 1, fillColor: '#334155', fillOpacity: 0.9 })
            .bindPopup(`<strong>${r.name}</strong>${r.radiusKm ? `<br/>travel radius ~${r.radiusKm} km (fallback)` : ''}`),
        );
        bounds.extend([r.lat, r.lng]);
      }
      for (const j of jobs) bounds.extend(j);

      if (bounds.isValid()) map.fitBounds(bounds.pad(0.15), { maxZoom: 11 });
    });

    return () => { cancelled = true; };
  }, [areas, districts, jobs, repairers]);

  return (
    <>
      <style>{`.leaflet-tooltip.area-label{background:transparent;border:none;box-shadow:none;color:#0f172a;font-weight:700;font-size:11px;text-shadow:0 0 2px #fff,0 0 2px #fff;}`}</style>
      <div ref={containerRef} className="h-[460px] w-full rounded-lg z-0" />
    </>
  );
}

export function CoveragePage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-coverage'], queryFn: () => api.get<Coverage>('/api/v1/admin/coverage') });
  const max = Math.max(1, ...(data?.areas.map((a) => a.demand) ?? [1]));

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Coverage heatmap</h1>
      <p className="text-sm text-gray-500 mb-6">Real postcode districts shaded by coverage — green where a repairer covers them, red where there's demand and none, over a heat cloud of job locations.</p>

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
              <CoverageMap areas={data.areas} districts={data.districts} jobs={data.points.jobs} repairers={data.points.repairers} />
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500 border border-emerald-800" /> covered district</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 border border-red-800" /> uncovered demand</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-400 border border-slate-500" /> district, no demand</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: 'radial-gradient(circle, #ef4444, #f59e0b, #3b82f6)' }} /> job locations (heat)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-600" /> repairer base + travel radius (fallback)</span>
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
