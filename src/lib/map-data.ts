/**
 * Phase 1 — map data, layer architecture and provenance registry.
 * Pure module: safe to import from both server routes and client components.
 */

export type SourceClass =
  | "OBSERVED"
  | "FORECAST"
  | "MODEL_RISK_ESTIMATE"
  | "OFFICIAL_WARNING"
  | "COMMUNITY_REPORT"
  | "SIMULATED";

export type MapDataset = {
  id: string;
  name: string;
  source: string;
  url: string;
  coverage: string;
  format: string;
  updated: string;
  sourceClass: SourceClass;
  limitations: string;
};

export const MAP_DATASETS: MapDataset[] = [
  {
    id: "state-boundary",
    name: "Tamil Nadu state boundary",
    source: "Indian States GeoJSON (Survey of India derived, community maintained)",
    url: "https://github.com/Subhash9325/GeoJson-Data-of-Indian-States",
    coverage: "Tamil Nadu state (IN-TN), territorial limits excluded",
    format: "GeoJSON MultiPolygon, simplified to 0.008° tolerance (703 vertices)",
    updated: "Repository snapshot; state reorganisation 2020 boundaries not applicable to state outline",
    sourceClass: "OBSERVED",
    limitations: "Simplified for browser rendering; not survey-grade; coastal territorial water limits excluded.",
  },
  {
    id: "district-boundaries",
    name: "Tamil Nadu district boundaries",
    source: "2011 Census district boundaries, simplified — udit-001/india-maps-data",
    url: "https://github.com/udit-001/india-maps-data",
    coverage: "37 undivided Census 2011 districts of Tamil Nadu",
    format: "GeoJSON Polygon rings, simplified (39 rings / 2,259 vertices)",
    updated: "2011 Census; districts reorganised in 2020 are not separately delimited in this dataset",
    sourceClass: "OBSERVED",
    limitations:
      "Mayiladuthurai (carved from Nagapattinam in 2020) has no polygon in this dataset and is shown as a labelled point. Simplified geometry is not survey-grade. District attributes are DisasterLink records, not census statistics.",
  },
  {
    id: "terrain",
    name: "Terrain elevation raster (3D)",
    source: "AWS Terrain Tiles (Mapzen Terrarium encoding), elevation from Copernicus/NASA DEM composites",
    url: "https://registry.opendata.aws/terrain-tiles/",
    coverage: "Global, including Tamil Nadu",
    format: "Raster DEM PNG tiles, {z}/{x}/{y}, encoding terrarium",
    updated: "Static open dataset",
    sourceClass: "OBSERVED",
    limitations:
      "Fetched directly by the browser at runtime; requires network access. No API key needed. If unavailable the map falls back to boundary-only rendering and states so.",
  },
  {
    id: "elevation-points",
    name: "District reference-point elevation",
    source: "Open-Meteo Elevation API (Copernicus DEM GLO-90)",
    url: "https://open-meteo.com/en/docs/elevation-api",
    coverage: "District reference points and mapped peaks in Tamil Nadu",
    format: "JSON elevation in metres",
    updated: "Cached 24 hours server-side",
    sourceClass: "OBSERVED",
    limitations: "Sampled at a single point per district, so it describes the reference point, not district relief.",
  },
  {
    id: "hydrology",
    name: "Rivers, reservoirs and coastline (reference overlay)",
    source: "Schematic public-map derived centrelines compiled for this prototype",
    url: "https://www.openstreetmap.org/",
    coverage: "Kaveri, Bhavani, Amaravathi, Vaigai, Thamirabarani, Palar, Ponnaiyar, Kollidam, Vellar + 12 reservoirs",
    format: "GeoJSON LineString / Point features",
    updated: "Static reference overlay",
    sourceClass: "MODEL_RISK_ESTIMATE",
    limitations:
      "Illustrative alignment only; not a survey-grade waterway dataset and not authoritative for reservoir extents or levels. Never used to declare an official flood-prone zone.",
  },
  {
    id: "roads",
    name: "Major roads",
    source: "Not ingested — OpenStreetMap Overpass API was unavailable when this phase was built",
    url: "https://overpass-api.de/",
    coverage: "None",
    format: "n/a",
    updated: "Not available",
    sourceClass: "COMMUNITY_REPORT",
    limitations:
      "Layer is disabled in the UI with an explicit reason rather than drawing approximate road geometry. Ingest motorway/trunk/primary ways via Overpass or a licensed NH/SH dataset to enable it.",
  },
  {
    id: "facilities",
    name: "Emergency facilities & safety zones",
    source: "DisasterLink facility records (public institution listings + simulation engine)",
    url: "/api/facilities",
    coverage: "Hospitals, clinics, fire stations, ambulances, shelters and relief camps in Tamil Nadu",
    format: "PostgreSQL records served as JSON",
    updated: "Administrator-controlled, realtime",
    sourceClass: "COMMUNITY_REPORT",
    limitations:
      "Directory candidates unless an administrator verifies them. Capacity/occupancy records carrying data class SIMULATED are demonstration values. No live availability feed.",
  },
  {
    id: "incidents",
    name: "Incident markers",
    source: "DisasterLink incident records (citizen reports and labelled simulation records)",
    url: "/api/incidents",
    coverage: "Verified and resolved incidents publicly; full queue for signed-in administrators",
    format: "PostgreSQL records served as JSON",
    updated: "Realtime",
    sourceClass: "COMMUNITY_REPORT",
    limitations: "Precise coordinates are withheld from public views for pending reports. SIMULATED records are badged.",
  },
  {
    id: "flood-risk",
    name: "Flood-risk estimate",
    source: "DisasterLink flood-risk heuristic v1",
    url: "/api/districts",
    coverage: "38 districts (score derived from forecast rainfall, reports, waterway proximity, terrain prior)",
    format: "Computed JSON per district",
    updated: "Recomputed per request",
    sourceClass: "MODEL_RISK_ESTIMATE",
    limitations: "Heuristic estimate. Not an official flood-prone-zone declaration and not a warning.",
  },
  {
    id: "rainfall",
    name: "Rainfall distribution & temperature",
    source: "Open-Meteo forecast API (district reference points)",
    url: "https://open-meteo.com/",
    coverage: "38 district reference points",
    format: "JSON millimetres / °C",
    updated: "Cached 15 minutes server-side",
    sourceClass: "FORECAST",
    limitations: "Point forecasts at district centres, not a gridded radar product.",
  },
  {
    id: "warnings",
    name: "Warning areas",
    source: "DisasterLink alert records published by authorised officers",
    url: "/api/alerts",
    coverage: "District-targeted and state-wide notices",
    format: "PostgreSQL records served as JSON",
    updated: "Realtime",
    sourceClass: "OFFICIAL_WARNING",
    limitations:
      "No IMD/TNSDMA bulletin ingestion is configured. Notices are attributed to their publishing officer; SIMULATED demonstration alerts are badged.",
  },
  {
    id: "evacuation",
    name: "Evacuation corridors",
    source: "DisasterLink schematic corridor set",
    url: "/api/evacuation",
    coverage: "Six planning corridors (Chennai, Coimbatore, Madurai, Nagapattinam delta, Nilgiris, Tirunelveli)",
    format: "GeoJSON LineString",
    updated: "Static corridor definition + live hazard matching",
    sourceClass: "SIMULATED",
    limitations: "Schematic planning guidance. Not a routing engine, not guaranteed safe.",
  },
];

