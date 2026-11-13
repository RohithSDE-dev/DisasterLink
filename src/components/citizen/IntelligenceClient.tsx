"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORY_LABELS, RISK_DISCLAIMER } from "@/lib/constants";
import { apiRequest, useApi } from "../interactive";
import TamilNaduMap, { type MapMarker } from "../TamilNaduMap";
import { Chip, EmptyState, Notice, RiskBadge, SectionHeading, SeverityBadge, SourceBadge, StatusBadge, formatDateTime } from "../ui";
import { RiskCard } from "./panels";

type DistrictEntry = {
  code: string;
  name: string;
  region: string;
  incidents: { total: number; pending: number; verified: number; resolved: number; recentWater: number };
  openSos: number;
  facilities: number;
  risk: {
    level: string;
    score: number;
    explanation: string;
    factors: { id: string; label: string; points: number; sourceClass: string }[];
    disclaimer: string;
    confidence: string;
    generatedAt: string;
    model: string;
    riverDistanceKm: number | null;
    nearestRiver: string | null;
  };
  weather: { available: boolean; temperature: number | null; rainfall: number | null; condition: string | null; next24hRainfall: number | null; fetchedAt: string; stale: boolean };
};

type PublicIncident = {
  publicId: string;
  category: string;
  status: string;
  locationName: string;
  districtCode: string;
  lat: number | null;
  lng: number | null;
  reportedSeverity: string;
  assessedSeverity: string | null;
  dataClass: string;
  createdAt: string;
};

type Facility = {
  id: number;
  name: string;
  category: string;
  districtCode: string;
  lat: number | null;
  lng: number | null;
  isOfficialShelter: boolean;
  verificationStatus: string;
};

type Analysis = {
  categoryLabel: string;
  categoryConfidence: number;
  severitySuggestion: string;
  severityRationale: string[];
  summary: string;
  matchedPhrases: string[];
  duplicate: { publicId: string; similarity: number } | null;
  suggestedActions: string[];
  advisory: string;
  alternativeCategories: { category: string; score: number }[];
};

