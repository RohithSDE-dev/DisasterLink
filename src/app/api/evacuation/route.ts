import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilities as facilitiesTable, incidents as incidentsTable } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { handleError, ok } from "@/lib/api";
import { districtByCode } from "@/lib/districts";
import { EVACUATION_DISCLAIMER, assessCorridors, suggestShelters, type HazardIncident } from "@/lib/evacuation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const url = new URL(request.url);
    const district = url.searchParams.get("district") ?? undefined;
    const lat = url.searchParams.get("lat") ? Number(url.searchParams.get("lat")) : undefined;
    const lng = url.searchParams.get("lng") ? Number(url.searchParams.get("lng")) : undefined;

    const [incidentRows, facilityRows] = await Promise.all([
      db
        .select()
        .from(incidentsTable)
        .where(inArray(incidentsTable.status, ["PENDING", "UNDER_REVIEW", "VERIFIED", "RESOLVED"]))
        .orderBy(desc(incidentsTable.updatedAt))
        .limit(400),
      db.select().from(facilitiesTable).where(eq(facilitiesTable.isActive, true)),
    ]);

    const hazards: HazardIncident[] = incidentRows.map((row) => ({
      publicId: row.publicId,
      category: row.category,
      status: row.status,
      locationName: row.locationName,
      lat: row.lat,
      lng: row.lng,
      assessedSeverity: row.assessedSeverity,
      reportedSeverity: row.reportedSeverity,
      dataClass: row.dataClass,
      districtCode: row.districtCode,
    }));

    const centre = districtByCode(district);
    const origin = lat !== undefined && lng !== undefined ? { lat, lng } : centre ? { lat: centre.lat, lng: centre.lng } : undefined;
    const allCorridors = assessCorridors(hazards, (code) => districtByCode(code)?.name ?? code);
    const corridors = allCorridors
      .map((corridor) => ({ ...corridor, matchesDistrict: district ? corridor.districtNames.includes(districtByCode(district)?.name ?? "") : true }))
      .sort((a, b) => Number(b.matchesDistrict) - Number(a.matchesDistrict));
    const shelters = suggestShelters(facilityRows, { districtCode: district, lat: origin?.lat, lng: origin?.lng, limit: 10 }).map((shelter) => ({
      ...shelter,
      districtName: districtByCode(shelter.districtCode)?.name ?? shelter.districtCode,
    }));

    const blockages = hazards
      .filter((hazard) => ["ROAD_BLOCKAGE", "FLOODING", "WATERLOGGING", "LANDSLIDE", "FALLEN_TREE"].includes(hazard.category))
      .filter((hazard) => !district || hazard.districtCode === district)
      .slice(0, 12)
      .map((hazard) => ({
        ...hazard,
        districtName: districtByCode(hazard.districtCode)?.name ?? hazard.districtCode,
        severity: hazard.assessedSeverity ?? hazard.reportedSeverity,
        verified: hazard.status === "VERIFIED" || hazard.status === "RESOLVED",
      }));

    const newestUpdate = incidentRows.reduce<string | null>((latest, row) => {
      const value = new Date(row.updatedAt).toISOString();
      return !latest || value > latest ? value : latest;
    }, null);

    return ok(
      {
        corridors,
        shelters,
        blockages,
        freshness: { incidentDataUpdatedAt: newestUpdate, shelterDataUpdatedAt: new Date().toISOString(), origin: origin ?? null },
        disclaimer: EVACUATION_DISCLAIMER,
        dataClass: "SIMULATED",
        coverageNote:
          "Corridors are schematic planning examples for Tamil Nadu districts. Shelters listed as SIMULATED are demonstration records and are not official government shelters.",
      },
      undefined,
      "Evacuation assistance retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}
