import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { incidents, sosRequests } from "@/db/schema";
import { analyzeIncident, buildSituationReport, summarizeDistrictActivity } from "@/lib/ai";
import { ApiError, handleError, ok, oneOf, readJson, requireRole, str } from "@/lib/api";
import { AI_MODEL } from "@/lib/constants";
import { districtByCode } from "@/lib/districts";
import { getAnalytics, getCommandOverview, getDistrictIntelligence } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok({
    model: AI_MODEL,
    modes: ["classify", "district-summary", "sitrep"],
    capabilities: [
      "Incident classification suggestions",
      "Severity suggestion for administrator review",
      "Duplicate report detection",
      "Long report summarisation",
      "District activity summary",
      "Administrative situation report draft",
    ],
    limits: [
      "Never verifies an incident",
      "Never issues an official alert",
      "Never dispatches a response team",
      "Runs offline as a deterministic heuristic model — no external LLM is called",
    ],
  });
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const mode = oneOf(body.mode, ["classify", "district-summary", "sitrep"] as const, "Mode");

    if (mode === "classify") {
      const description = str(body.description, "Description", { min: 12, max: 3000 });
      const districtCode = str(body.districtCode, "District", { optional: true, max: 12 }).toUpperCase();
      if (districtCode && !districtByCode(districtCode)) throw new ApiError("Unknown district", 422);
      const existing = districtCode
        ? await db
            .select()
            .from(incidents)
            .where(inArray(incidents.status, ["PENDING", "UNDER_REVIEW", "VERIFIED"]))
            .orderBy(desc(incidents.createdAt))
            .limit(40)
        : [];
      const analysis = analyzeIncident({
        description,
        districtCode,
        existing: existing.filter((e) => !districtCode || e.districtCode === districtCode),
      });
      return ok({ analysis, model: AI_MODEL });
    }

    if (mode === "district-summary") {
      const districtCode = str(body.districtCode, "District", { max: 12 }).toUpperCase();
      const intelligence = await getDistrictIntelligence(districtCode);
      if (!intelligence) throw new ApiError("Unknown district", 404);
      const summary = summarizeDistrictActivity({
        districtName: intelligence.district.name,
        incidents: intelligence.incidents,
        openSos: intelligence.sosCounts.open,
        riskLevel: intelligence.risk.level,
      });
      return ok({ summary, model: AI_MODEL });
    }

    await requireRole(["ADMIN", "SUPER_ADMIN"]);
    const [overview, analytics, sosRows] = await Promise.all([getCommandOverview(), getAnalytics(), db.select().from(sosRequests)]);
    const report = buildSituationReport({
      generatedFor: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      totals: {
        total: overview.totals.total,
        pending: overview.totals.pending,
        verified: overview.totals.verified,
        resolved: overview.totals.resolved,
        rejected: overview.totals.rejected,
      },
      districts: overview.board.map((b) => ({ name: b.name, incidents: b.incidents.total, verified: b.incidents.verified, risk: b.risk.level })),
      openSos: sosRows.filter((s) => s.status !== "RESOLVED").length,
      teamsAvailable: overview.totals.teamsAvailable,
      urgentIncidents: overview.recentIncidents
        .filter((i) => i.status === "PENDING" || i.status === "UNDER_REVIEW")
        .map((i) => ({
          publicId: i.publicId,
          category: i.category,
          district: districtByCode(i.districtCode)?.name ?? i.districtCode,
          severity: i.assessedSeverity ?? i.aiSeverity ?? i.reportedSeverity,
        })),
    });
    return ok({ report, analyticsSummary: analytics.byStatus, model: AI_MODEL });
  } catch (error) {
    return handleError(error);
  }
}