export default function IntelligenceClient() {
  const districtsApi = useApi<{ districts: DistrictEntry[] }>("/api/districts");
  const incidentsApi = useApi<{ incidents: PublicIncident[] }>("/api/incidents?limit=300");
  const facilitiesApi = useApi<{ facilities: Facility[] }>("/api/facilities");
  const [selected, setSelected] = useState<string | null>("TN-CBE");
  const [levelFilter, setLevelFilter] = useState("ALL");

  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const districts = districtsApi.data?.districts ?? [];
  const active = districts.find((d) => d.code === selected) ?? null;

  const rows = useMemo(
    () => districts.filter((d) => (levelFilter === "ALL" ? true : d.risk.level === levelFilter)).sort((a, b) => b.risk.score - a.risk.score),
    [districts, levelFilter],
  );

  const markers: MapMarker[] = [
    ...(incidentsApi.data?.incidents ?? [])
      .filter((i) => i.lat !== null && i.lng !== null)
      .map((i) => ({
        id: i.publicId,
        type: "INCIDENT" as const,
        lat: i.lat as number,
        lng: i.lng as number,
        title: i.publicId,
        description: `${CATEGORY_LABELS[i.category] ?? i.category} · ${i.locationName}`,
        severity: i.assessedSeverity ?? i.reportedSeverity,
        status: i.status,
        dataClass: i.dataClass,
      })),
    ...(facilitiesApi.data?.facilities ?? [])
      .filter((f) => f.lat !== null && f.lng !== null)
      .map((f) => ({
        id: `f-${f.id}`,
        type: f.isOfficialShelter ? ("SHELTER" as const) : ("FACILITY" as const),
        lat: f.lat as number,
        lng: f.lng as number,
        title: f.name,
        status: f.verificationStatus,
      })),
  ];

  async function analyse() {
    setAiBusy(true);
    setAiError(null);
    const result = await apiRequest<{ analysis: Analysis }>("/api/ai", {
      method: "POST",
      body: { mode: "classify", description: text, districtCode: selected ?? undefined },
    });
    setAiBusy(false);
    if (!result.ok) setAiError(result.error ?? "AI analysis unavailable");
    else setAnalysis(result.data?.analysis ?? null);
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Disaster intelligence engine"
        title="Geographic, weather, community and AI signals in one view"
        description="Switch layers on the map, inspect district risk explanations, and run the AI incident assistant. Every layer carries an explicit source classification."
        action={<SourceBadge source="MODEL_RISK_ESTIMATE" />}
      />

      <Notice tone="info" title="Interpretation rules">
        Risk fill is a transparent heuristic (MODEL_RISK_ESTIMATE) — not an official flood-prone-zone map. Weather is provider data. Official
        warnings are not ingested in this prototype. Incident markers are citizen records; only administrator-verified reports are published
        publicly. <strong>SIMULATED</strong> demonstration records are badged.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-3">
          <TamilNaduMap
            districts={districts.map((d) => ({
              code: d.code,
              name: d.name,
              riskLevel: d.risk.level,
              incidents: d.incidents.total,
              openSos: d.openSos,
              temperature: d.weather.temperature,
            }))}
            markers={markers}
            selectedCode={selected}
            onSelectDistrict={(code) => setSelected(code)}
            heightClass="h-[440px] sm:h-[560px]"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="card card-pad">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Districts mapped</p>
              <p className="text-xl font-extrabold text-slate-900">{districts.length}<span className="text-sm font-semibold text-slate-400">/38</span></p>
              <p className="text-[10px] text-slate-500">Mayiladuthurai has no separate polygon in the 2011 dataset.</p>
            </div>
            <div className="card card-pad">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Public incident markers</p>
              <p className="text-xl font-extrabold text-slate-900">{incidentsApi.data?.incidents.length ?? "—"}</p>
              <p className="text-[10px] text-slate-500">Verified / resolved records only.</p>
            </div>
            <div className="card card-pad">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Facility candidates</p>
              <p className="text-xl font-extrabold text-slate-900">{facilitiesApi.data?.facilities.length ?? "—"}</p>
              <p className="text-[10px] text-slate-500">No availability is claimed.</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {active ? (
            <RiskCard risk={{ ...active.risk, districtCode: active.code, generatedAt: active.risk.generatedAt, weatherAvailable: active.weather.available } as never} />
          ) : (
            <EmptyState title="Select a district on the map" description="The risk explanation updates immediately when a district is selected." />
          )}

          <div className="card card-pad">
            <h3 className="text-sm font-bold text-slate-900">AI incident analyst</h3>
            <p className="mb-2 text-[11px] text-slate-500">
              Paste a citizen description to preview classification, severity suggestion, duplicate detection and a summary. Heuristic model,
              no external LLM.
            </p>
            <textarea
              className="input min-h-[90px] text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Water is waist deep near the bus stand, two families are trapped on the ground floor…"
            />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={analyse} className="btn-dark btn-sm" disabled={aiBusy || text.trim().length < 12}>
                {aiBusy ? "Analysing…" : "Analyse"}
              </button>
              <Link href="/report" className="btn-ghost btn-sm">Report instead</Link>
            </div>
            {aiError ? <p className="mt-2 text-[11px] text-red-600">{aiError}</p> : null}
            {analysis ? (
              <div className="mt-2 space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5 text-[11px] text-slate-700">
                <div className="flex flex-wrap gap-1.5">
                  <Chip tone="purple">AI-ASSISTED</Chip>
                  <StatusBadge status="UNDER_REVIEW" />
                </div>
                <p><strong>{analysis.categoryLabel}</strong> · {analysis.categoryConfidence}% keyword confidence</p>
                <p className="flex items-center gap-1">Suggested severity <SeverityBadge severity={analysis.severitySuggestion} /></p>
                <p>{analysis.summary}</p>
                {analysis.duplicate ? <p className="rounded bg-amber-100 px-2 py-1">Possible duplicate: {analysis.duplicate.publicId} ({analysis.duplicate.similarity}%)</p> : null}
                <ul className="list-disc pl-4">
                  {analysis.suggestedActions.map((action) => <li key={action}>{action}</li>)}
                </ul>
                <p className="text-[10px] text-slate-500">{analysis.advisory}</p>
              </div>
            ) : null}
          </div>

          <div className="card card-pad">
            <h3 className="text-sm font-bold text-slate-900">Flood risk estimate — all districts</h3>
            <div className="mt-1 flex flex-wrap gap-1">
              {["ALL", "VERY_HIGH", "HIGH", "MODERATE", "LOW"].map((level) => (
                <button
                  key={level}
                  onClick={() => setLevelFilter(level)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${levelFilter === level ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}
                >
                  {level.replace("_", " ")}
                </button>
              ))}
            </div>
            <div className="mt-2 max-h-[260px] overflow-y-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>District</th>
                    <th>Score</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.code} className="cursor-pointer hover:bg-blue-50" onClick={() => setSelected(row.code)}>
                      <td className="text-xs font-semibold">{row.name}</td>
                      <td className="text-xs tabular-nums">{row.risk.score}</td>
                      <td><RiskBadge level={row.risk.level} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">{RISK_DISCLAIMER}</p>
            <p className="mt-1 text-[10px] text-slate-400">Generated {formatDateTime(active?.risk.generatedAt)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
