"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest, useApi } from "../interactive";
import { Chip, DemoBadge, Notice, SectionHeading, StatusBadge } from "../ui";

type DemoStatus = {
  notice: string;
  simulated: { incidents: number; sos: number };
  live: { incidents: number; sos: number };
  demoRecords: { incidents: { publicId: string; status: string }[]; sos: { publicId: string; status: string }[] };
};
type DemoRecord = { id: number; publicId: string; status: string };
type Team = { id: number; name: string; status: string; baseDistrict: string };
type Assignment = { id: number; teamName: string; status: string; sosId: number | null; incidentId: number | null };

export default function DemoClient() {
  const status = useApi<DemoStatus>("/api/demo");
  const auth = useApi<{ user: { name: string; role: string } | null }>("/api/auth");
  const [incident, setIncident] = useState<DemoRecord | null>(null);
  const [sos, setSos] = useState<DemoRecord | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = auth.data?.user ? ["ADMIN", "SUPER_ADMIN"].includes(auth.data.user.role) : false;

  const push = useCallback((line: string) => setLog((current) => [`${new Date().toLocaleTimeString("en-IN")} · ${line}`, ...current].slice(0, 14)), []);

  useEffect(() => {
    if (status.data?.demoRecords.incidents[0]) {
      // keep the most recent demo records visible across reloads
      const existing = status.data.demoRecords.incidents[0];
      setIncident((current) => current ?? { id: -1, publicId: existing.publicId, status: existing.status });
    }
  }, [status.data]);

  async function loadTeam() {
    const response = await apiRequest<{ teams: Team[]; sos: { id: number; publicId: string; status: string }[] }>("/api/sos");
    if (!response.ok) return null;
    const available = (response.data?.teams ?? []).find((t) => t.status === "AVAILABLE" && t.baseDistrict === "TN-CBE") ?? (response.data?.teams ?? []).find((t) => t.status === "AVAILABLE");
    return available ?? null;
  }

  async function createRecords() {
    setBusy("create");
    setError(null);
    const response = await apiRequest<{ incident: DemoRecord; sos: DemoRecord }>("/api/demo", { method: "POST", body: { action: "create-demo-record" } });
    setBusy(null);
    if (!response.ok) {
      setError(response.error ?? "Could not create demo records");
      return;
    }
    setIncident(response.data!.incident);
    setSos(response.data!.sos);
    push(`Created ${response.data!.incident.publicId} (PENDING) and ${response.data!.sos.publicId} (SUBMITTED)`);
    status.reload();
  }

  async function verifyIncident() {
    if (!incident || incident.id < 0) return;
    setBusy("verify");
    const response = await apiRequest(`/api/incidents/${incident.id}`, {
      method: "PATCH",
      body: { action: "VERIFY", severity: "HIGH", note: "DEMO RUN: verified by duty officer after reviewing the simulated report." },
    });
    setBusy(null);
    if (!response.ok) {
      setError(response.error ?? "Verification failed");
      return;
    }
    setIncident((current) => (current ? { ...current, status: "VERIFIED" } : current));
    push(`Administrator VERIFIED ${incident.publicId} at severity HIGH`);
    status.reload();
  }

  async function reviewAndVerifySos() {
    if (!sos || sos.id < 0) return;
    setBusy("sos");
    const receive = await apiRequest(`/api/sos/${sos.id}`, { method: "PATCH", body: { action: "RECEIVE", note: "DEMO RUN: received by duty officer." } });
    if (!receive.ok) {
      setBusy(null);
      setError(receive.error ?? "Could not receive SOS");
      return;
    }
    const verify = await apiRequest(`/api/sos/${sos.id}`, { method: "PATCH", body: { action: "VERIFY", note: "DEMO RUN: request reviewed and verified. No team dispatched yet." } });
    setBusy(null);
    if (!verify.ok) {
      setError(verify.error ?? "Could not verify SOS");
      return;
    }
    setSos((current) => (current ? { ...current, status: "VERIFIED" } : current));
    push(`SOS ${sos.publicId} RECEIVED → VERIFIED by administrator`);
    status.reload();
  }

  async function assignTeam() {
    if (!sos || sos.id < 0) return;
    setBusy("assign");
    const available = team ?? (await loadTeam());
    if (!available) {
      setBusy(null);
      setError("No available demonstration team found. Login as an administrator and ensure a team is AVAILABLE.");
      return;
    }
    const response = await apiRequest(`/api/sos/${sos.id}`, {
      method: "PATCH",
      body: { action: "ASSIGN", teamId: available.id, resourcesAllocated: "Rescue boat, first-aid kit (SIMULATED)", note: "DEMO RUN: response team assigned by authorised administrator." },
    });
    setBusy(null);
    if (!response.ok) {
      setError(response.error ?? "Could not assign team");
      return;
    }
    setTeam(available);
    setSos((current) => (current ? { ...current, status: "TEAM_ASSIGNED" } : current));
    push(`Team "${available.name}" assigned to ${sos.publicId}`);
  }

  async function advanceAssignment() {
    setBusy("advance");
    const board = await apiRequest<{ assignments: Assignment[] }>("/api/response");
    if (!board.ok) {
      setBusy(null);
      setError(board.error ?? "Could not load assignments");
      return;
    }
    const target = board.data!.assignments.find((a) => a.sosId !== null) ?? board.data!.assignments[0];
    if (!target) {
      setBusy(null);
      setError("No assignment on record yet. Assign a team first.");
      return;
    }
    const nextStatus = target.status === "ASSIGNED" ? "EN_ROUTE" : target.status === "EN_ROUTE" ? "ON_SITE" : "COMPLETED";
    const response = await apiRequest("/api/response", { method: "PATCH", body: { kind: "ASSIGNMENT", id: target.id, status: nextStatus } });
    setBusy(null);
    if (!response.ok) {
      setError(response.error ?? "Could not update assignment");
      return;
    }
    setAssignment({ ...target, status: nextStatus });
    push(`Assignment #${target.id} status advanced to ${nextStatus}`);
  }

  async function resetDemo() {
    setBusy("reset");
    const response = await apiRequest<{ removed: { incidents: number; sos: number } }>("/api/demo", { method: "POST", body: { action: "reset-demo-records" } });
    setBusy(null);
    if (!response.ok) {
      setError(response.error ?? "Could not reset demo records");
      return;
    }
    setIncident(null);
    setSos(null);
    setAssignment(null);
    setTeam(null);
    push(`Removed ${response.data!.removed.incidents} demo incident(s) and ${response.data!.removed.sos} demo SOS record(s)`);
    status.reload();
  }

  const steps: { label: string; done: boolean; detail: string; action?: () => void; actionLabel?: string; disabled?: boolean; href?: string }[] = [
    { label: "Select Coimbatore", done: true, detail: "District context TN-CBE is preselected across the platform.", href: "/districts/TN-CBE" },
    { label: "View district weather and risk", done: true, detail: "Open the Coimbatore intelligence page for live provider weather and the heuristic risk explanation.", href: "/districts/TN-CBE" },
    { label: "Create a simulated waterlogging report", done: Boolean(incident), detail: "Equivalent to a citizen submission — stored as PENDING, badged SIMULATED.", action: createRecords, actionLabel: "Create demo report + SOS", disabled: !isAdmin || busy === "create" },
    { label: "Incident ID generated", done: Boolean(incident), detail: incident ? `ID ${incident.publicId} · status ${incident.status}` : "No demo record created yet." },
    { label: "Command Centre sees the incoming report", done: Boolean(incident), detail: "Open the incident management console to inspect the queue.", href: "/admin/incidents" },
    { label: "Administrator reviews and verifies", done: incident?.status === "VERIFIED", detail: "Verification records an audit entry and a status history event.", action: verifyIncident, actionLabel: "Verify incident (admin)", disabled: !incident || incident.id < 0 || busy === "verify" },
    { label: "District intelligence reflects the change", done: incident?.status === "VERIFIED", detail: "The district page and risk heuristic read the same records.", href: "/districts/TN-CBE" },
    { label: "Citizen submits an SOS", done: Boolean(sos), detail: sos ? `SOS ${sos.publicId} · status ${sos.status}` : "Creates a second SIMULATED record for the SOS workflow.", action: createRecords, actionLabel: "Create demo SOS", disabled: !isAdmin || busy === "create" },
    { label: "Administrator reviews the SOS", done: ["VERIFIED", "TEAM_ASSIGNED", "RESOLVED"].includes(sos?.status ?? ""), detail: "No automatic dispatch happens at any stage.", action: reviewAndVerifySos, actionLabel: "Receive + verify SOS (admin)", disabled: !sos || sos.id < 0 || busy === "sos" },
    { label: "Authorised administrator assigns a response team", done: ["TEAM_ASSIGNED", "RESOLVED"].includes(sos?.status ?? ""), detail: team ? `Team: ${team.name}` : "Team assignment is written to the assignment ledger and audit log.", action: assignTeam, actionLabel: "Assign team (admin)", disabled: !sos || sos.id < 0 || busy === "assign" },
    { label: "Assignment status updated", done: Boolean(assignment), detail: assignment ? `Assignment #${assignment.id} → ${assignment.status}` : "Advance the latest assignment status to demonstrate live tracking.", action: advanceAssignment, actionLabel: "Advance assignment", disabled: !isAdmin || busy === "advance" },
    { label: "History remains available", done: true, detail: "Tracking views retain the full event timeline.", href: sos ? `/track?id=${sos.publicId}&type=SOS` : "/track" },
  ];

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Demonstration mode"
        title="Guided judge workflow"
        description="Runs the full disaster workflow end-to-end using clearly badged SIMULATED records. Real weather data is never overwritten or mixed with simulated observations."
        action={<DemoBadge label="DEMO MODE" />}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card card-pad">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Simulated incidents</p>
          <p className="text-xl font-extrabold text-slate-900">{status.data?.simulated.incidents ?? "—"}</p>
          <p className="text-[10px] text-slate-500">Seeded + demo-run records</p>
        </div>
        <div className="card card-pad">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Simulated SOS</p>
          <p className="text-xl font-extrabold text-slate-900">{status.data?.simulated.sos ?? "—"}</p>
          <p className="text-[10px] text-slate-500">Never auto-dispatched</p>
        </div>
        <div className="card card-pad">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Community submissions</p>
          <p className="text-xl font-extrabold text-slate-900">{(status.data?.live.incidents ?? 0) + (status.data?.live.sos ?? 0)}</p>
          <p className="text-[10px] text-slate-500">Citizen-entered, PENDING review</p>
        </div>
      </div>

      {!isAdmin ? (
        <Notice tone="warn" title="Administrator session required for demo actions">
          The workflow steps that verify reports or assign teams require an authorised administrator. Sign in with{" "}
          <strong>admin@disasterlink.demo / Admin@123</strong> (or the super admin account) to run the full sequence.{" "}
          <Link className="font-semibold underline" href="/login?next=/demo">Open demo login →</Link>
        </Notice>
      ) : (
        <Notice tone="success" title="Administrator session active">
          Signed in as {auth.data?.user?.name}. All administrative actions are audit-logged.
        </Notice>
      )}

      {error ? <Notice tone="danger" title="Demo action failed">{error}</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <ol className="space-y-2">
          {steps.map((step, index) => (
            <li key={`${step.label}-${index}`} className={`card flex flex-wrap items-start gap-3 p-3 ${step.done ? "border-emerald-200 bg-emerald-50/40" : ""}`}>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${step.done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                {step.done ? "✓" : index + 1}
              </span>
              <div className="min-w-[180px] flex-1">
                <p className="text-sm font-bold text-slate-900">{step.label}</p>
                <p className="text-[11px] leading-snug text-slate-600">{step.detail}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {step.href ? <Link href={step.href} className="btn-outline btn-sm">Open</Link> : null}
                {step.action ? (
                  <button className="btn-dark btn-sm" onClick={step.action} disabled={step.disabled}>
                    {busy && step.disabled ? "Working…" : step.actionLabel}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="space-y-3">
          <div className="card card-pad">
            <h3 className="text-sm font-bold text-slate-900">Run log</h3>
            {log.length ? (
              <ul className="mt-2 space-y-1">
                {log.map((line, index) => (
                  <li key={`${line}-${index}`} className="rounded bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-600">{line}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500">Actions you take appear here with timestamps.</p>
            )}
          </div>

          <div className="card card-pad">
            <h3 className="text-sm font-bold text-slate-900">Demo controls</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Link href="/sos" className="btn-sos btn-sm">Open citizen SOS form</Link>
              <Link href="/report" className="btn-outline btn-sm">Open incident form</Link>
              <button className="btn-outline btn-sm" onClick={resetDemo} disabled={!isAdmin || busy === "reset"}>Reset demo records</button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              Reset removes only records with a DEMO- identifier. Seeded SIMULATED records remain so the dashboard stays demonstrable.
            </p>
          </div>

          <div className="card card-pad">
            <h3 className="text-sm font-bold text-slate-900">Safety statements</h3>
            <ul className="mt-1 space-y-1.5 text-[11px] leading-relaxed text-slate-600">
              <li>• SOS submissions never guarantee dispatch.</li>
              <li>• AI suggestions never verify incidents or issue alerts.</li>
              <li>• Risk values are MODEL_RISK_ESTIMATE, not official flood zones.</li>
              <li>• Official IMD/TNSDMA warnings are not ingested in this prototype.</li>
              <li>• Facilities are candidates; availability is never confirmed automatically.</li>
            </ul>
            <div className="mt-2 flex flex-wrap gap-1">
              <StatusBadge status="PENDING" /> <StatusBadge status="VERIFIED" /> <StatusBadge status="TEAM_ASSIGNED" />
            </div>
            <Chip tone="dark" className="mt-2">SIMULATED records are always badged</Chip>
          </div>
        </div>
      </div>
    </div>
  );
}
