import { RISK_DISCLAIMER, type Severity } from "./constants";
import { RIVERS, type DistrictSeed } from "./districts";
import type { WeatherSnapshot } from "./weather";

export type RiskFactor = {
  id: string;
  label: string;
  detail: string;
  points: number;
  sourceClass: "OBSERVED" | "FORECAST" | "COMMUNITY_REPORT" | "MODEL_RISK_ESTIMATE";
  contribution: "RAISES" | "NEUTRAL";
};

export type RiskAssessment = {
  districtCode: string;
  level: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  score: number;
  factors: RiskFactor[];
  explanation: string;
  sourceClass: "MODEL_RISK_ESTIMATE";
  model: string;
  generatedAt: string;
  weatherAvailable: boolean;
  riverDistanceKm: number | null;
  nearestRiver: string | null;
  disclaimer: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
};

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export function nearestRiver(centroid: { lat: number; lng: number }) {
  let best: { name: string; km: number } | null = null;
  for (const river of RIVERS) {
    for (const point of river.points) {
      const km = haversineKm(centroid, { lat: point[1], lng: point[0] });
      if (!best || km < best.km) best = { name: river.name, km };
    }
  }
  return best;
}

export type RiskIncidentInput = {
  category: string;
  status: string;
  createdAt: string | Date;
  dataClass?: string;
};

const COASTAL = new Set(["TN-CHN", "TN-CGL", "TN-KCH", "TN-TVL", "TN-CDL", "TN-NGP", "TN-MYL", "TN-TVR", "TN-TNJ", "TN-RMD", "TN-TUT", "TN-KKI"]);
const HILLY = new Set(["TN-NLG", "TN-THI", "TN-DGL", "TN-KKI"]);

