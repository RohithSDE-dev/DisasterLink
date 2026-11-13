"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "../interactive";
import TamilNaduMap from "../TamilNaduMap";
import { Chip, EmptyState, Notice, RiskBadge, SectionHeading, SourceBadge, Stat, formatDateTime } from "../ui";

type DistrictEntry = {
  code: string;
  name: string;
  region: string;
  hasPolygon: boolean;
  lat: number;
  lng: number;
  incidents: { total: number; pending: number; verified: number; resolved: number; recentWater: number };
  openSos: number;
  facilities: number;
  shelters: number;
  risk: {
    level: string;
    score: number;
    explanation: string;
    factors: { id: string; label: string; points: number; sourceClass: string }[];
    disclaimer: string;
    confidence: string;
    generatedAt: string;
  };
  weather: { available: boolean; stale: boolean; temperature: number | null; rainfall: number | null; condition: string | null; next24hRainfall: number | null; fetchedAt: string };
};

export default function DistrictMapExplorer({ initialCode }: { initialCode?: string }) {
  const { data, loading, error } = useApi<{ districts: DistrictEntry[] }>("/api/districts");
  const [selected, setSelected] = useState<string | null>(initialCode ?? null);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("ALL");

  const list = data?.districts ?? [];
  const activeCode = selected ?? "TN-CBE";
  const active = list.find((d) => d.code === activeCode) ?? null;

  const filtered = useMemo(
    () =>
      list
        .filter((d) => (region === "ALL" ? true : d.region === region))
        .filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => b.risk.score - a.risk.score),
    [list, region, query],
  );

  if (loading && !data) return <div className="h-[520px] animate-pulse rounded-xl border border-slate-200 bg-white" />;
  if (error) return <Notice tone="danger" title="District data unavailable">{error}</Notice>;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Geographic intelligence"
        title="Tamil Nadu district explorer"
        description="Click any district polygon to open its data panel instantly. Fill colour is the MODEL_RISK_ESTIMATE heuristic; it is not an official flood-zone map."
        action={<SourceBadge source="MODEL_RISK_ESTIMATE" />}
      />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter district list…" className="input h-9 max-w-[220px] text-xs" />
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="input h-9 w-auto py-1 text-xs">
              <option value="ALL">All regions</option>
              {["North", "Central", "West", "Delta", "South"].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <Chip tone="blue">{filtered.length} districts shown</Chip>
            <Link href="/intelligence" className="btn-outline btn-sm ml-auto">Layer controls &amp; AI</Link>
          </div>

          <TamilNaduMap
            districts={filtered.map((d) => ({
              code: d.code,
              name: d.name,
              riskLevel: d.risk.level,
              incidents: d.incidents.total,
              openSos: d.openSos,
              temperature: d.weather.temperature,
            }))}
            selectedCode={activeCode}
            onSelectDistrict={(code) => setSelected(code)}
            heightClass="h-[460px] sm:h-[620px]"
          />

          <div className="card overflow-hidden">
            <div className="max-h-[320px] overflow-y-auto">
              <table className="table-base">
                <thead className="sticky top-0">
                  <tr>
                    <th>District</th>
                    <th>Risk</th>
                    <th className="text-right">Reports</th>
                    <th className="text-right">Pending</th>
                    <th className="text-right">Verified</th>
                    <th className="text-right">Open SOS</th>
                    <th className="text-right">Facilities</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr
                      key={d.code}
                      onClick={() => setSelected(d.code)}
                      className={`cursor-pointer hover:bg-blue-50/60 ${activeCode === d.code ? "bg-blue-50" : ""}`}
                    >
                      <td className="font-semibold text-slate-800">{d.name}</td>
                      <td><RiskBadge level={d.risk.level} /></td>
                      <td className="text-right tabular-nums">{d.incidents.total}</td>
                      <td className="text-right tabular-nums">{d.incidents.pending}</td>
                      <td className="text-right tabular-nums">{d.incidents.verified}</td>
                      <td className="text-right tabular-nums">{d.openSos}</td>
                      <td className="text-right tabular-nums">{d.facilities}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {active ? (
            <>
              <div className="card card-pad">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">{active.region} Tamil Nadu</p>
                    <h3 className="text-xl font-extrabold text-slate-900">{active.name}</h3>
                    <p className="text-[11px] text-slate-500">
                      {active.lat.toFixed(3)}° N, {active.lng.toFixed(3)}° E
                    </p>
                  </div>
                  <RiskBadge level={active.risk.level} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Stat label="Temperature" value={active.weather.available ? `${active.weather.temperature?.toFixed(1)} °C` : "—"} hint={active.weather.condition ?? "unavailable"} />
                  <Stat label="Rain next 24h" value={active.weather.available ? `${active.weather.next24hRainfall} mm` : "—"} hint="forecast" />
                  <Stat label="Verified reports" value={active.incidents.verified} tone="good" hint={`${active.incidents.total} total`} />
                  <Stat label="Open SOS" value={active.openSos} tone={active.openSos > 0 ? "danger" : "default"} hint="requires review" />
                </div>

                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Risk explanation</p>
                    <span className="text-xs font-bold text-slate-700">{active.risk.score}/100</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600">{active.risk.explanation}</p>
                  <ul className="mt-2 space-y-1">
                    {active.risk.factors
                      .filter((f) => f.points > 0)
                      .map((f) => (
                        <li key={f.id} className="flex items-start justify-between gap-2 text-[11px]">
                          <span className="text-slate-600">{f.label}</span>
                          <span className="font-bold text-orange-600">+{f.points}</span>
                        </li>
                      ))}
                  </ul>
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{active.risk.disclaimer}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/districts/${active.code}`} className="btn-primary btn-sm">District intelligence</Link>
                  <Link href={`/report?district=${active.code}`} className="btn-outline btn-sm">Report here</Link>
                  <Link href={`/facilities?district=${active.code}`} className="btn-outline btn-sm">Facilities</Link>
                </div>
                <p className="mt-2 text-[10px] text-slate-500">
                  Weather update {formatDateTime(active.weather.fetchedAt)} · risk model refreshed on this request
                </p>
              </div>

              <div className="card card-pad">
                <h4 className="text-sm font-bold text-slate-900">Coverage notes</h4>
                <ul className="mt-2 space-y-1.5 text-[11px] text-slate-600">
                  <li>• 38 districts listed; boundary polygons cover 37 undivided Census 2011 districts.</li>
                  <li>• Mayiladuthurai (carved from Nagapattinam in 2020) is selectable without a polygon in this dataset.</li>
                  <li>• Facility counts are directory candidates, not verified bed/stock availability.</li>
                  <li>• Official shelters appear only when an administrator records a source-backed designation.</li>
                </ul>
              </div>
            </>
          ) : (
            <EmptyState title="Select a district" description="Click the map or the table to load a district panel." />
          )}
        </div>
      </div>
    </div>
  );
}
