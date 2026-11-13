"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { isStale } from "@/lib/citizen";
import { CAMPUS_NOTE, requestLocation, type LatLng } from "@/lib/geo-distance";
import { useApi } from "../interactive";
import { Chip, DataClassBadge, EmptyState, Notice, SectionHeading, SourceBadge, formatDateTime } from "../ui";
import TamilNaduMap from "../TamilNaduMap";
import { useSelectedDistrict } from "./useDistrict";

type Shelter = {
  id: number;
  name: string;
  districtCode: string;
  districtName: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  capacity: number | null;
  occupancy: number | null;
  remaining: number | null;
  availabilityStatus: string;
  capacityDataClass: string;
  isOfficialShelter: boolean;
  isActive: boolean;
  dataClass: string;
  verificationStatus: string;
  updatedAt: string;
  distanceKm: number | null;
  availabilityNote: string | null;
};

type Payload = { facilities: unknown[]; shelters: Shelter[]; counts: Record<string, number>; location: LatLng | null };

export default function SheltersClient() {
  const [district, setDistrict] = useSelectedDistrict();
  const [scope, setScope] = useState<"DISTRICT" | "ALL">("DISTRICT");
  const [location, setLocation] = useState<LatLng | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [onlyWithSpace, setOnlyWithSpace] = useState(false);

  const query = scope === "DISTRICT" ? `?district=${district}${location ? `&lat=${location.lat}&lng=${location.lng}` : ""}` : location ? `?lat=${location.lat}&lng=${location.lng}` : "";
  const { data, loading, error, reload } = useApi<Payload>(`/api/facilities${query}`, [scope, district, location]);

  const shelters = useMemo(() => {
    const rows = data?.shelters ?? [];
    const filtered = scope === "DISTRICT" ? rows.filter((row) => row.districtCode === district) : rows;
    const withSpace = onlyWithSpace ? filtered.filter((row) => (row.remaining ?? 0) > 0) : filtered;
    return [...withSpace].sort((a, b) => {
      if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm !== null) return -1;
      if (b.distanceKm !== null) return 1;
      return (b.remaining ?? 0) - (a.remaining ?? 0);
    });
  }, [data, scope, district, onlyWithSpace]);

  async function useLocation() {
    setGeoMessage("Requesting your location…");
    const fix = await requestLocation({ onError: (message) => setGeoMessage(message) });
    if (fix) {
      setLocation(fix);
      setGeoMessage(`Using ${fix.lat}, ${fix.lng} for distance ordering.`);
    }
  }

  const markers = shelters
    .filter((row) => row.lat !== null && row.lng !== null)
    .map((row) => ({
      id: `shelter-${row.id}`,
      type: "SHELTER" as const,
      lat: row.lat as number,
      lng: row.lng as number,
      title: row.name,
      description: `${row.districtName}${row.capacity !== null ? ` · ${row.occupancy ?? 0}/${row.capacity}` : " · capacity not recorded"}`,
      status: row.availabilityStatus,
      dataClass: row.dataClass,
    }));

  const totals = useMemo(() => {
    const withCapacity = shelters.filter((row) => row.capacity !== null);
    return {
      count: shelters.length,
      capacity: withCapacity.reduce((sum, row) => sum + (row.capacity ?? 0), 0),
      occupied: withCapacity.reduce((sum, row) => sum + (row.occupancy ?? 0), 0),
      remaining: withCapacity.reduce((sum, row) => sum + (row.remaining ?? 0), 0),
      stale: shelters.filter((row) => isStale(row.updatedAt)).length,
    };
  }, [shelters]);

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Safety zones & shelters"
        title="Find a relief camp or shelter"
        description="Capacity, occupancy and operational status come from the same records the government command centre updates. Only recorded values are shown — never estimates."
        action={<Chip tone="amber">SIMULATED records badged</Chip>}
      />

      <Notice tone="warn" title="Check before you travel">
        Capacity can change quickly and this page does not reserve a place. DisasterLink never labels a shelter as “safe”: confirm operational
        status with the district control room or on arrival. Demonstration camps are labelled SIMULATED and are not official government shelters.
      </Notice>

      <div className="card card-pad">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="label">District</span>
            <select className="input" value={district} onChange={(event) => setDistrict(event.target.value)} disabled={scope === "ALL"}>
              {DISTRICTS.map((entry) => (
                <option key={entry.code} value={entry.code}>{entry.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Search area</span>
            <select className="input" value={scope} onChange={(event) => setScope(event.target.value as "DISTRICT" | "ALL")}>
              <option value="DISTRICT">Selected district</option>
              <option value="ALL">All districts</option>
            </select>
          </label>
          <div className="flex items-end">
            <button className="btn-outline btn-sm w-full" onClick={useLocation}>Use my location</button>
          </div>
          <div className="flex items-end">
            <button className="btn-primary btn-sm w-full" onClick={reload}>Refresh occupancy</button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <label className="inline-flex items-center gap-1.5 font-medium">
            <input type="checkbox" checked={onlyWithSpace} onChange={(event) => setOnlyWithSpace(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
            Only camps with recorded space
          </label>
          {geoMessage ? <span className="text-slate-600">{geoMessage}</span> : <span>{CAMPUS_NOTE}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Camps listed", value: totals.count },
          { label: "Total capacity", value: totals.capacity },
          { label: "Occupied", value: totals.occupied },
          { label: "Remaining", value: totals.remaining },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className="text-lg font-extrabold tabular-nums text-slate-900">{loading && !data ? "—" : item.value}</p>
          </div>
        ))}
      </div>
      {totals.stale > 0 ? (
        <p className="text-[11px] text-amber-700">{totals.stale} camp record(s) have not been updated for over 12 hours and are marked stale.</p>
      ) : null}

      {error ? <Notice tone="danger" title="Shelter data unavailable">{error}</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-2">
          {loading && !data ? [0, 1, 2].map((index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-white" />) : null}
          {!loading && shelters.length === 0 ? (
            <EmptyState
              title="No camp record for this selection"
              description="Absence of a record does not mean no shelter exists. Contact the district control room (1078) and follow instructions from local authorities."
            />
          ) : null}
          {shelters.map((shelter) => {
            const stale = isStale(shelter.updatedAt);
            const full = shelter.availabilityStatus === "FULL" || (shelter.remaining !== null && shelter.remaining <= 0);
            return (
              <article key={shelter.id} className="card card-pad">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={full ? "red" : shelter.availabilityStatus === "LIMITED" ? "amber" : shelter.availabilityStatus === "AVAILABLE" ? "green" : "neutral"}>
                    {shelter.isActive ? shelter.availabilityStatus : "INACTIVE"}
                  </Chip>
                  {shelter.isOfficialShelter ? <Chip tone="green">OFFICIAL SHELTER</Chip> : <Chip tone="neutral">Camp record</Chip>}
                  <SourceBadge source={shelter.verificationStatus} />
                  {shelter.dataClass === "SIMULATED" ? <DataClassBadge dataClass="SIMULATED" /> : null}
                  {stale ? <Chip tone="amber">STALE UPDATE</Chip> : null}
                  {shelter.distanceKm !== null ? <Chip tone="blue">~{shelter.distanceKm} km</Chip> : null}
                </div>
                <h3 className="mt-1 text-sm font-bold text-slate-900">{shelter.name}</h3>
                <p className="text-[11px] text-slate-600">{shelter.districtName} · {shelter.address ?? "Address not recorded"}</p>

                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {[
                    { label: "Capacity", value: shelter.capacity !== null ? String(shelter.capacity) : "Not recorded" },
                    { label: "Occupied", value: shelter.occupancy !== null ? String(shelter.occupancy) : "Not recorded" },
                    { label: "Remaining", value: shelter.remaining !== null ? String(shelter.remaining) : "Not recorded" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-md bg-slate-50 px-2 py-1">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
                      <p className="text-xs font-bold text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>
                {shelter.capacity !== null ? (
                  <div className="mt-1.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{ width: `${Math.min(100, Math.round(((shelter.occupancy ?? 0) / Math.max(1, shelter.capacity)) * 100))}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {shelter.capacityDataClass === "SIMULATED" ? "SIMULATED occupancy figure · " : `${shelter.capacityDataClass} figure · `}
                      last updated {formatDateTime(shelter.updatedAt)}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1.5 text-[10px] text-amber-700">Capacity and occupancy unavailable for this record — contact the control room before travelling.</p>
                )}
                {shelter.availabilityNote ? <p className="mt-1 text-[10px] leading-snug text-slate-500">{shelter.availabilityNote}</p> : null}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {shelter.lat !== null && shelter.lng !== null ? (
                    <a
                      className="btn-outline btn-sm"
                      href={`https://www.openstreetmap.org/directions?to=${shelter.lat}%2C${shelter.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Directions
                    </a>
                  ) : null}
                  <Link className="btn-ghost btn-sm" href={`/map?district=${shelter.districtCode}`}>Open map</Link>
                  <Link className="btn-ghost btn-sm" href={`/report?district=${shelter.districtCode}`}>Report an issue here</Link>
                </div>
              </article>
            );
          })}
        </div>

        <div className="space-y-3">
          <TamilNaduMap
            compact
            heightClass="h-[320px] sm:h-[380px]"
            districts={DISTRICTS.map((entry) => ({ code: entry.code, name: entry.name }))}
            markers={markers}
            initialLayers={["shelters", "labels"]}
            selectedCode={district}
            onSelectDistrict={(code) => setDistrict(code)}
          />
          <Notice tone="info" title="How occupancy is maintained">
            An authorised administrator records capacity and occupancy in the command centre. Those values are validated so occupancy can never
            exceed capacity, and they appear here and on the Phase 1 map immediately after saving.
          </Notice>
          <div className="card card-pad">
            <h3 className="mb-1 text-sm font-bold text-slate-900">District control room</h3>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <a className="link" href="tel:1078">1078 · Disaster control</a>
              <a className="link" href="tel:112">112 · Emergency</a>
              <a className="link" href="tel:108">108 · Ambulance</a>
              <a className="link" href="tel:101">101 · Fire &amp; rescue</a>
            </div>
          </div>
          <div className="card card-pad">
            <h3 className="mb-1 text-sm font-bold text-slate-900">Related citizen tools</h3>
            <div className="flex flex-wrap gap-1.5">
              <Link className="btn-outline btn-sm" href="/evacuation">Evacuation guidance</Link>
              <Link className="btn-outline btn-sm" href="/facilities">Hospitals &amp; services</Link>
              <Link className="btn-outline btn-sm" href="/safety">Safety instructions</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
