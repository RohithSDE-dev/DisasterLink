"use client";

import { useState } from "react";
import { apiRequest, useApi } from "../interactive";
import { CategoryBars, DistrictBars, MiniBars, SeverityDonut, TrendLines } from "../charts";
import { Chip, DataClassBadge, Notice, SectionHeading, Stat } from "../ui";

type Analytics = {
  byDistrict: { district: string; total: number; verified: number; risk: string }[];
  districtSeverity: { code: string; district: string; total: number; low: number; moderate: number; high: number; critical: number; verified: number; unverified: number }[];
  byCategory: { label: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
  byStatus: { status: string; count: number }[];
  weeks: { label: string; incidents: number; sos: number }[];
  months: { label: string; incidents: number }[];
  sos: { total: number; byStatus: { status: string; count: number }[]; open: number; resolved: number; avgResponseHours: number | null };
  resolution: {
    avgResolutionHours: number | null;
    avgVerificationHours: number | null;
    resolvedSample: number;
    trend: { label: string; verified: number; resolved: number }[];
  };
  byFacilityCategory: { category: string; count: number }[];
  assignments: { total: number; active: number; completed: number };
  riskLevels: { level: string; districts: number }[];
  simulated: { incidents: number; sos: number; facilities: number };
  disclosure: string;
};

export default function AnalyticsConsole() {
  const { data, loading, error } = useApi<Analytics>("/api/analytics");
  const [report, setReport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sitrep() {
    setBusy(true);
    const response = await apiRequest<{ report: string }>("/api/ai", { method: "POST", body: { mode: "sitrep" } });
    setBusy(false);
    if (response.ok) setReport(response.data?.report ?? null);
  }

  if (loading && !data) return <div className="h-[400px] animate-pulse rounded-xl bg-white" />;
  if (error) return <Notice tone="danger" title="Analytics unavailable">{error}</Notice>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Analytics"
        title="Incident, SOS and response performance"
        description="Every figure is computed from records stored in this DisasterLink database. SIMULATED demonstration records are included and labelled."
        action={<button className="btn-dark btn-sm" onClick={sitrep} disabled={busy}>{busy ? "Drafting…" : "Generate AI sitrep"}</button>}
      />

      <Notice tone="demo" title="Data disclosure">
        {data.disclosure} Simulated now: {data.simulated.incidents} incident(s), {data.simulated.sos} SOS, {data.simulated.facilities} facility record(s).
      </Notice>

      {report ? (
        <div className="card card-pad">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Situation report draft</h3>
            <button className="btn-outline btn-sm" onClick={() => setReport(null)}>Close</button>
          </div>
          <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] text-slate-200">{report}</pre>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Avg verification time" value={data.resolution.avgVerificationHours !== null ? `${data.resolution.avgVerificationHours} h` : "No sample"} hint={`${data.byStatus.find((s) => s.status === "VERIFIED")?.count ?? 0} verified records`} tone="info" />
        <Stat label="Avg resolution time" value={data.resolution.avgResolutionHours !== null ? `${data.resolution.avgResolutionHours} h` : "No sample"} hint={`${data.resolution.resolvedSample} resolved with timestamps`} tone="good" />
        <Stat label="Open SOS" value={data.sos.open} hint={`${data.sos.total} total requests`} tone="danger" />
        <Stat label="Active assignments" value={data.assignments.active} hint={`${data.assignments.completed} completed`} tone="warn" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card card-pad"><SectionHeading eyebrow="Trends" title="Weekly incidents and SOS" /><TrendLines data={data.weeks} /></div>
        <div className="card card-pad">
          <SectionHeading eyebrow="Resolution trend" title="Verified vs resolved per week" description="Derived from verification and resolution timestamps, not estimates." />
          <TrendLines data={data.resolution.trend.map((row) => ({ label: row.label, incidents: row.verified, sos: row.resolved }))} />
          <p className="mt-1 text-[10px] text-slate-500">Series: verified (blue) and resolved (red) counts per week.</p>
        </div>
      </div>

      <div className="card card-pad">
        <SectionHeading eyebrow="District intelligence" title="Severity distribution, verified and unverified" description="Counts from incident records including SIMULATED demonstration rows." />
        <div className="max-h-[340px] overflow-auto">
          <table className="table-base min-w-[720px]">
            <thead className="sticky top-0"><tr><th>District</th><th className="text-right">Total</th><th className="text-right">Critical</th><th className="text-right">High</th><th className="text-right">Moderate</th><th className="text-right">Low</th><th className="text-right">Verified</th><th className="text-right">Unverified</th></tr></thead>
            <tbody>
              {data.districtSeverity.map((row) => (
                <tr key={row.code}>
                  <td className="text-xs font-semibold">{row.district}</td>
                  <td className="text-right text-xs tabular-nums">{row.total}</td>
                  <td className="text-right text-xs tabular-nums text-red-600">{row.critical}</td>
                  <td className="text-right text-xs tabular-nums text-orange-600">{row.high}</td>
                  <td className="text-right text-xs tabular-nums text-amber-600">{row.moderate}</td>
                  <td className="text-right text-xs tabular-nums text-emerald-600">{row.low}</td>
                  <td className="text-right text-xs tabular-nums">{row.verified}</td>
                  <td className="text-right text-xs tabular-nums">{row.unverified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card card-pad"><SectionHeading eyebrow="Categories" title="Incident mix" /><CategoryBars data={data.byCategory} /></div>
        <div className="card card-pad"><SectionHeading eyebrow="Severity" title="Assessed severity" /><SeverityDonut data={data.bySeverity} /></div>
        <div className="card card-pad"><SectionHeading eyebrow="Workflow" title="Reports by status" /><MiniBars data={data.byStatus.map((s) => ({ label: s.status.replaceAll("_", " "), value: s.count }))} /></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="card card-pad"><SectionHeading eyebrow="Districts" title="Reports and verified counts" /><DistrictBars data={data.byDistrict} /></div>
        <div className="space-y-4">
          <div className="card card-pad">
            <SectionHeading eyebrow="SOS" title="Requests by status" />
            <MiniBars data={data.sos.byStatus.map((s) => ({ label: s.status.replaceAll("_", " "), value: s.count }))} />
            <p className="mt-2 text-[10px] text-slate-500">SOS submission never implies dispatch. Only administrator assignment creates an assignment record.</p>
          </div>
          <div className="card card-pad">
            <SectionHeading eyebrow="Facilities" title="Directory distribution" />
            <MiniBars data={data.byFacilityCategory.map((f) => ({ label: f.category.replaceAll("_", " "), value: f.count }))} />
            <p className="mt-2 text-[10px] text-slate-500">Counts are directory candidates, not verified availability.</p>
          </div>
          <div className="card card-pad">
            <SectionHeading eyebrow="Risk model" title="Districts by heuristic level" />
            <MiniBars
              data={data.riskLevels.map((r) => ({
                label: r.level.replace("_", " "),
                value: r.districts,
                color: r.level === "VERY_HIGH" ? "#b91c1c" : r.level === "HIGH" ? "#ea580c" : r.level === "MODERATE" ? "#ca8a04" : "#059669",
              }))}
            />
            <p className="mt-2 text-[10px] text-slate-500">MODEL_RISK_ESTIMATE — not an official flood-prone-zone classification.</p>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <SectionHeading eyebrow="District table" title="Full district analytics" action={<DataClassBadge dataClass="SIMULATED" />} />
        <div className="max-h-[380px] overflow-auto">
          <table className="table-base">
            <thead className="sticky top-0"><tr><th>District</th><th className="text-right">Reports</th><th className="text-right">Verified</th><th>Risk level</th></tr></thead>
            <tbody>
              {data.byDistrict.map((row) => (
                <tr key={row.district}>
                  <td className="text-xs font-semibold">{row.district}</td>
                  <td className="text-right text-xs tabular-nums">{row.total}</td>
                  <td className="text-right text-xs tabular-nums">{row.verified}</td>
                  <td><Chip tone={row.risk === "VERY_HIGH" ? "red" : row.risk === "HIGH" ? "orange" : row.risk === "MODERATE" ? "amber" : "green"}>{row.risk.replace("_", " ")}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
