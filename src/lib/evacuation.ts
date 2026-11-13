/**
 * Smart evacuation assistance.
 *
 * Corridors are SCHEMATIC planning examples (labelled SIMULATED). The module never
 * claims a route is guaranteed safe: it surfaces reported hazards, distance/time
 * heuristics and shelter capacity, together with data freshness warnings.
 */
import { haversineKm } from "./risk";

export type Waypoint = { name: string; lat: number; lng: number };

export type EvacuationCorridor = {
  id: string;
  name: string;
  districtCodes: string[];
  waypoints: Waypoint[];
  guidance: string;
  relatesTo: string[];
};

export const EVACUATION_CORRIDORS: EvacuationCorridor[] = [
  {
    id: "che-south",
    name: "Chennai south coastal corridor",
    districtCodes: ["TN-CHN", "TN-CGL"],
    waypoints: [
      { name: "Velachery", lat: 12.9756, lng: 80.2207 },
      { name: "Tambaram", lat: 12.9249, lng: 80.1 },
      { name: "Chengalpattu", lat: 12.6819, lng: 79.9888 },
    ],
    guidance: "Move inland along the GST corridor toward Chengalpattu; low-lying stretches around Velachery flood first.",
    relatesTo: ["WATERLOGGING", "FLOODING", "ROAD_BLOCKAGE"],
  },
  {
    id: "cbe-east",
    name: "Coimbatore east flood corridor",
    districtCodes: ["TN-CBE"],
    waypoints: [
      { name: "Singanallur", lat: 11.0021, lng: 77.0271 },
      { name: "Peelamedu", lat: 11.0384, lng: 77.0104 },
      { name: "Coimbatore Medical College", lat: 11.0178, lng: 76.9778 },
    ],
    guidance: "Lake outlet flooding can cut Singanallur; use the higher Trichy Road side toward the medical college.",
    relatesTo: ["FLOODING", "WATERLOGGING", "ROAD_BLOCKAGE"],
  },
  {
    id: "mdu-vaigai",
    name: "Madurai Vaigai corridor",
    districtCodes: ["TN-MDU"],
    waypoints: [
      { name: "Vaigai river bank", lat: 9.928, lng: 78.105 },
      { name: "Periyar bus stand", lat: 9.9195, lng: 78.1145 },
      { name: "Government Rajaji Hospital", lat: 9.929, lng: 78.134 },
    ],
    guidance: "Avoid the river bank service roads; climb toward the hospital and city-centre high ground.",
    relatesTo: ["FLOODING", "ROAD_BLOCKAGE"],
  },
  {
    id: "ngp-coast",
    name: "Nagapattinam coastal evacuation",
    districtCodes: ["TN-NGP", "TN-MYL", "TN-TVR"],
    waypoints: [
      { name: "Nagapattinam coast road", lat: 10.7661, lng: 79.8444 },
      { name: "Thiruvarur inland", lat: 10.7724, lng: 79.6368 },
      { name: "Thanjavur", lat: 10.787, lng: 79.1378 },
    ],
    guidance: "Delta districts flood behind the coast; move inland and away from canal overflows.",
    relatesTo: ["FLOODING", "WATERLOGGING"],
  },
  {
    id: "nlg-descent",
    name: "Nilgiris ghat descent",
    districtCodes: ["TN-NLG", "TN-CBE"],
    waypoints: [
      { name: "Coonoor", lat: 11.3538, lng: 76.7959 },
      { name: "Kallar", lat: 11.3268, lng: 76.8788 },
      { name: "Mettupalayam", lat: 11.3021, lng: 76.9401 },
    ],
    guidance: "Landslide-prone ghat stretches require official clearance before descent; never travel at night on blocked sections.",
    relatesTo: ["LANDSLIDE", "ROAD_BLOCKAGE", "FALLEN_TREE"],
  },
  {
    id: "tnv-river",
    name: "Tirunelveli Thamirabarani corridor",
    districtCodes: ["TN-TNV"],
    waypoints: [
      { name: "Thamirabarani bank", lat: 8.6905, lng: 77.7395 },
      { name: "Tirunelveli town", lat: 8.7139, lng: 77.7567 },
      { name: "Palayamkottai", lat: 8.7184, lng: 77.7418 },
    ],
    guidance: "Move away from the river bank; Palayamkottai has higher ground and medical facilities.",
    relatesTo: ["FLOODING", "WATERLOGGING"],
  },
];

export type HazardFlag = {
  publicId: string;
  category: string;
  severity: string;
  status: string;
  locationName: string;
  distanceKm: number;
  dataClass: string;
};

export type CorridorAssessment = {
  id: string;
  name: string;
  districtNames: string[];
  distanceKm: number;
  estimatedMinutes: number;
  hazardFlags: HazardFlag[];
  risk: "CLEARER" | "CAUTION" | "HIGHLY_UNCERTAIN";
  guidance: string;
  dataClass: "SIMULATED";
  freshness: string;
  disclaimer: string;
  polyline: [number, number][];
};

