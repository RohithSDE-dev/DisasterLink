import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { facilities, incidents } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { handleError, ok } from "@/lib/api";
import { BOUNDARY_SOURCE, DISTRICT_GEOMETRY, DISTRICTS, RIVER_SOURCE } from "@/lib/districts";
import { getElevation } from "@/lib/elevation";
import { COASTLINE, LANDMARKS, RESERVOIRS, riverFeatureCollection } from "@/lib/geo";
import { facilityGroupOf, MAP_BASEMAP, MAP_DATASETS, MAP_LAYERS, validateDistrictCollection, type FacilityGroupId } from "@/lib/map-data";
import { getDistrictBoard } from "@/lib/queries";
import stateBoundary from "@/data/tn-state.geo.json";

export const dynamic = "force-dynamic";

const EMPTY_GROUPS: Record<FacilityGroupId, number> = {
  HOSPITAL_GOV: 0,
  HOSPITAL_PRIVATE: 0,
  CLINIC: 0,
  FIRE: 0,
  AMBULANCE: 0,
  SHELTER: 0,
  CAMP: 0,
};

export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const url = new URL(request.url);
    const withWeather = url.searchParams.get("weather") !== "0";

    const [facilityRows, incidentRows, elevation] = await Promise.all([
      db
        .select({
          districtCode: facilities.districtCode,
          category: facilities.category,
          facilityClass: facilities.facilityClass,
          isOfficialShelter: facilities.isOfficialShelter,
          name: facilities.name,
          count: sql<number>`count(*)::int`,
        })
        .from(facilities)
        .where(eq(facilities.isActive, true))
        .groupBy(facilities.districtCode, facilities.category, facilities.facilityClass, facilities.isOfficialShelter, facilities.name),
      db
        .select({ districtCode: incidents.districtCode, status: incidents.status, count: sql<number>`count(*)::int` })
        .from(incidents)
        .groupBy(incidents.districtCode, incidents.status),
      getElevation(),
    ]);

    const plantCounts = new Map<string, Record<FacilityGroupId, number>>();
    for (const row of facilityRows) {
      const group = facilityGroupOf({
        category: row.category,
        facilityClass: row.facilityClass,
        isOfficialShelter: row.isOfficialShelter,
        name: row.name,
      });
      if (!group) continue;
      const bucket = plantCounts.get(row.districtCode) ?? { ...EMPTY_GROUPS };
      bucket[group] += row.count;
      plantCounts.set(row.districtCode, bucket);
    }

    const incidentCounts = new Map<string, { total: number; verified: number; pending: number }>();
    for (const row of incidentRows) {
      const bucket = incidentCounts.get(row.districtCode) ?? { total: 0, verified: 0, pending: 0 };
      bucket.total += row.count;
      if (["VERIFIED", "RESOLVED"].includes(row.status)) bucket.verified += row.count;
      if (["PENDING", "UNDER_REVIEW"].includes(row.status)) bucket.pending += row.count;
      incidentCounts.set(row.districtCode, bucket);
    }

    // Weather-derived risk and rainfall attributes are optional so the map can
    // load fast when a caller only needs geometry and facilities.
    const board = withWeather ? await getDistrictBoard() : [];
    const boardByCode = new Map(board.map((entry) => [entry.code, entry]));

    const elevationByDistrict = elevation.districts ?? {};

    const districtFeatures = DISTRICT_GEOMETRY.filter((district) => district.rings.length > 0).map((district) => {
      const seed = DISTRICTS.find((entry) => entry.code === district.code);
      const boardEntry = boardByCode.get(district.code);
      const groups = plantCounts.get(district.code) ?? { ...EMPTY_GROUPS };
      const counts = incidentCounts.get(district.code) ?? { total: 0, verified: 0, pending: 0 };
      const facilityTotal = Object.values(groups).reduce((sum, value) => sum + value, 0);
      return {
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: district.rings },
        properties: {
          code: district.code,
          name: district.name,
          region: seed?.region ?? "Unknown",
          centroid: district.centroid,
          referenceLat: seed?.lat ?? district.centroid[1],
          referenceLng: seed?.lng ?? district.centroid[0],
          elevationM: elevationByDistrict[district.code] ?? null,
          hasPolygon: district.hasPolygon,
          riskLevel: boardEntry?.risk.level ?? "UNKNOWN",
          riskScore: boardEntry?.risk.score ?? null,
          riskExplanation: boardEntry?.risk.explanation ?? null,
          rainfall24h: boardEntry?.weather.next24hRainfall ?? null,
          rainNow: boardEntry?.weather.rainfall ?? null,
          temperature: boardEntry?.weather.temperature ?? null,
          apparentTemperature: boardEntry?.weather.apparentTemperature ?? null,
          condition: boardEntry?.weather.condition ?? null,
          weatherCode: boardEntry?.weather.weatherCode ?? null,
          precipProbability: boardEntry?.weather.precipProbability ?? null,
          windSpeed: boardEntry?.weather.windSpeed ?? null,
          windDirection: boardEntry?.weather.windDirection ?? null,
          windGusts: boardEntry?.weather.windGusts ?? null,
          humidity: boardEntry?.weather.humidity ?? null,
          cloudCover: boardEntry?.weather.cloudCover ?? null,
          pressure: boardEntry?.weather.pressure ?? null,
          uvIndex: boardEntry?.weather.uvIndex ?? null,
          weatherAvailable: boardEntry?.weather.available ?? false,
          weatherFetchedAt: boardEntry?.weather.fetchedAt ?? null,
          incidents: counts.total,
          verified: counts.verified,
          pending: counts.pending,
          facilities: facilityTotal,
          facilityCounts: groups,
        },
      };
    });

    const validation = validateDistrictCollection(
      districtFeatures.map((feature) => ({ properties: feature.properties, geometry: feature.geometry })),
      DISTRICTS.map((district) => district.name),
    );

    const withoutPolygon = DISTRICTS.filter((district) => !districtFeatures.some((feature) => feature.properties.code === district.code)).map(
      (district) => ({ code: district.code, name: district.name, lat: district.lat, lng: district.lng, reason: "No polygon in the 2011 Census boundary dataset" }),
    );

    return ok(
      {
        state: stateBoundary,
        districts: { type: "FeatureCollection", features: districtFeatures },
        districtsWithoutPolygon: withoutPolygon,
        hydrology: riverFeatureCollection(),
        reservoirs: RESERVOIRS,
        landmarks: LANDMARKS,
        coastline: { type: "LineString", coordinates: COASTLINE },
        bounds: { minLat: 7.8, maxLat: 14.0, minLng: 75.8, maxLng: 80.9 },
        elevation,
        basemap: {
          style: MAP_BASEMAP.styleUrl,
          attribution: MAP_BASEMAP.attribution,
          terrainTiles: MAP_BASEMAP.terrainTiles,
          terrainAttribution: MAP_BASEMAP.terrainAttribution,
          apiKeyRequired: false,
          note: "OpenFreeMap vector tiles and AWS Terrain Tiles are keyless. Both are fetched by the browser; if either is unreachable the map degrades to a boundary-only style and reports it.",
        },
        datasets: MAP_DATASETS,
        layers: MAP_LAYERS,
        validation,
        provenance: {
          boundaries: BOUNDARY_SOURCE,
          hydrology: RIVER_SOURCE,
          state: stateBoundary.source,
          districts: DISTRICTS.length,
        },
        generatedAt: new Date().toISOString(),
      },
      undefined,
      "Geographic layers retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}
