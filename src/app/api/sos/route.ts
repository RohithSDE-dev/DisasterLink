import { randomBytes } from "node:crypto";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { sosEvents, sosRequests, teams } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { getSessionUser } from "@/lib/auth";
import { generateTrackingCode, hashTrackingCode } from "@/lib/citizen";
import { sosTriage } from "@/lib/ai";
import { ApiError, handleError, num, ok, oneOf, readJson, requireRole, str } from "@/lib/api";
import { EMERGENCY_TYPES, SOS_DISCLAIMER, SOS_STATUSES } from "@/lib/constants";
import { districtByCode } from "@/lib/districts";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireRole(["OFFICER", "ADMIN", "SUPER_ADMIN"]);
    const canSeeContact = can(actor.role, "sos.view_contact");
    const url = new URL(request.url);
    const district = url.searchParams.get("district");
    const status = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const rows = await db.select().from(sosRequests).orderBy(desc(sosRequests.createdAt));
    const teamRows = await db.select().from(teams);
    const filtered = rows.filter((row) => {
      if (district && row.districtCode !== district) return false;
      if (status && row.status !== status) return false;
      if (priority && row.priority !== priority) return false;
      if (q && !`${row.publicId} ${row.description} ${row.locationName ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const safeRows = canSeeContact
      ? filtered
      : filtered.map((row) => ({ ...row, name: row.name ? "Restricted" : null, phone: null, lat: null, lng: null }));

    return ok({
      sos: safeRows,
      contactRedacted: !canSeeContact,
      capabilities: {
        acknowledge: can(actor.role, "sos.acknowledge"),
        assign: can(actor.role, "sos.assign"),
        resolve: can(actor.role, "sos.resolve"),
      },
      teams: teamRows,
      counts: {
        total: rows.length,
        submitted: rows.filter((r) => r.status === "SUBMITTED").length,
        open: rows.filter((r) => !["RESOLVED"].includes(r.status)).length,
        verified: rows.filter((r) => ["VERIFIED", "TEAM_ASSIGNED"].includes(r.status)).length,
        assigned: rows.filter((r) => r.status === "TEAM_ASSIGNED").length,
        resolved: rows.filter((r) => r.status === "RESOLVED").length,
        critical: rows.filter((r) => r.priority === "CRITICAL" && r.status !== "RESOLVED").length,
      },
      statuses: SOS_STATUSES,
      disclaimer: SOS_DISCLAIMER,
    });
  } catch (error) {
    return handleError(error);
  }
}

const TN_BOX = { minLat: 7.8, maxLat: 14.0, minLng: 75.8, maxLng: 80.9 };

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = await readJson(request);
    const emergencyType = oneOf(body.emergencyType ?? "OTHER", EMERGENCY_TYPES, "Emergency type");
    const description = str(body.description, "Emergency description", { min: 10, max: 1500 });
    const districtCode = str(body.districtCode, "District", { max: 12 }).toUpperCase();
    const district = districtByCode(districtCode);
    if (!district) throw new ApiError("Unknown district code", 422);
    const locationName = str(body.locationName, "Landmark / location", { optional: true, max: 240 });
    const lat = num(body.lat, "Latitude", { optional: true, min: TN_BOX.minLat, max: TN_BOX.maxLat });
    const lng = num(body.lng, "Longitude", { optional: true, min: TN_BOX.minLng, max: TN_BOX.maxLng });
    const name = str(body.name, "Name", { optional: true, max: 120 });
    const phone = str(body.phone, "Phone", { optional: true, max: 20 });
    if (phone && !/^[0-9+\s-]{6,20}$/.test(phone)) throw new ApiError("Phone must contain only digits, spaces, + or -", 422);
    const peopleAffected = body.peopleAffected === undefined || body.peopleAffected === "" ? null : Number(body.peopleAffected);
    if (peopleAffected !== null && (!Number.isInteger(peopleAffected) || peopleAffected < 0 || peopleAffected > 100000)) {
      throw new ApiError("People affected must be a whole number between 0 and 100000", 422);
    }

    const triage = sosTriage(description, emergencyType);
    const priority = triage.severity === "CRITICAL" ? "CRITICAL" : triage.severity === "HIGH" ? "HIGH" : triage.severity === "LOW" ? "LOW" : "NORMAL";
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const publicId = `SOS-${stamp}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const trackingCode = generateTrackingCode();
    const sessionUser = await getSessionUser().catch(() => null);

    const inserted = await db
      .insert(sosRequests)
      .values({
        publicId,
        emergencyType,
        description,
        districtCode,
        locationName: locationName || null,
        lat,
        lng,
        name: name || null,
        phone: phone || null,
        peopleAffected,
        status: "SUBMITTED",
        priority,
        aiSummary: triage.summary,
        aiSeverity: triage.severity,
        dataClass: "COMMUNITY_REPORT",
        reporterUserId: sessionUser?.id ?? null,
        trackingCodeHash: hashTrackingCode(trackingCode),
      })
      .returning();

    await db.insert(sosEvents).values({
      sosId: inserted[0].id,
      action: "CREATED",
      toStatus: "SUBMITTED",
      note: "SOS received by DisasterLink. No response team has been dispatched. An authorised administrator must review this request.",
      actorName: name || "Citizen",
      actorRole: "CITIZEN",
    });

    return ok(
      {
        sos: inserted[0],
        triage,
        disclaimer: SOS_DISCLAIMER,
        tracking: {
          publicId,
          trackingCode,
          linkedToAccount: Boolean(sessionUser),
          link: `/track?id=${encodeURIComponent(publicId)}&type=SOS&code=${encodeURIComponent(trackingCode)}`,
        },
        trackingNote:
          "Save your SOS ID and tracking code. The code is shown once — it unlocks the private status page. Submission does not guarantee dispatch.",
      },
      201,
      "SOS request submitted successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}
