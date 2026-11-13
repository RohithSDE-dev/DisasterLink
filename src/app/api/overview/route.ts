import { handleError, ok } from "@/lib/api";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { districtByCode } from "@/lib/districts";
import { getFacilities, getPublicOverview } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const district = url.searchParams.get("district") ?? "TN-CBE";
    const overview = await getPublicOverview(district);

    const [facilityRows, alertRows, user] = await Promise.all([
      getFacilities({ district }),
      db.select().from(alerts).where(eq(alerts.isActive, true)),
      getSessionUser().catch(() => null),
    ]);

    const shelters = facilityRows
      .filter((row) => row.category === "SHELTER" || row.isOfficialShelter)
      .map((row) => ({
        id: row.id,
        name: row.name,
        districtCode: row.districtCode,
        districtName: districtByCode(row.districtCode)?.name ?? row.districtCode,
        address: row.address,
        lat: row.lat,
        lng: row.lng,
        capacity: row.capacity,
        occupancy: row.occupancy,
        remaining: row.capacity !== null && row.occupancy !== null ? Math.max(0, row.capacity - row.occupancy) : null,
        availabilityStatus: row.availabilityStatus,
        capacityDataClass: row.capacityDataClass,
        updatedAt: row.updatedAt,
        isOfficialShelter: row.isOfficialShelter,
        isActive: row.isActive,
        dataClass: row.dataClass,
      }))
      .sort((a, b) => (b.remaining ?? -1) - (a.remaining ?? -1));

    const announcements = alertRows
      .filter((row) => row.category === "PUBLIC_SAFETY_NOTICE")
      .filter((row) => !row.districtCode || row.districtCode === district)
      .slice(0, 4)
      .map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        instruction: row.instruction,
        severity: row.severity,
        sourceClass: row.sourceClass,
        sourceName: row.sourceName,
        districtName: row.districtCode ? districtByCode(row.districtCode)?.name ?? row.districtCode : "State-wide",
        issuedAt: row.issuedAt,
        expiresAt: row.expiresAt,
        isSimulated: row.isSimulated,
      }));

    const officialForDistrict = alertRows.filter(
      (row) => row.sourceClass === "OFFICIAL_WARNING" && (!row.districtCode || row.districtCode === district),
    );

    return ok(
      {
        ...overview,
        shelters,
        shelterSummary: {
          total: shelters.length,
          withCapacity: shelters.filter((row) => row.capacity !== null).length,
          remaining: shelters.reduce((sum, row) => sum + (row.remaining ?? 0), 0),
          capacity: shelters.reduce((sum, row) => sum + (row.capacity ?? 0), 0),
        },
        announcements,
        officialWarningCount: officialForDistrict.length,
        account: user ? { name: user.name, role: user.role } : null,
        generatedAt: new Date().toISOString(),
      },
      undefined,
      "Citizen dashboard retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}
