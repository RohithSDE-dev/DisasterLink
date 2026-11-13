import { AI_MODEL, CATEGORY_LABELS, INCIDENT_CATEGORIES, SEVERITIES } from "./constants";

/**
 * DisasterLink AI Incident Intelligence.
 * A deterministic, explainable NLP heuristic that runs fully offline.
 * It assists administrators and never verifies incidents or issues alerts.
 */

const KEYWORDS: Record<string, { terms: string[]; weight: number }[]> = {
  FLOODING: [
    { terms: ["flood", "flooded", "flooding", "inundated", "inundation", "river overflow", "water entered", "water level rising"], weight: 5 },
    { terms: ["submerged", "swept away", "knee deep", "waist deep"], weight: 3 },
  ],
  WATERLOGGING: [
    { terms: ["waterlog", "waterlogged", "water logging", "stagnant", "logging", "puddle", "drain overflow"], weight: 5 },
    { terms: ["ankle deep", "road under water", "stagnation"], weight: 2 },
  ],
  FALLEN_TREE: [
    { terms: ["tree fell", "fallen tree", "tree uprooted", "uprooted", "tree collapsed", "branch fell"], weight: 5 },
  ],
  ROAD_BLOCKAGE: [
    { terms: ["blocked", "blockage", "road closed", "traffic block", "debris on road", "road blocked", "boulder"], weight: 5 },
    { terms: ["diversion", "impassable"], weight: 2 },
  ],
  BUILDING_DAMAGE: [
    { terms: ["wall collapsed", "building damage", "cracked wall", "roof collapsed", "collapse", "structural damage", "house damaged"], weight: 5 },
  ],
  FIRE: [
    { terms: ["fire", "burning", "smoke", "short circuit", "blast", "explosion", "flames"], weight: 5 },
  ],
  LANDSLIDE: [
    { terms: ["landslide", "land slide", "mudslide", "hill slope", "slope failure", "rockfall", "boulders falling"], weight: 6 },
  ],
  OTHER: [
    { terms: ["power cut", "electric pole", "live wire", "gas leak", "medical emergency"], weight: 2 },
  ],
};

const SEVERITY_SIGNALS: { level: "CRITICAL" | "HIGH" | "MODERATE" | "LOW"; weight: number; terms: string[] }[] = [
  {
    level: "CRITICAL",
    weight: 5,
    terms: ["trapped", "stranded", "missing", "casualt", "death", "died", "collapsed building", "children stuck", "elderly stuck", "rescue", "swept away", "life threatening", "critical"],
  },
  { level: "HIGH", weight: 3, terms: ["rising water", "waist deep", "chest deep", "large", "severe", "multiple vehicles", "hospital", "school", "evacuat", "injur"] },
  { level: "MODERATE", weight: 2, terms: ["blocked", "knee deep", "slow traffic", "few houses", "ankle deep", "stagnant"] },
  { level: "LOW", weight: 1, terms: ["minor", "small", "slight", "partial", "cleared"] },
];

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !["the", "and", "for", "near", "with", "from", "this", "that", "very"].includes(t));
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  setA.forEach((t) => {
    if (setB.has(t)) intersection += 1;
  });
  return intersection / (setA.size + setB.size - intersection);
}

const SEVERITY_ORDER = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
function bump(base: string, delta: number) {
  const index = Math.max(0, Math.min(3, SEVERITY_ORDER.indexOf(base as (typeof SEVERITY_ORDER)[number]) + delta));
  return SEVERITY_ORDER[index];
}

export type IncidentAnalysis = {
  model: string;
  sourceClass: "MODEL_RISK_ESTIMATE";
  category: string;
  categoryLabel: string;
  categoryConfidence: number;
  alternativeCategories: { category: string; score: number }[];
  matchedPhrases: string[];
  severitySuggestion: (typeof SEVERITIES)[number];
  severityRationale: string[];
  summary: string;
  suggestedActions: string[];
  duplicate: { publicId: string; similarity: number; status: string } | null;
  advisory: string;
};

export type DuplicateCandidate = {
  publicId: string;
  category: string;
  description: string;
  districtCode: string;
  createdAt: string | Date;
  status: string;
};