export type HazardIncident = {
  publicId: string;
  category: string;
  status: string;
  locationName: string;
  lat: number | null;
  lng: number | null;
  assessedSeverity: string | null;
  reportedSeverity: string;
  dataClass: string;
  districtCode: string;
};

export const EVACUATION_DISCLAIMER =
  "Schematic corridor guidance for planning and demonstration. It is not a live routing service, is not guaranteed safe and does not reflect current road conditions. Confirm access with local authorities before moving.";

export function assessCorridors(
  incidents: HazardIncident[],
  districtName: (code: string) => string,
  corridorFilter?: string,
): CorridorAssessment[] {
  const hazards = incidents.filter((incident) => ["ROAD_BLOCKAGE", "FLOODING", "WATERLOGGING", "FALLEN_TREE", "LANDSLIDE"].includes(incident.category));

  return EVACUATION_CORRIDORS.filter((corridor) => !corridorFilter || corridor.districtCodes.includes(corridorFilter)).map((corridor) => {
    let distanceKm = 0;
    for (let i = 1; i < corridor.waypoints.length; i += 1) {
      distanceKm += haversineKm(corridor.waypoints[i - 1], corridor.waypoints[i]);
    }
    const flags: HazardFlag[] = [];
    for (const hazard of hazards) {
      if (hazard.lat === null || hazard.lng === null) continue;
      if (!corridor.districtCodes.includes(hazard.districtCode)) continue;
      const nearest = Math.min(
        ...corridor.waypoints.map((point) => haversineKm({ lat: hazard.lat as number, lng: hazard.lng as number }, point)),
      );
      if (nearest <= 6) {
        flags.push({
          publicId: hazard.publicId,
          category: hazard.category,
          severity: hazard.assessedSeverity ?? hazard.reportedSeverity,
          status: hazard.status,
          locationName: hazard.locationName,
          distanceKm: Math.round(nearest * 10) / 10,
          dataClass: hazard.dataClass,
        });
      }
    }
    flags.sort((a, b) => a.distanceKm - b.distanceKm);
    const critical = flags.some((f) => f.severity === "CRITICAL" || f.severity === "HIGH");
    const risk: CorridorAssessment["risk"] = critical ? "HIGHLY_UNCERTAIN" : flags.length ? "CAUTION" : "CLEARER";
    return {
      id: corridor.id,
      name: corridor.name,
      districtNames: corridor.districtCodes.map(districtName),
      distanceKm: Math.round(distanceKm * 10) / 10,
      estimatedMinutes: Math.round((distanceKm / 24) * 60) + 8,
      hazardFlags: flags.slice(0, 5),
      risk,
      guidance: corridor.guidance,
      dataClass: "SIMULATED",
      freshness: new Date().toISOString(),
      disclaimer: EVACUATION_DISCLAIMER,
      polyline: corridor.waypoints.map((point) => [point.lng, point.lat] as [number, number]),
    };
  });
}

export type ShelterSuggestion = {
  id: number;
  name: string;
  districtCode: string;
  districtName: string;
  lat: number | null;
  lng: number | null;
  capacity: number | null;
  occupancy: number | null;
  remaining: number | null;
  availabilityStatus: string;
  capacityDataClass: string;
  distanceKm: number | null;
};

export function suggestShelters(
  facilities: {
    id: number;
    name: string;
    category: string;
    districtCode: string;
    lat: number | null;
    lng: number | null;
    capacity: number | null;
    occupancy: number | null;
    availabilityStatus: string;
    capacityDataClass: string;
    isOfficialShelter: boolean;
    isActive: boolean;
  }[],
  options: { districtCode?: string; lat?: number; lng?: number; limit?: number } = {},
): ShelterSuggestion[] {
  const origin = options.lat !== undefined && options.lng !== undefined ? { lat: options.lat, lng: options.lng } : null;
  return facilities
    .filter((facility) => facility.isActive && (facility.category === "SHELTER" || facility.isOfficialShelter))
    .map((facility) => {
      const remaining =
        facility.capacity !== null && facility.occupancy !== null ? Math.max(0, facility.capacity - facility.occupancy) : null;
      return {
        id: facility.id,
        name: facility.name,
        districtCode: facility.districtCode,
        districtName: facility.districtCode,
        lat: facility.lat,
        lng: facility.lng,
        capacity: facility.capacity,
        occupancy: facility.occupancy,
        remaining,
        availabilityStatus: facility.availabilityStatus,
        capacityDataClass: facility.capacityDataClass,
        distanceKm:
          origin && facility.lat !== null && facility.lng !== null
            ? haversineKm(origin, { lat: facility.lat, lng: facility.lng })
            : null,
      };
    })
    .sort((a, b) => {
      if (options.districtCode) {
        const aLocal = a.districtCode === options.districtCode ? 0 : 1;
        const bLocal = b.districtCode === options.districtCode ? 0 : 1;
        if (aLocal !== bLocal) return aLocal - bLocal;
      }
      if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
      return (b.remaining ?? 0) - (a.remaining ?? 0);
    })
    .slice(0, options.limit ?? 8);
}
