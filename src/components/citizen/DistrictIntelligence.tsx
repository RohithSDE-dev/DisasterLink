"use client";

import Link from "next/link";
import { useState } from "react";
import { CATEGORY_LABELS } from "@/lib/constants";
import type { RiskAssessment } from "@/lib/risk";
import type { WeatherSnapshot } from "@/lib/weather";
import { apiRequest, useApi } from "../interactive";
import TamilNaduMap, { type MapMarker } from "../TamilNaduMap";
import { Chip, DataClassBadge, EmptyState, KeyValue, Notice, RiskBadge, SectionHeading, SeverityBadge, SourceBadge, StatusBadge, formatDateTime, relativeTime } from "../ui";
import { AlertsCard, RiskCard, WeatherCard } from "./panels";

type Detail = {
  district: { code: string; name: string; region: string; lat: number; lng: number };
  weather: WeatherSnapshot;
  risk: RiskAssessment;
  activity: { summary: string; advisory: string; model: string; hotspots: string[] };
  incidents: {
    id: number;
    publicId: string;
    category: string;
    description: string;
    locationName: string;
    lat: number | null;
    lng: number | null;
    status: string;
    reportedSeverity: string;
    assessedSeverity: string | null;
    dataClass: string;
    createdAt: string;
    verifiedAt: string | null;
  }[];
  facilities: {
    id: number;
    name: string;
    category: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    phone: string | null;
    verificationStatus: string;
    isOfficialShelter: boolean;
    availabilityNote: string | null;
    dataClass: string;
  }[];
  alerts: Parameters<typeof AlertsCard>[0]["alerts"];
  sosCounts: { total: number; open: number };
  rivers: { name: string; distanceKm: number }[];
  boundarySource: { name: string; url: string; note: string };
  riskDisclaimer: string;
};

