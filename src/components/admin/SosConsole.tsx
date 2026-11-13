"use client";

import { useMemo, useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { PRIORITIES, SOS_DISCLAIMER, SOS_STATUSES } from "@/lib/constants";
import { apiRequest, Modal, useApi } from "../interactive";
import { Chip, DataClassBadge, EmptyState, Field, Notice, SectionHeading, StatusBadge, formatDateTime, relativeTime } from "../ui";

type SosRow = {
  id: number;
  publicId: string;
  emergencyType: string;
  description: string;
  districtCode: string;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  name: string | null;
  phone: string | null;
  peopleAffected: number | null;
  status: string;
  priority: string;
  assignedTeamId: number | null;
  assignedTeamName: string | null;
  resolutionNote: string | null;
  dataClass: string;
  createdAt: string;
  resolvedAt: string | null;
};

type Detail = {
  sos: SosRow;
  events: { id: number; action: string; fromStatus: string | null; toStatus: string | null; note: string | null; actorName: string | null; createdAt: string }[];
  teams: { id: number; name: string; status: string; baseDistrict: string }[];
  assignments: { id: number; teamName: string; status: string; createdAt: string; resourcesAllocated: string | null }[];
};

export default function SosConsole() {
  const list = useApi<{ sos: SosRow[]; counts: Record<string, number>; contactRedacted: boolean; capabilities: Record<string, boolean> }>("/api/sos");
  const [status, setStatus] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const [district, setDistrict] = useState("ALL");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const detail = useApi<Detail>(openId ? `/api/sos/${openId}` : null);
  const [note, setNote] = useState("");
  const [teamId, setTeamId] = useState("");
  const [resources, setResources] = useState("");
  const [priorityDraft, setPriorityDraft] = useState("NORMAL");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = list.data?.sos ?? [];
  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (status !== "ALL" && row.status !== status) return false;
        if (priority !== "ALL" && row.priority !== priority) return false;
        if (district !== "ALL" && row.districtCode !== district) return false;
        if (query && !`${row.publicId} ${row.description} ${row.locationName ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [rows, status, priority, district, query],
  );

  async function act(action: string, extra?: Record<string, unknown>) {
    if (!openId) return;
    setBusy(true);
    setFeedback(null);
    setError(null);
    const response = await apiRequest(`/api/sos/${openId}`, {
      method: "PATCH",
      body: {
        action,
        note: note || undefined,
        priority: action === "SET_PRIORITY" ? priorityDraft : undefined,
        teamId: action === "ASSIGN" ? Number(teamId) : undefined,
        resourcesAllocated: action === "ASSIGN" ? resources : undefined,
        ...extra,
      },
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.error ?? "Action failed");
      return;
    }
    setFeedback(`${action.replaceAll("_", " ")} recorded. Audit entry written.`);
    setNote("");
    detail.reload();
    list.reload();
  }

  const active = detail.data?.sos;
  const counts = list.data?.counts ?? {};
  const caps = list.data?.capabilities ?? {};
  const contactRedacted = list.data?.contactRedacted ?? false;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] text-red-950">
        <p className="text-[10px] font-bold uppercase tracking-wide">SOS control policy</p>
        {SOS_DISCLAIMER}
      </div>

      <SectionHeading
        eyebrow="SOS control panel"
        title="Triage incoming emergency requests"
        description="Review, prioritise, verify and assign an authorised response team. No automatic dispatch occurs."
        action={<Chip tone="red">{counts.critical ?? 0} critical open</Chip>}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Total", counts.total ?? 0],
          ["Submitted", counts.submitted ?? 0],
          ["Open", counts.open ?? 0],
          ["Verified", counts.verified ?? 0],
          ["Team assigned", counts.assigned ?? 0],
          ["Resolved", counts.resolved ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="text-lg font-extrabold tabular-nums text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="card card-pad">
        <div className="grid gap-2 sm:grid-cols-4">
          <label>
            <span className="label">Search</span>
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ID, description, location" />
          </label>
          <label>
            <span className="label">Status</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ALL">All statuses</option>
              {SOS_STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Priority</span>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="ALL">All priorities</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>
            <span className="label">District</span>
            <select className="input" value={district} onChange={(e) => setDistrict(e.target.value)}>
              <option value="ALL">All districts</option>
              {DISTRICTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base min-w-[900px]">
            <thead>
              <tr>
                <th>Request</th>
                <th>Emergency</th>
                <th>District</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Team</th>
                <th>Received</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td>
                    <p className="font-mono text-[10px] text-slate-500">{row.publicId}</p>
                    <p className="max-w-[180px] truncate text-xs font-semibold">{row.locationName ?? "Location not provided"}</p>
                    <DataClassBadge dataClass={row.dataClass} />
                  </td>
                  <td className="text-xs">{row.emergencyType.replaceAll("_", " ")}</td>
                  <td className="text-xs">{DISTRICTS.find((d) => d.code === row.districtCode)?.name ?? row.districtCode}</td>
                  <td><Chip tone={row.priority === "CRITICAL" ? "red" : row.priority === "HIGH" ? "orange" : "neutral"}>{row.priority}</Chip></td>
                  <td><StatusBadge status={row.status} /></td>
                  <td className="text-[11px]">{row.assignedTeamName ?? "—"}</td>
                  <td className="text-[10px] text-slate-500">{relativeTime(row.createdAt)}</td>
                  <td>
                    <button
                      className="btn-outline btn-sm"
                      onClick={() => {
                        setOpenId(row.id);
                        setPriorityDraft(row.priority);
                        setNote("");
                        setTeamId("");
                        setResources("");
                        setFeedback(null);
                        setError(null);
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length ? <div className="p-4"><EmptyState title="No SOS requests match these filters" /></div> : null}
      </div>

      <Modal open={Boolean(openId)} onClose={() => setOpenId(null)} title={active ? `${active.publicId} · SOS triage` : "Loading…"} description="Assignment requires an authorised administrator." wide>
        {active ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={active.status} />
              <Chip tone={active.priority === "CRITICAL" ? "red" : active.priority === "HIGH" ? "orange" : "neutral"}>PRIORITY {active.priority}</Chip>
              <Chip tone="blue">{active.emergencyType.replaceAll("_", " ")}</Chip>
              <DataClassBadge dataClass={active.dataClass} />
              <span className="text-[10px] text-slate-500">{formatDateTime(active.createdAt)}</span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-red-700">Emergency description</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-800">{active.description}</p>
                <div className="mt-2 space-y-0.5 text-[11px] text-slate-700">
                  <p><strong>District:</strong> {DISTRICTS.find((d) => d.code === active.districtCode)?.name}</p>
                  <p><strong>Location:</strong> {active.locationName ?? "Not provided"}</p>
                  <p><strong>GPS:</strong> {active.lat !== null ? `${active.lat}, ${active.lng}` : "Not shared"}</p>
                  <p><strong>People affected:</strong> {active.peopleAffected ?? "Unknown"}</p>
                </div>
                {active.lat !== null && active.lng !== null ? (
                  <a className="btn-outline btn-sm mt-2" href={`https://www.openstreetmap.org/?mlat=${active.lat}&mlon=${active.lng}#map=15/${active.lat}/${active.lng}`} target="_blank" rel="noreferrer">Open location on map</a>
                ) : null}
                <div className="mt-2 rounded-md bg-white p-2 text-[10px] text-slate-600">
                  {contactRedacted ? (
                    <><strong>Restricted:</strong> citizen contact details and precise coordinates are hidden for your role.</>
                  ) : (
                    <><strong>Restricted contact:</strong> {active.name ?? "Not provided"} · {active.phone ?? "No callback number"} — never publish.</>
                  )}
                </div>
                {active.resolutionNote ? <p className="mt-2 rounded-md bg-emerald-50 p-2 text-[11px] text-emerald-900">Resolution: {active.resolutionNote}</p> : null}
              </div>

              <div className="space-y-2">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Status &amp; priority</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button className="btn-outline btn-sm" onClick={() => act("RECEIVE")} disabled={busy || !caps.acknowledge}>Acknowledge</button>
                    <button className="btn-outline btn-sm" onClick={() => act("REVIEW")} disabled={busy || !caps.acknowledge}>Under review</button>
                    <button className="btn-primary btn-sm" onClick={() => act("VERIFY")} disabled={busy || !caps.assign}>Verify request</button>
                    <button className="btn-sos btn-sm" onClick={() => act("RESOLVE")} disabled={busy || !caps.resolve}>Resolve</button>
                  </div>
                  <div className="mt-2 flex items-end gap-2">
                    <label className="flex-1">
                      <span className="label">Set priority</span>
                      <select className="input py-1.5 text-xs" value={priorityDraft} onChange={(e) => setPriorityDraft(e.target.value)}>
                        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </label>
                    <button className="btn-outline btn-sm" onClick={() => act("SET_PRIORITY")} disabled={busy || !caps.assign}>Apply</button>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Assign authorised response team</p>
                  <select className="input py-1.5 text-xs" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                    <option value="">Select team…</option>
                    {(detail.data?.teams ?? []).map((team) => (
                      <option key={team.id} value={team.id}>{team.name} · {team.baseDistrict} · {team.status}</option>
                    ))}
                  </select>
                  <input className="input mt-1.5 py-1.5 text-xs" placeholder="Resources allocated (optional)" value={resources} onChange={(e) => setResources(e.target.value)} />
                  <button className="btn-dark btn-sm mt-2" onClick={() => act("ASSIGN")} disabled={busy || !teamId || !caps.assign}>Assign team</button>
                  <p className="mt-1 text-[10px] text-slate-500">Assigning a SIMULATED team does not contact any real responder.</p>
                </div>

                <Field label="Remarks (required to resolve)">
                  <textarea className="input min-h-[60px] text-xs" value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <button className="btn-ghost btn-sm" onClick={() => act("ADD_REMARK")} disabled={busy || !caps.acknowledge}>Save remark</button>
                {!caps.assign ? <p className="text-[10px] text-amber-700">Your role can acknowledge and record notes but cannot assign teams or resolve requests.</p> : null}
              </div>
            </div>

            {feedback ? <Notice tone="success">{feedback}</Notice> : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">SOS history</p>
                <ol className="space-y-2">
                  {(detail.data?.events ?? []).map((event) => (
                    <li key={event.id} className="text-[11px]">
                      <p className="font-semibold text-slate-800">{event.action.replaceAll("_", " ")} {event.toStatus ? `→ ${event.toStatus.replaceAll("_", " ")}` : ""}</p>
                      <p className="text-slate-500">{event.note}</p>
                      <p className="text-[10px] text-slate-400">{formatDateTime(event.createdAt)} · {event.actorName ?? "System"}</p>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Assignment ledger</p>
                {(detail.data?.assignments ?? []).length ? (
                  <ul className="space-y-1.5">
                    {detail.data!.assignments.map((assignment) => (
                      <li key={assignment.id} className="text-[11px]">
                        <p className="font-semibold text-slate-800">#{assignment.id} · {assignment.teamName}</p>
                        <p className="text-slate-500">{assignment.resourcesAllocated ?? "No resources listed"}</p>
                        <p className="text-[10px] text-slate-400"><StatusBadge status={assignment.status} /></p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-slate-500">No team assigned yet.</p>
                )}
              </div>
            </div>
          </div>
        ) : detail.loading ? (
          <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
        ) : null}
      </Modal>
    </div>
  );
}