export type MapLayerGroup = "base" | "hazards" | "operations" | "facilities";

export type MapLayerDefinition = {
  id: string;
  label: string;
  group: MapLayerGroup;
  description: string;
  available: boolean;
  /** Default visible state */
  on: boolean;
  datasetId?: string;
  unavailableReason?: string;
};

export const MAP_LAYERS: MapLayerDefinition[] = [
  { id: "stateBoundary", label: "Tamil Nadu state boundary", group: "base", description: "State outline with glow outline.", available: true, on: true, datasetId: "state-boundary" },
  { id: "districtBoundaries", label: "District boundaries", group: "base", description: "Clickable district polygons and outlines.", available: true, on: true, datasetId: "district-boundaries" },
  { id: "districtLabels", label: "District labels", group: "base", description: "District names at state and district zoom.", available: true, on: true, datasetId: "district-boundaries" },
  { id: "terrain", label: "3D terrain", group: "base", description: "Elevation mesh with hillshade and adjustable exaggeration.", available: true, on: true, datasetId: "terrain" },
  { id: "elevation", label: "Elevation readout", group: "base", description: "DEM elevation values for district points and mapped peaks.", available: true, on: false, datasetId: "elevation-points" },
  { id: "hydrology", label: "Rivers, reservoirs & coast", group: "base", description: "Schematic waterway centrelines, reservoirs and coastline.", available: true, on: true, datasetId: "hydrology" },
  {
    id: "roads",
    label: "Major roads",
    group: "base",
    description: "National/state highway overlay.",
    available: false,
    on: false,
    datasetId: "roads",
    unavailableReason: "No reliable road dataset ingested (Overpass unavailable). Layer held back rather than approximated.",
  },
  { id: "hospitals", label: "Hospitals & medical centres", group: "facilities", description: "Government/private hospitals, PHCs and clinics.", available: true, on: true, datasetId: "facilities" },
  { id: "fire", label: "Fire stations", group: "facilities", description: "Fire and rescue station records.", available: true, on: true, datasetId: "facilities" },
  { id: "ambulances", label: "Ambulances", group: "facilities", description: "Ambulance base records with availability status.", available: true, on: true, datasetId: "facilities" },
  { id: "shelters", label: "Shelters & safety zones", group: "facilities", description: "Relief camps and shelters with capacity where recorded.", available: true, on: true, datasetId: "facilities" },
  { id: "incidents", label: "Active incidents", group: "operations", description: "Incident markers coloured by category, outlined by status.", available: true, on: true, datasetId: "incidents" },
  { id: "floodRisk", label: "Flood-risk areas", group: "hazards", description: "District risk-heuristic fill (MODEL_RISK_ESTIMATE).", available: true, on: true, datasetId: "flood-risk" },
  { id: "rainfall", label: "Rainfall distribution", group: "hazards", description: "Forecast 24-hour accumulation fill.", available: true, on: false, datasetId: "rainfall" },
  { id: "temperature", label: "Temperature distribution", group: "hazards", description: "Observed temperature fill per district reference point.", available: true, on: false, datasetId: "rainfall" },
  { id: "precipProbability", label: "Precipitation probability", group: "hazards", description: "Peak forecast rain probability over the next 24 hours.", available: true, on: false, datasetId: "rainfall" },
  { id: "wind", label: "Wind direction & speed", group: "hazards", description: "Wind arrows from district observations, sized and coloured by speed.", available: true, on: false, datasetId: "rainfall" },
  { id: "warnings", label: "Weather warning areas", group: "hazards", description: "Alert areas published by authorised officers.", available: true, on: true, datasetId: "warnings" },
  { id: "evacuation", label: "Evacuation corridors", group: "operations", description: "Schematic corridors with reported-hazard matching.", available: true, on: false, datasetId: "evacuation" },
];

