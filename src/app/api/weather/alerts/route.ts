import { desc } from "drizzle-orm";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { fail, handleError, ok, requireUser } from "@/lib/api";
import { districtByCode } from "@/lib/districts";
import { fetchWeather, providerInfo } from "@/lib/weather";
import {
  WEATHER_ALERT_GUIDANCE,
  deriveForecastSignals,
  type OfficialAlertView,
  type WeatherAlertPayload,
} from "@/lib/weather-alerts";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  FLOOD_WARNING: "Flood warning",
  HEAVY_RAINFALL: "Heavy rainfall",
  CYCLONE_WARNING: "Cyclone warning",
  LANDSLIDE_WARNING: "Landslide warning",
  EXTREME_WEATHER: "Extreme weather",
  ROAD_CLOSURE: "Road closure",
  EVACUATION: "Emergency evacuation",
  PUBLIC_SAFETY_NOTICE: "Public safety notice",
};

export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const url = new URL(request.url);
    const code = (url.searchParams.get("district") ?? "TN-CBE").toUpperCase();
    const district = districtByCode(code);
    if (!district) return fail("Unknown district code", 404);

    const [weather, rows, user] = await Promise.all([
      fetchWeather(district),
      db.select().from(alerts).orderBy(desc(alerts.createdAt)),
      requireUser().catch(() => null),
    ]);

    const officialAlerts: OfficialAlertView[] = rows
      .filter((row) => !row.districtCode || row.districtCode === district.code)
      .filter((row) => row.isActive)
      .map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        instruction: row.instruction,
        category: row.category,
        categoryLabel: CATEGORY_LABELS[row.category] ?? row.category,
        severity: row.severity,
        districtCode: row.districtCode,
        sourceName: row.sourceName,
        sourceUrl: row.sourceUrl,
        sourceReference: row.sourceReference,
        sourceClass: row.sourceClass,
        publishedByName: row.publishedByName,
        isSimulated: row.isSimulated || row.sourceClass === "SIMULATED",
        issuedAt: row.issuedAt ? new Date(row.issuedAt).toISOString() : null,
        expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
        expired: row.expiresAt ? new Date(row.expiresAt).getTime() < Date.now() : false,
        origin: "DISASTERLINK_OFFICER" as const,
      }))
      .sort((a, b) => (a.expired === b.expired ? 0 : a.expired ? 1 : -1));

    const forecastSignals = deriveForecastSignals(weather, district.name);

    const payload: WeatherAlertPayload = {
      districtCode: district.code,
      districtName: district.name,
      officialAlerts,
      forecastSignals,
      counts: {
        official: officialAlerts.filter((alert) => alert.sourceClass === "OFFICIAL_WARNING").length,
        forecastSignals: forecastSignals.length,
        officialWarnings: officialAlerts.length,
        simulated: officialAlerts.filter((alert) => alert.isSimulated).length,
      },
      guidance: WEATHER_ALERT_GUIDANCE,
      providerIssueTime: weather.available ? (weather.current?.time ?? weather.fetchedAt) : null,
    };

    return ok(
      {
        ...payload,
        provider: providerInfo(),
        weather: {
          available: weather.available,
          stale: weather.stale,
          fetchedAt: weather.fetchedAt,
          error: weather.error ?? null,
          sourceClass: "FORECAST" as const,
          thresholds: {
            heavyRain24hMm: 64.5,
            veryHeavyRain24hMm: 115.6,
            extremelyHeavyRain24hMm: 204.4,
            strongWindKmh: 40,
            heatwaveMaxC: 40,
            extremeUv: 11,
          },
        },
        authenticated: Boolean(user),
      },
      undefined,
      "Weather alerts retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}
