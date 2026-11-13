import { eq } from "drizzle-orm";
import { db } from "@/db";
import { weatherCache } from "@/db/schema";
import type { DistrictSeed } from "./districts";

/**
 * Weather provider configuration. Secrets are read from server-side environment
 * variables only and are never serialised into API responses or client bundles.
 * Open-Meteo requires no key; the hooks exist for a keyed commercial host.
 */
export const WEATHER_PROVIDER = {
  id: "open-meteo",
  name: "Open-Meteo",
  docsUrl: "https://open-meteo.com/en/docs",
  baseUrl: process.env.OPEN_METEO_BASE_URL?.trim() || "https://api.open-meteo.com/v1/forecast",
  apiKeyConfigured: Boolean(process.env.OPEN_METEO_API_KEY?.trim()),
  keyRequiredByDefault: false,
  cacheTtlMinutes: (() => {
    const parsed = Number(process.env.WEATHER_CACHE_TTL_MINUTES ?? 15);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 120 ? Math.round(parsed) : 15;
  })(),
  timeoutMs: (() => {
    const parsed = Number(process.env.WEATHER_TIMEOUT_MS ?? 9000);
    return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 30000 ? Math.round(parsed) : 9000;
  })(),
} as const;

/** Safe, non-secret provider description for API responses and the UI. */
export type ProviderInfo = {
  id: string;
  name: string;
  docsUrl: string;
  attribution: string;
  keyRequired: boolean;
  apiKeyConfigured: boolean;
  cacheTtlMinutes: number;
  configured: boolean;
};

export function providerInfo(): ProviderInfo {
  return {
    id: WEATHER_PROVIDER.id,
    name: WEATHER_PROVIDER.name,
    docsUrl: WEATHER_PROVIDER.docsUrl,
    attribution: "Weather data by Open-Meteo.com (CC BY 4.0). Elevation data by Copernicus DEM.",
    keyRequired: WEATHER_PROVIDER.keyRequiredByDefault,
    apiKeyConfigured: WEATHER_PROVIDER.apiKeyConfigured,
    cacheTtlMinutes: WEATHER_PROVIDER.cacheTtlMinutes,
    configured: true,
  };
}

