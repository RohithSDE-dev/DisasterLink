"use client";

import { useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { ASSIGNMENT_STATUSES, RESOURCE_CATEGORIES, TEAM_STATUSES, TEAM_TYPES } from "@/lib/constants";
import { apiRequest, Tabs, useApi } from "../interactive";
import { Chip, DataClassBadge, EmptyState, Field, Notice, SectionHeading, StatusBadge, formatDateTime } from "../ui";

type Team = { id: number; name: string; type: string; baseDistrict: string; contact: string | null; memberCount: number; status: string; notes: string | null; dataClass: string };
type Resource = { id: number; name: string; category: string; quantity: number; unit: string; districtCode: string; status: string; dataClass: string };
type Assignment = { id: number; teamName: string; incidentId: number | null; sosId: number | null; resourcesAllocated: string | null; status: string; notes: string | null; assignedByName: string | null; createdAt: string; dataClass: string };
type Incident = { id: number; publicId: string; districtCode: string; status: string; category: string; locationName: string };

export default function ResponseConsole() {
  const board = useApi<{ teams: Team[]; resources: Resource[]; assignments: Assignment[]; incidents: Incident[] }>("/api/response");
  const [tab, setTab] = useState("teams");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teamForm, setTeamForm] = useState({ name: "", type: "FIRE_RESCUE", baseDistrict: "TN-CBE", contact: "", memberCount: "8" });
  const [resourceForm, setResourceForm] = useState({ name: "", category: "BOATS", quantity: "1", unit: "units", districtCode: "TN-CBE" });
  const [assignForm, setAssignForm] = useState({ incidentId: "", teamId: "", resourcesAllocated: "", notes: "" });

  async function patch(kind: string, id: number, body: Record<string, unknown>) {
    setError(null);
    const response = await apiRequest("/api/response", { method: "PATCH", body: { kind, id, ...body } });
    if (!response.ok) setError(response.error ?? "Update failed");
    else {
      setFeedback("Record updated and audit logged.");
      board.reload();
    }
  }

  async function createTeam() {
    const response = await apiRequest("/api/response", {
      method: "POST",
      body: { kind: "TEAM", ...teamForm, memberCount: Number(teamForm.memberCount) },
    });
    if (!response.ok) setError(response.error ?? "Could not create team");
    else {
      setFeedback("Team created (SIMULATED record class).");
      setTeamForm({ name: "", type: "FIRE_RESCUE", baseDistrict: "TN-CBE", contact: "", memberCount: "8" });
      board.reload();
    }
  }

  async function createResource() {
    const response = await apiRequest("/api/response", {
      method: "POST",
      body: { kind: "RESOURCE", ...resourceForm, quantity: Number(resourceForm.quantity) },
    });
    if (!response.ok) setError(response.error ?? "Could not create resource");
    else {
      setFeedback("Resource added (SIMULATED record class).");
      setResourceForm({ name: "", category: "BOATS", quantity: "1", unit: "units", districtCode: "TN-CBE" });
      board.reload();
    }
  }

  async function assignIncident() {
    const response = await apiRequest("/api/response", {
      method: "PUT",
      body: { teamId: Number(assignForm.teamId), incidentId: Number(assignForm.incidentId), resourcesAllocated: assignForm.resourcesAllocated, notes: assignForm.notes },
    });
    if (!response.ok) setError(response.error ?? "Assignment failed");
    else {
      setFeedback("Response team assigned to incident. Audit entry written.");
      setAssignForm({ incidentId: "", teamId: "", resourcesAllocated: "", notes: "" });
      board.reload();
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Resource coordination"
        title="Response teams, resources and assignments"
        description="Team assignments require an authorised administrator. Every team, resource and assignment in this dataset is a SIMULATED demonstration record."
        action={<Chip tone="dark">SIMULATED DATA</Chip>}
      />

      <Tabs
        tabs={[
          { id: "teams", label: "Teams", count: board.data?.teams.length },
          { id: "resources", label: "Resources", count: board.data?.resources.length },
          { id: "assignments", label: "Assignments", count: board.data?.assignments.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {tab === "teams" ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-2 sm:grid-cols-2">
            {(board.data?.teams ?? []).map((team) => (
              <div key={team.id} className="card card-pad">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={team.status} />
                  <Chip tone="blue">{team.type.replaceAll("_", " ")}</Chip>
                  <DataClassBadge dataClass={team.dataClass} />
                </div>
                <p className="mt-1 text-sm font-bold text-slate-900">{team.name}</p>
                <p className="text-[11px] text-slate-500">{DISTRICTS.find((d) => d.code === team.baseDistrict)?.name ?? team.baseDistrict} · {team.memberCount} members</p>
                <p className="text-[10px] text-slate-400">{team.contact ?? "No contact recorded"}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {TEAM_STATUSES.map((status) => (
                    <button
                      key={status}
                      onClick={() => patch("TEAM", team.id, { status })}
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${team.status === status ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}
                    >
                      {status.replaceAll("_", " ")}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-slate-500">{team.notes}</p>
              </div>
            ))}
            {!board.data?.teams.length ? <EmptyState title="No teams recorded" description="Create a demonstration team to exercise the assignment workflow." /> : null}
          </div>
          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-bold text-slate-900">Add response team</h3>
            <div className="space-y-2">
              <Field label="Team name" required><input className="input" value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Type">
                  <select className="input" value={teamForm.type} onChange={(e) => setTeamForm({ ...teamForm, type: e.target.value })}>
                    {TEAM_TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
                  </select>
                </Field>
                <Field label="Members"><input className="input" type="number" value={teamForm.memberCount} onChange={(e) => setTeamForm({ ...teamForm, memberCount: e.target.value })} /></Field>
              </div>
              <Field label="Base district">
                <select className="input" value={teamForm.baseDistrict} onChange={(e) => setTeamForm({ ...teamForm, baseDistrict: e.target.value })}>
                  {DISTRICTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Control contact (optional)"><input className="input" value={teamForm.contact} onChange={(e) => setTeamForm({ ...teamForm, contact: e.target.value })} /></Field>
              <button className="btn-primary btn-sm" onClick={createTeam} disabled={!teamForm.name}>Create team</button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "resources" ? (
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead>
                <tr><th>Resource</th><th>Category</th><th>District</th><th className="text-right">Qty</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {(board.data?.resources ?? []).map((resource) => (
                  <tr key={resource.id}>
                    <td className="text-xs font-semibold">{resource.name}<div className="mt-0.5"><DataClassBadge dataClass={resource.dataClass} /></div></td>
                    <td className="text-xs">{resource.category.replaceAll("_", " ")}</td>
                    <td className="text-xs">{DISTRICTS.find((d) => d.code === resource.districtCode)?.name ?? resource.districtCode}</td>
                    <td className="text-right text-xs tabular-nums">{resource.quantity} {resource.unit}</td>
                    <td>
                      <select
                        className="rounded border border-slate-300 px-1 py-0.5 text-[10px]"
                        value={resource.status}
                        onChange={(e) => patch("RESOURCE", resource.id, { status: e.target.value })}
                      >
                        {["AVAILABLE", "DEPLOYED", "MAINTENANCE"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <button className="btn-ghost btn-sm" onClick={() => patch("RESOURCE", resource.id, { quantity: Math.max(0, resource.quantity - 1) })}>−1</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-bold text-slate-900">Add resource</h3>
            <div className="space-y-2">
              <Field label="Resource name" required><input className="input" value={resourceForm.name} onChange={(e) => setResourceForm({ ...resourceForm, name: e.target.value })} /></Field>
              <Field label="Category">
                <select className="input" value={resourceForm.category} onChange={(e) => setResourceForm({ ...resourceForm, category: e.target.value })}>
                  {RESOURCE_CATEGORIES.map((c) => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Quantity"><input className="input" type="number" value={resourceForm.quantity} onChange={(e) => setResourceForm({ ...resourceForm, quantity: e.target.value })} /></Field>
                <Field label="Unit"><input className="input" value={resourceForm.unit} onChange={(e) => setResourceForm({ ...resourceForm, unit: e.target.value })} /></Field>
              </div>
              <Field label="District">
                <select className="input" value={resourceForm.districtCode} onChange={(e) => setResourceForm({ ...resourceForm, districtCode: e.target.value })}>
                  {DISTRICTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
                </select>
              </Field>
              <button className="btn-primary btn-sm" onClick={createResource} disabled={!resourceForm.name}>Add resource</button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "assignments" ? (
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead>
                <tr><th>#</th><th>Team</th><th>Linked record</th><th>Resources</th><th>Status</th><th>Created</th></tr>
              </thead>
              <tbody>
                {(board.data?.assignments ?? []).map((assignment) => (
                  <tr key={assignment.id}>
                    <td className="text-xs">{assignment.id}</td>
                    <td className="text-xs font-semibold">{assignment.teamName}<div className="mt-0.5"><DataClassBadge dataClass={assignment.dataClass} /></div></td>
                    <td className="text-[11px]">{assignment.sosId ? `SOS #${assignment.sosId}` : assignment.incidentId ? `Incident #${assignment.incidentId}` : "Unlinked"}</td>
                    <td className="text-[11px]">{assignment.resourcesAllocated ?? "—"}</td>
                    <td>
                      <select
                        className="rounded border border-slate-300 px-1 py-0.5 text-[10px]"
                        value={assignment.status}
                        onChange={(e) => patch("ASSIGNMENT", assignment.id, { status: e.target.value })}
                      >
                        {ASSIGNMENT_STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
                      </select>
                    </td>
                    <td className="text-[10px] text-slate-500">{formatDateTime(assignment.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!board.data?.assignments.length ? <div className="p-4"><EmptyState title="No assignments yet" description="Assign a team to an incident or SOS to populate the ledger." /></div> : null}
          </div>
          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-bold text-slate-900">Assign team to incident</h3>
            <div className="space-y-2">
              <Field label="Incident" required>
                <select className="input" value={assignForm.incidentId} onChange={(e) => setAssignForm({ ...assignForm, incidentId: e.target.value })}>
                  <option value="">Select incident…</option>
                  {(board.data?.incidents ?? []).filter((i) => i.status !== "REJECTED").map((incident) => (
                    <option key={incident.id} value={incident.id}>{incident.publicId} · {incident.locationName} · {incident.status}</option>
                  ))}
                </select>
              </Field>
              <Field label="Team" required>
                <select className="input" value={assignForm.teamId} onChange={(e) => setAssignForm({ ...assignForm, teamId: e.target.value })}>
                  <option value="">Select team…</option>
                  {(board.data?.teams ?? []).map((team) => <option key={team.id} value={team.id}>{team.name} · {team.status}</option>)}
                </select>
              </Field>
              <Field label="Resources allocated"><input className="input" value={assignForm.resourcesAllocated} onChange={(e) => setAssignForm({ ...assignForm, resourcesAllocated: e.target.value })} /></Field>
              <Field label="Notes"><input className="input" value={assignForm.notes} onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })} /></Field>
              <button className="btn-dark btn-sm" onClick={assignIncident} disabled={!assignForm.incidentId || !assignForm.teamId}>Create assignment</button>
              <p className="text-[10px] text-slate-500">Assignment does not verify the incident. This prototype never contacts a real responder.</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
