"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "../interactive";
import { MiniBars, TrendLines } from "../charts";
import { Chip, DataClassBadge, EmptyState, Notice, RiskBadge, SectionHeading, SourceBadge, Stat, formatDateTime } from "../ui";

type BoardRow = {
  code: string;
  name: string;
  region: string;
  risk: { level: string; score: number; explanation: string };
  weather: { available: boolean; stale: boolean; temperature: number | null; rainfall: number | null; condition: string | null; next24hRainfall: number | null; fetchedAt: string };
  incidents: { total: number; pending: number; verified: number };
  openSos: number;
};

type AlertRow = { id: number; title: string; severity: string; districtCode: string | null; sourceClass: string; isActive: boolean; category: string; issuedAt: string | null; expiresAt: string | null; sourceName: string };

export default function WeatherIntelConsole() {
  const board = useApi<{ districts: BoardRow[] }>("/api/districts");
  const alertsApi = useApi<{ alerts: AlertRow[]; counts: Record<string, number> }>("/api/alerts?includeInactive=1");
  const [sort, setSort] = useState<"rainfall" | "temperature" | "risk">("rainfall");

  const rows = useMemo(() => {
    const list = board.data?.districts ?? [];
    if (sort === "rainfall") return [...list].sort((a, b) => (b.weather.next24hRainfall ?? -1) - (a.weather.next24hRainfall ?? -1));
    if (sort === "temperature") return [...list].sort((a, b) => (b.weather.temperature ?? -99) - (a.weather.temperature ?? -99));
    return [...list].sort((a, b) => b.risk.score - a.risk.score);
  }, [board.data, sort]);

  const available = rows.filter((row) => row.weather.available);
  const heavy = rows.filter((row) => (row.weather.next24hRainfall ?? 0) >= 30);
  const moderate = rows.filter((row) => {
    const rain = row.weather.next24hRainfall ?? 0;
    return rain >= 10 && rain < 30;
  });
  const unavailable = rows.length - available.length;
  const activeAlerts = (alertsApi.data?.alerts ?? []).filter((alert) => alert.isActive);

  const rainfallTrend = rows
    .slice(0, 10)
    .map((row) => ({ label: row.name.slice(0, 8), incidents: Math.round((row.weather.next24hRainfall ?? 0) * 10) / 10 }));

  const regional = ["North", "Central", "West", "Delta", "South"].map((region) => {
    const regionRows = available.filter((row) => row.region === region);
    const average = regionRows.length
      ? regionRows.reduce((sum, row) => sum + (row.weather.next24hRainfall ?? 0), 0) / regionRows.length
      : 0;
    return { label: region, value: Math.round(average * 10) / 10 };
  });

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Weather intelligence"
        title="Statewide rainfall, temperature and risk signals"
        description="Observed and forecast data from Open-Meteo at district reference points, batched and cached for 15 minutes. Official warnings are not ingested."
        action={<SourceBadge source="FORECAST" />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Districts reporting" value={`${available.length}/${rows.length}`} hint={unavailable ? `${unavailable} temporarily unavailable` : "provider reachable"} tone="info" />
        <Stat label="Heavy forecast (≥30 mm)" value={heavy.length} hint={heavy.slice(0, 2).map((row) => row.name).join(", ") || "none"} tone="danger" />
        <Stat label="Moderate forecast" value={moderate.length} hint="10–30 mm next 24 h" tone="warn" />
        <Stat label="Weather cache" value={available[0] ? formatDateTime(available[0].weather.fetchedAt) : "—"} hint="refresh cycle ≤15 min" tone="default" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <SectionHeading
          eyebrow="Weather warning status"
          title="Active notices feeding the warning layer"
          description="Officer-published notices. Forecast-derived signals are shown per district on the citizen weather page and are never treated as official warnings."
          action={<Link href="/admin/alerts" className="btn-outline btn-sm">Manage alerts</Link>}
        />
        {activeAlerts.length ? (
          <div className="overflow-x-auto">
            <table className="table-base min-w-[620px]">
              <thead><tr><th>Alert</th><th>District</th><th>Severity</th><th>Class</th><th>Issued</th><th>Expires</th></tr></thead>
              <tbody>
                {activeAlerts.map((alert) => (
                  <tr key={alert.id}>
                    <td className="text-xs font-semibold">{alert.title}<p className="text-[10px] font-normal text-slate-500">{alert.sourceName}</p></td>
                    <td className="text-[11px]">{alert.districtCode ? rows.find((row) => row.code === alert.districtCode)?.name ?? alert.districtCode : "State-wide"}</td>
                    <td><Chip tone={alert.severity === "CRITICAL" ? "red" : alert.severity === "HIGH" ? "orange" : "amber"}>{alert.severity}</Chip></td>
                    <td><SourceBadge source={alert.sourceClass} /></td>
                    <td className="text-[10px] text-slate-500">{formatDateTime(alert.issuedAt)}</td>
                    <td className="text-[10px] text-slate-500">{formatDateTime(alert.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">No active warning notice. Weather values below are provider observations and forecasts, not official warnings.</p>
        )}
      </div>

      {unavailable ? (
        <Notice tone="warn" title="Partial provider data">
          {unavailable} district(s) currently lack a provider observation. They are shown as “n/a” rather than with fabricated values. Cached
          observations are labelled stale.
        </Notice>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card card-pad">
          <SectionHeading eyebrow="Forecast ranking" title="Next-24h rainfall by district" />
          <div className="max-h-[280px] overflow-auto">
            <table className="table-base min-w-[520px]">
              <thead className="sticky top-0">
                <tr><th>District</th><th>Condition</th><th className="text-right">Now</th><th className="text-right">Next 24h</th><th>Risk</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.code}>
                    <td className="text-xs font-semibold">{row.name}</td>
                    <td className="text-[11px]">{row.weather.available ? `${row.weather.condition ?? "—"} · ${row.weather.temperature?.toFixed(1)} °C` : <span className="text-amber-700">n/a</span>}</td>
                    <td className="text-right text-xs tabular-nums">{row.weather.available ? `${row.weather.rainfall?.toFixed(1) ?? "—"} mm` : "n/a"}</td>
                    <td className="text-right text-xs tabular-nums">{row.weather.available ? `${row.weather.next24hRainfall ?? "—"} mm` : "n/a"}</td>
                    <td><RiskBadge level={row.risk.level} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(["rainfall", "temperature", "risk"] as const).map((key) => (
              <button key={key} onClick={() => setSort(key)} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${sort === key ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>
                Sort by {key}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card card-pad">
            <SectionHeading eyebrow="Distribution" title="Regional average forecast rainfall" description="Simple mean of district reference points in each region." />
            <MiniBars data={regional.map((row) => ({ ...row, color: "#0ea5e9" }))} />
          </div>
          <div className="card card-pad">
            <SectionHeading eyebrow="Trend view" title="Top districts by forecast rainfall" />
            {rainfallTrend.some((row) => row.incidents > 0) ? (
              <TrendLines data={rainfallTrend} />
            ) : (
              <EmptyState title="No rainfall signal" description="All districts currently show little or no forecast accumulation." />
            )}
            <p className="mt-1 text-[10px] text-slate-500">Series shows millimetres forecast in the next 24 hours (labelled as incidents in the shared chart component).</p>
          </div>
          <div className="card card-pad">
            <SectionHeading eyebrow="Cross-links" title="Related operations" />
            <div className="flex flex-wrap gap-1.5">
              <Link href="/admin/map" className="btn-outline btn-sm">3D operations map</Link>
              <Link href="/admin/alerts" className="btn-outline btn-sm">Publish warning</Link>
              <Link href="/admin/districts" className="btn-outline btn-sm">District intelligence</Link>
              <Link href="/weather" className="btn-outline btn-sm">Citizen weather view</Link>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              <DataClassBadge dataClass="SIMULATED" /> Incident counts on linked screens include demonstration records. Weather values are
              provider data, never simulated.
            </p>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <SectionHeading eyebrow="District table" title="Full weather & risk register" />
        <div className="max-h-[360px] overflow-auto">
          <table className="table-base min-w-[820px]">
            <thead className="sticky top-0">
              <tr><th>District</th><th>Region</th><th>Condition</th><th className="text-right">Temp</th><th className="text-right">Rain 24h</th><th className="text-right">Reports</th><th className="text-right">Open SOS</th><th>Fetch time</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code}>
                  <td className="text-xs font-semibold">{row.name}</td>
                  <td className="text-[11px]">{row.region}</td>
                  <td className="text-[11px]">{row.weather.available ? row.weather.condition ?? "—" : "unavailable"}</td>
                  <td className="text-right text-xs tabular-nums">{row.weather.available ? `${row.weather.temperature?.toFixed(1)} °C` : "n/a"}</td>
                  <td className="text-right text-xs tabular-nums">{row.weather.available ? `${row.weather.next24hRainfall ?? "—"} mm` : "n/a"}</td>
                  <td className="text-right text-xs tabular-nums">{row.incidents.total}</td>
                  <td className="text-right text-xs tabular-nums">{row.openSos}</td>
                  <td className="text-[10px] text-slate-500">{row.weather.stale ? "stale cache" : formatDateTime(row.weather.fetchedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Humidity, UV index and visibility are available on the district weather view; the batched board endpoint omits them to keep the payload small.</p>
      </div>
    </div>
  );
}
