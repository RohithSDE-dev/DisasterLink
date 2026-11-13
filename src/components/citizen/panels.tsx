"use client";

import Link from "next/link";
import type { RiskAssessment } from "@/lib/risk";
import type { WeatherSnapshot } from "@/lib/weather";
import { CATEGORY_LABELS } from "@/lib/constants";
import { Chip, DataClassBadge, EmptyState, Meter, Notice, RiskBadge, SeverityBadge, SourceBadge, StatusBadge, formatDateTime, relativeTime } from "../ui";

export function WeatherCard({ weather, onRefresh }: { weather: WeatherSnapshot | null; onRefresh?: () => void }) {
  if (!weather) {
    return <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />;
  }
  if (!weather.available) {
    return (
      <div className="card card-pad">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Weather — currently unavailable</h3>
          <SourceBadge source="OBSERVED" />
        </div>
        <Notice tone="warn" title="Live weather not retrieved">
          {weather.error ?? "The Open-Meteo service could not be reached."} No weather values are fabricated. Last attempted{" "}
          {formatDateTime(weather.fetchedAt)}.
        </Notice>
        {onRefresh ? (
          <button onClick={onRefresh} className="btn-outline btn-sm mt-3">
            Retry weather
          </button>
        ) : null}
      </div>
    );
  }
  const current = weather.current!;
  const rows = [
    { label: "Temperature", value: `${current.temperature.toFixed(1)} °C` },
    { label: "Rainfall now", value: `${current.precipitation.toFixed(1)} mm` },
    { label: "Humidity", value: `${Math.round(current.humidity)} %` },
    { label: "Wind", value: `${current.windSpeed.toFixed(1)} km/h` },
  ];
  return (
    <div className="card card-pad">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Current weather</h3>
          <p className="text-xs text-slate-500">
            {current.condition} · observed {formatDateTime(current.time)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceBadge source="OBSERVED" />
          {weather.stale ? <Chip tone="amber">CACHED</Chip> : <Chip tone="green">LIVE</Chip>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg bg-slate-50 px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{row.label}</p>
            <p className="text-sm font-bold text-slate-900">{row.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-950">
        <span className="font-semibold">Forecast rainfall (next 24h): {weather.next24hRainfall ?? "—"} mm.</span> Source: {weather.sourceName} (
        {weather.sourceClass} / FORECAST). This is a weather forecast, not a flood warning.
      </div>
      {weather.daily.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="table-base min-w-[420px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Rain (mm)</th>
                <th>Chance</th>
                <th>Min / Max</th>
              </tr>
            </thead>
            <tbody>
              {weather.daily.slice(0, 5).map((day) => (
                <tr key={day.date}>
                  <td>{new Date(day.date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })}</td>
                  <td className="tabular-nums">{day.precipitationSum.toFixed(1)}</td>
                  <td className="tabular-nums">{day.precipitationProbability ?? "—"}%</td>
                  <td className="tabular-nums">
                    {Math.round(day.tempMin)}° / {Math.round(day.tempMax)}°
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>
          Fetched {relativeTime(weather.fetchedAt)} · cached up to 15 min ·{" "}
          <a className="link" href={weather.sourceUrl} target="_blank" rel="noreferrer">
            Open-Meteo
          </a>
        </span>
        {onRefresh ? (
          <button onClick={onRefresh} className="btn-ghost btn-sm">
            Refresh
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function RiskCard({ risk, compact }: { risk: RiskAssessment | null | undefined; compact?: boolean }) {
  if (!risk) return null;
  const tone = risk.level === "LOW" ? "green" : risk.level === "MODERATE" ? "amber" : risk.level === "HIGH" ? "orange" : "red";
  return (
    <div className="card card-pad">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Estimated flood risk</h3>
          <p className="text-[11px] text-slate-500">{risk.model}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <SourceBadge source="MODEL_RISK_ESTIMATE" />
          <RiskBadge level={risk.level} />
        </div>
      </div>
      <div className="mb-3">
        <div className="mb-1 flex items-end justify-between">
          <span className="text-2xl font-extrabold text-slate-900">{risk.level.replace("_", " ")}</span>
          <span className="text-xs font-semibold text-slate-500">{risk.score}/100 heuristic score</span>
        </div>
        <Meter value={risk.score} tone={tone as "green" | "amber" | "orange" | "red"} />
      </div>
      <p className="mb-3 text-xs leading-relaxed text-slate-600">{risk.explanation}</p>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Why this classification</p>
      <ul className="space-y-1.5">
        {risk.factors.map((factor) => (
          <li key={factor.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-1.5">
            <div>
              <p className="text-xs font-semibold text-slate-800">{factor.label}</p>
              {!compact ? <p className="text-[11px] leading-snug text-slate-500">{factor.detail}</p> : null}
            </div>
            <span className={`shrink-0 text-xs font-bold tabular-nums ${factor.points > 0 ? "text-orange-600" : "text-slate-400"}`}>
              {factor.points > 0 ? `+${factor.points}` : "0"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{risk.disclaimer}</p>
    </div>
  );
}

type AlertRow = {
  id: number;
  title: string;
  summary: string;
  severity: string;
  sourceName: string;
  sourceUrl: string | null;
  sourceClass: string;
  verification: string;
  isSimulated: boolean;
  issuedAt: string | Date | null;
  districtCode: string | null;
};

export function AlertsCard({ alerts }: { alerts: AlertRow[] }) {
  const official = alerts.filter((a) => a.sourceClass === "OFFICIAL_WARNING");
  const simulated = alerts.filter((a) => a.sourceClass === "SIMULATED" || a.isSimulated);
  return (
    <div className="card card-pad">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Official warnings</h3>
        <Chip tone={official.length ? "red" : "neutral"}>{official.length ? `${official.length} active` : "None ingested"}</Chip>
      </div>
      {official.length === 0 ? (
        <Notice tone="warn" title="No official warning is available in DisasterLink">
          Warnings from the India Meteorological Department and TNSDMA are <strong>not connected</strong> to this prototype. Check{" "}
          <a className="underline" href="https://mausam.imd.gov.in/" target="_blank" rel="noreferrer">
            mausam.imd.gov.in
          </a>{" "}
          and{" "}
          <a className="underline" href="https://www.tnsdma.tn.gov.in/" target="_blank" rel="noreferrer">
            tnsdma.tn.gov.in
          </a>{" "}
          directly. Weather shown elsewhere is provider data, not an official warning.
        </Notice>
      ) : (
        <ul className="space-y-2">
          {official.map((alert) => (
            <li key={alert.id} className="rounded-lg border border-red-200 bg-red-50 p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <SeverityBadge severity={alert.severity} />
                <SourceBadge source="OFFICIAL_WARNING" />
                <span className="text-[10px] text-slate-500">{formatDateTime(alert.issuedAt)}</span>
              </div>
              <p className="mt-1 text-xs font-bold text-red-900">{alert.title}</p>
              <p className="text-[11px] text-red-800">{alert.summary}</p>
            </li>
          ))}
        </ul>
      )}
      {simulated.length > 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2.5">
          <div className="mb-1 flex items-center gap-2">
            <DataClassBadge dataClass="SIMULATED" />
            <p className="text-[11px] font-semibold text-slate-600">Demonstration alert — not a real warning</p>
          </div>
          {simulated.slice(0, 2).map((alert) => (
            <div key={alert.id} className="mt-1">
              <p className="text-xs font-semibold text-slate-800">{alert.title}</p>
              <p className="text-[11px] leading-snug text-slate-500">{alert.summary}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {alert.sourceName} · {formatDateTime(alert.issuedAt)} · verification {alert.verification}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type IncidentLike = {
  publicId: string;
  category: string;
  status: string;
  locationName: string;
  districtCode: string;
  createdAt: string | Date;
  reportedSeverity: string;
  assessedSeverity?: string | null;
  dataClass: string;
  description: string;
};

export function IncidentList({ incidents, showDistrict, limit = 6 }: { incidents: IncidentLike[]; showDistrict?: boolean; limit?: number }) {
  if (!incidents.length) {
    return (
      <EmptyState
        title="No reports match this view"
        description="Verified reports appear here only after an authorised administrator reviews and verifies a citizen submission."
      />
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {incidents.slice(0, limit).map((incident) => (
        <li key={incident.publicId} className="py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={incident.status} />
            <SeverityBadge severity={incident.assessedSeverity ?? incident.reportedSeverity} />
            <DataClassBadge dataClass={incident.dataClass} />
            <span className="ml-auto text-[10px] text-slate-400">{relativeTime(incident.createdAt)}</span>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-800">
            {CATEGORY_LABELS[incident.category] ?? incident.category} · {incident.locationName}
            {showDistrict ? ` · ${incident.districtCode}` : ""}
          </p>
          <p className="line-clamp-2 text-[11px] leading-snug text-slate-500">{incident.description}</p>
          <p className="mt-0.5 font-mono text-[10px] text-slate-400">{incident.publicId}</p>
        </li>
      ))}
    </ul>
  );
}

export function QuickAction({
  href,
  title,
  description,
  tone,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  tone: "red" | "blue" | "green" | "slate";
  icon: string;
}) {
  const tones = {
    red: "border-red-200 bg-red-50 hover:border-red-300",
    blue: "border-blue-200 bg-blue-50 hover:border-blue-300",
    green: "border-emerald-200 bg-emerald-50 hover:border-emerald-300",
    slate: "border-slate-200 bg-white hover:border-slate-300",
  };
  const iconTones = { red: "bg-red-600", blue: "bg-blue-700", green: "bg-emerald-600", slate: "bg-slate-800" };
  return (
    <Link href={href} className={`group flex items-start gap-3 rounded-xl border p-3 transition ${tones[tone]}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base text-white ${iconTones[tone]}`}>{icon}</span>
      <span>
        <span className="block text-sm font-bold text-slate-900">{title}</span>
        <span className="block text-[11px] leading-snug text-slate-600">{description}</span>
      </span>
    </Link>
  );
}
