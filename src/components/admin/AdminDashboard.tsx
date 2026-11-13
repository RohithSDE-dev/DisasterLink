"use client";

import Link from "next/link";
import { useState } from "react";
import { CATEGORY_LABELS } from "@/lib/constants";
import { apiRequest, useApi } from "../interactive";
import { CategoryBars, DistrictBars, SeverityDonut, TrendLines } from "../charts";
import { Chip, DataClassBadge, Notice, SectionHeading, SeverityBadge, SourceBadge, StatusBadge, formatDateTime, relativeTime } from "../ui";
import CommandMetrics from "./CommandMetrics";

type Command = {
  totals: Record<string, number>;
  recentIncidents: {
    id: number;
    publicId: string;
    category: string;
    districtCode: string;
    locationName: string;
    status: string;
    reportedSeverity: string;
    assessedSeverity: string | null;
    dataClass: string;
    createdAt: string;
  }[];
  recentSos: { id: number; publicId: string; districtCode: string; status: string; priority: string; dataClass: string; createdAt: string; emergencyType: string }[];
  recentAudit: { id: number; actorName: string | null; action: string; summary: string; createdAt: string; actorRole: string | null }[];
  activeAlerts: { id: number; title: string; severity: string; districtCode: string | null; sourceClass: string; category: string; expiresAt: string | null; isSimulated: boolean }[];
  actor: { role: string; name: string };
  board: {
    code: string;
    name: string;
    incidents: { total: number; pending: number; verified: number };
    openSos: number;
    risk: { level: string; score: number };
    weather: { available: boolean; temperature: number | null };
    facilities: number;
  }[];
};

