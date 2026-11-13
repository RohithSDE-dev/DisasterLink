import { randomBytes } from "node:crypto";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { incidentEvents, incidents } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { getSessionUser } from "@/lib/auth";
import { generateTrackingCode, hashTrackingCode } from "@/lib/citizen";
import { validateImageDataUrl } from "@/lib/image";
import { analyzeIncident } from "@/lib/ai";
import { ApiError, handleError, num, ok, oneOf, readJson, requireRole, str } from "@/lib/api";
import { CATEGORY_LABELS, INCIDENT_CATEGORIES, INCIDENT_STATUSES, SEVERITIES, SEVERITY_TONE } from "@/lib/constants";
import { districtByCode } from "@/lib/districts";

export const dynamic = "force-dynamic";

function publicIncident(row: typeof incidents.$inferSelect) {
  return {
    id: row.id,
    publicId: row.publicId,
    category: row.category,
    description: row.description,
    districtCode: row.districtCode,
    locationName: row.locationName,
    lat: row.lat,
    lng: row.lng,
    reportedSeverity: row.reportedSeverity,
    assessedSeverity: row.assessedSeverity,
    status: row.status,
    dataClass: row.dataClass,
    photoUrl: row.photoUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    verifiedAt: row.verifiedAt,
    resolvedAt: row.resolvedAt,
  };
}

export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "public";
    const district = url.searchParams.get("district");
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status");
    const severity = url.searchParams.get("severity");
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 500);

    let isAdmin = false;
    if (scope === "admin") {
      await requireRole(["OFFICER", "ADMIN", "SUPER_ADMIN"]);
      isAdmin = true;
    }

    const rows = await db.select().from(incidents).orderBy(desc(incidents.createdAt));
    const filtered = rows.filter((row) => {
      if (!isAdmin && !["VERIFIED", "RESOLVED"].includes(row.status)) return false;
      if (district && row.districtCode !== district) return false;
      if (category && row.category !== category) return false;
      if (status && row.status !== status) return false;
      if (severity && (row.assessedSeverity ?? row.reportedSeverity) !== severity) return false;
      if (q && !`${row.publicId} ${row.description} ${row.locationName}`.toLowerCase().includes(q)) return false;
      return true;
    });

    const counts = {
      total: rows.length,
      pending: rows.filter((r) => r.status === "PENDING").length,
      underReview: rows.filter((r) => r.status === "UNDER_REVIEW").length,
      verified: rows.filter((r) => r.status === "VERIFIED").length,
      rejected: rows.filter((r) => r.status === "REJECTED").length,
      resolved: rows.filter((r) => r.status === "RESOLVED").length,
      simulated: rows.filter((r) => r.dataClass === "SIMULATED").length,
    };

    const records = filtered.slice(0, limit).map((row) =>
      isAdmin
        ? {
            ...row,
            contactName: row.contactName,
            contactPhone: row.contactPhone,
            districtName: districtByCode(row.districtCode)?.name ?? row.districtCode,
            categoryLabel: CATEGORY_LABELS[row.category] ?? row.category,
            severity: row.assessedSeverity ?? row.reportedSeverity,
            severityTone: SEVERITY_TONE[row.assessedSeverity ?? row.reportedSeverity] ?? "",
          }
        : {
            ...publicIncident(row),
            districtName: districtByCode(row.districtCode)?.name ?? row.districtCode,
            categoryLabel: CATEGORY_LABELS[row.category] ?? row.category,
          },
    );

    return ok({ incidents: records, counts, scope: isAdmin ? "admin" : "public" });
  } catch (error) {
    return handleError(error);
  }
}

const TN_BOX = { minLat: 7.8, maxLat: 14.0, minLng: 75.8, maxLng: 80.9 };

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = await readJson(request);
    const category = oneOf(body.category, INCIDENT_CATEGORIES, "Category");
    const description = str(body.description, "Description", { min: 15, max: 2000 });
    const districtCode = str(body.districtCode, "District", { max: 12 }).toUpperCase();
    const district = districtByCode(districtCode);
    if (!district) throw new ApiError("Unknown district code", 422);
    const locationName = str(body.locationName, "Location description", { min: 3, max: 240 });
    const reportedSeverity = oneOf(body.reportedSeverity ?? "MODERATE", SEVERITIES, "Reported severity");
    const lat = num(body.lat, "Latitude", { optional: true, min: TN_BOX.minLat, max: TN_BOX.maxLat });
    const lng = num(body.lng, "Longitude", { optional: true, min: TN_BOX.minLng, max: TN_BOX.maxLng });
    const contactName = str(body.contactName, "Contact name", { optional: true, max: 120 });
    const contactPhone = str(body.contactPhone, "Contact phone", { optional: true, max: 20 });
    if (contactPhone && !/^[0-9+\s-]{6,20}$/.test(contactPhone)) {
      throw new ApiError("Contact phone must contain only digits, spaces, + or -", 422);
    }
    if (lat !== null && lng === null) throw new ApiError("Both latitude and longitude are required together", 422);
    let photoUrl: string | null = null;
    if (body.photoUrl !== undefined && body.photoUrl !== null && body.photoUrl !== "") {
      const image = validateImageDataUrl(body.photoUrl);
      if (!image.ok) throw new ApiError(image.error, 422);
      photoUrl = image.dataUrl;
    }

    const existing = await db
      .select()
      .from(incidents)
      .where(inArray(incidents.status, ["PENDING", "UNDER_REVIEW", "VERIFIED"]))
      .orderBy(desc(incidents.createdAt))
      .limit(60);
    const analysis = analyzeIncident({
      description,
      districtCode,
      reportedSeverity,
      existing: existing.filter((e) => e.districtCode === districtCode),
    });

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const publicId = `INC-${stamp}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const trackingCode = generateTrackingCode();
    const sessionUser = await getSessionUser().catch(() => null);

    const inserted = await db
      .insert(incidents)
      .values({
        publicId,
        category,
        description,
        districtCode,
        locationName,
        lat,
        lng,
        reportedSeverity,
        status: "PENDING",
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        photoUrl,
        dataClass: "COMMUNITY_REPORT",
        aiCategory: analysis.category,
        aiSeverity: analysis.severitySuggestion,
        aiSummary: analysis.summary,
        aiDuplicateOf: analysis.duplicate?.publicId ?? null,
        aiConfidence: analysis.categoryConfidence,
        reporterUserId: sessionUser?.id ?? null,
        trackingCodeHash: hashTrackingCode(trackingCode),
      })
      .returning();

    const incident = inserted[0];
    await db.insert(incidentEvents).values({
      incidentId: incident.id,
      action: "CREATED",
      toStatus: "PENDING",
      note: "Citizen report submitted. Awaiting administrator review. Community reports are not verified automatically.",
      actorName: contactName || sessionUser?.name || "Citizen reporter",
      actorRole: "CITIZEN",
    });

    return ok(
      {
        incident: publicIncident(incident),
        analysis,
        tracking: {
          publicId,
          trackingCode,
          linkedToAccount: Boolean(sessionUser),
          link: `/track?id=${encodeURIComponent(publicId)}&type=INCIDENT&code=${encodeURIComponent(trackingCode)}`,
        },
        trackingNote:
          "Save your incident ID and tracking code. The code is shown once — it unlocks the private status page for this report and cannot be recovered.",
      },
      201,
      "Report submitted successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}

export { INCIDENT_STATUSES };