export default function DistrictIntelligence({ code }: { code: string }) {
  const { data, loading, error, reload } = useApi<Detail>(`/api/districts/${code}`);
  const [aiSummary, setAiSummary] = useState<{ summary: string; advisory: string; model: string; hotspots: string[] } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function generateSummary() {
    setAiLoading(true);
    setAiError(null);
    const result = await apiRequest<{ summary: { summary: string; advisory: string; model: string; hotspots: string[] } }>("/api/ai", {
      method: "POST",
      body: { mode: "district-summary", districtCode: code },
    });
    setAiLoading(false);
    if (!result.ok) setAiError(result.error ?? "AI summary unavailable");
    else setAiSummary(result.data?.summary ?? null);
  }

  if (loading && !data) return <div className="h-[480px] animate-pulse rounded-xl border border-slate-200 bg-white" />;
  if (error || !data) return <Notice tone="danger" title="District intelligence unavailable">{error ?? "Unknown district"}</Notice>;

  const markers: MapMarker[] = [
    ...data.incidents
      .filter((i) => i.lat !== null && i.lng !== null)
      .map((i) => ({
        id: i.publicId,
        type: "INCIDENT" as const,
        lat: i.lat as number,
        lng: i.lng as number,
        title: `${i.publicId} · ${CATEGORY_LABELS[i.category] ?? i.category}`,
        description: i.locationName,
        severity: i.assessedSeverity ?? i.reportedSeverity,
        status: i.status,
        dataClass: i.dataClass,
      })),
    ...data.facilities
      .filter((f) => f.lat !== null && f.lng !== null)
      .map((f) => ({
        id: `f-${f.id}`,
        type: f.isOfficialShelter ? ("SHELTER" as const) : ("FACILITY" as const),
        lat: f.lat as number,
        lng: f.lng as number,
        title: f.name,
        description: f.address ?? undefined,
        status: f.verificationStatus,
        dataClass: f.dataClass,
      })),
  ];

  const verified = data.incidents.filter((i) => i.status === "VERIFIED" || i.status === "RESOLVED");
  const open = data.incidents.filter((i) => i.status === "PENDING" || i.status === "UNDER_REVIEW");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">
            <Link href="/districts" className="hover:underline">District intelligence</Link> · {data.district.region} Tamil Nadu
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{data.district.name}</h1>
          <p className="text-xs text-slate-500">
            {data.district.lat.toFixed(3)}° N, {data.district.lng.toFixed(3)}° E · generated {formatDateTime(data.risk.generatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RiskBadge level={data.risk.level} />
          <Link href={`/report?district=${data.district.code}`} className="btn-primary btn-sm">Report in this district</Link>
          <Link href={`/facilities?district=${data.district.code}`} className="btn-outline btn-sm">Nearby help</Link>
          <button onClick={reload} className="btn-outline btn-sm">Refresh</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <WeatherCard weather={data.weather} onRefresh={reload} />
          <RiskCard risk={data.risk} />

          <div className="card card-pad">
            <SectionHeading
              eyebrow="AI incident intelligence"
              title="District activity briefing"
              description="Heuristic summarisation of DisasterLink records. Assists administrators; never verifies incidents or issues alerts."
              action={
                <button onClick={generateSummary} className="btn-dark btn-sm" disabled={aiLoading}>
                  {aiLoading ? "Generating…" : aiSummary ? "Regenerate" : "Generate summary"}
                </button>
              }
            />
            {aiSummary ? (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <SourceBadge source="MODEL_RISK_ESTIMATE" />
                  <Chip tone="purple">AI-ASSISTED</Chip>
                  <span className="text-[10px] text-slate-500">{aiSummary.model}</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-700">{aiSummary.summary}</p>
                {aiSummary.hotspots?.length ? (
                  <p className="mt-1 text-[11px] text-slate-600"><strong>Hotspot locations:</strong> {aiSummary.hotspots.join(", ")}</p>
                ) : null}
                <p className="mt-1 text-[10px] text-slate-500">{aiSummary.advisory}</p>
              </div>
            ) : (
              <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{data.activity.summary}</div>
            )}
            {aiError ? <p className="mt-2 text-[11px] text-red-600">{aiError}</p> : null}
            <p className="mt-2 text-[10px] text-slate-500">{data.activity.advisory}</p>
          </div>

          <div className="card card-pad">
            <SectionHeading eyebrow="Reported incidents" title={`${data.incidents.length} record(s) in ${data.district.name}`} />
            {open.length ? (
              <div className="mb-4">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">Awaiting administrator review ({open.length})</p>
                <IncidentTable rows={open} />
              </div>
            ) : null}
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">Verified / resolved ({verified.length})</p>
            {verified.length ? <IncidentTable rows={verified} /> : <EmptyState title="No verified incidents" description="A report is published here only after administrator verification." />}
            <p className="mt-2 text-[10px] text-slate-500">
              Citizen submissions never verify themselves. Precise coordinates and contact details are withheld from public views.
            </p>
          </div>

          <div className="card card-pad">
            <SectionHeading eyebrow="Emergency facilities" title="Directory candidates" description="Availability is never inferred. Verification status is shown for every record." />
            {data.facilities.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {data.facilities.slice(0, 8).map((facility) => (
                  <div key={facility.id} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip tone="blue">{facility.category.replaceAll("_", " ")}</Chip>
                      <SourceBadge source={facility.verificationStatus} />
                      {facility.isOfficialShelter ? <Chip tone="green">OFFICIAL SHELTER</Chip> : null}
                    </div>
                    <p className="mt-1 text-xs font-bold text-slate-800">{facility.name}</p>
                    <p className="text-[11px] text-slate-500">{facility.address ?? "Address not recorded"}</p>
                    <p className="text-[10px] text-slate-400">{facility.phone ? `Phone: ${facility.phone}` : "Phone not verified"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No facilities recorded" description="Absence of a record does not mean no hospital or service exists in this district." />
            )}
            <Link href={`/facilities?district=${data.district.code}`} className="btn-outline btn-sm mt-2">Open full directory</Link>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-bold text-slate-900">District map</h3>
            <TamilNaduMap
              compact
              heightClass="h-[300px] sm:h-[360px]"
              districts={[{ code: data.district.code, name: data.district.name, riskLevel: data.risk.level, incidents: data.incidents.length, openSos: data.sosCounts.open }]}
              markers={markers}
              selectedCode={data.district.code}
            />
          </div>

          <AlertsCard alerts={data.alerts} />

          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-bold text-slate-900">District indicators</h3>
            <KeyValue
              rows={[
                { label: "Model risk", value: <RiskBadge level={data.risk.level} /> },
                { label: "Risk score", value: `${data.risk.score}/100` },
                { label: "Confidence", value: data.risk.confidence },
                { label: "Weather", value: data.weather.available ? `${data.weather.current?.temperature.toFixed(1)} °C` : "Unavailable" },
                { label: "Rain next 24h", value: data.weather.available ? `${data.weather.next24hRainfall} mm` : "—" },
                { label: "Reports", value: data.incidents.length },
                { label: "Verified", value: verified.length },
                { label: "Open SOS", value: data.sosCounts.open },
                { label: "Facilities listed", value: data.facilities.length },
                { label: "Official shelters", value: data.facilities.filter((f) => f.isOfficialShelter).length },
              ]}
            />
          </div>

          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-bold text-slate-900">Mapped waterways nearby</h3>
            {data.rivers.length ? (
              <ul className="space-y-1.5 text-xs">
                {data.rivers.slice(0, 6).map((river) => (
                  <li key={river.name} className="flex items-center justify-between">
                    <span className="text-slate-600">{river.name}</span>
                    <span className="font-semibold tabular-nums text-slate-800">~{river.distanceKm} km</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No schematic river line within 90 km of the district reference point.</p>
            )}
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              Schematic centre-lines for situational awareness only; proximity does not make an area an officially assessed flood-prone zone.
            </p>
          </div>

          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-bold text-slate-900">Preparedness guidance</h3>
            <ul className="space-y-1.5 text-[11px] leading-relaxed text-slate-600">
              <li>• Keep documents, medicines and a torch in a waterproof bag.</li>
              <li>• Never walk or drive through moving water — 15 cm can knock an adult down.</li>
              <li>• Move to higher floors before water enters the building; avoid basements.</li>
              <li>• Switch off main power if water is entering and it is safe to reach the breaker.</li>
              <li>• Keep phones charged and share your location only with responders.</li>
            </ul>
            <Link href="/safety" className="btn-outline btn-sm mt-2">Full safety guide</Link>
          </div>

          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-bold text-slate-900">Data sources for this page</h3>
            <ul className="space-y-1.5 text-[11px] text-slate-600">
              <li>Weather: Open-Meteo (OBSERVED / FORECAST), cached ≤ 15 min</li>
              <li>Risk: {data.risk.model}</li>
              <li>Boundaries: {data.boundarySource.name}</li>
              <li>Facilities: public listings, CANDIDATE verification</li>
              <li>Official warnings: not ingested</li>
              <li>Demo rows: {data.incidents.filter((i) => i.dataClass === "SIMULATED").length} SIMULATED incident(s)</li>
            </ul>
            <p className="mt-2 text-[10px] text-slate-500">{data.boundarySource.note}</p>
            <p className="mt-1 text-[10px] text-slate-500">{data.riskDisclaimer}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function IncidentTable({ rows }: { rows: Detail["incidents"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base min-w-[520px]">
        <thead>
          <tr>
            <th>Report</th>
            <th>Category</th>
            <th>Status</th>
            <th>Severity</th>
            <th>Reported</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr key={row.publicId}>
              <td>
                <p className="font-mono text-[11px] text-slate-500">{row.publicId}</p>
                <p className="text-xs font-semibold text-slate-800">{row.locationName}</p>
                <div className="mt-0.5"><DataClassBadge dataClass={row.dataClass} /></div>
              </td>
              <td className="text-xs">{CATEGORY_LABELS[row.category] ?? row.category}</td>
              <td><StatusBadge status={row.status} /></td>
              <td><SeverityBadge severity={row.assessedSeverity ?? row.reportedSeverity} /></td>
              <td className="text-[11px] text-slate-500">{relativeTime(row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
