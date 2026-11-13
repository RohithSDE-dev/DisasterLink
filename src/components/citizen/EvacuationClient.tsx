"use client";

import Link from "next/link";
import { useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { useApi } from "../interactive";
import TamilNadu3D from "../map/TamilNadu3D";
import { Chip, DataClassBadge, EmptyState, Notice, SectionHeading, SourceBadge, formatDateTime } from "../ui";
import { useSelectedDistrict } from "./useDistrict";

type Corridor = {
  id: string;
  name: string;
  districtNames: string[];
  distanceKm: number;
  estimatedMinutes: number;
  guidance: string;
  risk: "CLEARER" | "CAUTION" | "HIGHLY_UNCERTAIN";
  hazardFlags: { publicId: string; category: string; severity: string; status: string; locationName: string; distanceKm: number; dataClass: string }[];
  freshness: string;
  disclaimer: string;
};

type Shelter = {
  id: number;
  name: string;
  districtName: string;
  lat: number | null;
  lng: number | null;
  capacity: number | null;
  occupancy: number | null;
  remaining: number | null;
  availabilityStatus: string;
  capacityDataClass: string;
  distanceKm: number | null;
};

type Blockage = {
  publicId: string;
  category: string;
  locationName: string;
  districtName: string;
  severity: string;
  verified: boolean;
  dataClass: string;
};

type EvacuationPayload = {
  corridors: Corridor[];
  shelters: Shelter[];
  blockages: Blockage[];
  freshness: { incidentDataUpdatedAt: string | null; shelterDataUpdatedAt: string | null };
  disclaimer: string;
  coverageNote: string;
};

export default function EvacuationClient() {
  const [district, setDistrict] = useSelectedDistrict();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const { data, loading, error } = useApi<EvacuationPayload>(
    `/api/evacuation?district=${district}${coords ? `&lat=${coords.lat}&lng=${coords.lng}` : ""}`,
    [district, coords],
  );

  function useLocation() {
    if (!("geolocation" in navigator)) {
      setGeoError("This browser does not expose geolocation.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: Math.round(position.coords.latitude * 1e5) / 1e5, lng: Math.round(position.coords.longitude * 1e5) / 1e5 });
        setGeoError(null);
      },
      (err) => setGeoError(err.message || "Location permission was not granted."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Smart evacuation assistance"
        title="Safer corridors, nearest relief camps, known blockages"
        description="Schematic corridors for planning, capacity-aware camp suggestions and reported road hazards. No route is guaranteed safe."
        action={<SourceBadge source="COMMUNITY_REPORT" />}
      />

      <Notice tone="warn" title="Before you move">
        {data?.disclaimer ??
          "Corridors are schematic planning examples, not live routing. Conditions change quickly in floods — confirm access with local authorities and never drive through moving water."}
      </Notice>

      <div className="card card-pad">
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="sm:col-span-2">
            <span className="label">District</span>
            <select className="input" value={district} onChange={(event) => setDistrict(event.target.value)}>
              {DISTRICTS.map((entry) => (
                <option key={entry.code} value={entry.code}>{entry.name}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button className="btn-outline btn-sm" onClick={useLocation}>{coords ? "Update my location" : "Use my location"}</button>
            {coords ? <Chip tone="green">{coords.lat}, {coords.lng}</Chip> : <Chip tone="neutral">No GPS fix</Chip>}
          </div>
        </div>
        {geoError ? <p className="mt-1 text-[11px] text-amber-700">{geoError}</p> : null}
        <p className="mt-2 text-[10px] text-slate-500">
          Shelter distances are straight-line estimates from your shared location. Data freshness: incident list{" "}
          {data?.freshness.incidentDataUpdatedAt ? formatDateTime(data.freshness.incidentDataUpdatedAt) : "—"} · shelters{" "}
          {data?.freshness.shelterDataUpdatedAt ? formatDateTime(data.freshness.shelterDataUpdatedAt) : "—"}.
        </p>
      </div>

      {error ? <Notice tone="danger" title="Evacuation data unavailable">{error}</Notice> : null}

      <TamilNadu3D mode="citizen" initialDistrict={district} heightClass="h-[380px] sm:h-[460px]" />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card card-pad">
          <h3 className="mb-1 text-sm font-bold text-slate-900">Corridor assessments</h3>
          <p className="mb-2 text-[11px] text-slate-500">Hazards are matched to corridor waypoints within 6 km from reported incidents.</p>
          {loading && !data ? <div className="h-24 animate-pulse rounded bg-slate-100" /> : null}
          <div className="space-y-2">
            {(data?.corridors ?? []).map((corridor) => (
              <div key={corridor.id} className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={corridor.risk === "HIGHLY_UNCERTAIN" ? "red" : corridor.risk === "CAUTION" ? "amber" : "green"}>
                    {corridor.risk.replaceAll("_", " ")}
                  </Chip>
                  <Chip tone="dark">SCHEMATIC</Chip>
                  <span className="text-[10px] text-slate-500">{corridor.districtNames.join(" → ")}</span>
                </div>
                <p className="mt-1 text-sm font-bold text-slate-900">{corridor.name}</p>
                <p className="text-[11px] leading-snug text-slate-600">{corridor.guidance}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-700">
                  ≈ {corridor.distanceKm} km · ≈ {Math.floor(corridor.estimatedMinutes / 60)}h {corridor.estimatedMinutes % 60}m at a cautious 24 km/h
                </p>
                {corridor.hazardFlags.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {corridor.hazardFlags.map((hazard) => (
                      <li key={hazard.publicId} className="text-[10px] text-amber-800">
                        ⚠ {hazard.category.replaceAll("_", " ")} near {hazard.locationName} (~{hazard.distanceKm} km) · {hazard.severity} · {hazard.status.replaceAll("_", " ")}
                        {hazard.dataClass === "SIMULATED" ? " · SIMULATED" : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[10px] text-emerald-700">No reported hazard within 6 km of the corridor waypoints at the time of this snapshot.</p>
                )}
              </div>
            ))}
            {data && !data.corridors.length ? (
              <EmptyState title="No schematic corridor for this district" description="Corridors exist for Chennai, Coimbatore, Madurai, Nagapattinam, Nilgiris and Tirunelveli. Use the statewide view for other districts." />
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card card-pad">
            <h3 className="mb-1 text-sm font-bold text-slate-900">Nearest relief camps & shelters</h3>
            <p className="mb-2 text-[11px] text-slate-500">Capacity is shown only when recorded. SIMULATED records are badged.</p>
            <ul className="space-y-1.5">
              {(data?.shelters ?? []).map((shelter) => (
                <li key={shelter.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip tone={shelter.availabilityStatus === "FULL" ? "red" : shelter.availabilityStatus === "LIMITED" ? "amber" : "green"}>
                      {shelter.availabilityStatus}
                    </Chip>
                    {shelter.capacityDataClass === "SIMULATED" ? <DataClassBadge dataClass="SIMULATED" /> : null}
                    {shelter.distanceKm !== null ? <Chip tone="blue">~{shelter.distanceKm} km</Chip> : null}
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-900">{shelter.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {shelter.districtName}
                    {shelter.capacity !== null ? ` · ${shelter.occupancy ?? 0}/${shelter.capacity} occupied${shelter.remaining !== null ? ` · ${shelter.remaining} remaining` : ""}` : " · capacity not recorded"}
                  </p>
                  {shelter.lat !== null && shelter.lng !== null ? (
                    <a
                      className="mt-1 inline-block text-[10px] font-semibold text-blue-700 underline"
                      href={`https://www.openstreetmap.org/directions?to=${shelter.lat}%2C${shelter.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open directions
                    </a>
                  ) : null}
                </li>
              ))}
              {data && !data.shelters.length ? <EmptyState title="No shelter record for this district" description="Check another district or contact the district control room. Absence of a record is not proof that no shelter exists." /> : null}
            </ul>
          </div>

          <div className="card card-pad">
            <h3 className="mb-1 text-sm font-bold text-slate-900">Reported blockages & flooded roads</h3>
            <p className="mb-2 text-[11px] text-slate-500">Includes pending citizen reports, clearly marked. Verified reports are the stronger signal.</p>
            <ul className="space-y-1">
              {(data?.blockages ?? []).map((blockage) => (
                <li key={blockage.publicId} className="flex flex-wrap items-center justify-between gap-1 rounded border border-slate-200 px-2 py-1.5 text-[11px]">
                  <span>
                    <span className="font-semibold text-slate-800">{blockage.locationName}</span>
                    <span className="text-slate-500"> · {blockage.category.replaceAll("_", " ")} · {blockage.districtName}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Chip tone={blockage.verified ? "green" : "neutral"}>{blockage.verified ? "VERIFIED" : "PENDING"}</Chip>
                    <Chip tone={blockage.severity === "CRITICAL" ? "red" : blockage.severity === "HIGH" ? "orange" : "amber"}>{blockage.severity}</Chip>
                    <DataClassBadge dataClass={blockage.dataClass} />
                  </span>
                </li>
              ))}
              {data && !data.blockages.length ? <li className="text-[11px] text-slate-500">No reported road hazard in this district.</li> : null}
            </ul>
            <div className="mt-2 flex gap-2">
              <Link href="/report?category=ROAD_BLOCKAGE" className="btn-outline btn-sm">Report a blockage</Link>
              <Link href="/facilities" className="btn-ghost btn-sm">Facilities directory</Link>
            </div>
          </div>
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-slate-500">{data?.coverageNote}</p>
    </div>
  );
}
