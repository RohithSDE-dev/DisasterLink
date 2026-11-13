import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilities } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { handleError, ok } from "@/lib/api";
import { FACILITY_CATEGORIES } from "@/lib/constants";
import { districtByCode } from "@/lib/districts";
import { FACILITY_GROUPS, facilityGroupOf } from "@/lib/map-data";

export const dynamic = "force-dynamic";

/**
 * Map-optimised facility markers joined with district names and safety-zone
 * capacity. Only records with coordinates inside Tamil Nadu are returned.
 */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const url = new URL(request.url);
    const district = url.searchParams.get("district");
    const category = url.searchParams.get("category");
    const includeInactive = url.searchParams.get("includeInactive") === "1";

    const filters = [inArray(facilities.category, [...FACILITY_CATEGORIES])];
    if (district) filters.push(eq(facilities.districtCode, district.toUpperCase()));
    if (category) filters.push(eq(facilities.category, category.toUpperCase()));
    if (!includeInactive) filters.push(eq(facilities.isActive, true));

    const rows = await db
      .select()
      .from(facilities)
      .where(and(...filters))
      .orderBy(facilities.districtCode, facilities.name);

    const markers = rows
      .filter((row) => row.lat !== null && row.lng !== null)
      .map((row) => {
        const group = facilityGroupOf({
          category: row.category,
          facilityClass: row.facilityClass,
          isOfficialShelter: row.isOfficialShelter,
          name: row.name,
        });
        return {
          id: row.id,
          name: row.name,
          category: row.category,
          categoryLabel: row.category.replaceAll("_", " ").toLowerCase(),
          facilityClass: row.facilityClass,
          group,
          districtCode: row.districtCode,
          districtName: districtByCode(row.districtCode)?.name ?? row.districtCode,
          lat: row.lat,
          lng: row.lng,
          address: row.address,
          phone: row.phone,
          availabilityStatus: row.availabilityStatus,
          availabilityNote: row.availabilityNote,
          capacity: row.capacity,
          occupancy: row.occupancy,
          capacityDataClass: row.capacityDataClass,
          remaining: row.capacity !== null && row.occupancy !== null ? Math.max(0, row.capacity - row.occupancy) : null,
          verificationStatus: row.verificationStatus,
          isOfficialShelter: row.isOfficialShelter,
          isActive: row.isActive,
          dataClass: row.dataClass,
          sourceName: row.sourceName,
          sourceUrl: row.sourceUrl,
          updatedAt: row.updatedAt,
        };
      })
      .filter((marker) => marker.group !== null);

    const groupCounts = Object.fromEntries(FACILITY_GROUPS.map((group) => [group.id, markers.filter((marker) => marker.group === group.id).length]));

    return ok(
      {
        markers,
        groupCounts,
        total: markers.length,
        skippedWithoutCoordinates: rows.length - markers.length,
        groups: FACILITY_GROUPS,
        disclosure:
          "Marker records come from the DisasterLink facility database. Records whose capacity data class is SIMULATED are demonstration values and are badged as such in the map panels. Availability is recorded data, not a live feed.",
      },
      undefined,
      "Map facilities retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}
