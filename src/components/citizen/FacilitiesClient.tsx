"use client";

import { useEffect, useMemo, useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { FACILITY_CATEGORIES, FACILITY_LABELS } from "@/lib/constants";
import { useApi } from "../interactive";
import TamilNaduMap, { type MapMarker } from "../TamilNaduMap";
import { Chip, EmptyState, Notice, SectionHeading, SourceBadge } from "../ui";

type Facility = {
  id: number;
  name: string;
  category: string;
  districtCode: string;
  districtName: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  verificationStatus: string;
  availabilityNote: string | null;
  availabilityStatus: string;
  capacity: number | null;
  occupancy: number | null;
  capacityDataClass: string;
  facilityClass: string;
  isActive: boolean;
  isOfficialShelter: boolean;
  dataClass: string;
  distanceKm: number | null;
  isVerified: boolean;
};

type ShelterRow = {
  id: number;
  name: string;
  districtName: string;
  capacity: number | null;
  occupancy: number | null;
  remaining: number | null;
  availabilityStatus: string;
  distanceKm: number | null;
};

export default function FacilitiesClient() {
  const [district, setDistrict] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [shelterSummary, setShelterSummary] = useState<ShelterRow[]>([]);
  const { data, loading, error } = useApi<{
    facilities: Facility[];
    shelters: ShelterRow[];
    counts: { total: number; verified: number; candidate: number; shelters: number };
    disclosure: string;
  }>(`/api/facilities${coords ? `?lat=${coords.lat}&lng=${coords.lng}` : ""}`, [coords]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preset = params.get("district");
    if (preset) setDistrict(preset.toUpperCase());
  }, []);

  const all = data?.facilities ?? [];
  const verifiedCount = all.filter((facility) => facility.isVerified).length;
  const filtered = useMemo(() => {
    const rows = all.filter((facility) => {
      if (verifiedOnly && !facility.isVerified) return false;
      if (district !== "ALL" && facility.districtCode !== district) return false;
      if (category !== "ALL" && facility.category !== category) return false;
      if (query && !`${facility.name} ${facility.address ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    return rows.sort((a, b) => {
      if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm !== null) return -1;
      if (b.distanceKm !== null) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [all, district, category, query, verifiedOnly]);

  const markers: MapMarker[] = filtered
    .filter((f) => f.lat !== null && f.lng !== null)
    .map((f) => ({
      id: f.id,
      type: f.isOfficialShelter ? "SHELTER" : "FACILITY",
      lat: f.lat as number,
      lng: f.lng as number,
      title: f.name,
      description: `${FACILITY_LABELS[f.category] ?? f.category} · ${f.districtName}`,
      status: f.verificationStatus,
      dataClass: f.dataClass,
    }));

  const shelters = all.filter((f) => f.isOfficialShelter);

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Emergency resource directory"
        title="Find nearby help"
        description="Hospitals, pharmacies, fire and police stations, food resources and officially designated shelters. Verification status is shown for every record."
        action={<SourceBadge source="CANDIDATE" />}
      />

      <Notice tone="info" title="What this directory does and does not claim">
        Records are directory candidates compiled from public listings. DisasterLink does <strong>not</strong> claim that a hospital has free
        beds, a pharmacy has medicines, or a grocery store has emergency stock. Telephone numbers appear only when an administrator has
        recorded one. Always call before travelling.
      </Notice>

      <div className="card card-pad">
        <div className="grid gap-2 sm:grid-cols-3">
          <label>
            <span className="label">Search by name</span>
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hospital, pharmacy, station…" />
          </label>
          <label>
            <span className="label">District</span>
            <select className="input" value={district} onChange={(e) => setDistrict(e.target.value)}>
              <option value="ALL">All 38 districts</option>
              {DISTRICTS.map((d) => (
                <option key={d.code} value={d.code}>{d.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Category</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="ALL">All categories</option>
              {FACILITY_CATEGORIES.map((c) => (
                <option key={c} value={c}>{FACILITY_LABELS[c]}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Chip tone="blue">{filtered.length} result(s)</Chip>
          {category !== "ALL" ? <Chip>{FACILITY_LABELS[category]}</Chip> : null}
          {district !== "ALL" ? <Chip>{DISTRICTS.find((d) => d.code === district)?.name}</Chip> : null}
          <button
            className="btn-ghost btn-sm ml-auto"
            onClick={() => {
              setCategory("ALL");
              setDistrict("ALL");
              setQuery("");
            }}
          >
            Reset filters
          </button>
        </div>
      </div>

      {error ? <Notice tone="danger" title="Directory unavailable">{error}</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <div className="space-y-3">
          <div className="card overflow-hidden">
            <div className="max-h-[560px] overflow-y-auto">
              {loading ? (
                <div className="space-y-2 p-3">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-3">
                  <EmptyState
                    title="No facilities match these filters"
                    description="Try a broader category or a different district. The absence of a directory record does not mean a facility is absent on the ground."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((facility) => (
                    <li key={facility.id} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone="blue">{FACILITY_LABELS[facility.category]?.replace(/s$/, "") ?? facility.category}</Chip>
                        <SourceBadge source={facility.verificationStatus} />
                        {facility.isVerified ? <Chip tone="green">VERIFIED</Chip> : <Chip tone="amber">CANDIDATE</Chip>}
                      {facility.distanceKm !== null ? <Chip tone="blue">~{facility.distanceKm} km</Chip> : null}
                      {facility.isOfficialShelter ? <Chip tone="green">OFFICIAL SHELTER</Chip> : null}
                        {facility.dataClass === "SIMULATED" ? <Chip tone="dark">SIMULATED</Chip> : null}
                      </div>
                      <p className="mt-1 text-sm font-bold text-slate-900">{facility.name}</p>
                      <p className="text-[11px] text-slate-500">{[facility.address, facility.districtName].filter(Boolean).join(" · ")}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {facility.phone ? (
                          <a href={`tel:${facility.phone}`} className="link">Call {facility.phone}</a>
                        ) : (
                          <span className="text-slate-400">Phone not verified in DisasterLink records</span>
                        )}
                      </p>
                      {facility.capacity !== null ? (
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-700">
                          {facility.occupancy ?? 0}/{facility.capacity} occupied
                          {facility.capacityDataClass === "SIMULATED" ? " · SIMULATED" : ` · ${facility.capacityDataClass}`}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{facility.availabilityNote}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {facility.lat !== null && facility.lng !== null ? (
                          <a
                            className="btn-outline btn-sm"
                            href={`https://www.openstreetmap.org/directions?to=${facility.lat}%2C${facility.lng}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Directions
                          </a>
                        ) : null}
                        {facility.sourceUrl ? (
                          <a className="btn-ghost btn-sm" href={facility.sourceUrl} target="_blank" rel="noreferrer">Source</a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <TamilNaduMap
            heightClass="h-[360px] sm:h-[460px]"
            districts={DISTRICTS.map((d) => ({ code: d.code, name: d.name, riskLevel: undefined }))}
            markers={markers}
            initialLayers={["facilities", "shelters", "labels"]}
            selectedCode={district === "ALL" ? null : district}
            onSelectDistrict={(code) => setDistrict(code)}
          />
          <div className="card card-pad">
            <h3 className="text-sm font-bold text-slate-900">Official shelters</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
              Only locations with a source-backed official designation are labelled as shelters. Schools, community halls and other public
              buildings are never assumed to be shelters.
            </p>
            {shelters.length ? (
              <ul className="mt-2 space-y-1.5">
                {shelters.map((shelter) => (
                  <li key={shelter.id} className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs">
                    <p className="font-semibold text-emerald-900">{shelter.name}</p>
                    <p className="text-[10px] text-emerald-800">{shelter.districtName} · {shelter.verificationStatus} · source recorded</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2">
                <EmptyState
                  title="No verified official shelter is on record"
                  description="Administrators can add a shelter only with a supporting source URL. Until then, follow directions from local authorities."
                />
              </div>
            )}
          </div>
          <div className="card card-pad">
            <h3 className="mb-1 text-sm font-bold text-slate-900">Emergency contact numbers</h3>
            <ul className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600">
              <li><a className="link" href="tel:112">112 · Emergency</a></li>
              <li><a className="link" href="tel:108">108 · Ambulance</a></li>
              <li><a className="link" href="tel:101">101 · Fire &amp; Rescue</a></li>
              <li><a className="link" href="tel:1078">1078 · Disaster control room</a></li>
              <li><a className="link" href="tel:1091">1091 · Women helpline</a></li>
              <li><a className="link" href="tel:1098">1098 · Child helpline</a></li>
            </ul>
            <p className="mt-2 text-[10px] text-slate-500">Public emergency numbers only. Facility-specific numbers are shown only when recorded.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
