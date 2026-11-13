"use client";

import { useState } from "react";
import { useApi } from "../interactive";
import { Chip, EmptyState, Notice, SectionHeading, Stat, formatDateTime } from "../ui";

type AuditDetails = {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string | null;
  assignment?: { id: number; teamName: string } | null;
  [key: string]: unknown;
};

function detailRows(details: unknown): { label: string; value: string }[] {
  if (!details || typeof details !== "object") return [];
  const parsed = details as AuditDetails;
  const rows: { label: string; value: string }[] = [];
  if (parsed.before || parsed.after) {
    const keys = new Set([...Object.keys(parsed.before ?? {}), ...Object.keys(parsed.after ?? {})]);
    for (const key of keys) {
      const before = parsed.before?.[key];
      const after = parsed.after?.[key];
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      rows.push({ label: key, value: `${before === undefined || before === null ? "—" : String(before)} → ${after === undefined || after === null ? "—" : String(after)}` });
    }
  }
  if (parsed.assignment) rows.push({ label: "assignment", value: `#${parsed.assignment.id} · ${parsed.assignment.teamName}` });
  if (parsed.note) rows.push({ label: "note", value: String(parsed.note) });
  return rows;
}

type AuditRow = {
  id: number;
  actorId: number | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  details: unknown;
  createdAt: string;
};

export default function AuditConsole() {
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("ALL");
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data, loading, error, reload } = useApi<{ audit: AuditRow[]; counts: Record<string, number>; disclosure: string }>("/api/audit", [action, entity]);

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Governance"
        title="Administrative audit log"
        description="Append-only record of administrative changes: incident verification, SOS assignment, facility updates, alert publication and account changes."
        action={<button className="btn-outline btn-sm" onClick={reload}>Refresh</button>}
      />

      <Notice tone="info" title="Retention and access">
        {data?.disclosure ?? "Audit entries are append-only."} Records include the acting account, role, affected record and — where the action
        changed a field — the previous and new values. No API endpoint updates or deletes audit rows. Full governance tools (data sources, simulation mode) are restricted to the super
        administrator.
      </Notice>

      {error ? <Notice tone="danger" title="Audit log unavailable">{error}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Total", data?.counts.total ?? 0],
          ["Incidents", data?.counts.incidents ?? 0],
          ["SOS", data?.counts.sos ?? 0],
          ["Facilities", data?.counts.facilities ?? 0],
          ["Alerts", data?.counts.alerts ?? 0],
          ["Accounts", data?.counts.users ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="text-lg font-extrabold tabular-nums text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="card card-pad">
        <div className="grid gap-2 sm:grid-cols-3">
          <label>
            <span className="label">Action contains</span>
            <input className="input" value={action} onChange={(event) => setAction(event.target.value)} placeholder="VERIFY, ASSIGN, FACILITY…" />
          </label>
          <label>
            <span className="label">Entity</span>
            <select className="input" value={entity} onChange={(event) => setEntity(event.target.value)}>
              {["ALL", "INCIDENT", "SOS", "FACILITY", "ALERT", "TEAM", "RESOURCE", "ASSIGNMENT", "USER", "SYSTEM", "DATA_SOURCE"].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Stat label="Showing" value={data?.audit.length ?? "—"} hint="most recent first" />
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="max-h-[560px] overflow-auto">
          <table className="table-base min-w-[860px]">
            <thead className="sticky top-0">
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Summary</th></tr>
            </thead>
            <tbody>
              {loading && !data ? <tr><td colSpan={5} className="p-4 text-xs text-slate-500">Loading audit entries…</td></tr> : null}
              {(data?.audit ?? []).map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap text-[10px] text-slate-500">{formatDateTime(entry.createdAt)}</td>
                  <td className="text-[11px]">
                    {entry.actorName ?? "System"}
                    <div className="text-[10px] uppercase text-slate-400">{entry.actorRole ?? "SYSTEM"}</div>
                  </td>
                  <td><Chip tone={entry.action.includes("VERIFY") ? "green" : entry.action.includes("REJECT") ? "red" : entry.action.includes("ALERT") ? "orange" : "blue"}>{entry.action.replaceAll("_", " ")}</Chip></td>
                  <td className="text-[11px]">{entry.entityType}{entry.entityId ? ` · ${entry.entityId}` : ""}</td>
                  <td className="text-[11px] text-slate-600">
                    {entry.summary}
                    {(() => {
                      const rows = detailRows(entry.details);
                      if (!rows.length) return null;
                      return (
                        <div className="mt-0.5">
                          <button className="text-[9px] font-semibold text-blue-700 underline" onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                            {expanded === entry.id ? "Hide change detail" : "Show change detail"}
                          </button>
                          {expanded === entry.id ? (
                            <ul className="mt-1 space-y-0.5 rounded bg-slate-50 p-1.5 text-[10px]">
                              {rows.map((row) => (
                                <li key={row.label}><span className="text-slate-500">{row.label}:</span> <span className="font-medium text-slate-800">{row.value}</span></li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && !data.audit.length ? <div className="p-4"><EmptyState title="No matching audit entries" description="Adjust the filters or perform an administrative action to generate entries." /></div> : null}
      </div>
    </div>
  );
}
