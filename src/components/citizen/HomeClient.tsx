"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { FACILITY_LABELS } from "@/lib/constants";
import type { RiskAssessment } from "@/lib/risk";
import type { WeatherSnapshot } from "@/lib/weather";
import { useApi } from "../interactive";
import TamilNaduMap, { type MapMarker } from "../TamilNaduMap";
import { Chip, EmptyState, Notice, SectionHeading, SourceBadge, Stat, formatDateTime, relativeTime } from "../ui";
import { AlertsCard, IncidentList, QuickAction, RiskCard, WeatherCard } from "./panels";
import { useSelectedDistrict } from "./useDistrict";

type Overview = {
  district: { code: string; name: string; region: string; lat: number; lng: number };
  districtEntry: {
    code: string;
    name: string;
    risk: RiskAssessment;
    incidents: { total: number; pending: number; verified: number; resolved: number; recentWater: number };
    openSos: number;
    facilities: number;
    shelters: number;
  };
  weather: WeatherSnapshot;
  alerts: {
    id: number;
    title: string;
    summary: string;
    severity: string;
    sourceName: string;
    sourceUrl: string | null;
    sourceClass: string;
    verification: string;
    isSimulated: boolean;
    issuedAt: string | null;
    districtCode: string | null;
  }[];
  incidents: {
    publicId: string;
    category: string;
    status: string;
    locationName: string;
    districtCode: string;
    createdAt: string;
    reportedSeverity: string;
    assessedSeverity: string | null;
    dataClass: string;
    description: string;
    lat: number | null;
    lng: number | null;
  }[];
  facilityCounts: { category: string; count: number }[];
  verifiedUpdates: {
    publicId: string;
    category: string;
    status: string;
    locationName: string;
    districtCode: string;
    createdAt: string;
    reportedSeverity: string;
    assessedSeverity: string | null;
    dataClass: string;
    description: string;
  }[];
  boardSummary: { districtsWithAlerts: number; totalVerified: number; openSos: number };
  shelters: {
    id: number;
    name: string;
    districtName: string;
    address: string | null;
    capacity: number | null;
    occupancy: number | null;
    remaining: number | null;
    availabilityStatus: string;
    capacityDataClass: string;
    isOfficialShelter: boolean;
    updatedAt: string;
    dataClass: string;
  }[];
  shelterSummary: { total: number; withCapacity: number; remaining: number; capacity: number };
  announcements: {
    id: number;
    title: string;
    summary: string;
    instruction: string | null;
    severity: string;
    sourceClass: string;
    sourceName: string;
    districtName: string;
    issuedAt: string | null;
    isSimulated: boolean;
  }[];
  officialWarningCount: number;
  account: { name: string; role: string } | null;
};