function providerUrl(base: string): string {
  if (!WEATHER_PROVIDER.apiKeyConfigured || base.includes("open-meteo.com")) return base;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}apikey=${encodeURIComponent(process.env.OPEN_METEO_API_KEY?.trim() ?? "")}`;
}

export type WeatherCurrent = {
  time: string;
  temperature: number;
  apparentTemperature: number | null;
  humidity: number;
  precipitation: number;
  precipitationProbability: number | null;
  windSpeed: number;
  windDirection: number | null;
  windGusts: number | null;
  cloudCover: number | null;
  pressure: number | null;
  weatherCode: number;
  condition: string;
  uvIndex: number | null;
  visibilityMetres: number | null;
  isDay: boolean;
};

export type WeatherHourly = {
  time: string;
  temperature: number | null;
  precipitation: number;
  probability: number | null;
  weatherCode: number | null;
  condition: string | null;
  uvIndex: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  visibilityMetres: number | null;
  pressure: number | null;
};

export type WeatherDaily = {
  date: string;
  precipitationSum: number;
  precipitationProbability: number | null;
  tempMax: number;
  tempMin: number;
  weatherCode: number | null;
  sunrise: string | null;
  sunset: string | null;
  uvIndexMax: number | null;
  windMax: number | null;
  windDirectionDominant: number | null;
  precipitationHours: number | null;
  condition: string | null;
};

export type WeatherNext24h = {
  rainfallMm: number;
  maxProbability: number | null;
  peakWind: number | null;
  peakGusts: number | null;
  peakUv: number | null;
  minVisibilityMetres: number | null;
};

/** Bump when the snapshot shape changes so stale cache rows are refetched. */
export const WEATHER_SNAPSHOT_VERSION = 2;

export type WeatherSnapshot = {
  schemaVersion: number;
  available: boolean;
  sourceName: string;
  sourceUrl: string;
  sourceClass: "OBSERVED" | "FORECAST";
  fetchedAt: string;
  stale: boolean;
  current: WeatherCurrent | null;
  next24hRainfall: number | null;
  hourly: WeatherHourly[];
  daily: WeatherDaily[];
  sun: { sunrise: string | null; sunset: string | null };
  next24h: WeatherNext24h;
  provider: ProviderInfo;
  error?: string;
};

export type WeatherMap = Record<string, WeatherSnapshot>;

const CACHE_TTL_MS = WEATHER_PROVIDER.cacheTtlMinutes * 60 * 1000;

const CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Snowfall",
  75: "Heavy snowfall",
  80: "Rain showers",
  81: "Moderate showers",
  82: "Violent showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe thunderstorm",
};

export function weatherLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) return "Unknown";
  return CODES[code] ?? `WMO ${code}`;
}

export function weatherIcon(code: number | null | undefined, isDay = true): string {
  if (code === null || code === undefined) return "❔";
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code <= 2) return isDay ? "🌤️" : "🌙";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌧️";
  return "⛈️";
}

/** Gradient theme key used by the iPhone-style weather experience. */
export function weatherTheme(code: number | null | undefined, isDay: boolean): string {
  if (!isDay) return "night";
  if (code === null || code === undefined) return "clear";
  if (code === 0 || code === 1) return "clear";
  if (code <= 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code <= 67) return "rain";
  if (code <= 82) return "showers";
  return "storm";
}

/**
 * Cache rows written by an earlier snapshot shape are rejected so a deploy can
 * never serve half-populated weather (e.g. missing pressure or next-24h block).
 */
export function isUsableSnapshot(value: unknown): value is WeatherSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<WeatherSnapshot>;
  if (snapshot.schemaVersion !== WEATHER_SNAPSHOT_VERSION) return false;
  if (typeof snapshot.available !== "boolean") return false;
  if (snapshot.available) {
    if (!snapshot.current || typeof snapshot.current.temperature !== "number") return false;
    if (!snapshot.next24h || typeof snapshot.next24h.rainfallMm !== "number") return false;
    if (!Array.isArray(snapshot.hourly) || !Array.isArray(snapshot.daily)) return false;
  }
  return true;
}

function emptySnapshot(error: string, fetchedAt = new Date().toISOString(), stale = false): WeatherSnapshot {
  return {
    schemaVersion: WEATHER_SNAPSHOT_VERSION,
    next24h: { rainfallMm: 0, maxProbability: null, peakWind: null, peakGusts: null, peakUv: null, minVisibilityMetres: null },
    provider: providerInfo(),
    available: false,
    sourceName: "Open-Meteo",
    sourceUrl: "https://open-meteo.com/",
    sourceClass: "OBSERVED",
    fetchedAt,
    stale,
    current: null,
    next24hRainfall: null,
    hourly: [],
    daily: [],
    sun: { sunrise: null, sunset: null },
    error,
  };
}

type OpenMeteoCurrent = {
  time: string;
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  is_day: number;
  precipitation: number;
  rain?: number;
  weather_code: number;
  cloud_cover?: number;
  pressure_msl?: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  wind_gusts_10m?: number;
  uv_index?: number;
  visibility?: number;
};

type OpenMeteoResponse = {
  current?: OpenMeteoCurrent;
  hourly?: {
    time: string[];
    temperature_2m?: number[];
    precipitation: number[];
    precipitation_probability?: number[];
    weather_code?: number[];
    uv_index?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
    visibility?: number[];
    pressure_msl?: number[];
  };
  daily?: {
    time: string[];
    precipitation_sum: number[];
    precipitation_probability_max?: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code?: number[];
    sunrise?: string[];
    sunset?: string[];
    uv_index_max?: number[];
    wind_speed_10m_max?: number[];
    wind_direction_10m_dominant?: number[];
    precipitation_hours?: number[];
  };
};

export function toSnapshot(payload: OpenMeteoResponse): WeatherSnapshot {
  const current = payload.current;
  const times = payload.hourly?.time ?? [];

  // Align the 24-hour window with "now" rather than midnight, so an afternoon
  // request shows the coming evening/overnight hours.
  const allHours: WeatherHourly[] = times.map((time, i) => {
    const code = payload.hourly?.weather_code?.[i] ?? null;
    return {
      time,
      temperature: payload.hourly?.temperature_2m?.[i] ?? null,
      precipitation: payload.hourly?.precipitation?.[i] ?? 0,
      probability: payload.hourly?.precipitation_probability?.[i] ?? null,
      weatherCode: code,
      condition: code === null ? null : weatherLabel(code),
      uvIndex: payload.hourly?.uv_index?.[i] ?? null,
      windSpeed: payload.hourly?.wind_speed_10m?.[i] ?? null,
      windDirection: payload.hourly?.wind_direction_10m?.[i] ?? null,
      visibilityMetres: payload.hourly?.visibility?.[i] ?? null,
      pressure: payload.hourly?.pressure_msl?.[i] ?? null,
    };
  });

  const nowIndex = current ? Math.max(0, times.findIndex((time) => time >= current.time)) : 0;
  const hourly = allHours.slice(nowIndex, nowIndex + 24);

  const rainfallMm = Math.round(hourly.reduce((sum, hour) => sum + (hour.precipitation ?? 0), 0) * 10) / 10;
  const probabilities = hourly.map((hour) => hour.probability).filter((value): value is number => value !== null);
  const winds = hourly.map((hour) => hour.windSpeed).filter((value): value is number => value !== null);
  const uvs = hourly.map((hour) => hour.uvIndex).filter((value): value is number => value !== null);
  const visibilities = hourly.map((hour) => hour.visibilityMetres).filter((value): value is number => value !== null);

  const sunrise = payload.daily?.sunrise?.[0] ?? null;
  const sunset = payload.daily?.sunset?.[0] ?? null;

  return {
    schemaVersion: WEATHER_SNAPSHOT_VERSION,
    available: Boolean(current),
    sourceName: "Open-Meteo",
    sourceUrl: "https://open-meteo.com/",
    sourceClass: "OBSERVED",
    fetchedAt: new Date().toISOString(),
    stale: false,
    current: current
      ? {
          time: current.time,
          temperature: current.temperature_2m,
          apparentTemperature: current.apparent_temperature ?? null,
          humidity: current.relative_humidity_2m,
          precipitation: current.precipitation ?? current.rain ?? 0,
          precipitationProbability: hourly[0]?.probability ?? null,
          windSpeed: current.wind_speed_10m,
          windDirection: current.wind_direction_10m ?? null,
          windGusts: current.wind_gusts_10m ?? null,
          cloudCover: current.cloud_cover ?? null,
          pressure: current.pressure_msl ?? null,
          weatherCode: current.weather_code,
          condition: weatherLabel(current.weather_code),
          uvIndex: current.uv_index ?? payload.daily?.uv_index_max?.[0] ?? null,
          visibilityMetres: current.visibility ?? null,
          isDay: current.is_day === 1,
        }
      : null,
    next24hRainfall: rainfallMm,
    hourly,
    daily: (payload.daily?.time ?? []).map((date, i) => {
      const code = payload.daily?.weather_code?.[i] ?? null;
      return {
        date,
        precipitationSum: payload.daily?.precipitation_sum?.[i] ?? 0,
        precipitationProbability: payload.daily?.precipitation_probability_max?.[i] ?? null,
        tempMax: payload.daily?.temperature_2m_max?.[i] ?? 0,
        tempMin: payload.daily?.temperature_2m_min?.[i] ?? 0,
        weatherCode: code,
        condition: code === null ? null : weatherLabel(code),
        sunrise: payload.daily?.sunrise?.[i] ?? null,
        sunset: payload.daily?.sunset?.[i] ?? null,
        uvIndexMax: payload.daily?.uv_index_max?.[i] ?? null,
        windMax: payload.daily?.wind_speed_10m_max?.[i] ?? null,
        windDirectionDominant: payload.daily?.wind_direction_10m_dominant?.[i] ?? null,
        precipitationHours: payload.daily?.precipitation_hours?.[i] ?? null,
      };
    }),
    sun: { sunrise, sunset },
    next24h: {
      rainfallMm,
      maxProbability: probabilities.length ? Math.max(...probabilities) : null,
      peakWind: winds.length ? Math.round(Math.max(...winds) * 10) / 10 : null,
      peakGusts: current?.wind_gusts_10m ?? null,
      peakUv: uvs.length ? Math.max(...uvs) : null,
      minVisibilityMetres: visibilities.length ? Math.min(...visibilities) : null,
    },
    provider: providerInfo(),
  };
}

const HOURLY_FIELDS = "temperature_2m,precipitation,precipitation_probability,weather_code,uv_index,wind_speed_10m,wind_direction_10m,visibility,pressure_msl";
const DAILY_FIELDS = "weather_code,precipitation_sum,precipitation_probability_max,precipitation_hours,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,wind_speed_10m_max,wind_direction_10m_dominant";
const CURRENT_FIELDS = "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility";

export async function fetchWeather(district: DistrictSeed, opts?: { force?: boolean }): Promise<WeatherSnapshot> {
  const cached = await db.select().from(weatherCache).where(eq(weatherCache.districtCode, district.code)).limit(1);
  const row = cached[0];
  const usable = row ? isUsableSnapshot(row.payload) : false;
  const fresh = usable && Date.now() - new Date(row.fetchedAt).getTime() < CACHE_TTL_MS;
  if (row && fresh && !opts?.force) return row.payload as WeatherSnapshot;

  const url =
    providerUrl(WEATHER_PROVIDER.baseUrl) +
    `?latitude=${district.lat}&longitude=${district.lng}` +
    `&current=${CURRENT_FIELDS}&hourly=${HOURLY_FIELDS}&daily=${DAILY_FIELDS}` +
    `&timezone=Asia%2FKolkata&forecast_days=7`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEATHER_PROVIDER.timeoutMs);
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
    const payload = (await response.json()) as OpenMeteoResponse;
    if (!payload.current) throw new Error("Open-Meteo payload missing observation block");
    const snapshot = toSnapshot(payload);
    await db
      .insert(weatherCache)
      .values({ districtCode: district.code, payload: snapshot, ok: true, fetchedAt: new Date() })
      .onConflictDoUpdate({ target: weatherCache.districtCode, set: { payload: snapshot, ok: true, fetchedAt: new Date() } });
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weather service unavailable";
    if (row && row.ok && isUsableSnapshot(row.payload)) {
      const previous = row.payload;
      return { ...previous, stale: true, provider: providerInfo(), error: `${message}. Showing last successful update.` };
    }
    return emptySnapshot(`${message}. No cached observation is available for this district.`);
  }
}

/** Refresh many districts in a single Open-Meteo request (comma separated coordinates). */
export async function refreshDistrictWeather(districts: DistrictSeed[]): Promise<WeatherMap> {
  const cachedRows = await db.select().from(weatherCache);
  const cachedMap = new Map(cachedRows.filter((row) => isUsableSnapshot(row.payload)).map((row) => [row.districtCode, row]));
  const missing = districts.filter((d) => !cachedMap.has(d.code));
  const oldestFresh = cachedRows.length ? Math.min(...cachedRows.map((row) => new Date(row.fetchedAt).getTime())) : 0;
  const result: WeatherMap = {};

  if (Date.now() - oldestFresh < CACHE_TTL_MS && missing.length === 0) {
    for (const district of districts) {
      const row = cachedMap.get(district.code);
      if (row) result[district.code] = row.payload as WeatherSnapshot;
    }
    if (Object.keys(result).length === districts.length) return result;
  }

  const lat = districts.map((d) => d.lat).join(",");
  const lng = districts.map((d) => d.lng).join(",");
  const url =
    providerUrl(WEATHER_PROVIDER.baseUrl) +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=${CURRENT_FIELDS}&hourly=${HOURLY_FIELDS}&daily=${DAILY_FIELDS}` +
    `&timezone=Asia%2FKolkata&forecast_days=7`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEATHER_PROVIDER.timeoutMs * 2);
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
    const raw = (await response.json()) as OpenMeteoResponse | OpenMeteoResponse[];
    const list = Array.isArray(raw) ? raw : [raw];
    for (let i = 0; i < districts.length; i += 1) {
      const payload = list[i];
      if (!payload) continue;
      const snapshot = toSnapshot(payload);
      result[districts[i].code] = snapshot;
      await db
        .insert(weatherCache)
        .values({ districtCode: districts[i].code, payload: snapshot, ok: snapshot.available, fetchedAt: new Date() })
        .onConflictDoUpdate({
          target: weatherCache.districtCode,
          set: { payload: snapshot, ok: snapshot.available, fetchedAt: new Date() },
        });
    }
    // Any district omitted by the provider falls back to cache or an explicit unavailable state.
    for (const district of districts) {
      if (result[district.code]) continue;
      const previous = cachedMap.get(district.code)?.payload as WeatherSnapshot | undefined;
      result[district.code] = previous
        ? { ...previous, stale: true, provider: providerInfo(), error: "Provider omitted this district in the batch response. Cached observation shown." }
        : emptySnapshot("Provider omitted this district. No observation available.");
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weather service unavailable";
    for (const district of districts) {
      const previous = cachedMap.get(district.code)?.payload as WeatherSnapshot | undefined;
      result[district.code] = previous
        ? { ...previous, stale: true, provider: providerInfo(), error: `${message}. Cached observation shown.` }
        : emptySnapshot(`${message}. No cached observation for this district.`);
    }
    return result;
  }
}
