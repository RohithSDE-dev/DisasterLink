"use client";

import { useMemo, useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { FACILITY_LABELS } from "@/lib/constants";
import { apiRequest, useApi } from "../interactive";
import { CategoryBars } from "../charts";
import { Chip, DataClassBadge, EmptyState, Field, Notice, SectionHeading, SourceBadge, Stat, formatDateTime } from "../ui";

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
  availabilityStatus: string;
  availabilityNote: string | null;
  capacity: number | null;
  occupancy: number | null;
  capacityDataClass: string;
  isActive: boolean;
  isOfficialShelter: boolean;
  facilityClass: string;
  dataClass: string;
  updatedAt: string;
};

const AVAILABILITY = ["AVAILABLE", "LIMITED", "FULL", "CLOSED", "UNKNOWN"] as const;

export default function FacilityOperationsConsole({ kind }: { kind: "SHELTER" | "AMBULANCE_SERVICE" }) {
  const { data, loading, error, reload } = useApi<{ facilities: Facility[] }>("/api/facilities?includeInactive=1");
  const [district, setDistrict] = useState("ALL");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Facility | null>(null);
  const [capacity, setCapacity] = useState("");
  const [occupancy, setOccupancy] = useState("");
  const [availability, setAvailability] = useState<string>("UNKNOWN");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      (data?.facilities ?? []).filter((facility) => {
        if (kind === "SHELTER" && facility.category !== "SHELTER" && !facility.isOfficialShelter) return false;
        if (kind === "AMBULANCE_SERVICE" && facility.category !== "AMBULANCE_SERVICE") return false;
        if (district !== "ALL" && facility.districtCode !== district) return false;
        if (query && !facility.name.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [data, kind, district, query],
  );

  const totals = useMemo(() => {
    const active = rows.filter((row) => row.isActive);
    const capacity = active.reduce((sum, row) => sum + (row.capacity ?? 0), 0);
    const occupancy = active.reduce((sum, row) => sum + (row.occupancy ?? 0), 0);
    return {
      facilities: active.length,
      capacity,
      occupancy,
      remaining: Math.max(0, capacity - occupancy),
      available: active.filter((row) => row.availabilityStatus === "AVAILABLE").length,
      limited: active.filter((row) => row.availabilityStatus === "LIMITED").length,
      full: active.filter((row) => row.availabilityStatus === "FULL" || row.availabilityStatus === "CLOSED").length,
      recorded: active.filter((row) => row.capacity !== null).length,
      verified: active.filter((row) => row.capacityDataClass === "VERIFIED").length,
      simulated: active.filter((row) => row.capacityDataClass === "SIMULATED").length,
    };
  }, [rows]);

  const byDistrict = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.districtName, (map.get(row.districtName) ?? 0) + 1);
    return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [rows]);

  function startEdit(facility: Facility) {
    setEditing(facility);
    setCapacity(facility.capacity !== null ? String(facility.capacity) : "");
    setOccupancy(facility.occupancy !== null ? String(facility.occupancy) : "");
    setAvailability(facility.availabilityStatus);
    setNote(facility.availabilityNote ?? "");
    setFeedback(null);
    setFormError(null);
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setFormError(null);
    const body: Record<string, unknown> = {
      id: editing.id,
      availabilityStatus: availability,
      capacityDataClass: "VERIFIED",
    };
    if (capacity !== "") body.capacity = Number(capacity);
    if (occupancy !== "") body.occupancy = Number(occupancy);
    if (note !== (editing.availabilityNote ?? "")) body.availabilityNote = note;
    const response = await apiRequest("/api/facilities", { method: "PATCH", body });
    setBusy(false);
    if (!response.ok) {
      setFormError(response.error ?? "Update failed");
      return;
    }
    setFeedback(`Updated ${editing.name} — capacity/occupancy marked VERIFIED and audit logged.`);
    setEditing(null);
    reload();
  }

  async function quickStatus(facility: Facility, status: string) {
    const response = await apiRequest("/api/facilities", { method: "PATCH", body: { id: facility.id, availabilityStatus: status } });
    if (!response.ok) setFormError(response.error ?? "Update failed");
    else {
      setFeedback(`${facility.name} availability set to ${status}.`);
      reload();
    }
  }

  const isShelter = kind === "SHELTER";

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow={isShelter ? "Safety zones & shelters" : "Ambulance management"}
        title={isShelter ? "Relief camp and shelter operations" : "Ambulance availability board"}
        description={
          isShelter
            ? "Capacity and occupancy updates are administrator-controlled and audit logged. SIMULATED demonstration camps are not official shelter designations."
            : "Availability status demonstrates fleet coordination. Records are SIMULATED; no live emergency service feed is integrated."
        }
        action={<DataClassBadge dataClass="SIMULATED" />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={isShelter ? "Active camps" : "Active ambulances"} value={totals.facilities} hint={`${totals.recorded} with capacity recorded`} tone="info" />
        <Stat label={isShelter ? "Total capacity" : "Marked available"} value={isShelter ? totals.capacity : totals.available} hint={isShelter ? `${totals.occupancy} occupied` : `${totals.limited} limited`} tone="good" />
        <Stat label={isShelter ? "Remaining capacity" : "Unavailable"} value={isShelter ? totals.remaining : totals.full} hint={isShelter ? `${totals.full} full/closed` : "full or closed"} tone={isShelter ? "warn" : "danger"} />
        <Stat label="Verified capacity records" value={totals.verified} hint={`${totals.simulated} simulated`} tone="default" />
      </div>

      <Notice tone="warn" title="Data honesty">
        Occupancy and capacity are shown only where an administrator has recorded them. Values with data class SIMULATED are demonstration
        numbers. Do not publish bed, medicine or fleet availability without source confirmation.
      </Notice>

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="card card-pad">
        <div className="grid gap-2 sm:grid-cols-3">
          <label>
            <span className="label">Search</span>
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Facility name" />
          </label>
          <label>
            <span className="label">District</span>
            <select className="input" value={district} onChange={(event) => setDistrict(event.target.value)}>
              <option value="ALL">All districts</option>
              {DISTRICTS.map((entry) => (
                <option key={entry.code} value={entry.code}>{entry.name}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button className="btn-outline btn-sm" onClick={reload}>Refresh</button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="card overflow-hidden">
          <div className="max-h-[520px] overflow-auto">
            <table className="table-base min-w-[720px]">
              <thead className="sticky top-0">
                <tr>
                  <th>{isShelter ? "Camp / shelter" : "Ambulance"}</th>
                  <th>District</th>
                  <th>Availability</th>
                  <th className="text-right">{isShelter ? "Occupancy" : "Class"}</th>
                  <th>Verification</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr><td colSpan={6} className="p-4 text-xs text-slate-500">Loading facility records…</td></tr>
                ) : null}
                {rows.map((facility) => (
                  <tr key={facility.id}>
                    <td>
                      <p className="text-xs font-bold text-slate-800">{facility.name}</p>
                      <p className="text-[10px] text-slate-500">{facility.address ?? "No address"} · updated {formatDateTime(facility.updatedAt)}</p>
                      {facility.capacityDataClass === "SIMULATED" ? <DataClassBadge dataClass="SIMULATED" /> : null}
                    </td>
                    <td className="text-xs">{facility.districtName}</td>
                    <td>
                      <select
                        value={facility.availabilityStatus}
                        onChange={(event) => void quickStatus(facility, event.target.value)}
                        className="rounded border border-slate-300 px-1 py-0.5 text-[10px]"
                      >
                        {AVAILABILITY.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
                    <td className="text-right text-xs tabular-nums">
                      {isShelter
                        ? facility.capacity !== null
                          ? `${facility.occupancy ?? 0}/${facility.capacity}`
                          : "not recorded"
                        : facility.facilityClass}
                    </td>
                    <td><SourceBadge source={facility.verificationStatus} /></td>
                    <td><button className="btn-outline btn-sm" onClick={() => startEdit(facility)}>Update</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && !rows.length ? <div className="p-4"><EmptyState title="No records for this filter" description="Change the district filter or add a facility from the facilities module." /></div> : null}
        </div>

        <div className="space-y-4">
          {editing ? (
            <div className="card card-pad">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Update record</p>
                  <p className="text-sm font-bold text-slate-900">{editing.name}</p>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => setEditing(null)}>Close</button>
              </div>
              <div className="space-y-2">
                <Field label="Availability status">
                  <select className="input" value={availability} onChange={(event) => setAvailability(event.target.value)}>
                    {AVAILABILITY.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={isShelter ? "Capacity" : "Capacity (if known)"}><input className="input" type="number" min={0} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></Field>
                  <Field label={isShelter ? "Occupancy" : "In use"}><input className="input" type="number" min={0} value={occupancy} onChange={(event) => setOccupancy(event.target.value)} /></Field>
                </div>
                <Field label="Availability note" hint="State the source and time of the confirmation.">
                  <textarea className="input min-h-[70px] text-xs" value={note} onChange={(event) => setNote(event.target.value)} />
                </Field>
                {formError ? <Notice tone="danger">{formError}</Notice> : null}
                <button className="btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save verified update"}</button>
                <p className="text-[10px] text-slate-500">Saving marks capacity data class VERIFIED and writes an audit entry.</p>
              </div>
            </div>
          ) : (
            <div className="card card-pad">
              <SectionHeading eyebrow="Operations" title="How to update" />
              <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-slate-600">
                <li>Use the availability dropdown for an immediate status change.</li>
                <li>Open “Update” to record verified capacity/occupancy with a note and source.</li>
                <li>Every change is written to the administrative audit log.</li>
                <li>Citizen screens read the same records, so updates propagate to the map and directories.</li>
              </ol>
            </div>
          )}

          <div className="card card-pad">
            <SectionHeading eyebrow="Distribution" title={isShelter ? "Camps by district" : "Ambulances by district"} />
            <CategoryBars data={byDistrict} />
            <p className="mt-2 text-[10px] text-slate-500">{FACILITY_LABELS[kind] ?? kind} · counts include inactive records only in the table view.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
