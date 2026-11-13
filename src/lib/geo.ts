import { DISTRICT_GEOMETRY, RIVERS } from "./districts";

/** Approximate locations of major Tamil Nadu reservoirs/dams (public reference points). */
export type Reservoir = {
  name: string;
  districtCode: string;
  lat: number;
  lng: number;
  river: string;
  note: string;
};

export const RESERVOIRS: Reservoir[] = [
  { name: "Mettur Dam (Stanley Reservoir)", districtCode: "TN-SLM", lat: 11.7906, lng: 77.8008, river: "Kaveri", note: "Reference location only; storage levels are not ingested." },
  { name: "Bhavanisagar Dam", districtCode: "TN-ERD", lat: 11.4724, lng: 77.1042, river: "Bhavani", note: "Reference location only." },
  { name: "Amaravathi Dam", districtCode: "TN-TPR", lat: 10.4231, lng: 77.2583, river: "Amaravathi", note: "Reference location only." },
  { name: "Aliyar Dam", districtCode: "TN-CBE", lat: 10.4824, lng: 76.9736, river: "Aliyar", note: "Reference location only." },
  { name: "Vaigai Dam", districtCode: "TN-THI", lat: 9.9686, lng: 77.8705, river: "Vaigai", note: "Reference location only." },
  { name: "Sathanur Dam", districtCode: "TN-TVM", lat: 12.1328, lng: 78.8492, river: "Ponnaiyar", note: "Reference location only." },
  { name: "Krishnagiri Dam", districtCode: "TN-KRG", lat: 12.4944, lng: 78.2167, river: "Thenpennai", note: "Reference location only." },
  { name: "Puzhal Lake", districtCode: "TN-TVL", lat: 13.1597, lng: 80.1669, river: "Local catchment", note: "City supply reservoir; reference location only." },
  { name: "Chembarambakkam Lake", districtCode: "TN-CGL", lat: 13.0201, lng: 80.0605, river: "Adyar catchment", note: "Reference location only." },
  { name: "Veeranam Lake", districtCode: "TN-CDL", lat: 11.3506, lng: 79.3608, river: "Vellar", note: "Reference location only." },
  { name: "Pechiparai Dam", districtCode: "TN-KKI", lat: 8.3964, lng: 77.3036, river: "Kodayar", note: "Reference location only." },
  { name: "Perunchani Dam", districtCode: "TN-KKI", lat: 8.3589, lng: 77.3747, river: "Kodayar", note: "Reference location only." },
];

export const LANDMARKS: { name: string; kind: "PEAK" | "COAST" | "CITY"; lat: number; lng: number }[] = [
  { name: "Doddabetta", kind: "PEAK", lat: 11.3997, lng: 76.7361 },
  { name: "Anamalai Hills", kind: "PEAK", lat: 10.1704, lng: 77.0601 },
  { name: "Kolli Hills", kind: "PEAK", lat: 11.2519, lng: 78.3494 },
  { name: "Yelagiri", kind: "PEAK", lat: 12.5764, lng: 78.6394 },
  { name: "Meghamalai", kind: "PEAK", lat: 9.6964, lng: 77.4022 },
  { name: "Point Calimere", kind: "COAST", lat: 10.2817, lng: 79.8322 },
  { name: "Dhanushkodi", kind: "COAST", lat: 9.1526, lng: 79.4186 },
  { name: "Kanyakumari Cape", kind: "COAST", lat: 8.0783, lng: 77.5507 },
  { name: "Pulicat Lake", kind: "COAST", lat: 13.4167, lng: 80.3167 },
  { name: "Pamban / Rameswaram", kind: "COAST", lat: 9.2876, lng: 79.3129 },
];

export const COASTLINE: [number, number][] = [
  [80.32, 13.45],
  [80.29, 13.15],
  [80.28, 12.95],
  [80.25, 12.72],
  [80.18, 12.42],
  [80.13, 12.14],
  [80.02, 11.85],
  [79.87, 11.62],
  [79.84, 11.42],
  [79.85, 11.18],
  [79.84, 10.92],
  [79.84, 10.62],
  [79.85, 10.30],
  [79.83, 10.05],
  [79.62, 9.65],
  [79.40, 9.28],
  [79.18, 9.02],
  [78.95, 8.80],
  [78.55, 8.62],
  [78.28, 8.50],
  [78.12, 8.32],
  [77.98, 8.20],
  [77.72, 8.12],
  [77.55, 8.06],
];

export type GeoFeature = {
  type: "Feature";
  geometry: { type: "Polygon" | "LineString" | "Point"; coordinates: unknown };
  properties: Record<string, unknown>;
};

export function districtFeatureCollection(
  board: { code: string; name: string; risk: { level: string; score: number }; weather: { next24hRainfall: number | null; temperature: number | null; rainfall: number | null }; incidents: { total: number; verified: number; pending: number }; facilities: number }[],
): { type: "FeatureCollection"; features: GeoFeature[] } {
  const byCode = new Map(board.map((entry) => [entry.code, entry]));
  const features: GeoFeature[] = [];
  for (const district of DISTRICT_GEOMETRY) {
    const entry = byCode.get(district.code);
    if (!district.rings.length) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: district.rings },
      properties: {
        code: district.code,
        name: district.name,
        centroid: district.centroid,
        riskLevel: entry?.risk.level ?? "UNKNOWN",
        riskScore: entry?.risk.score ?? 0,
        rainfall24h: entry?.weather.next24hRainfall ?? 0,
        temperature: entry?.weather.temperature ?? 0,
        rainNow: entry?.weather.rainfall ?? 0,
        incidents: entry?.incidents.total ?? 0,
        verified: entry?.incidents.verified ?? 0,
        pending: entry?.incidents.pending ?? 0,
        facilities: entry?.facilities ?? 0,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function riverFeatureCollection(): { type: "FeatureCollection"; features: GeoFeature[] } {
  const features: GeoFeature[] = RIVERS.map((river) => ({
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates: river.points },
    properties: { name: river.name, kind: "RIVER", dataClass: "SCHEMATIC" },
  }));
  features.push({
    type: "Feature",
    geometry: { type: "LineString", coordinates: COASTLINE },
    properties: { name: "Tamil Nadu coastline", kind: "COASTLINE", dataClass: "SCHEMATIC" },
  });
  for (const reservoir of RESERVOIRS) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [reservoir.lng, reservoir.lat] },
      properties: { name: reservoir.name, kind: "RESERVOIR", river: reservoir.river, note: reservoir.note, districtCode: reservoir.districtCode },
    });
  }
  for (const landmark of LANDMARKS) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [landmark.lng, landmark.lat] },
      properties: { name: landmark.name, kind: landmark.kind },
    });
  }
  return { type: "FeatureCollection", features };
}