export function estimateFloodRisk(input: {
  district: DistrictSeed;
  weather: WeatherSnapshot;
  incidents: RiskIncidentInput[];
  assignedTeamCount?: number;
}): RiskAssessment {
  const { district, weather, incidents } = input;
  const factors: RiskFactor[] = [];
  const since = Date.now() - 48 * 60 * 60 * 1000;
  const recentWater = incidents.filter(
    (i) =>
      ["WATERLOGGING", "FLOODING", "LANDSLIDE"].includes(i.category) &&
      new Date(i.createdAt).getTime() >= since &&
      i.status !== "REJECTED",
  );
  const verifiedWater = recentWater.filter((i) => i.status === "VERIFIED" || i.status === "RESOLVED").length;
  const pendingWater = recentWater.length - verifiedWater;

  if (weather.available && weather.next24hRainfall !== null) {
    const rain = weather.next24hRainfall;
    let points = 0;
    if (rain >= 60) points = 34;
    else if (rain >= 30) points = 24;
    else if (rain >= 10) points = 14;
    else if (rain >= 2) points = 6;
    factors.push({
      id: "forecast_rainfall",
      label: `Forecast rainfall next 24h: ${rain.toFixed(1)} mm`,
      detail: `${rain >= 30 ? "Heavy" : rain >= 10 ? "Moderate" : "Light"} forecast accumulation from Open-Meteo. Forecast input, not an official warning.`,
      points,
      sourceClass: "FORECAST",
      contribution: points > 0 ? "RAISES" : "NEUTRAL",
    });
  } else {
    factors.push({
      id: "forecast_rainfall",
      label: "Forecast rainfall unavailable",
      detail: weather.error ?? "The weather provider could not be reached. No rainfall points were added.",
      points: 0,
      sourceClass: "FORECAST",
      contribution: "NEUTRAL",
    });
  }

  if (weather.available && weather.current) {
    const now = weather.current.precipitation;
    const points = now >= 7.5 ? 12 : now >= 2 ? 7 : now > 0 ? 3 : 0;
    factors.push({
      id: "observed_rainfall",
      label: `Observed rainfall now: ${now.toFixed(1)} mm`,
      detail: "Current precipitation at the district reference point from Open-Meteo.",
      points,
      sourceClass: "OBSERVED",
      contribution: points > 0 ? "RAISES" : "NEUTRAL",
    });
  }

  const reportPoints = Math.min(30, verifiedWater * 15 + pendingWater * 6);
  factors.push({
    id: "community_reports",
    label: `${recentWater.length} flood/waterlogging report(s) in the last 48h`,
    detail: `${verifiedWater} administrator-verified, ${pendingWater} awaiting review. Unverified citizen reports contribute fewer points and never verify an incident.`,
    points: reportPoints,
    sourceClass: "COMMUNITY_REPORT",
    contribution: reportPoints > 0 ? "RAISES" : "NEUTRAL",
  });

  const river = nearestRiver({ lat: district.lat, lng: district.lng });
  const riverPoints = river ? (river.km <= 12 ? 16 : river.km <= 25 ? 9 : river.km <= 40 ? 4 : 0) : 0;
  factors.push({
    id: "river_proximity",
    label: river ? `Nearest mapped waterway: ${river.name} (~${river.km} km)` : "No mapped waterway within the schematic layer",
    detail:
      "Distance is measured from the district reference point to a schematic river centerline. Proximity alone does not make an area an officially assessed flood-prone zone.",
    points: riverPoints,
    sourceClass: "MODEL_RISK_ESTIMATE",
    contribution: riverPoints > 0 ? "RAISES" : "NEUTRAL",
  });

  let terrainPoints = 0;
  const terrainNotes: string[] = [];
  if (district.region === "Delta") {
    terrainPoints += 10;
    terrainNotes.push("delta/low-lying coastal plain heuristic");
  }
  if (COASTAL.has(district.code)) {
    terrainPoints += 5;
    terrainNotes.push("coastal district heuristic");
  }
  if (HILLY.has(district.code)) {
    terrainPoints += 6;
    terrainNotes.push("hilly terrain heuristic (rain-triggered runoff/landslide sensitivity)");
  }
  factors.push({
    id: "terrain_prior",
    label: terrainNotes.length ? `Geographic heuristic: ${terrainNotes.join(", ")}` : "No terrain pre-disposition applied",
    detail:
      "MODEL_RISK_ESTIMATE prior derived from district classification (delta / coastal / hilly). This is a transparent heuristic, not a government flood hazard assessment.",
    points: terrainPoints,
    sourceClass: "MODEL_RISK_ESTIMATE",
    contribution: terrainPoints > 0 ? "RAISES" : "NEUTRAL",
  });

  const score = factors.reduce((sum, f) => sum + f.points, 0);
  const level: RiskAssessment["level"] = score >= 62 ? "VERY_HIGH" : score >= 40 ? "HIGH" : score >= 20 ? "MODERATE" : "LOW";
  const leaders = [...factors].filter((f) => f.points > 0).sort((a, b) => b.points - a.points);
  const explanation =
    leaders.length === 0
      ? `No rainfall, report or terrain input currently raises the heuristic score for ${district.name}; the estimate remains LOW.`
      : `Score ${score}/100 places ${district.name} at ${level.replace("_", " ")} in this heuristic model. Main contributors: ${leaders
          .slice(0, 3)
          .map((f) => `${f.label} (+${f.points})`)
          .join("; ")}.`;

  return {
    districtCode: district.code,
    level,
    score,
    factors,
    explanation,
    sourceClass: "MODEL_RISK_ESTIMATE",
    model: "DisasterLink Flood Risk Heuristic v1 (transparent weighted scoring)",
    generatedAt: new Date().toISOString(),
    weatherAvailable: weather.available,
    riverDistanceKm: river?.km ?? null,
    nearestRiver: river?.name ?? null,
    disclaimer: RISK_DISCLAIMER,
    confidence: weather.available ? (recentWater.length > 0 ? "HIGH" : "MEDIUM") : "LOW",
  };
}

export function riskToSeverity(level: RiskAssessment["level"]): Severity {
  return level === "VERY_HIGH" ? "CRITICAL" : level === "HIGH" ? "HIGH" : level === "MODERATE" ? "MODERATE" : "LOW";
}
