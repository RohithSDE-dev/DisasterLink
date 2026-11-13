"use client";

import { useMemo, useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { FACILITY_CATEGORIES, FACILITY_LABELS, VERIFICATION_CLASSES } from "@/lib/constants";
import { apiRequest, Modal, useApi } from "../interactive";
import { Chip, EmptyState, Field, Notice, SectionHeading, SourceBadge } from "../ui";

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
  availabilityConfirmedAt: string | null;
  isActive: boolean;
  isOfficialShelter: boolean;
  shelterDesignation: string | null;
  dataClass: string;
};

const EMPTY_FORM = {
  name: "",
  category: "HOSPITAL",
  districtCode: "TN-CBE",
  address: "",
  phone: "",
  sourceName: "Administrator verified record",
  sourceUrl: "",
  verificationStatus: "CANDIDATE",
  availabilityNote: "",
  isOfficialShelter: false,
  shelterDesignation: "",
  lat: "",
  lng: "",
};

export default function FacilityConsole() {
  const list = useApi<{ facilities: Facility[] }>("/api/facilities?includeInactive=1");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [district, setDistrict] = useState("ALL");
  const [verification, setVerification] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [edit, setEdit] = useState<Facility | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const facilities = list.data?.facilities ?? [];
  const filtered = useMemo(
    () =>
      facilities.filter((facility) => {
        if (category !== "ALL" && facility.category !== category) return false;
        if (district !== "ALL" && facility.districtCode !== district) return false;
        if (verification !== "ALL" && facility.verificationStatus !== verification) return false;
        if (query && !`${facility.name} ${facility.address ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [facilities, category, district, verification, query],
  );

  async function createFacility() {
    setBusy(true);
    setError(null);
    const response = await apiRequest("/api/facilities", {
      method: "POST",
      body: {
        ...form,
        lat: form.lat || undefined,
        lng: form.lng || undefined,
        isOfficialShelter: form.isOfficialShelter || form.category === "SHELTER",
      },
    });
    setBusy(false);
    if (!response.ok) setError(response.error ?? "Could not create facility");
    else {
      setCreateOpen(false);
      setForm({ ...EMPTY_FORM });
      setFeedback("Facility created. Record is a directory candidate until verified.");
      list.reload();
    }
  }

  async function patchFacility(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const response = await apiRequest("/api/facilities", { method: "PATCH", body });
    setBusy(false);
    if (!response.ok) setError(response.error ?? "Update failed");
    else {
      setFeedback("Facility updated and audit logged.");
      list.reload();
      setEdit(null);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Facility management"
        title="Hospitals, emergency services and shelters"
        description="Records are candidates until an administrator verifies them. Availability is only shown when explicitly recorded with a timestamp."
        action={<button className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>Add facility</button>}
      />

      <Notice tone="warn" title="Verification policy">
        Do not claim bed, medicine or stock availability without a confirmed source. An official shelter designation requires a supporting
        source URL — schools and community halls are never assumed to be shelters.
      </Notice>

      <div className="grid gap-2 sm:grid-cols-5">
        <label className="sm:col-span-2">
          <span className="label">Search</span>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Facility name or address" />
        </label>
        <label>
          <span className="label">Category</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="ALL">All categories</option>
            {FACILITY_CATEGORIES.map((c) => <option key={c} value={c}>{FACILITY_LABELS[c]}</option>)}
          </select>
        </label>
        <label>
          <span className="label">District</span>
          <select className="input" value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option value="ALL">All districts</option>
            {DISTRICTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Verification</span>
          <select className="input" value={verification} onChange={(e) => setVerification(e.target.value)}>
            <option value="ALL">All</option>
            {VERIFICATION_CLASSES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      </div>

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="card overflow-hidden">
        <div className="max-h-[600px] overflow-auto">
          <table className="table-base min-w-[900px]">
            <thead className="sticky top-0">
              <tr>
                <th>Facility</th>
                <th>Category</th>
                <th>District</th>
                <th>Verification</th>
                <th>Availability</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((facility) => (
                <tr key={facility.id}>
                  <td>
                    <p className="text-xs font-bold text-slate-800">{facility.name}</p>
                    <p className="text-[10px] text-slate-500">{facility.address ?? "No address"} · {facility.phone ?? "no verified phone"}</p>
                    {facility.isOfficialShelter ? <Chip tone="green">OFFICIAL SHELTER</Chip> : null}
                  </td>
                  <td className="text-xs">{FACILITY_LABELS[facility.category] ?? facility.category}</td>
                  <td className="text-xs">{facility.districtName}</td>
                  <td><SourceBadge source={facility.verificationStatus} /></td>
                  <td className="max-w-[220px] text-[10px] text-slate-500">{facility.availabilityNote ?? "Not confirmed"}</td>
                  <td>{facility.isActive ? <Chip tone="green">ACTIVE</Chip> : <Chip tone="neutral">INACTIVE</Chip>}</td>
                  <td><button className="btn-outline btn-sm" onClick={() => { setEdit(facility); setError(null); }}>Manage</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length ? <div className="p-4"><EmptyState title="No facilities match these filters" /></div> : null}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add facility" description="Directory candidates must not imply confirmed availability." wide>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Name" required><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Category" required>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {FACILITY_CATEGORIES.map((c) => <option key={c} value={c}>{FACILITY_LABELS[c]}</option>)}
            </select>
          </Field>
          <Field label="District" required>
            <select className="input" value={form.districtCode} onChange={(e) => setForm({ ...form, districtCode: e.target.value })}>
              {DISTRICTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Verification status">
            <select className="input" value={form.verificationStatus} onChange={(e) => setForm({ ...form, verificationStatus: e.target.value })}>
              {VERIFICATION_CLASSES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Address"><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Phone (verified only)"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Latitude"><input className="input" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="11.0168" /></Field>
          <Field label="Longitude"><input className="input" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="76.9558" /></Field>
          <Field label="Source name" required><input className="input" value={form.sourceName} onChange={(e) => setForm({ ...form, sourceName: e.target.value })} /></Field>
          <Field label="Source URL" hint="Required when marking an official shelter."><input className="input" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Field label="Confirmed availability note" hint="Leave blank if availability is not confirmed.">
              <input className="input" value={form.availabilityNote} onChange={(e) => setForm({ ...form, availabilityNote: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={form.isOfficialShelter} onChange={(e) => setForm({ ...form, isOfficialShelter: e.target.checked })} className="h-4 w-4" />
            Officially designated shelter
          </label>
          {form.isOfficialShelter ? (
            <Field label="Shelter designation"><input className="input" value={form.shelterDesignation} onChange={(e) => setForm({ ...form, shelterDesignation: e.target.value })} /></Field>
          ) : null}
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="mt-3 flex gap-2">
          <button className="btn-primary btn-sm" onClick={createFacility} disabled={busy}>Create facility</button>
          <button className="btn-outline btn-sm" onClick={() => setCreateOpen(false)}>Cancel</button>
        </div>
      </Modal>

      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit ? `Manage: ${edit.name}` : ""} description="Verification and availability changes are audit logged.">
        {edit ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <SourceBadge source={edit.verificationStatus} />
              {edit.isOfficialShelter ? <Chip tone="green">OFFICIAL SHELTER</Chip> : null}
              <Chip tone={edit.isActive ? "green" : "neutral"}>{edit.isActive ? "ACTIVE" : "INACTIVE"}</Chip>
            </div>
            <Field label="Verification status">
              <select className="input" defaultValue={edit.verificationStatus} onChange={(e) => patchFacility({ id: edit.id, verificationStatus: e.target.value })}>
                {VERIFICATION_CLASSES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Phone"><input className="input" defaultValue={edit.phone ?? ""} onBlur={(e) => e.target.value !== (edit.phone ?? "") && patchFacility({ id: edit.id, phone: e.target.value })} /></Field>
            <Field label="Availability note" hint="Only record confirmed information with its source.">
              <textarea className="input min-h-[70px] text-xs" defaultValue={edit.availabilityNote ?? ""} onBlur={(e) => e.target.value !== (edit.availabilityNote ?? "") && patchFacility({ id: edit.id, availabilityNote: e.target.value })} />
            </Field>
            <Field label="Source URL"><input className="input" defaultValue={edit.sourceUrl ?? ""} onBlur={(e) => e.target.value !== (edit.sourceUrl ?? "") && patchFacility({ id: edit.id, sourceUrl: e.target.value })} /></Field>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button className="btn-outline btn-sm" onClick={() => patchFacility({ id: edit.id, isActive: !edit.isActive })}>{edit.isActive ? "Deactivate" : "Activate"}</button>
              <button className="btn-outline btn-sm" onClick={() => patchFacility({ id: edit.id, verificationStatus: "VERIFIED" })}>Mark verified</button>
              <button className="btn-outline btn-sm" onClick={() => patchFacility({ id: edit.id, isOfficialShelter: !edit.isOfficialShelter, sourceUrl: edit.sourceUrl })}>
                {edit.isOfficialShelter ? "Remove shelter flag" : "Mark official shelter"}
              </button>
            </div>
            <p className="text-[10px] text-slate-500">Source: {edit.sourceName ?? "Not recorded"} · data class {edit.dataClass}</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