type Analytics = {
  byCategory: { label: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
  byDistrict: { district: string; total: number; verified: number }[];
  weeks: { label: string; incidents: number; sos: number }[];
  byStatus: { status: string; count: number }[];
  riskLevels: { level: string; districts: number }[];
  resolution: { avgResolutionHours: number | null; avgVerificationHours: number | null };
};

export default function AdminDashboard() {
  const command = useApi<Command>("/api/command");
  const analytics = useApi<Analytics>("/api/analytics");
  const [sitrep, setSitrep] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = command.data?.totals ?? {};
  const board = command.data?.board ?? [];
  const hotspots = [...board].sort((a, b) => b.risk.score - a.risk.score).slice(0, 5);

  async function generateSitrep() {
    setBusy(true);
    setError(null);
    const response = await apiRequest<{ report: string }>("/api/ai", { method: "POST", body: { mode: "sitrep" } });
    setBusy(false);
    if (!response.ok) setError(response.error ?? "Could not generate situation report");
    else setSitrep(response.data?.report ?? null);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-ink-900 p-4 text-white sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-red-300">Emergency operations · Tamil Nadu</p>
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">State disaster management overview</h1>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-300">
              All metrics count DisasterLink records. Simulated demonstration records are included and badged. Weather is provider data;
              official warnings are not ingested in this prototype.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={generateSitrep} className="btn bg-white text-ink-900 hover:bg-slate-100 btn-sm" disabled={busy}>
              {busy ? "Drafting…" : "AI situation report"}
            </button>
            <Link href="/admin/map" className="btn bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20 btn-sm">Live 3D map</Link>
            <Link href="/admin/alerts" className="btn bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20 btn-sm">Publish alert</Link>
            <Link href="/admin/incidents" className="btn bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20 btn-sm">Review queue</Link>
            <Link href="/admin/sos" className="btn-sos btn-sm">SOS control</Link>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {[
            { label: "Total reports", value: totals.total },
            { label: "Pending review", value: totals.pending },
            { label: "Verified", value: totals.verified },
            { label: "Active SOS", value: totals.openSos },
            { label: "Resolved", value: totals.resolved },
            { label: "Facilities", value: totals.facilities },
            { label: "Teams available", value: totals.teamsAvailable },
            { label: "Official shelters", value: totals.officialShelters },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
              <p className="text-lg font-extrabold tabular-nums">{item.value ?? "—"}</p>
            </div>
          ))}
        </div>
      </div>

      {error ? <Notice tone="danger" title="AI report failed">{error}</Notice> : null}
      {sitrep ? (
        <div className="card card-pad">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <SectionHeading eyebrow="AI-assisted" title="Situation report draft" description="Generated from current DisasterLink records for administrator review." />
            <button className="btn-outline btn-sm" onClick={() => setSitrep(null)}>Close</button>
          </div>
          <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-200">{sitrep}</pre>
          <p className="mt-2 text-[10px] text-slate-500">This draft is not an official bulletin and never verifies incidents or dispatches teams.</p>
        </div>
      ) : null}

      <div className="card card-pad">
        <CommandMetrics totals={totals} lastUpdated={command.data ? new Date().toISOString() : null} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Reported", value: totals.awaitingVerification ?? 0, hint: "awaiting verification" },
          { label: "Verified", value: totals.verified ?? 0, hint: "published to citizens" },
          { label: "Assigned", value: totals.assigned ?? 0, hint: "team assigned" },
          { label: "In progress", value: totals.inProgress ?? 0, hint: "response underway" },
        ].map((stage) => (
          <div key={stage.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{stage.label}</p>
            <p className="text-xl font-extrabold tabular-nums text-slate-900">{stage.value}</p>
            <p className="text-[10px] text-slate-400">{stage.hint}</p>
          </div>
        ))}
        <div className="sm:col-span-2 lg:col-span-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Incident workflow</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {["REPORTED", "UNDER REVIEW", "VERIFIED", "ASSIGNED", "IN PROGRESS", "RESOLVED"].map((stage, index, list) => (
              <span key={stage} className="inline-flex items-center gap-1">
                <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{stage}</span>
                {index < list.length - 1 ? <span className="text-slate-400">→</span> : null}
              </span>
            ))}
            <span className="ml-2 rounded-md bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">REJECTED (terminal)</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="card card-pad">
          <SectionHeading eyebrow="Incident categories" title="Distribution of reported incidents" description="Counts include SIMULATED demonstration records." />
          <CategoryBars data={analytics.data?.byCategory ?? []} />
        </div>
        <div className="card card-pad">
          <SectionHeading eyebrow="Severity" title="Assessed severity distribution" />
          <SeverityDonut data={analytics.data?.bySeverity ?? []} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card card-pad">
          <SectionHeading eyebrow="Trend" title="Weekly incident and SOS load" description="Last 8 weeks of records stored in DisasterLink." />
          <TrendLines data={analytics.data?.weeks ?? []} />
        </div>
        <div className="card card-pad">
          <SectionHeading eyebrow="Geography" title="District report distribution" />
          <DistrictBars data={analytics.data?.byDistrict ?? []} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="card card-pad">
          <SectionHeading
            eyebrow="Priority queue"
            title="Recent incoming reports"
            action={<Link href="/admin/incidents" className="btn-outline btn-sm">Open incident console</Link>}
          />
          <div className="overflow-x-auto">
            <table className="table-base min-w-[540px]">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>District</th>
                  <th>Status</th>
                  <th>Severity</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {(command.data?.recentIncidents ?? []).map((incident) => (
                  <tr key={incident.id}>
                    <td>
                      <p className="font-mono text-[10px] text-slate-500">{incident.publicId}</p>
                      <p className="text-xs font-semibold">{CATEGORY_LABELS[incident.category] ?? incident.category} · {incident.locationName}</p>
                      <DataClassBadge dataClass={incident.dataClass} />
                    </td>
                    <td className="text-xs">{board.find((b) => b.code === incident.districtCode)?.name ?? incident.districtCode}</td>
                    <td><StatusBadge status={incident.status} /></td>
                    <td><SeverityBadge severity={incident.assessedSeverity ?? incident.reportedSeverity} /></td>
                    <td className="text-[10px] text-slate-500">{relativeTime(incident.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card card-pad">
            <SectionHeading eyebrow="Alerts" title="Active warning notices" action={<Link href="/admin/alerts" className="btn-outline btn-sm">Alert management</Link>} />
            {(command.data?.activeAlerts ?? []).length ? (
              <ul className="space-y-1.5">
                {(command.data?.activeAlerts ?? []).map((alert) => (
                  <li key={alert.id} className="rounded-lg border border-slate-200 px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <SourceBadge source={alert.sourceClass} />
                      <Chip tone={alert.severity === "CRITICAL" ? "red" : alert.severity === "HIGH" ? "orange" : "amber"}>{alert.severity}</Chip>
                      {alert.isSimulated ? <DataClassBadge dataClass="SIMULATED" /> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-800">{alert.title}</p>
                    <p className="text-[10px] text-slate-500">expires {formatDateTime(alert.expiresAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-500">No active alert. This does not mean conditions are safe.</p>
            )}
          </div>

          <div className="card card-pad">
            <SectionHeading eyebrow="SOS" title="Incoming requests" action={<Link href="/admin/sos" className="btn-outline btn-sm">SOS panel</Link>} />
            <ul className="space-y-2">
              {(command.data?.recentSos ?? []).map((sos) => (
                <li key={sos.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={sos.status} />
                    <Chip tone={sos.priority === "CRITICAL" ? "red" : sos.priority === "HIGH" ? "orange" : "neutral"}>{sos.priority}</Chip>
                    <DataClassBadge dataClass={sos.dataClass} />
                    <span className="ml-auto text-[10px] text-slate-400">{relativeTime(sos.createdAt)}</span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-slate-500">{sos.publicId}</p>
                  <p className="text-xs font-semibold text-slate-700">{sos.emergencyType.replaceAll("_", " ")} · {board.find((b) => b.code === sos.districtCode)?.name ?? sos.districtCode}</p>
                </li>
              ))}
              {!command.data?.recentSos.length ? <p className="text-xs text-slate-500">No SOS requests recorded.</p> : null}
            </ul>
          </div>

          <div className="card card-pad">
            <SectionHeading eyebrow="Model risk" title="Highest risk districts" action={<SourceBadge source="MODEL_RISK_ESTIMATE" />} />
            <ul className="space-y-1.5">
              {hotspots.map((district) => (
                <li key={district.code} className="flex items-center justify-between gap-2 text-xs">
                  <Link href={`/districts/${district.code}`} className="font-semibold text-slate-700 hover:text-blue-700">{district.name}</Link>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-slate-500">{district.risk.score}</span>
                    <Chip tone={district.risk.level === "VERY_HIGH" ? "red" : district.risk.level === "HIGH" ? "orange" : district.risk.level === "MODERATE" ? "amber" : "green"}>
                      {district.risk.level.replace("_", " ")}
                    </Chip>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-slate-500">Heuristic estimate, not an official flood-prone-zone designation.</p>
          </div>

          <div className="card card-pad">
            <SectionHeading eyebrow="Audit" title="Recent administrative activity" action={<Link href="/admin/governance" className="btn-outline btn-sm">Audit log</Link>} />
            <ul className="space-y-1.5">
              {(command.data?.recentAudit ?? []).slice(0, 6).map((entry) => (
                <li key={entry.id} className="text-[11px]">
                  <p className="font-semibold text-slate-700">{entry.action.replaceAll("_", " ")}</p>
                  <p className="text-slate-500">{entry.summary}</p>
                  <p className="text-[10px] text-slate-400">{entry.actorName ?? "System"} · {formatDateTime(entry.createdAt)}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