export function analyzeIncident(input: {
  description: string;
  districtCode: string;
  reportedSeverity?: string;
  existing?: DuplicateCandidate[];
}): IncidentAnalysis {
  const text = input.description.toLowerCase();
  const scores: { category: string; score: number; matched: string[] }[] = [];

  for (const category of INCIDENT_CATEGORIES) {
    const rules = KEYWORDS[category] ?? [];
    let score = 0;
    const matched: string[] = [];
    for (const rule of rules) {
      for (const term of rule.terms) {
        if (text.includes(term)) {
          score += rule.weight;
          matched.push(term);
        }
      }
    }
    scores.push({ category, score, matched });
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0]?.score > 0 ? scores[0] : { category: "OTHER", score: 1, matched: [] };
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0) || 1;
  const categoryConfidence = Math.min(96, Math.round((best.score / totalScore) * 100) + (best.score >= 5 ? 15 : 0));

  let severity = (input.reportedSeverity && SEVERITIES.includes(input.reportedSeverity as never)
    ? input.reportedSeverity
    : "MODERATE") as string;
  const severityRationale: string[] = [];
  const signalHits: string[] = [];

  for (const signal of SEVERITY_SIGNALS) {
    const hit = signal.terms.find((t) => text.includes(t));
    if (hit) {
      signalHits.push(`${signal.level} signal "${hit}"`);
      severity = signal.level;
      severityRationale.push(`Detected ${signal.level.toLowerCase()} signal: "${hit}"`);
      break;
    }
  }

  if (best.category === "LANDSLIDE" || best.category === "FIRE") {
    severity = bump(severity, 1);
    severityRationale.push(`${CATEGORY_LABELS[best.category]} incidents carry elevated default severity.`);
  }
  if (/\b\d{2,}\b/.test(text) && /(people|persons|famil|residents|students)/.test(text)) {
    severity = bump(severity, 1);
    severityRationale.push("Report mentions a group of affected people.");
  }
  if (/hospital|clinic|school|shelter|old age/.test(text)) {
    severity = bump(severity, 1);
    severityRationale.push("A sensitive facility (hospital/school/shelter) is referenced.");
  }
  if (!severityRationale.length) {
    severityRationale.push(
      `No escalation phrase detected; suggestion follows the citizen-reported severity (${severity}) and must be reviewed by an administrator.`,
    );
  }

  const sentences = input.description
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const summary =
    sentences.slice(0, 2).join(" ").slice(0, 320) + (input.description.length > 320 || sentences.length > 2 ? " …" : "");

  let duplicate: IncidentAnalysis["duplicate"] = null;
  if (input.existing?.length) {
    const candidateTokens = tokens(input.description);
    let top: { c: DuplicateCandidate; score: number } | null = null;
    for (const c of input.existing) {
      const base = jaccard(candidateTokens, tokens(c.description));
      const sameDistrict = c.districtCode === input.districtCode ? 0.12 : 0;
      const sameCategory = c.category === best.category ? 0.1 : 0;
      const hoursOld = Math.abs(Date.now() - new Date(c.createdAt).getTime()) / 3_600_000;
      const recency = hoursOld <= 24 ? 0.06 : 0;
      const score = base + sameDistrict + sameCategory + recency;
      if (!top || score > top.score) top = { c, score };
    }
    if (top && top.score >= 0.45) {
      duplicate = {
        publicId: top.c.publicId,
        similarity: Math.round(top.score * 100),
        status: top.c.status,
      };
    }
  }

  const actions: Record<string, string[]> = {
    FLOODING: ["Ask for water depth and whether people are trapped", "Check nearby verified reports for the same locality", "Prepare a non-official situational note for duty officers"],
    WATERLOGGING: ["Confirm road usability with the local body", "Look for repeat reports in the last 24h", "Note the location for drainage coordination"],
    FALLEN_TREE: ["Notify the local body tree-cutting team", "Check if the road is fully blocked", "Warn nearby traffic marshals"],
    ROAD_BLOCKAGE: ["Record the route/landmark details", "Coordinate alternate route advisory", "Check whether responder access is affected"],
    BUILDING_DAMAGE: ["Check for trapped occupants", "Suggest structural inspection by the local body", "Prioritise for fire & rescue review"],
    FIRE: ["Confirm whether the fire service has been contacted directly", "Ask for access details", "Escalate to duty officer immediately"],
    LANDSLIDE: ["Check for trapped vehicles or houses", "Coordinate with highways and revenue teams", "Treat as high priority until verified"],
    OTHER: ["Request a clearer description", "Capture a photograph if safe", "Route to duty officer triage"],
  };

  return {
    model: AI_MODEL,
    sourceClass: "MODEL_RISK_ESTIMATE",
    category: best.category,
    categoryLabel: CATEGORY_LABELS[best.category],
    categoryConfidence,
    alternativeCategories: scores.slice(1, 4).filter((s) => s.score > 0).map((s) => ({ category: s.category, score: s.score })),
    matchedPhrases: [...new Set(best.matched)].slice(0, 6),
    severitySuggestion: severity as (typeof SEVERITIES)[number],
    severityRationale,
    summary,
    suggestedActions: actions[best.category] ?? actions.OTHER,
    duplicate,
    advisory:
      "AI suggestion for human review only. It does not verify this incident, issue an official warning, or dispatch any response team.",
  };
}