export const LAYER_GROUPS: { id: MapLayerGroup; label: string }[] = [
  { id: "base", label: "Geography" },
  { id: "facilities", label: "Emergency facilities" },
  { id: "hazards", label: "Hazard & weather" },
  { id: "operations", label: "Operations" },
];

export type FacilityGroupId = "HOSPITAL_GOV" | "HOSPITAL_PRIVATE" | "CLINIC" | "FIRE" | "AMBULANCE" | "SHELTER" | "CAMP";

export type FacilityGroupDefinition = {
  id: FacilityGroupId;
  label: string;
  short: string;
  glyph: string;
  color: string;
  layer: "hospitals" | "fire" | "ambulances" | "shelters";
};

export const FACILITY_GROUPS: FacilityGroupDefinition[] = [
  { id: "HOSPITAL_GOV", label: "Government hospitals", short: "Gov hospital", glyph: "H", color: "#22d3ee", layer: "hospitals" },
  { id: "HOSPITAL_PRIVATE", label: "Private hospitals", short: "Pvt hospital", glyph: "H", color: "#60a5fa", layer: "hospitals" },
  { id: "CLINIC", label: "PHCs & medical centres", short: "PHC / clinic", glyph: "C", color: "#a78bfa", layer: "hospitals" },
  { id: "FIRE", label: "Fire stations", short: "Fire station", glyph: "F", color: "#fb923c", layer: "fire" },
  { id: "AMBULANCE", label: "Ambulances", short: "Ambulance", glyph: "A", color: "#f472b6", layer: "ambulances" },
  { id: "SHELTER", label: "Shelters", short: "Shelter", glyph: "S", color: "#34d399", layer: "shelters" },
  { id: "CAMP", label: "Relief camps", short: "Relief camp", glyph: "R", color: "#facc15", layer: "shelters" },
];

export const FACILITY_GROUP_MAP: Record<FacilityGroupId, FacilityGroupDefinition> = Object.fromEntries(
  FACILITY_GROUPS.map((group) => [group.id, group]),
) as Record<FacilityGroupId, FacilityGroupDefinition>;

