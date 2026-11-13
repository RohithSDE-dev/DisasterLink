/**
 * Advanced AI disaster intelligence built purely from DisasterLink records.
 * Deterministic, explainable and always labelled MODEL_RISK_ESTIMATE.
 */
import { CATEGORY_LABELS } from "./constants";
import { haversineKm } from "./risk";

export type AnalysisIncident = {
  publicId: string;
  category: string;
  status: string;
  districtCode: string;
  locationName: string;
  lat: number | null;
  lng: number | null;
  reportedSeverity: string;
  assessedSeverity: string | null;
  dataClass: string;
  createdAt: string | Date;
};

export type IncidentCluster = {
  key: string;
  districtCode: string;
  districtName: string;
  category: string;
  categoryLabel: string;
  count: number;
  verified: number;
  pending: number;
  centroid: { lat: number; lng: number } | null;
  members: string[];
  severity: string;
  windowHours: number;
};

export function clusterIncidents(incidents: AnalysisIncident[], districtName: (code: string) => string, radiusKm = 6): IncidentCluster[] {
  const recent = incidents.filter((i) => Date.now() - new Date(i.createdAt).getTime() <= 72 * 3600 * 1000 && i.status !== "REJECTED");
  const buckets = new Map<string, AnalysisIncident[]>();

  for (const incident of recent) {
    const key =
      incident.lat !== null && incident.lng !== null
        ? `${incident.districtCode}:${incident.category}:${Math.round(incident.lat * 15)}:${Math.round(incident.lng * 15)}`
        : `${incident.districtCode}:${incident.category}:unknown`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(incident);
    else buckets.set(key, [incident]);
  }

  const clusters: IncidentCluster[] = [];
  for (const [key, members] of buckets) {
    const geoMembers = members.filter((m) => m.lat !== null && m.lng !== null);
    let centroid: { lat: number; lng: number } | null = null;
    if (geoMembers.length) {
      centroid = {
        lat: geoMembers.reduce((sum, m) => sum + (m.lat as number), 0) / geoMembers.length,
        lng: geoMembers.reduce((sum, m) => sum + (m.lng as number), 0) / geoMembers.length,
      };
    }
    // Merge geographically close members of the same category inside a district.
    const existing = clusters.find(
      (cluster) =>
        cluster.districtCode === members[0].districtCode &&
        cluster.category === members[0].category &&
        centroid &&
        cluster.centroid &&
        haversineKm(centroid, cluster.centroid) <= radiusKm,
    );
    const severities = members.map((m) => m.assessedSeverity ?? m.reportedSeverity);
    const severity = severities.includes("CRITICAL") ? "CRITICAL" : severities.includes("HIGH") ? "HIGH" : severities.includes("MODERATE") ? "MODERATE" : "LOW";
    if (existing) {
      existing.count += members.length;
      existing.verified += members.filter((m) => ["VERIFIED", "RESOLVED"].includes(m.status)).length;
      existing.pending += members.filter((m) => ["PENDING", "UNDER_REVIEW"].includes(m.status)).length;
      existing.members.push(...members.map((m) => m.publicId));
      if (severity === "CRITICAL" || existing.severity !== "CRITICAL") existing.severity = severity;
      continue;
    }
    clusters.push({
      key,
      districtCode: members[0].districtCode,
      districtName: districtName(members[0].districtCode),
      category: members[0].category,
      categoryLabel: CATEGORY_LABELS[members[0].category] ?? members[0].category,
      count: members.length,
      verified: members.filter((m) => ["VERIFIED", "RESOLVED"].includes(m.status)).length,
      pending: members.filter((m) => ["PENDING", "UNDER_REVIEW"].includes(m.status)).length,
      centroid,
      members: members.map((m) => m.publicId),
      severity,
      windowHours: 72,
    });
  }
  return clusters.sort((a, b) => b.count - a.count || (a.severity === "CRITICAL" ? -1 : 1)).slice(0, 25);
}

export type ResourceDemandRow = {
  districtCode: string;
  districtName: string;
  openReports: number;
  critical: number;
  verified: number;
  suggestedBoats: number;
  suggestedPumps: number;
  suggestedMedicalKits: number;
  suggestedShelterKitSets: number;
  rationale: string;
};

