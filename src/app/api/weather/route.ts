import { fail, handleError, ok } from "@/lib/api";
import { districtByCode } from "@/lib/districts";
import { fetchWeather, providerInfo } from "@/lib/weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = (url.searchParams.get("district") ?? "TN-CBE").toUpperCase();
    const force = url.searchParams.get("refresh") === "1";
    const district = districtByCode(code);
    if (!district) return fail("Unknown district code", 404);

    const weather = await fetchWeather(district, { force });

    return ok(
      {
        district: { code: district.code, name: district.name, region: district.region, lat: district.lat, lng: district.lng },
        weather,
        provider: providerInfo(),
        classification: {
          current: "OBSERVED",
          hourly: "FORECAST",
          daily: "FORECAST",
          note: "Current conditions are provider observations at the district reference point; hourly and daily values are provider forecasts. Neither is an official warning.",
        },
        cache: {
          ttlMinutes: providerInfo().cacheTtlMinutes,
          stale: weather.stale,
          fetchedAt: weather.fetchedAt,
        },
      },
      undefined,
      "Weather retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}