export type DistrictActivity = {
  districtName: string;
  total: number;
  pending: number;
  verified: number;
  categories: { category: string; count: number }[];
  summary: string;
  hotspots: string[];
  model: string;
  advisory: string;
};

export function summarizeDistrictActivity(input: {
  districtName: string;
  incidents: { category: string; status: string; locationName: string; assessedSeverity?: string | null; reportedSeverity: string }[];
  openSos: number;
  riskLevel: string;
}): DistrictActivity {
  const total = input.incidents.length;
  const pending = input.incidents.filter((i) => i.status === "PENDING" || i.status === "UNDER_REVIEW").length;
  const verified = input.incidents.filter((i) => i.status === "VERIFIED").length;
  const byCategory = new Map<string, number>();
  for (const incident of input.incidents) {
    byCategory.set(incident.category, (byCategory.get(incident.category) ?? 0) + 1);
  }
  const categories = [...byCategory.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
  const top = categories[0];
  const summary =
    total === 0
      ? `No incident reports are recorded for ${input.districtName} in the current dataset. Weather is observed independently; the absence of reports does not mean an absence of hazard.`
      : `${input.districtName} has ${total} report(s): ${verified} verified, ${pending} awaiting administrator review. Top category: ${
          top ? CATEGORY_LABELS[top.category] : "none"
        }${top ? ` (${top.count})` : ""}. ${input.openSos} SOS request(s) remain open. Current model risk level: ${input.riskLevel.replace("_", " ")}.`;
  const hotspots = [...new Set(input.incidents.map((i) => i.locationName))].slice(0, 4);
  return {
    districtName: input.districtName,
    total,
    pending,
    verified,
    categories,
    summary,
    hotspots,
    model: AI_MODEL,
    advisory: "Generated from DisasterLink records for administrative briefing only. Not an official bulletin.",
  };
}

export function buildSituationReport(input: {
  generatedFor: string;
  totals: Record<string, number>;
  districts: { name: string; incidents: number; verified: number; risk: string }[];
  openSos: number;
  teamsAvailable: number;
  urgentIncidents: { publicId: string; category: string; district: string; severity: string }[];
}): string {
  const lines: string[] = [];
  lines.push(`DISASTERLINK — AI-ASSISTED SITUATION REPORT (internal draft)`);
  lines.push(`Generated: ${input.generatedFor} · Model: ${AI_MODEL}`);
  lines.push("");
  lines.push(`1. INCIDENT PICTURE`);
  lines.push(
    `   Reported: ${input.totals.total ?? 0} · Pending: ${input.totals.pending ?? 0} · Verified: ${input.totals.verified ?? 0} · Resolved: ${
      input.totals.resolved ?? 0
    } · Rejected: ${input.totals.rejected ?? 0}`,
  );
  lines.push("");
  lines.push(`2. SOS POSITION`);
  lines.push(`   Open SOS requests requiring review/assignment: ${input.openSos}`);
  lines.push("");
  lines.push(`3. DISTRICT PRESSURE (top by report volume)`);
  const topDistricts = [...input.districts].sort((a, b) => b.incidents - a.incidents).slice(0, 5);
  for (const d of topDistricts) {
    lines.push(`   - ${d.name}: ${d.incidents} report(s), ${d.verified} verified, model risk ${d.risk.replace("_", " ")}`);
  }
  lines.push("");
  lines.push(`4. PRIORITY INCIDENTS FOR REVIEW`);
  if (input.urgentIncidents.length === 0) lines.push("   None flagged by the current filter.");
  for (const i of input.urgentIncidents.slice(0, 6)) {
    lines.push(`   - ${i.publicId} · ${CATEGORY_LABELS[i.category] ?? i.category} · ${i.district} · suggested severity ${i.severity}`);
  }
  lines.push("");
  lines.push(`5. RESOURCES`);
  lines.push(`   Response teams marked available: ${input.teamsAvailable}`);
  lines.push("");
  lines.push(`NOTE: AI-assisted draft for administrator review. It is not an official warning, does not verify incidents and never dispatches teams.`);
  return lines.join("\n");
}

export function sosTriage(description: string, emergencyType: string): { summary: string; severity: string; rationale: string[] } {
  const analysis = analyzeIncident({ description, districtCode: "" });
  const rationale = [analysis.severityRationale.join(" "), `Emergency type is ${emergencyType}.`];
  return {
    summary: analysis.summary,
    severity: analysis.severitySuggestion,
    rationale: rationale.filter(Boolean),
  };
}
