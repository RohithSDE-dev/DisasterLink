"use client";

import { useMemo, useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { CATEGORY_LABELS, INCIDENT_CATEGORIES, INCIDENT_STATUS_LABELS, SEVERITIES } from "@/lib/constants";
import { WORKFLOW_ACTIONS } from "@/lib/permissions";
import { apiRequest, Modal, useApi } from "../interactive";
import { Chip, DataClassBadge, EmptyState, Field, Notice, SectionHeading, SeverityBadge, SourceBadge, StatusBadge, formatDateTime, relativeTime } from "../ui";

type Row = {
  id: number;
  publicId: string;
  category: string;
  description: string;
  districtCode: string;
  districtName: string;
  locationName: string;
  lat: number | null;
  lng: number | null;
  reportedSeverity: string;
  assessedSeverity: string | null;
  status: string;
  dataClass: string;
  contactName: string | null;
  contactPhone: string | null;
  photoUrl: string | null;
  aiCategory: string | null;
  aiSeverity: string | null;
  aiSummary: string | null;
  aiDuplicateOf: string | null;
  aiConfidence: number | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
  resolvedAt: string | null;
};

type Detail = {
  incident: Row;
  events: { id: number; action: string; fromStatus: string | null; toStatus: string | null; note: string | null; actorName: string | null; actorRole: string | null; createdAt: string }[];
  analysis: {
    categoryLabel: string;
    categoryConfidence: number;
    severitySuggestion: string;
    severityRationale: string[];
    summary: string;
    suggestedActions: string[];
    duplicate: { publicId: string; similarity: number; status: string } | null;
    advisory: string;
  };
  teams: { id: number; name: string; status: string; baseDistrict: string }[];
  contactRedacted: boolean;
  capabilities: Record<string, boolean>;
  actorRole: string;
};

const STATUS_TABS = [
  { id: "ALL", label: "All" },
  { id: "PENDING", label: "Reported" },
  { id: "UNDER_REVIEW", label: "Under review" },
  { id: "VERIFIED", label: "Verified" },
  { id: "ASSIGNED", label: "Assigned" },
  { id: "IN_PROGRESS", label: "In progress" },
  { id: "RESOLVED", label: "Resolved" },
  { id: "REJECTED", label: "Rejected" },
];

export default function IncidentConsole() {
  const list = useApi<{ incidents: Row[]; counts: Record<string, number> }>("/api/incidents?scope=admin&limit=400");
  const [status, setStatus] = useState("ALL");
  const [district, setDistrict] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [severity, setSeverity] = useState("ALL");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const detail = useApi<Detail>(openId ? `/api/incidents/${openId}` : null);
  const [note, setNote] = useState("");
  const [severityDraft, setSeverityDraft] = useState("MODERATE");
  const [teamId, setTeamId] = useState("");
  const [resources, setResources] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = list.data?.incidents ?? [];
  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (status !== "ALL" && row.status !== status) return false;
        if (district !== "ALL" && row.districtCode !== district) return false;
        if (category !== "ALL" && row.category !== category) return false;
        if (severity !== "ALL" && (row.assessedSeverity ?? row.reportedSeverity) !== severity) return false;
        if (query && !`${row.publicId} ${row.description} ${row.locationName}`.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [rows, status, district, category, severity, query],
  );

  const capabilities = detail.data?.capabilities ?? {};
  const counts = list.data?.counts ?? {};

  async function act(action: string, extra?: Record<string, unknown>) {
    if (!openId) return;
    setBusy(true);
    setFeedback(null);
    setError(null);
    const response = await apiRequest(`/api/incidents/${openId}`, {
      method: "PATCH",
      body: {
        action,
        note: note || undefined,
        severity: ["VERIFY", "SET_SEVERITY"].includes(action) ? severityDraft : undefined,
        ...extra,
      },
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.error ?? "Action failed");
      return;
    }
    setFeedback(`${action.replaceAll("_", " ")} recorded. Status change, actor and audit entry saved.`);
    setNote("");
    detail.reload();
    list.reload();
  }

  async function assignTeam() {
    if (!teamId) {
      setError("Select an available response team first");
      return;
    }
    await act("ASSIGN", { teamId: Number(teamId), resourcesAllocated: resources || undefined });
    setTeamId("");
    setResources("");
  }

  function openIncident(row: Row) {
    setOpenId(row.id);
    setSeverityDraft(row.assessedSeverity ?? row.reportedSeverity);
    setNote("");
    setFeedback(null);
    setError(null);
    setTeamId("");
    setResources("");
  }

  const active = detail.data?.incident;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Incident management"
        title="Review, verify and track response"
        description="Workflow: Reported → Under review → Verified → Assigned → In progress → Resolved. Every change is saved with the acting officer, timestamp and an audit record."
        action={<SourceBadge source="COMMUNITY_REPORT" />}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {STATUS_TABS.filter((tab) => tab.id !== "ALL").map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatus(status === tab.id ? "ALL" : tab.id)}
            className={`rounded-lg border px-2.5 py-1.5 text-left transition ${
              status === tab.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <p className={`text-[9px] font-bold uppercase tracking-wide ${status === tab.id ? "text-slate-300" : "text-slate-500"}`}>{tab.label}</p>
            <p className="text-base font-extrabold tabular-nums">{list.data?.counts[tab.id] ?? 0}</p>
          </button>
        ))}
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Simulated</p>
          <p className="text-base font-extrabold tabular-nums">{counts.simulated ?? 0}</p>
        </div>
      </div>

      <div className="card card-pad">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label>
            <span className="label">Search</span>
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID, description, location" />
          </label>
          <label>
            <span className="label">Status</span>
            <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUS_TABS.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
            </select>
          </label>
          <label>
            <span className="label">District</span>
            <select className="input" value={district} onChange={(event) => setDistrict(event.target.value)}>
              <option value="ALL">All districts</option>
              {DISTRICTS.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Category</span>
            <select className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="ALL">All categories</option>
              {INCIDENT_CATEGORIES.map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Severity</span>
            <select className="input" value={severity} onChange={(event) => setSeverity(event.target.value)}>
              <option value="ALL">All severities</option>
              {SEVERITIES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <Chip tone="blue">{filtered.length} shown</Chip>
          <span>Server-side permission checks apply to every action. Buttons below reflect your role but the API enforces it independently.</span>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base min-w-[900px]">
            <thead>
              <tr>
                <th>Incident</th>
                <th>Category</th>
                <th>District / location</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Reported</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td>
                    <p className="font-mono text-[10px] text-slate-500">{row.publicId}</p>
                    <p className="max-w-[220px] truncate text-[11px] text-slate-600">{row.description}</p>
                    <DataClassBadge dataClass={row.dataClass} />
                  </td>
                  <td className="text-xs">{CATEGORY_LABELS[row.category] ?? row.category}</td>
                  <td className="text-[11px]">
                    <p className="font-semibold">{row.districtName}</p>
                    <p className="text-slate-500">{row.locationName}</p>
                  </td>
                  <td><SeverityBadge severity={row.assessedSeverity ?? row.reportedSeverity} /></td>
                  <td><StatusBadge status={row.status} /></td>
                  <td className="text-[10px] text-slate-500">{relativeTime(row.createdAt)}</td>
                  <td><button className="btn-outline btn-sm" onClick={() => openIncident(row)}>Review</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && !list.loading ? <div className="p-4"><EmptyState title="No incidents match these filters" description="Adjust the filters or wait for new citizen reports." /></div> : null}
      </div>

      <Modal
        open={Boolean(openId)}
        onClose={() => setOpenId(null)}
        title={active ? `${active.publicId} · review` : "Loading incident…"}
        description="Official action panel — every action is attributed and audit logged."
        wide
      >
        {detail.loading && !active ? <div className="h-40 animate-pulse rounded-lg bg-slate-100" /> : null}
        {detail.error ? <Notice tone="danger">{detail.error}</Notice> : null}
        {active ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={active.status} />
              <SeverityBadge severity={active.assessedSeverity ?? active.reportedSeverity} />
              <Chip tone="blue">{CATEGORY_LABELS[active.category] ?? active.category}</Chip>
              <DataClassBadge dataClass={active.dataClass} />
              <span className="text-[10px] text-slate-500">
                reported {formatDateTime(active.createdAt)} · updated {formatDateTime(active.updatedAt)}
              </span>
            </div>

            <ol className="flex flex-wrap items-center gap-1">
              {["PENDING", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS", "RESOLVED"].map((stage) => {
                const reached = active.status === "RESOLVED" ? stage !== "REJECTED" : ["PENDING", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS"].indexOf(stage) <= ["PENDING", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS"].indexOf(active.status);
                return (
                  <li key={stage} className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${reached ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {INCIDENT_STATUS_LABELS[stage]}
                  </li>
                );
              })}
              {active.status === "REJECTED" ? <li className="rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Rejected</li> : null}
            </ol>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Citizen report</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-700">{active.description}</p>
                <p className="mt-2 text-[11px] text-slate-600"><strong>District:</strong> {active.districtName}</p>
                <p className="text-[11px] text-slate-600"><strong>Location:</strong> {active.locationName}</p>
                <p className="text-[11px] text-slate-600">
                  <strong>Coordinates:</strong>{" "}
                  {detail.data?.contactRedacted ? "Restricted for your role" : active.lat !== null ? `${active.lat}, ${active.lng}` : "Not provided"}
                </p>
                <p className="text-[11px] text-slate-600"><strong>Citizen-reported severity:</strong> {active.reportedSeverity}</p>
                {detail.data?.contactRedacted ? (
                  <p className="mt-2 rounded bg-amber-50 p-2 text-[10px] text-amber-900">
                    Citizen contact details and precise coordinates are hidden for your role. Administrators can access them when required for response.
                  </p>
                ) : (
                  <div className="mt-2 rounded-md bg-amber-50 p-2 text-[10px] text-amber-900">
                    <strong>Restricted personal data:</strong> {active.contactName ?? "No name"} · {active.contactPhone ?? "No phone"} — never publish.
                  </div>
                )}
                {active.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={active.photoUrl} alt={`Citizen photograph for ${active.publicId}`} className="mt-2 max-h-44 w-full rounded-md object-cover" />
                ) : null}
              </div>

              <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <SourceBadge source="MODEL_RISK_ESTIMATE" />
                  <Chip tone="purple">AI-ASSISTED</Chip>
                </div>
                <p className="mt-1 text-xs"><strong>Suggested category:</strong> {detail.data?.analysis.categoryLabel} ({detail.data?.analysis.categoryConfidence}%)</p>
                <p className="text-xs"><strong>Suggested severity:</strong> {detail.data?.analysis.severitySuggestion}</p>
                <p className="mt-1 text-[11px] text-slate-700">{detail.data?.analysis.summary}</p>
                {detail.data?.analysis.duplicate ? (
                  <p className="mt-1 rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-900">
                    Possible duplicate of {detail.data.analysis.duplicate.publicId} ({detail.data.analysis.duplicate.similarity}%, {detail.data.analysis.duplicate.status})
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] text-slate-500">{detail.data?.analysis.advisory}</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Official action panel</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Assessed severity">
                  <select className="input" value={severityDraft} onChange={(event) => setSeverityDraft(event.target.value)}>
                    {SEVERITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Official remarks / rejection reason / resolution details" hint="Required for reject and resolve.">
                    <textarea className="input min-h-[62px] text-xs" value={note} onChange={(event) => setNote(event.target.value)} />
                  </Field>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {WORKFLOW_ACTIONS.filter((action) => action.action !== "ASSIGN").map((action) => {
                  const allowed = capabilities[
                    action.action === "START_REVIEW"
                      ? "review"
                      : action.action === "VERIFY"
                        ? "verify"
                        : action.action === "REJECT"
                          ? "reject"
                          : action.action === "START_WORK"
                            ? "progress"
                            : action.action === "RESOLVE"
                              ? "resolve"
                              : "review"
                  ];
                  return (
                    <button
                      key={action.action}
                      className={action.action === "REJECT" ? "btn-sos btn-sm" : action.action === "VERIFY" ? "btn-primary btn-sm" : "btn-outline btn-sm"}
                      onClick={() => act(action.action)}
                      disabled={busy || !allowed}
                      title={allowed ? action.label : `Requires ${action.capability}`}
                    >
                      {action.label}
                    </button>
                  );
                })}
                <button className="btn-outline btn-sm" onClick={() => act("SET_SEVERITY")} disabled={busy || !capabilities.severity}>Set severity</button>
                <button className="btn-outline btn-sm" onClick={() => act("ADD_REMARK")} disabled={busy || !capabilities.remark}>Add remark</button>
                <button className="btn-ghost btn-sm" onClick={() => act("REOPEN")} disabled={busy || !capabilities.review}>Reopen</button>
              </div>
              {!capabilities.verify ? (
                <p className="mt-1 text-[10px] text-amber-700">
                  Your role ({detail.data?.actorRole}) can review and progress incidents but cannot verify, reject or assign. Those actions require an administrator.
                </p>
              ) : null}

              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Assign response team → sets status ASSIGNED</p>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[180px] flex-1">
                    <select className="input py-1.5 text-xs" value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={!capabilities.assign}>
                      <option value="">Select available team…</option>
                      {(detail.data?.teams ?? []).map((team) => (
                        <option key={team.id} value={team.id}>{team.name} · {team.baseDistrict} · {team.status}</option>
                      ))}
                    </select>
                  </label>
                  <input className="input max-w-[180px] py-1.5 text-xs" placeholder="Resources" value={resources} onChange={(event) => setResources(event.target.value)} disabled={!capabilities.assign} />
                  <button className="btn-dark btn-sm" onClick={assignTeam} disabled={busy || !teamId || !capabilities.assign}>Assign team</button>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">Team records in this prototype are SIMULATED. Assignment never contacts a real responder.</p>
              </div>

              {feedback ? <Notice tone="success">{feedback}</Notice> : null}
              {error ? <Notice tone="danger">{error}</Notice> : null}
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Incident history (immutable)</p>
              <ol className="space-y-2">
                {(detail.data?.events ?? []).map((event) => (
                  <li key={event.id} className="flex gap-2 text-[11px]">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                    <div>
                      <p className="font-semibold text-slate-800">
                        {event.action.replaceAll("_", " ")}
                        {event.fromStatus || event.toStatus ? (
                          <span className="text-slate-500"> · {event.fromStatus ?? "—"} → {event.toStatus ?? "—"}</span>
                        ) : null}
                      </p>
                      <p className="text-slate-500">{event.note}</p>
                      <p className="text-[10px] text-slate-400">
                        {formatDateTime(event.createdAt)} · {event.actorName ?? "System"} ({event.actorRole ?? "SYSTEM"})
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
