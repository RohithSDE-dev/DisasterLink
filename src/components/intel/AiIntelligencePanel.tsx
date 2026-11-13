"use client";

import { useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { MiniBars } from "../charts";
import { useApi } from "../interactive";
import { Chip, DataClassBadge, EmptyState, Notice, RiskBadge, SectionHeading, SeverityBadge, SourceBadge, Stat, formatDateTime } from "../ui";

type Intelligence = {
  scope: { type: string; code?: string; name?: string };
  model: string;
  sourceClass: string;
  statistics: { reports: number; verified: number; pending: number; simulated: number; districtsMonitored: number };
  riskRanking: { code: string; name: string; level: string; score: number; explanation: string; confidence: string; factors: { id: string; label: string; points: number; sourceClass: string }[] }[];
  rainfall: { districtCode: string; districtName: string; rainfall24h: number | null; rainfallNow: number | null; temperature: number | null; band: string; trendNote: string }[];
  clusters: {
    key: string;
    districtName: string;
    categoryLabel: string;
    count: number;
    verified: number;
    pending: number;
    severity: string;
    members: string[];
    windowHours: number;
  }[];
  resourceDemand: {
    districtCode: string;
    districtName: string;
    openReports: number;
    critical: number;
    suggestedBoats: number;
    suggestedPumps: number;
    suggestedMedicalKits: number;
    suggestedShelterKitSets: number;
    rationale: string;
  }[];
  history: { last7Days: number; previous7Days: number; changePct: number | null; note: string; byCategory: { label: string; last7: number; previous7: number }[] };
  labels: Record<string, string>;
  disclaimer: string;
  advisory: string;
};

export default function AiIntelligencePanel({ mode = "admin" }: { mode?: "admin" | "citizen" }) {
  const [district, setDistrict] = useState("");
  const { data, loading, error, reload } = useApi<Intelligence>(`/api/intelligence${district ? `?district=${district}` : ""}`, [district]);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="AI disaster intelligence"
        title="Risk, rainfall, clustering and resource demand"
        description="Computed offline from DisasterLink records with a transparent heuristic model. Assists human review; never verifies incidents or publishes warnings."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source="MODEL_RISK_ESTIMATE" />
            <Chip tone="purple">{data?.model ?? "Heuristic v1"}</Chip>
            <button className="btn-outline btn-sm" onClick={reload}>Recompute</button>
          </div>
        }
      />

      <div className="card card-pad">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px]">
            <span className="label">Scope</span>
            <select className="input" value={district} onChange={(event) => setDistrict(event.target.value)}>
              <option value="">State-wide (all 38 districts)</option>
              {DISTRICTS.map((entry) => (
                <option key={entry.code} value={entry.code}>{entry.name}</option>
              ))}
            </select>
          </label>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Chip tone="blue">{data?.statistics.districtsMonitored ?? "—"} districts</Chip>
            <Chip tone="neutral">window 72 h</Chip>
            <DataClassBadge dataClass="SIMULATED" />
          </div>
        </div>
      </div>

      {error ? <Notice tone="danger" title="Intelligence unavailable">{error}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Reports in scope" value={data?.statistics.reports ?? "—"} hint="includes simulated records" tone="info" />
        <Stat label="Verified / resolved" value={data?.statistics.verified ?? "—"} hint="administrator-confirmed" tone="good" />
        <Stat label="Awaiting review" value={data?.statistics.pending ?? "—"} hint="pending or under review" tone="warn" />
        <Stat label="7-day change" value={data?.history.changePct === null || data?.history.changePct === undefined ? "No baseline" : `${data.history.changePct > 0 ? "+" : ""}${data.history.changePct}%`} hint={`${data?.history.last7Days ?? 0} vs ${data?.history.previous7Days ?? 0} reports`} tone="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card card-pad">
          <SectionHeading eyebrow="Flood-risk estimate" title="Highest-risk districts" description="Score composition is shown so reviewers can challenge the model." />
          {loading && !data ? <div className="h-40 animate-pulse rounded bg-slate-100" /> : null}
          <ol className="space-y-2">
            {(data?.riskRanking ?? []).map((row) => (
              <li key={row.code} className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <RiskBadge level={row.level} />
                  <span className="text-xs font-bold text-slate-900">{row.name}</span>
                  <span className="ml-auto text-[11px] font-semibold tabular-nums text-slate-600">{row.score}/100</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-600">{row.explanation}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {row.factors.map((factor) => (
                    <Chip key={factor.id} tone="neutral">+{factor.points} {factor.label.split(":")[0]}</Chip>
                  ))}
                </div>
              </li>
            ))}
            {data && !data.riskRanking.length ? <EmptyState title="No risk rows" /> : null}
          </ol>
          <p className="mt-2 text-[10px] text-slate-500">{data?.disclaimer}</p>
        </div>

        <div className="space-y-4">
          <div className="card card-pad">
            <SectionHeading eyebrow="Rainfall analysis" title="Forecast accumulation ranking" description="FORECAST values from Open-Meteo, not official warnings." />
            <div className="max-h-[260px] overflow-y-auto">
              <table className="table-base">
                <thead className="sticky top-0">
                  <tr><th>District</th><th className="text-right">Next 24h</th><th className="text-right">Now</th><th>Band</th></tr>
                </thead>
                <tbody>
                  {(data?.rainfall ?? []).map((row) => (
                    <tr key={row.districtCode}>
                      <td className="text-xs font-semibold">{row.districtName}</td>
                      <td className="text-right text-xs tabular-nums">{row.rainfall24h !== null ? `${row.rainfall24h} mm` : "n/a"}</td>
                      <td className="text-right text-xs tabular-nums">{row.rainfallNow !== null ? `${row.rainfallNow} mm` : "n/a"}</td>
                      <td>
                        <Chip tone={row.band === "HEAVY" ? "red" : row.band === "MODERATE" ? "amber" : row.band === "LIGHT" ? "blue" : "neutral"}>{row.band.replace("_", " ")}</Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card card-pad">
            <SectionHeading eyebrow="Incident clustering" title="Spatial clusters (72 h)" description="Nearby same-category reports merged within 6 km to reveal emerging hotspots." />
            {(data?.clusters ?? []).length ? (
              <ul className="space-y-1.5">
                {data!.clusters.slice(0, 8).map((cluster) => (
                  <li key={cluster.key}>
                    <button
                      onClick={() => setSelectedCluster(selectedCluster === cluster.key ? null : cluster.key)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-left hover:bg-slate-50"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone="blue">{cluster.categoryLabel}</Chip>
                        <SeverityBadge severity={cluster.severity} />
                        <span className="text-xs font-semibold text-slate-800">{cluster.districtName}</span>
                        <span className="ml-auto text-[11px] font-bold tabular-nums text-slate-700">{cluster.count} reports</span>
                      </div>
                      <p className="text-[10px] text-slate-500">{cluster.verified} verified · {cluster.pending} pending · window {cluster.windowHours}h</p>
                      {selectedCluster === cluster.key ? (
                        <p className="mt-1 font-mono text-[10px] text-slate-500">{cluster.members.join(", ")}</p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No clusters in this window" description="Clusters appear when multiple nearby reports share a category within 72 hours." />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card card-pad">
          <SectionHeading eyebrow="Resource demand" title="Planning estimate by district" description="Heuristic demand signal — not an allocation order. Approve resources manually." />
          <div className="max-h-[300px] overflow-auto">
            <table className="table-base min-w-[520px]">
              <thead className="sticky top-0">
                <tr><th>District</th><th className="text-right">Boats</th><th className="text-right">Pumps</th><th className="text-right">Medical</th><th className="text-right">Shelter kits</th></tr>
              </thead>
              <tbody>
                {(data?.resourceDemand ?? []).map((row) => (
                  <tr key={row.districtCode}>
                    <td className="text-xs font-semibold">
                      {row.districtName}
                      <span className="ml-1 text-[10px] font-normal text-slate-500">({row.openReports} open · {row.critical} critical)</span>
                    </td>
                    <td className="text-right text-xs tabular-nums">{row.suggestedBoats}</td>
                    <td className="text-right text-xs tabular-nums">{row.suggestedPumps}</td>
                    <td className="text-right text-xs tabular-nums">{row.suggestedMedicalKits}</td>
                    <td className="text-right text-xs tabular-nums">{row.suggestedShelterKitSets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-pad">
          <SectionHeading eyebrow="Historical comparison" title="Last 7 days vs previous 7 days" description="DisasterLink records only; not an official historical disaster archive." />
          <MiniBars
            data={(data?.history.byCategory ?? []).slice(0, 8).flatMap((row) => [
              { label: `${row.label} · last 7d`, value: row.last7 },
              { label: `${row.label} · prior 7d`, value: row.previous7 },
            ])}
          />
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{data?.history.note}</p>
          <div className="mt-2 rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600">
            <p className="font-semibold uppercase tracking-wide text-slate-500">Source classes</p>
            {data?.labels
              ? Object.entries(data.labels).map(([key, value]) => (
                  <p key={key}><strong className="capitalize">{key.replaceAll("_", " ")}</strong>: {value}</p>
                ))
              : null}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">{data?.advisory}</p>
          <p className="mt-1 text-[10px] text-slate-400">Generated {formatDateTime(new Date())}</p>
        </div>
      </div>

      {mode === "citizen" ? (
        <Notice tone="info" title="What this means for citizens">
          Cluster counts include unverified community reports; only administrator-verified reports are published as confirmed incidents. Use
          these insights to prepare, not as a substitute for official warnings.
        </Notice>
      ) : null}
    </div>
  );
}
