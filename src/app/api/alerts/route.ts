import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { alertReads, alerts } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { getSessionUser } from "@/lib/auth";
import { ApiError, fail, handleError, ok, oneOf, readJson, requireRole, str, writeAudit } from "@/lib/api";
import { SEVERITIES } from "@/lib/constants";
import { districtByCode } from "@/lib/districts";

export const dynamic = "force-dynamic";

const ALERT_CATEGORIES = [
  "FLOOD_WARNING",
  "HEAVY_RAINFALL",
  "CYCLONE_WARNING",
  "LANDSLIDE_WARNING",
  "EXTREME_WEATHER",
  "ROAD_CLOSURE",
  "EVACUATION",
  "PUBLIC_SAFETY_NOTICE",
] as const;

const ALERT_CATEGORY_LABELS: Record<string, string> = {
  FLOOD_WARNING: "Flood warning",
  HEAVY_RAINFALL: "Heavy rainfall",
  CYCLONE_WARNING: "Cyclone warning",
  LANDSLIDE_WARNING: "Landslide warning",
  EXTREME_WEATHER: "Extreme weather",
  ROAD_CLOSURE: "Road closure",
  EVACUATION: "Emergency evacuation",
  PUBLIC_SAFETY_NOTICE: "Public safety notice",
};

export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const url = new URL(request.url);
    const district = url.searchParams.get("district");
    const requestedInactive = url.searchParams.get("includeInactive") === "1";
    // Retired/inactive notices are operational records; only command-centre
    // roles may list them. Citizens always receive active alerts only.
    if (requestedInactive) await requireRole(["OFFICER", "ADMIN", "SUPER_ADMIN"]);
    const includeInactive = requestedInactive;
    const rows = await db.select().from(alerts).orderBy(desc(alerts.createdAt));
    const user = await getSessionUser();
    const reads = user ? await db.select().from(alertReads).where(eq(alertReads.userId, user.id)) : [];
    const readIds = new Set(reads.map((row) => row.alertId));

    const filtered = rows.filter((row) => {
      if (!includeInactive && !row.isActive) return false;
      if (district && row.districtCode && row.districtCode !== district) return false;
      return true;
    });

    return ok(
      {
        alerts: filtered.map((row) => ({
          ...row,
          categoryLabel: ALERT_CATEGORY_LABELS[row.category] ?? row.category,
          districtName: row.districtCode ? districtByCode(row.districtCode)?.name ?? row.districtCode : "State-wide",
          read: user ? readIds.has(row.id) : null,
          expired: row.expiresAt ? new Date(row.expiresAt).getTime() < Date.now() : false,
        })),
        counts: {
          total: rows.length,
          active: rows.filter((row) => row.isActive).length,
          official: rows.filter((row) => row.sourceClass === "OFFICIAL_WARNING").length,
          simulated: rows.filter((row) => row.sourceClass === "SIMULATED" || row.isSimulated).length,
          unread: user ? rows.filter((row) => row.isActive && !readIds.has(row.id)).length : null,
        },
        categories: ALERT_CATEGORIES.map((value) => ({ value, label: ALERT_CATEGORY_LABELS[value] })),
        authenticated: Boolean(user),
        disclosure:
          "Warnings published inside DisasterLink are authorised prototype notices attributed to the publishing officer. They are not IMD/TNSDMA bulletins unless a source reference is supplied and verified.",
      },
      undefined,
      "Alerts retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRole(["ADMIN", "SUPER_ADMIN"]);
    const body = await readJson(request);

    if (body.action === "mark-read") {
      const alertId = Number(body.id);
      if (!Number.isInteger(alertId)) throw new ApiError("Alert id is required", 422);
      await db.insert(alertReads).values({ alertId, userId: actor.id }).onConflictDoNothing();
      return ok({ alertId, read: true }, undefined, "Alert marked as read");
    }

    const title = str(body.title, "Title", { min: 8, max: 200 });
    const summary = str(body.summary, "Summary", { min: 20, max: 1500 });
    const category = oneOf(body.category ?? "PUBLIC_SAFETY_NOTICE", ALERT_CATEGORIES, "Alert category");
    const severity = oneOf(body.severity ?? "MODERATE", SEVERITIES, "Severity");
    const districtCode = str(body.districtCode, "District", { optional: true, max: 12 }).toUpperCase();
    if (districtCode && !districtByCode(districtCode)) throw new ApiError("Unknown district code", 422);
    const sourceName = str(body.sourceName, "Source name", { min: 3, max: 200 });
    const sourceReference = str(body.sourceReference, "Source reference", { optional: true, max: 300 });
    const sourceClass = body.sourceClass === "OFFICIAL_WARNING" ? "OFFICIAL_WARNING" : "COMMUNITY_REPORT";
    if (sourceClass === "OFFICIAL_WARNING" && !sourceReference) {
      throw new ApiError("An official warning requires a source reference (bulletin number or official URL)", 422);
    }
    const instruction = str(body.instruction, "Public instruction", { optional: true, max: 800 });
    const expiresInHours = Number(body.expiresInHours ?? 12);
    if (!Number.isFinite(expiresInHours) || expiresInHours <= 0 || expiresInHours > 168) {
      throw new ApiError("Expiry must be between 1 and 168 hours", 422);
    }
    const sourceUrl = str(body.sourceUrl, "Source URL", { optional: true, max: 500 });

    const inserted = await db
      .insert(alerts)
      .values({
        title,
        summary,
        category,
        districtCode: districtCode || null,
        severity,
        instruction: instruction || null,
        sourceName,
        sourceUrl: sourceUrl || null,
        sourceReference: sourceReference || null,
        sourceClass,
        verification: "VERIFIED",
        publishedById: actor.id,
        publishedByName: `${actor.name} (${actor.role})`,
        isActive: true,
        isSimulated: false,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + expiresInHours * 3600 * 1000),
      })
      .returning();

    await writeAudit({
      actor,
      action: "ALERT_PUBLISHED",
      entityType: "ALERT",
      entityId: inserted[0].id,
      summary: `${sourceClass === "OFFICIAL_WARNING" ? "Official warning" : "Advisory"} published: ${title}`,
      details: { districtCode, severity, category, sourceReference },
    });

    return ok(inserted[0], 201, "Alert published successfully");
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireRole(["ADMIN", "SUPER_ADMIN"]);
    const body = await readJson(request);
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new ApiError("Alert id is required", 422);
    const rows = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
    const alert = rows[0];
    if (!alert) return fail("Alert not found", 404);
    const update: Partial<typeof alerts.$inferInsert> = {};
    if (body.isActive !== undefined) update.isActive = Boolean(body.isActive);
    if (body.expiresInHours !== undefined) {
      const hours = Number(body.expiresInHours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 168) throw new ApiError("Expiry must be between 1 and 168 hours", 422);
      update.expiresAt = new Date(Date.now() + hours * 3600 * 1000);
    }
    if (!Object.keys(update).length) throw new ApiError("No supported fields supplied", 422);
    const updated = await db.update(alerts).set(update).where(eq(alerts.id, id)).returning();
    await writeAudit({
      actor,
      action: "ALERT_UPDATED",
      entityType: "ALERT",
      entityId: id,
      summary: `Alert "${alert.title}" updated`,
      details: update,
    });
    return ok(updated[0], undefined, "Alert updated successfully");
  } catch (error) {
    return handleError(error);
  }
}
