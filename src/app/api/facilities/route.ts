import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities } from "@/db/schema";
import { ApiError, fail, handleError, num, ok, oneOf, readJson, requireRole, str, writeAudit } from "@/lib/api";
import { FACILITY_CATEGORIES, VERIFICATION_CLASSES } from "@/lib/constants";
import { districtByCode } from "@/lib/districts";
import { getFacilities } from "@/lib/queries";

export const dynamic = "force-dynamic";

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * radius * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rows = await getFacilities({
      district: url.searchParams.get("district") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      includeInactive: url.searchParams.get("includeInactive") === "1",
    });
    const lat = url.searchParams.get("lat") ? Number(url.searchParams.get("lat")) : null;
    const lng = url.searchParams.get("lng") ? Number(url.searchParams.get("lng")) : null;
    const origin = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

    const mapped = rows.map((row) => ({
      ...row,
      districtName: districtByCode(row.districtCode)?.name ?? row.districtCode,
      distanceKm: origin && row.lat !== null && row.lng !== null ? haversineKm(origin, { lat: row.lat, lng: row.lng }) : null,
      isVerified: row.verificationStatus === "VERIFIED",
    }));

    const shelters = mapped
      .filter((row) => row.category === "SHELTER" || row.isOfficialShelter)
      .map((row) => ({
        id: row.id,
        name: row.name,
        districtCode: row.districtCode,
        districtName: row.districtName,
        address: row.address,
        lat: row.lat,
        lng: row.lng,
        capacity: row.capacity,
        occupancy: row.occupancy,
        remaining: row.capacity !== null && row.occupancy !== null ? Math.max(0, row.capacity - row.occupancy) : null,
        availabilityStatus: row.availabilityStatus,
        capacityDataClass: row.capacityDataClass,
        isOfficialShelter: row.isOfficialShelter,
        isActive: row.isActive,
        dataClass: row.dataClass,
        verificationStatus: row.verificationStatus,
        updatedAt: row.updatedAt,
        distanceKm: row.distanceKm,
        availabilityNote: row.availabilityNote,
      }))
      .sort((a, b) => {
        if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
        return (b.remaining ?? 0) - (a.remaining ?? 0);
      });

    return ok({
      facilities: mapped,
      categories: FACILITY_CATEGORIES,
      shelters,
      counts: {
        total: mapped.length,
        verified: mapped.filter((row) => row.isVerified).length,
        candidate: mapped.filter((row) => !row.isVerified).length,
        shelters: shelters.length,
        sheltersWithCapacity: shelters.filter((row) => row.capacity !== null).length,
      },
      location: origin,
      disclosure:
        "Facility records are directory candidates unless marked VERIFIED. Bed counts, medicine stock and supplies are never displayed unless an administrator records a confirmed update with a timestamp. Phone numbers appear only when recorded by an administrator.",
    }, undefined, "Facilities retrieved successfully");
  } catch (error) {
    return handleError(error);
  }
}

function parseFacilityBody(body: Record<string, unknown>) {
  const districtCode = str(body.districtCode, "District", { max: 12 }).toUpperCase();
  if (!districtByCode(districtCode)) throw new ApiError("Unknown district code", 422);
  const isOfficialShelter = Boolean(body.isOfficialShelter) || body.category === "SHELTER";
  const sourceUrl = str(body.sourceUrl, "Source URL", { optional: true, max: 500 });
  if (isOfficialShelter && !sourceUrl) {
    throw new ApiError("An official shelter requires a source URL supporting the designation", 422);
  }
  return {
    name: str(body.name, "Facility name", { max: 200 }),
    category: oneOf(body.category, FACILITY_CATEGORIES, "Category"),
    districtCode,
    address: str(body.address, "Address", { optional: true, max: 300 }),
    lat: num(body.lat, "Latitude", { optional: true, min: 7.8, max: 14 }),
    lng: num(body.lng, "Longitude", { optional: true, min: 75.8, max: 80.9 }),
    phone: str(body.phone, "Phone", { optional: true, max: 30 }),
    sourceName: str(body.sourceName, "Source name", { max: 200 }),
    sourceUrl,
    verificationStatus: oneOf(body.verificationStatus ?? "CANDIDATE", VERIFICATION_CLASSES, "Verification status"),
    availabilityNote: str(body.availabilityNote, "Availability note", { optional: true, max: 400 }),
    isOfficialShelter,
    shelterDesignation: str(body.shelterDesignation, "Shelter designation", { optional: true, max: 200 }),
    facilityClass: oneOf(body.facilityClass ?? "UNKNOWN", ["GOVERNMENT", "PRIVATE", "NGO", "UNKNOWN"] as const, "Facility class"),
    availabilityStatus: oneOf(
      body.availabilityStatus ?? "UNKNOWN",
      ["AVAILABLE", "LIMITED", "FULL", "CLOSED", "UNKNOWN"] as const,
      "Availability status",
    ),
    capacity: num(body.capacity, "Capacity", { optional: true, min: 0, max: 1_000_000 }),
    occupancy: num(body.occupancy, "Occupancy", { optional: true, min: 0, max: 1_000_000 }),
    capacityDataClass: oneOf(
      body.capacityDataClass ?? "UNVERIFIED",
      ["VERIFIED", "SIMULATED", "UNVERIFIED"] as const,
      "Capacity data class",
    ),
  };
}