export default function HomeClient() {
  const [code, select] = useSelectedDistrict();
  const router = useRouter();
  const { data, loading, error, reload } = useApi<Overview>(`/api/overview?district=${code}`, [code]);

  const markers: MapMarker[] =
    data?.incidents
      .filter((incident) => incident.lat !== null && incident.lng !== null)
      .map((incident) => ({
        id: incident.publicId,
        type: "INCIDENT" as const,
        lat: incident.lat as number,
        lng: incident.lng as number,
        title: `${incident.publicId}`,
        description: incident.locationName,
        severity: incident.assessedSeverity ?? incident.reportedSeverity,
        status: incident.status,
        dataClass: incident.dataClass,
        districtName: data?.district.name,
      })) ?? [];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl bg-ink-900 text-white shadow-lg">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="chip bg-white/10 text-sky-200 ring-white/20">TAMIL NADU · 38 DISTRICTS</span>
              <span className="chip bg-white/10 text-slate-200 ring-white/20">DECISION-SUPPORT PROTOTYPE</span>
            </div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">
              Know the Risk. Find Safety. Get Help.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              DisasterLink combines observed weather, citizen reports, mapped facilities and an explainable flood-risk heuristic in
              one place. Reports become verified incidents only after an authorised administrator reviews them.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="home-district">
                District
              </label>
              <select
                id="home-district"
                value={code}
                onChange={(event) => select(event.target.value)}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none [&>option]:text-slate-900"
              >
                {DISTRICTS.map((district) => (
                  <option key={district.code} value={district.code}>
                    {district.name}
                  </option>
                ))}
              </select>
              <Link href="/sos" className="btn-sos">
                🚨 Emergency SOS
              </Link>
              <Link href="/report" className="btn bg-white text-ink-900 hover:bg-slate-100">
                Report an incident
              </Link>
              <Link href="/facilities" className="btn border border-white/20 text-white hover:bg-white/10">
                Find nearby help
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Verified reports", value: data?.boardSummary.totalVerified ?? "—", hint: "state-wide records" },
                { label: "High / very high risk", value: data?.boardSummary.districtsWithAlerts ?? "—", hint: "model estimate" },
                { label: "Open SOS", value: data?.boardSummary.openSos ?? "—", hint: "incl. simulated" },
                { label: "District reports", value: data?.districtEntry.incidents.total ?? "—", hint: `${data?.district.name ?? "selected district"}` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
                  <p className="text-lg font-bold tabular-nums">{item.value}</p>
                  <p className="truncate text-[10px] text-slate-400">{item.hint}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-sky-300">Selected district</p>
              <Link href={`/districts/${code}`} className="text-[11px] font-semibold text-sky-200 underline">
                Full intelligence →
              </Link>
            </div>
            <p className="mt-1 text-xl font-extrabold">{data?.district.name ?? "Loading…"}</p>
            <p className="text-[11px] text-slate-400">{data?.district.region} Tamil Nadu</p>

            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-2">
                <span className="text-[11px] text-slate-300">Weather now</span>
                <span className="text-sm font-bold">
                  {data?.weather.available ? `${data.weather.current?.temperature.toFixed(1)} °C · ${data.weather.current?.condition}` : "Unavailable"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-2">
                <span className="text-[11px] text-slate-300">Model flood risk</span>
                <span className="text-sm font-bold text-amber-300">{data?.districtEntry.risk.level.replace("_", " ") ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-2">
                <span className="text-[11px] text-slate-300">Official warnings</span>
                <span className="text-xs font-bold text-slate-200">
                  {data?.alerts.some((a) => a.sourceClass === "OFFICIAL_WARNING") ? "Available" : "None ingested"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-2">
                <span className="text-[11px] text-slate-300">Pending reports</span>
                <span className="text-sm font-bold">{data?.districtEntry.incidents.pending ?? 0}</span>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
              Weather from Open-Meteo. Risk is a MODEL_RISK_ESTIMATE from a transparent heuristic — not a government flood-zone
              declaration.
            </p>
          </div>
        </div>
      </section>

      <Notice tone="demo" title="About the data in this prototype">
        Demonstration incidents, SOS requests, teams and resources are <strong>SIMULATED</strong> and badged throughout. Weather is real
        provider data (when reachable). No official IMD/TNSDMA warning is ingested, and no facility availability is claimed.{" "}
        <Link href="/demo" className="font-semibold underline">
          Open the guided demo →
        </Link>
      </Notice>

      {error ? <Notice tone="danger" title="Could not load district overview">{error}. Try again or refresh the page.</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
        <div className="space-y-4">
          <AlertsCard alerts={data?.alerts ?? []} />
          {loading && !data ? <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white" /> : <WeatherCard weather={data?.weather ?? null} onRefresh={reload} />}
          <RiskCard risk={data?.districtEntry.risk} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card card-pad">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Emergency situation · {data?.district.name ?? "district"}</h3>
                <Chip tone={(data?.officialWarningCount ?? 0) > 0 ? "red" : "green"}>
                  {data?.officialWarningCount ?? 0} official warning(s)
                </Chip>
              </div>
              <ul className="space-y-1.5 text-xs">
                <li className="flex items-center justify-between"><span className="text-slate-600">Open SOS requests</span><span className="font-bold tabular-nums text-slate-900">{data?.districtEntry.openSos ?? "—"}</span></li>
                <li className="flex items-center justify-between"><span className="text-slate-600">Reports awaiting review</span><span className="font-bold tabular-nums text-slate-900">{data?.districtEntry.incidents.pending ?? "—"}</span></li>
                <li className="flex items-center justify-between"><span className="text-slate-600">Verified incidents</span><span className="font-bold tabular-nums text-emerald-700">{data?.districtEntry.incidents.verified ?? "—"}</span></li>
                <li className="flex items-center justify-between"><span className="text-slate-600">Model flood risk</span><span className="font-bold text-amber-700">{data?.districtEntry.risk.level.replace("_", " ") ?? "—"}</span></li>
                <li className="flex items-center justify-between"><span className="text-slate-600">Shelters with space</span><span className="font-bold tabular-nums text-slate-900">{data?.shelterSummary.remaining ?? "—"} places</span></li>
              </ul>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Link href="/alerts" className="btn-outline btn-sm">District alerts</Link>
                <Link href="/evacuation" className="btn-outline btn-sm">Evacuation help</Link>
                <Link href="/shelters" className="btn-outline btn-sm">Shelters</Link>
              </div>
            </div>
            <div className="card card-pad">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Public safety announcements</h3>
                <Link href="/notifications" className="text-[11px] font-semibold text-blue-700 underline">Notifications</Link>
              </div>
              {data?.announcements.length ? (
                <ul className="space-y-1.5">
                  {data.announcements.map((announcement) => (
                    <li key={announcement.id} className="rounded-lg border border-slate-200 p-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <Chip tone={announcement.severity === "CRITICAL" ? "red" : announcement.severity === "HIGH" ? "orange" : "amber"}>{announcement.severity}</Chip>
                        <Chip tone="blue">{announcement.districtName}</Chip>
                        {announcement.isSimulated ? <Chip tone="dark">SIMULATED</Chip> : null}
                      </div>
                      <p className="mt-0.5 text-xs font-bold text-slate-900">{announcement.title}</p>
                      <p className="text-[11px] leading-snug text-slate-600">{announcement.summary}</p>
                      {announcement.instruction ? <p className="mt-0.5 text-[10px] font-medium text-slate-700">Action: {announcement.instruction}</p> : null}
                      <p className="text-[10px] text-slate-400">{announcement.sourceName} · {formatDateTime(announcement.issuedAt)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-slate-500">No public safety announcement for this district. Check official sources for current advice.</p>
              )}
            </div>
          </div>

          <div className="card card-pad">
            <SectionHeading
              eyebrow="Nearby shelters"
              title={`Safety zones in ${data?.district.name ?? "your district"}`}
              description="Capacity is shown only where recorded. Occupancy is maintained by officials and can change quickly."
              action={<Link href="/shelters" className="btn-outline btn-sm">Open shelter finder</Link>}
            />
            {(data?.shelters ?? []).length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {(data?.shelters ?? []).slice(0, 4).map((shelter) => (
                  <div key={shelter.id} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <Chip tone={shelter.availabilityStatus === "FULL" ? "red" : shelter.availabilityStatus === "AVAILABLE" ? "green" : "amber"}>{shelter.availabilityStatus}</Chip>
                      {shelter.dataClass === "SIMULATED" ? <Chip tone="dark">SIMULATED</Chip> : null}
                    </div>
                    <p className="mt-1 text-xs font-bold text-slate-900">{shelter.name}</p>
                    <p className="text-[11px] text-slate-500">{shelter.districtName}</p>
                    <p className="text-[11px] font-semibold text-slate-700">
                      {shelter.capacity !== null ? `${shelter.occupancy ?? 0}/${shelter.capacity} occupied · ${shelter.remaining ?? 0} free` : "Capacity not recorded"}
                    </p>
                    <p className="text-[10px] text-slate-400">Updated {formatDateTime(shelter.updatedAt)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No shelter record for this district" description="Absence of a record does not mean no shelter exists. Call 1078 for district control room guidance." />
            )}
          </div>

          <div className="card card-pad">
            <SectionHeading
              eyebrow="Latest verified updates"
              title="Verified incident record"
              description="Only reports verified by an authorised administrator are published as verified updates."
              action={
                <Link href="/track" className="btn-outline btn-sm">
                  Track a submission
                </Link>
              }
            />
            <IncidentList incidents={data?.verifiedUpdates ?? []} />
          </div>

          <div className="card card-pad">
            <SectionHeading
              eyebrow="District map"
              title={`${data?.district.name ?? "District"} situational view`}
              description="Reports in the selected district plus the current heuristic risk fill. Click a district to open its intelligence record."
              action={
                <Link href="/districts" className="btn-outline btn-sm">
                  Open full map
                </Link>
              }
            />
            <TamilNaduMap
              compact
              heightClass="h-[320px] sm:h-[400px]"
              districts={[
                {
                  code,
                  name: data?.district.name ?? "",
                  riskLevel: data?.districtEntry.risk.level,
                  incidents: data?.districtEntry.incidents.total,
                  openSos: data?.districtEntry.openSos,
                  temperature: data?.weather.current?.temperature ?? null,
                },
              ]}
              markers={markers}
              selectedCode={code}
              onSelectDistrict={(next) => {
                select(next);
                router.push(`/districts/${next}`);
              }}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-2">
            <QuickAction href="/sos" title="Emergency SOS" description="Coordinates captured with your permission. Reviewed by a duty officer — never auto-dispatched." tone="red" icon="🆘" />
            <QuickAction href="/report" title="Report an incident" description="Flooding, waterlogging, fallen trees, road blockage and more. Get a trackable incident ID." tone="blue" icon="📍" />
            <QuickAction href="/facilities" title="Find nearby help" description="Hospitals, pharmacies, fire, police and food resources — with verification labels." tone="green" icon="🏥" />
            <QuickAction href="/weather" title="District weather" description="Premium current conditions, hourly and 7-day forecast, rainfall and temperature maps." tone="blue" icon="🌧" />
            <QuickAction href="/alerts" title="Alerts & notifications" description="Flood, rainfall, cyclone, landslide, road closure and evacuation notices by district." tone="slate" icon="📣" />
            <QuickAction href="/map" title="3D Tamil Nadu map" description="Terrain, flood-risk fills, rainfall, incidents, facilities, shelters and evacuation corridors." tone="blue" icon="🗺" />
            <QuickAction href="/evacuation" title="Evacuation assistance" description="Schematic safer corridors, nearest camps with remaining capacity, reported blockages." tone="green" icon="🧭" />
            <QuickAction href="/safety" title="Safety instructions" description="Before, during and after guidance for floods, cyclones, electrical hazards and landslides." tone="slate" icon="📘" />
          </div>

          <div className="card card-pad">
            <h3 className="text-sm font-bold text-slate-900">Facilities listed in {data?.district.name ?? "district"}</h3>
            {data?.facilityCounts.length ? (
              <ul className="mt-2 space-y-1.5">
                {data.facilityCounts.map((row) => (
                  <li key={row.category} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{FACILITY_LABELS[row.category] ?? row.category}</span>
                    <span className="font-bold tabular-nums text-slate-900">{row.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No facilities on record" description="Facility candidates are added by administrators. Absence does not mean no facility exists." />
            )}
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              Directory candidates only. No bed, medicine or stock availability is confirmed. Call the facility before travelling.
            </p>
            <Link href="/facilities" className="btn-outline btn-sm mt-2">
              Open directory
            </Link>
          </div>

          <div className="card card-pad">
            <h3 className="text-sm font-bold text-slate-900">Recent activity in district</h3>
            <p className="mb-2 text-[11px] text-slate-500">Includes pending citizen reports, each badged with its data class.</p>
            <IncidentList incidents={data?.incidents ?? []} limit={5} />
          </div>

          <div className="card card-pad">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Data provenance</h3>
              <SourceBadge source="OBSERVED" />
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-600">
              <li className="flex justify-between gap-2"><span>Weather</span><span className="font-semibold">Open-Meteo · cached 15 min</span></li>
              <li className="flex justify-between gap-2"><span>Boundaries</span><span className="font-semibold">Census 2011 (simplified)</span></li>
              <li className="flex justify-between gap-2"><span>Facilities</span><span className="font-semibold">Public listings · CANDIDATE</span></li>
              <li className="flex justify-between gap-2"><span>Warnings</span><span className="font-semibold">Not ingested</span></li>
              <li className="flex justify-between gap-2"><span>Risk model</span><span className="font-semibold">Heuristic v1 · MODEL_RISK_ESTIMATE</span></li>
            </ul>
            <p className="mt-2 text-[10px] text-slate-500">
              Weather cache last updated <Chip tone="blue">{data ? relativeTime(data.weather.fetchedAt) : "—"}</Chip>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