export type FacilityGroupInput = {
  category: string;
  facilityClass?: string | null;
  isOfficialShelter?: boolean;
  name?: string;
};

/** Maps a facility record onto a map marker group. Unknown categories return null (not mapped). */
export function facilityGroupOf(facility: FacilityGroupInput): FacilityGroupId | null {
  const category = facility.category?.toUpperCase();
  if (category === "HOSPITAL") return facility.facilityClass === "GOVERNMENT" ? "HOSPITAL_GOV" : "HOSPITAL_PRIVATE";
  if (category === "CLINIC") return "CLINIC";
  if (category === "FIRE_STATION") return "FIRE";
  if (category === "AMBULANCE_SERVICE") return "AMBULANCE";
  if (category === "SHELTER") {
    const isCamp = /relief camp|camp/i.test(facility.name ?? "");
    return isCamp || !facility.isOfficialShelter ? "CAMP" : "SHELTER";
  }
  return null;
}

export const RISK_COLORS: Record<string, string> = {
  LOW: "#0f766e",
  MODERATE: "#ca8a04",
  HIGH: "#ea580c",
  VERY_HIGH: "#b91c1c",
  UNKNOWN: "#475569",
};

export const INCIDENT_CATEGORY_COLORS: Record<string, string> = {
  FLOODING: "#2563eb",
  WATERLOGGING: "#0ea5e9",
  FALLEN_TREE: "#16a34a",
  ROAD_BLOCKAGE: "#a16207",
  BUILDING_DAMAGE: "#7c3aed",
  FIRE: "#dc2626",
  LANDSLIDE: "#b45309",
  OTHER: "#64748b",
};

export const MAP_BASEMAP = {
  styleUrl: "https://tiles.openfreemap.org/styles/liberty",
  attribution: "Basemap: OpenFreeMap (OpenStreetMap data, ODbL)",
  terrainTiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  terrainAttribution: "Elevation: AWS Terrain Tiles (Mapzen terrarium)",
  defaultExaggeration: 1.25,
  minExaggeration: 0,
  maxExaggeration: 2.5,
};

export type DistrictValidationReport = {
  expectedDistricts: number;
  polygonDistricts: number;
  missingPolygonDistricts: string[];
  invalidRings: number;
  outOfBoundsVertices: number;
  totalVertices: number;
  valid: boolean;
  checkedAt: string;
};

type GeometryLike = { coordinates: unknown };

function* positions(coords: unknown): Generator<[number, number]> {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    yield coords as [number, number];
    return;
  }
  for (const child of coords) yield* positions(child);
}

function* rings(coords: unknown): Generator<[number, number][]> {
  if (!Array.isArray(coords) || coords.length === 0) return;
  if (Array.isArray(coords[0]) && typeof (coords[0] as unknown[])[0] === "number") {
    yield coords as [number, number][];
    return;
  }
  for (const child of coords) yield* rings(child);
}

/**
 * Validates the district GeoJSON at request time: ring closure, Tamil Nadu
 * bounding box, vertex counts and 38-district coverage.
 */
export function validateDistrictCollection(
  features: { properties: { name: string; code: string }; geometry: GeometryLike }[],
  expectedNames: string[],
): DistrictValidationReport {
  let invalidRings = 0;
  let outOfBounds = 0;
  let totalVertices = 0;
  for (const feature of features) {
    for (const ring of rings(feature.geometry.coordinates)) {
      totalVertices += ring.length;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) invalidRings += 1;
    }
    for (const [lng, lat] of positions(feature.geometry.coordinates)) {
      if (!(lng > 75.5 && lng < 81.0 && lat > 7.5 && lat < 14.5)) outOfBounds += 1;
    }
  }
  const present = new Set(features.map((feature) => feature.properties.name));
  const missing = expectedNames.filter((name) => !present.has(name));
  return {
    expectedDistricts: expectedNames.length,
    polygonDistricts: features.length,
    missingPolygonDistricts: missing,
    invalidRings,
    outOfBoundsVertices: outOfBounds,
    totalVertices,
    valid: invalidRings === 0 && outOfBounds === 0 && features.length + missing.length === expectedNames.length,
    checkedAt: new Date().toISOString(),
  };
}

export function bboxOf(coords: unknown): [number, number, number, number] | null {
  let minLng = 180;
  let minLat = 90;
  let maxLng = -180;
  let maxLat = -90;
  let found = false;
  for (const [lng, lat] of positions(coords)) {
    found = true;
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return found ? [minLng, minLat, maxLng, maxLat] : null;
}