export async function POST(request: Request) {
  try {
    const actor = await requireRole(["ADMIN", "SUPER_ADMIN"]);
    const body = await readJson(request);
    const values = parseFacilityBody(body);
    const inserted = await db
      .insert(facilities)
      .values({
        ...values,
        sourceClass: "COMMUNITY_REPORT",
        availabilityConfirmedAt: values.availabilityNote ? new Date() : null,
        dataClass: "CANDIDATE",
        isActive: true,
      })
      .returning();
    await writeAudit({
      actor,
      action: "FACILITY_CREATED",
      entityType: "FACILITY",
      entityId: inserted[0].id,
      summary: `Facility "${values.name}" created in ${districtByCode(values.districtCode)?.name}`,
      details: { verificationStatus: values.verificationStatus, isOfficialShelter: values.isOfficialShelter },
    });
    return ok({ facility: inserted[0] }, 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireRole(["ADMIN", "SUPER_ADMIN"]);
    const body = await readJson(request);
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new ApiError("Facility id is required", 422);
    const rows = await db.select().from(facilities).where(eq(facilities.id, id)).limit(1);
    const facility = rows[0];
    if (!facility) return fail("Facility not found", 404);

    const update: Partial<typeof facilities.$inferInsert> = { updatedAt: new Date() };
    const changes: string[] = [];
    if (body.verificationStatus) {
      update.verificationStatus = oneOf(body.verificationStatus, VERIFICATION_CLASSES, "Verification status");
      changes.push(`verification → ${update.verificationStatus}`);
    }
    if (body.isActive !== undefined) {
      update.isActive = Boolean(body.isActive);
      changes.push(update.isActive ? "activated" : "deactivated");
    }
    if (body.name !== undefined) update.name = str(body.name, "Facility name", { max: 200 });
    if (body.address !== undefined) update.address = str(body.address, "Address", { optional: true, max: 300 });
    if (body.phone !== undefined) update.phone = str(body.phone, "Phone", { optional: true, max: 30 });
    if (body.availabilityNote !== undefined) {
      update.availabilityNote = str(body.availabilityNote, "Availability note", { optional: true, max: 400 });
      update.availabilityConfirmedAt = update.availabilityNote ? new Date() : null;
      changes.push(update.availabilityNote ? "availability recorded" : "availability cleared");
    }
    if (body.isOfficialShelter !== undefined) {
      const official = Boolean(body.isOfficialShelter);
      const sourceUrl = str(body.sourceUrl, "Source URL", { optional: true, max: 500 }) || facility.sourceUrl;
      if (official && !sourceUrl) throw new ApiError("An official shelter requires a source URL supporting the designation", 422);
      update.isOfficialShelter = official;
      update.sourceUrl = sourceUrl;
      update.shelterDesignation = str(body.shelterDesignation, "Shelter designation", { optional: true, max: 200 }) || null;
      changes.push(official ? "marked as official shelter" : "official shelter flag removed");
    }
    if (body.category !== undefined) update.category = oneOf(body.category, FACILITY_CATEGORIES, "Category");
    if (body.lat !== undefined) update.lat = num(body.lat, "Latitude", { optional: true, min: 7.8, max: 14 });
    if (body.lng !== undefined) update.lng = num(body.lng, "Longitude", { optional: true, min: 75.8, max: 80.9 });
    if (body.facilityClass !== undefined) {
      update.facilityClass = oneOf(body.facilityClass, ["GOVERNMENT", "PRIVATE", "NGO", "UNKNOWN"] as const, "Facility class");
      changes.push(`class → ${update.facilityClass}`);
    }
    if (body.availabilityStatus !== undefined) {
      update.availabilityStatus = oneOf(
        body.availabilityStatus,
        ["AVAILABLE", "LIMITED", "FULL", "CLOSED", "UNKNOWN"] as const,
        "Availability status",
      );
      changes.push(`availability → ${update.availabilityStatus}`);
    }
    if (body.capacity !== undefined || body.occupancy !== undefined) {
      const capacity = body.capacity !== undefined ? num(body.capacity, "Capacity", { optional: true, min: 0, max: 1_000_000 }) : facility.capacity;
      const occupancy = body.occupancy !== undefined ? num(body.occupancy, "Occupancy", { optional: true, min: 0, max: 1_000_000 }) : facility.occupancy;
      if (capacity !== null && occupancy !== null && occupancy > capacity) {
        throw new ApiError("Occupancy cannot exceed the recorded capacity", 422);
      }
      if (body.capacity !== undefined) update.capacity = capacity;
      if (body.occupancy !== undefined) update.occupancy = occupancy;
      update.capacityDataClass = oneOf(
        body.capacityDataClass ?? "VERIFIED",
        ["VERIFIED", "SIMULATED", "UNVERIFIED"] as const,
        "Capacity data class",
      );
      changes.push(`capacity/occupancy → ${capacity ?? "—"}/${occupancy ?? "—"} (${update.capacityDataClass})`);
    }

    if (!changes.length && Object.keys(update).length <= 1) throw new ApiError("No supported fields supplied", 422);

    const updated = await db.update(facilities).set(update).where(eq(facilities.id, id)).returning();
    await writeAudit({
      actor,
      action: "FACILITY_UPDATED",
      entityType: "FACILITY",
      entityId: id,
      summary: `Facility "${facility.name}" updated: ${changes.join(", ") || "details edited"}`,
      details: { changes },
    });
    return ok({ facility: updated[0] });
  } catch (error) {
    return handleError(error);
  }
}
