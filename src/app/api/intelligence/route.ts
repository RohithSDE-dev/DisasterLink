import { desc } from "drizzle-orm";
import { db } from "@/db";
import { incidents as incidentsTable } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { handleError, ok } from "@/lib/api";
import { AI_MODEL, RISK_DISCLAIMER } from "@/lib/constants";
import { districtByCode } from "@/lib/districts";
import { clusterIncidents, estimateResourceDemand, historicalComparison, rainfallTrends, type AnalysisIncident } from "@/lib/analysis";
import { getDistrictBoard } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const url = new URL(request.url);
    const district = url.searchParams.get("district")?.toUpperCase();
    const board = await getDistrictBoard();
    const rows = await db.select().from(incidentsTable).orderBy(desc(incidentsTable.createdAt)).limit(600);

    const incidents: AnalysisIncident[] = rows.map((row) => ({
      publicId: row.publicId,
      category: row.category,
      status: row.status,
      districtCode: row.districtCode,
      locationName: row.locationName,
      lat: row.lat,
      lng: row.lng,
      reportedSeverity: row.reportedSeverity,
      assessedSeverity: row.assessedSeverity,
      dataClass: row.dataClass,
      createdAt: row.createdAt,
    }));

    const scoped = district ? incidents.filter((incident) => incident.districtCode === district) : incidents;
    const scopedBoard = district ? board.filter((entry) => entry.code === district) : board;
    const nameOf = (code: string) => districtByCode(code)?.name ?? code;

    return ok(
      {
        scope: district ? { type: "DISTRICT", code: district, name: nameOf(district) } : { type: "STATE" },
        model: AI_MODEL,
        sourceClass: "MODEL_RISK_ESTIMATE",
        riskRanking: [...scopedBoard]
          .sort((a, b) => b.risk.score - a.risk.score)
          .slice(0, 12)
          .map((entry) => ({
            code: entry.code,
            name: entry.name,
            level: entry.risk.level,
            score: entry.risk.score,
            explanation: entry.risk.explanation,
            factors: entry.risk.factors.filter((factor) => factor.points > 0),
            confidence: entry.risk.confidence,
          })),
        rainfall: rainfallTrends(scopedBoard).slice(0, 15),
        clusters: clusterIncidents(scoped, nameOf),
        resourceDemand: estimateResourceDemand(scoped, nameOf),
        history: historicalComparison(scoped),
        statistics: {
          reports: scoped.length,
          verified: scoped.filter((incident) => ["VERIFIED", "RESOLVED"].includes(incident.status)).length,
          pending: scoped.filter((incident) => ["PENDING", "UNDER_REVIEW"].includes(incident.status)).length,
          simulated: scoped.filter((incident) => incident.dataClass === "SIMULATED").length,
          districtsMonitored: scopedBoard.length,
        },
        labels: {
          observed: "Current weather measurements from Open-Meteo",
          forecast: "Provider forecast for the next hours/days",
          modelRisk: "DisasterLink heuristic — not an official hazard assessment",
          officialWarning: "Not ingested in this prototype; published notices are attributed to their officer",
          communityReport: "Citizen submissions, unverified until administrator review",
          simulated: "Demonstration records, badged throughout the platform",
        },
        disclaimer: RISK_DISCLAIMER,
        advisory: "AI-assisted analysis for human review. It never verifies incidents, publishes warnings or dispatches resources.",
      },
      undefined,
      "Disaster intelligence computed successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}