export function estimateResourceDemand(
  incidents: AnalysisIncident[],
  districtName: (code: string) => string,
): ResourceDemandRow[] {
  const byDistrict = new Map<string, AnalysisIncident[]>();
  for (const incident of incidents) {
    if (["REJECTED", "RESOLVED"].includes(incident.status)) continue;
    const list = byDistrict.get(incident.districtCode) ?? [];
    list.push(incident);
    byDistrict.set(incident.districtCode, list);
  }
  return [...byDistrict.entries()]
    .map(([districtCode, list]) => {
      const water = list.filter((i) => ["FLOODING", "WATERLOGGING"].includes(i.category)).length;
      const medical = list.filter((i) => ["BUILDING_DAMAGE", "FIRE", "OTHER"].includes(i.category)).length;
      const critical = list.filter((i) => (i.assessedSeverity ?? i.reportedSeverity) === "CRITICAL").length;
      const verified = list.filter((i) => i.status === "VERIFIED").length;
      const suggestedBoats = Math.min(8, Math.ceil(water / 2) + critical);
      const suggestedPumps = Math.min(12, water * 2);
      const suggestedMedicalKits = Math.min(40, medical * 3 + critical * 2);
      const suggestedShelterKitSets = Math.min(300, list.length * 15);
      return {
        districtCode,
        districtName: districtName(districtCode),
        openReports: list.length,
        critical,
        verified,
        suggestedBoats,
        suggestedPumps,
        suggestedMedicalKits,
        suggestedShelterKitSets,
        rationale: `${water} water-related and ${medical} medical/structural open report(s); ${critical} critical. Demand is a planning heuristic, not an allocation order.`,
      };
    })
    .sort((a, b) => b.critical - a.critical || b.openReports - a.openReports)
    .slice(0, 12);
}

export type RainfallTrend = {
  districtCode: string;
  districtName: string;
  rainfall24h: number | null;
  rainfallNow: number | null;
  temperature: number | null;
  band: "NO_RAIN" | "LIGHT" | "MODERATE" | "HEAVY";
  trendNote: string;
};

export function rainfallTrends(
  board: { code: string; name: string; weather: { next24hRainfall: number | null; rainfall: number | null; temperature: number | null; available: boolean } }[],
): RainfallTrend[] {
  return board
    .map((entry) => {
      const rainfall24h = entry.weather.available ? entry.weather.next24hRainfall : null;
      const value = rainfall24h ?? 0;
      const band: RainfallTrend["band"] = !entry.weather.available
        ? "NO_RAIN"
        : value >= 30
          ? "HEAVY"
          : value >= 10
            ? "MODERATE"
            : value >= 1
              ? "LIGHT"
              : "NO_RAIN";
      return {
        districtCode: entry.code,
        districtName: entry.name,
        rainfall24h,
        rainfallNow: entry.weather.available ? entry.weather.rainfall : null,
        temperature: entry.weather.available ? entry.weather.temperature : null,
        band,
        trendNote: entry.weather.available
          ? `${band === "HEAVY" ? "Heavy" : band === "MODERATE" ? "Moderate" : band === "LIGHT" ? "Light" : "Little"} forecast accumulation over the next 24 hours.`
          : "Weather provider unavailable for this district; no rainfall estimate is shown.",
      };
    })
    .sort((a, b) => (b.rainfall24h ?? -1) - (a.rainfall24h ?? -1));
}

export type HistoricalComparison = {
  last7Days: number;
  previous7Days: number;
  changePct: number | null;
  byCategory: { category: string; label: string; last7: number; previous7: number }[];
  note: string;
};

export function historicalComparison(incidents: AnalysisIncident[]): HistoricalComparison {
  const now = Date.now();
  const inWindow = (date: string | Date, fromDays: number, toDays: number) => {
    const t = new Date(date).getTime();
    return t >= now - toDays * 86400000 && t < now - fromDays * 86400000;
  };
  const last7 = incidents.filter((i) => inWindow(i.createdAt, 0, 7));
  const previous7 = incidents.filter((i) => inWindow(i.createdAt, 7, 14));
  const categories = [...new Set([...last7, ...previous7].map((i) => i.category))];
  return {
    last7Days: last7.length,
    previous7Days: previous7.length,
    changePct: previous7.length === 0 ? null : Math.round(((last7.length - previous7.length) / previous7.length) * 100),
    byCategory: categories
      .map((category) => ({
        category,
        label: CATEGORY_LABELS[category] ?? category,
        last7: last7.filter((i) => i.category === category).length,
        previous7: previous7.filter((i) => i.category === category).length,
      }))
      .sort((a, b) => b.last7 - a.last7),
    note:
      "Comparison of DisasterLink records in the last 7 days against the preceding 7 days. Seeded and SIMULATED demonstration records are included — this is not an official historical disaster record.",
  };
}
