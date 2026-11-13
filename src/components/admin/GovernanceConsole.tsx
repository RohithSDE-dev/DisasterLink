"use client";

import { useState } from "react";
import { apiRequest, Tabs, useApi } from "../interactive";
import { Chip, EmptyState, Notice, SectionHeading, SourceBadge, formatDateTime } from "../ui";

type Audit = { id: number; actorName: string | null; actorRole: string | null; action: string; entityType: string; entityId: string | null; summary: string; details: unknown; createdAt: string };
type DataSource = { id: number; name: string; url: string; coverage: string; sourceClass: string; verificationStatus: string; refreshInterval: string | null; enabled: boolean; notes: string | null; lastUpdatedAt: string | null };
type User = { id: number; name: string; email: string; role: string; createdAt: string };

export default function GovernanceConsole() {
  const governance = useApi<{ audit: Audit[]; dataSources: DataSource[]; users: User[] }>("/api/governance");
  const demo = useApi<{ simulated: { incidents: number; sos: number }; demoRecords: { incidents: { publicId: string; status: string }[]; sos: { publicId: string; status: string }[] } }>("/api/demo");
  const [tab, setTab] = useState("audit");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleSource(source: DataSource) {
    const response = await apiRequest("/api/governance", { method: "PATCH", body: { id: source.id, enabled: !source.enabled } });
    if (!response.ok) setError(response.error ?? "Update failed");
    else {
      setFeedback(`Data source "${source.name}" ${source.enabled ? "disabled" : "enabled"}.`);
      governance.reload();
    }
  }

  async function demoAction(action: string) {
    setError(null);
    const response = await apiRequest(`/api/demo`, { method: "POST", body: { action } });
    if (!response.ok) setError(response.error ?? "Demo action failed");
    else {
      setFeedback(action === "create-demo-record" ? "Demo incident and SOS created (SIMULATED)." : "Demo records removed.");
      demo.reload();
      governance.reload();
    }
  }

  if (governance.loading && !governance.data) return <div className="h-[300px] animate-pulse rounded-xl bg-white" />;
  if (governance.error) {
    return (
      <div className="space-y-3">
        <SectionHeading eyebrow="Governance" title="Restricted area" />
        <Notice tone="warn" title="Super administrator access required">
          {governance.error}. Sign out and sign in with <strong>super@disasterlink.demo / Super@123</strong> to review the audit log, manage
          data sources and run simulation mode.
        </Notice>
      </div>
    );
  }

  const data = governance.data;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Governance & simulation"
        title="Audit trail, data sources and demonstration controls"
        description="Super administrator functions. Simulations never overwrite observed weather or official warning tables."
        action={<Chip tone="purple">SUPER ADMIN</Chip>}
      />

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Tabs
        tabs={[
          { id: "audit", label: "Audit log", count: data.audit.length },
          { id: "sources", label: "Data sources", count: data.dataSources.length },
          { id: "users", label: "Users & roles", count: data.users.length },
          { id: "simulation", label: "Simulation" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "audit" ? (
        <div className="card overflow-hidden">
          <div className="max-h-[600px] overflow-auto">
            <table className="table-base min-w-[860px]">
              <thead className="sticky top-0">
                <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Summary</th></tr>
              </thead>
              <tbody>
                {data.audit.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap text-[10px] text-slate-500">{formatDateTime(entry.createdAt)}</td>
                    <td className="text-[11px]">{entry.actorName ?? "System"}<div className="text-[10px] uppercase text-slate-400">{entry.actorRole ?? "SYSTEM"}</div></td>
                    <td className="text-[11px] font-semibold">{entry.action.replaceAll("_", " ")}</td>
                    <td className="text-[11px]">{entry.entityType}{entry.entityId ? ` · ${entry.entityId}` : ""}</td>
                    <td className="text-[11px] text-slate-600">{entry.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "sources" ? (
        <div className="space-y-2">
          <Notice tone="info" title="Source classification policy">
            OBSERVED and FORECAST data describe provider measurements/forecasts. MODEL_RISK_ESTIMATE is a heuristic. OFFICIAL_WARNING is
            reserved for ingested government bulletins — none are connected in this prototype. SIMULATED data exists only for demonstration.
          </Notice>
          {data.dataSources.map((source) => (
            <div key={source.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{source.name}</p>
                  <p className="text-[11px] text-slate-500">{source.coverage}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <SourceBadge source={source.sourceClass} />
                    <SourceBadge source={source.verificationStatus} />
                    <Chip tone={source.enabled ? "green" : "neutral"}>{source.enabled ? "ENABLED" : "DISABLED"}</Chip>
                    {source.refreshInterval ? <Chip tone="blue">{source.refreshInterval}</Chip> : null}
                  </div>
                </div>
                <button className="btn-outline btn-sm" onClick={() => toggleSource(source)}>{source.enabled ? "Disable" : "Enable"}</button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">{source.notes}</p>
              <a className="mt-1 inline-block text-[10px] font-semibold text-blue-700 underline" href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "users" ? (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th></tr></thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.id}>
                  <td className="text-xs font-semibold">{user.name}</td>
                  <td className="text-xs">{user.email}</td>
                  <td><Chip tone={user.role === "SUPER_ADMIN" ? "purple" : user.role === "ADMIN" ? "blue" : "neutral"}>{user.role}</Chip></td>
                  <td className="text-[10px] text-slate-500">{formatDateTime(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-200 p-3 text-[10px] text-slate-500">
            Role responsibilities: CITIZEN reports and tracks; ADMIN verifies incidents, manages facilities and assignments; SUPER_ADMIN manages
            administrators, data sources, simulation mode and audit access.
          </p>
        </div>
      ) : null}

      {tab === "simulation" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card card-pad">
            <h3 className="text-sm font-bold text-slate-900">Simulation controls</h3>
            <p className="mt-1 text-[11px] text-slate-600">
              Create SIMULATED records to demonstrate the workflow. Simulated records are badged everywhere and are never merged with observed
              weather or official warnings.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] uppercase text-slate-500">Simulated incidents</p><p className="text-lg font-extrabold">{demo.data?.simulated.incidents ?? "—"}</p></div>
              <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] uppercase text-slate-500">Simulated SOS</p><p className="text-lg font-extrabold">{demo.data?.simulated.sos ?? "—"}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button className="btn-primary btn-sm" onClick={() => demoAction("create-demo-record")}>Create demo incident + SOS</button>
              <button className="btn-outline btn-sm" onClick={() => demoAction("reset-demo-records")}>Remove DEMO- records</button>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">Removing demo records does not affect seeded simulated data or real citizen submissions.</p>
          </div>
          <div className="card card-pad">
            <h3 className="text-sm font-bold text-slate-900">Current DEMO- records</h3>
            {demo.data && (demo.data.demoRecords.incidents.length || demo.data.demoRecords.sos.length) ? (
              <ul className="mt-2 space-y-1 text-[11px]">
                {demo.data.demoRecords.incidents.map((row) => <li key={row.publicId} className="font-mono">{row.publicId} · {row.status}</li>)}
                {demo.data.demoRecords.sos.map((row) => <li key={row.publicId} className="font-mono">{row.publicId} · {row.status}</li>)}
              </ul>
            ) : (
              <div className="mt-2"><EmptyState title="No demo-run records" description="Use the simulation controls to create a demonstration record, or run the guided workflow from Demo Mode." /></div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
