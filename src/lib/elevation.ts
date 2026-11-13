import { LANDMARKS, RESERVOIRS } from "./geo";
import { DISTRICTS } from "./districts";

/**
 * DEM elevation sampling for map reference points.
 * Source: Open-Meteo Elevation API (Copernicus DEM GLO-90). Cached 24h in memory
 * because terrain elevation does not change between requests.
 */
export type ElevationValue = { lat: number; lng: number; elevationM: number | null };

export type ElevationPayload = {
  available: boolean;
  sourceName: string;
  sourceUrl: string;
  sourceClass: "OBSERVED";
  resolution: string;
  fetchedAt: string;
  error?: string;
  districts: Record<string, number | null>;
  peaks: { name: string; kind: string; elevationM: number | null }[];
  reservoirs: { name: string; elevationM: number | null }[];
  minM: number | null;
  maxM: number | null;
};

const TTL_MS = 24 * 60 * 60 * 1000;
let cache: { payload: ElevationPayload; at: number } | null = null;

function empty(error: string): ElevationPayload {
  return {
    available: false,
    sourceName: "Open-Meteo Elevation API",
    sourceUrl: "https://open-meteo.com/en/docs/elevation-api",
    sourceClass: "OBSERVED",
    resolution: "Copernicus DEM GLO-90 (90 m)",
    fetchedAt: new Date().toISOString(),
    error,
    districts: Object.fromEntries(DISTRICTS.map((district) => [district.code, null])),
    peaks: LANDMARKS.filter((landmark) => landmark.kind === "PEAK").map((peak) => ({ name: peak.name, kind: peak.kind, elevationM: null })),
    reservoirs: RESERVOIRS.map((reservoir) => ({ name: reservoir.name, elevationM: null })),
    minM: null,
    maxM: null,
  };
}

export async function getElevation(opts?: { force?: boolean }): Promise<ElevationPayload> {
  if (!opts?.force && cache && Date.now() - cache.at < TTL_MS) return cache.payload;

  const points: { lat: number; lng: number; kind: "district" | "peak" | "reservoir"; key: string }[] = [
    ...DISTRICTS.map((district) => ({ lat: district.lat, lng: district.lng, kind: "district" as const, key: district.code })),
    ...LANDMARKS.filter((landmark) => landmark.kind === "PEAK").map((landmark) => ({ lat: landmark.lat, lng: landmark.lng, kind: "peak" as const, key: landmark.name })),
    ...RESERVOIRS.map((reservoir) => ({ lat: reservoir.lat, lng: reservoir.lng, kind: "reservoir" as const, key: reservoir.name })),
  ];

  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${points.map((p) => p.lat).join(",")}&longitude=${points.map((p) => p.lng).join(",")}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`Elevation provider returned ${response.status}`);
    const payload = (await response.json()) as { elevation?: (number | null)[] };
    const values = payload.elevation ?? [];
    if (values.length !== points.length) throw new Error("Elevation provider returned an unexpected number of samples");

    const districts: Record<string, number | null> = {};
    const peaks: ElevationPayload["peaks"] = [];
    const reservoirs: ElevationPayload["reservoirs"] = [];
    points.forEach((point, index) => {
      const value = typeof values[index] === "number" ? Math.round(values[index] as number) : null;
      if (point.kind === "district") districts[point.key] = value;
      else if (point.kind === "peak") peaks.push({ name: point.key, kind: "PEAK", elevationM: value });
      else reservoirs.push({ name: point.key, elevationM: value });
    });
    const numeric = Object.values(districts).filter((value): value is number => typeof value === "number");
    const result: ElevationPayload = {
      available: true,
      sourceName: "Open-Meteo Elevation API",
      sourceUrl: "https://open-meteo.com/en/docs/elevation-api",
      sourceClass: "OBSERVED",
      resolution: "Copernicus DEM GLO-90 (90 m)",
      fetchedAt: new Date().toISOString(),
      districts,
      peaks,
      reservoirs,
      minM: numeric.length ? Math.min(...numeric) : null,
      maxM: numeric.length ? Math.max(...numeric) : null,
    };
    cache = { payload: result, at: Date.now() };
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Elevation provider unavailable";
    if (cache) return { ...cache.payload, error: `${message}. Showing last successful sample.` };
    return empty(`${message}. Elevation values are shown as unavailable rather than estimated.`);
  }
}
