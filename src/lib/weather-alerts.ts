import type { WeatherSnapshot } from "./weather";

/**
 * Severe-weather alert assembly.
 *
 * Two clearly separated classes are returned:
 *  1. DisasterLink alerts published by authorised officers (stored in the alerts
 *     table). These can carry the OFFICIAL_WARNING class only when a source
 *     reference was supplied at publication time; SIMULATED demo rows stay badged.
 *  2. Forecast signals derived locally from the provider forecast using published
 *     IMD-style rainfall thresholds. These are always classified FORECAST and are
 *     never presented as official government warnings.
 */

export type AlertSeverity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export type OfficialAlertView = {
  id: number;
  title: string;
  summary: string;
  instruction: string | null;
  category: string;
  categoryLabel: string;
  severity: string;
  districtCode: string | null;
  sourceName: string;
  sourceUrl: string | null;
  sourceReference: string | null;
  sourceClass: string;
  publishedByName: string | null;
  isSimulated: boolean;
  issuedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
  origin: "DISASTERLINK_OFFICER";
};

export type ForecastSignal = {
  id: string;
  title: string;
  detail: string;
  severity: AlertSeverity;
  category: "HEAVY_RAINFALL" | "EXTREMELY_HEAVY_RAINFALL" | "THUNDERSTORM" | "STRONG_WINDS" | "HEATWAVE" | "LOW_VISIBILITY" | "EXTREME_UV";
  sourceClass: "FORECAST";
  sourceName: string;
  issuedAt: string;
  expiresAt: string | null;
  threshold: string;
  observedValue: string;
  isOfficialWarning: false;
  origin: "PROVIDER_FORECAST_DERIVED";
};

export type WeatherAlertPayload = {
  districtCode: string;
  districtName: string;
  officialAlerts: OfficialAlertView[];
  forecastSignals: ForecastSignal[];
  counts: { official: number; forecastSignals: number; officialWarnings: number; simulated: number };
  guidance: string;
  providerIssueTime: string | null;
};

/**
 * IMD rainfall classification thresholds (24 h accumulated rainfall, mm).
 * Reference: IMD "Heavy rain" 64.5–115.5 mm, "Very heavy" 115.6–204.4 mm,
 * "Extremely heavy" > 204.4 mm. Thresholds are used here to *describe a
 * forecast*, never to issue an official warning.
 */
export const IMD_RAINFALL_THRESHOLDS = {
  heavy: 64.5,
  veryHeavy: 115.6,
  extremelyHeavy: 204.4,
} as const;

const WET_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

export function deriveForecastSignals(snapshot: WeatherSnapshot | null | undefined, districtName: string): ForecastSignal[] {
  if (!snapshot?.available || !snapshot.current) return [];
  const signals: ForecastSignal[] = [];
  const hourly = Array.isArray(snapshot.hourly) ? snapshot.hourly : [];
  const daily = Array.isArray(snapshot.daily) ? snapshot.daily : [];
  const next24h = snapshot.next24h;
  const issuedAt = snapshot.fetchedAt;
  const current = snapshot.current;
  const nextDay = daily[0];
  const rainfall24h = nextDay?.precipitationSum ?? next24h?.rainfallMm ?? null;
  const probability24h = nextDay?.precipitationProbability ?? next24h?.maxProbability ?? null;
  const windPeak = Math.max(current.windSpeed ?? 0, next24h?.peakWind ?? 0, nextDay?.windMax ?? 0);
  const gust = next24h?.peakGusts ?? current.windGusts ?? null;
  const maxTemp = Math.max(...daily.slice(0, 2).map((day) => day.tempMax), current.temperature);
  const minVisibility = next24h?.minVisibilityMetres ?? current.visibilityMetres ?? null;
  const peakUv = Math.max(next24h?.peakUv ?? 0, current.uvIndex ?? 0, ...daily.slice(0, 2).map((day) => day.uvIndexMax ?? 0));
  const thunder = hourly.slice(0, 12).some((hour) => hour.weatherCode !== null && hour.weatherCode >= 95) || current.weatherCode >= 95;

  if (rainfall24h !== null && rainfall24h >= IMD_RAINFALL_THRESHOLDS.extremelyHeavy) {
    signals.push({
      id: "extremely-heavy-rainfall",
      title: "Extremely heavy rainfall indicated by forecast",
      detail: `The provider forecast indicates about ${rainfall24h.toFixed(1)} mm of accumulated rain in the next 24 hours for ${districtName}. This exceeds the IMD "extremely heavy" rainfall band, but this signal is a local interpretation of a forecast — not an issued warning.`,
      severity: "CRITICAL",
      category: "EXTREMELY_HEAVY_RAINFALL",
      sourceClass: "FORECAST",
      sourceName: snapshot.sourceName,
      issuedAt,
      expiresAt: nextDay?.date ? `${nextDay.date}T23:59:59+05:30` : null,
      threshold: `> ${IMD_RAINFALL_THRESHOLDS.extremelyHeavy} mm / 24 h`,
      observedValue: `${rainfall24h.toFixed(1)} mm / 24 h`,
      isOfficialWarning: false,
      origin: "PROVIDER_FORECAST_DERIVED",
    });
  } else if (rainfall24h !== null && rainfall24h >= IMD_RAINFALL_THRESHOLDS.veryHeavy) {
    signals.push({
      id: "very-heavy-rainfall",
      title: "Very heavy rainfall indicated by forecast",
      detail: `The provider forecast indicates about ${rainfall24h.toFixed(1)} mm in the next 24 hours for ${districtName}, inside the IMD "very heavy" band. Forecast information only — no official warning has been issued through DisasterLink.`,
      severity: "HIGH",
      category: "HEAVY_RAINFALL",
      sourceClass: "FORECAST",
      sourceName: snapshot.sourceName,
      issuedAt,
      expiresAt: nextDay?.date ? `${nextDay.date}T23:59:59+05:30` : null,
      threshold: `${IMD_RAINFALL_THRESHOLDS.veryHeavy}–${IMD_RAINFALL_THRESHOLDS.extremelyHeavy} mm / 24 h`,
      observedValue: `${rainfall24h.toFixed(1)} mm / 24 h`,
      isOfficialWarning: false,
      origin: "PROVIDER_FORECAST_DERIVED",
    });
  } else if ((rainfall24h !== null && rainfall24h >= IMD_RAINFALL_THRESHOLDS.heavy) || (probability24h !== null && probability24h >= 80 && rainfall24h !== null && rainfall24h >= 30)) {
    signals.push({
      id: "heavy-rainfall",
      title: "Heavy rainfall indicated by forecast",
      detail: `Forecast accumulation for ${districtName} is about ${rainfall24h?.toFixed(1) ?? "—"} mm over 24 hours with a peak rain probability of ${probability24h ?? "—"}%. Forecast information only, not an official warning.`,
      severity: "MODERATE",
      category: "HEAVY_RAINFALL",
      sourceClass: "FORECAST",
      sourceName: snapshot.sourceName,
      issuedAt,
      expiresAt: nextDay?.date ? `${nextDay.date}T23:59:59+05:30` : null,
      threshold: `${IMD_RAINFALL_THRESHOLDS.heavy}–${IMD_RAINFALL_THRESHOLDS.veryHeavy} mm / 24 h`,
      observedValue: `${rainfall24h?.toFixed(1) ?? "—"} mm / 24 h`,
      isOfficialWarning: false,
      origin: "PROVIDER_FORECAST_DERIVED",
    });
  }

  if (thunder) {
    signals.push({
      id: "thunderstorm",
      title: "Thunderstorm activity indicated",
      detail: "The forecast contains thunderstorm weather codes in the next few hours. Lightning safety guidance applies. Forecast information only.",
      severity: "HIGH",
      category: "THUNDERSTORM",
      sourceClass: "FORECAST",
      sourceName: snapshot.sourceName,
      issuedAt,
      expiresAt: null,
      threshold: "WMO weather code ≥ 95 in the next 12 h",
      observedValue: `code ${hourly.slice(0, 12).find((hour) => (hour.weatherCode ?? 0) >= 95)?.weatherCode ?? current.weatherCode}`,
      isOfficialWarning: false,
      origin: "PROVIDER_FORECAST_DERIVED",
    });
  }

  if (windPeak >= 40 || (gust ?? 0) >= 60) {
    signals.push({
      id: "strong-winds",
      title: "Strong winds indicated",
      detail: `Peak forecast wind speed is about ${Math.round(windPeak)} km/h${gust !== null ? ` with gusts near ${Math.round(gust)} km/h` : ""}. Secure loose objects and avoid exposed coastal areas. Forecast information only.`,
      severity: windPeak >= 62 ? "HIGH" : "MODERATE",
      category: "STRONG_WINDS",
      sourceClass: "FORECAST",
      sourceName: snapshot.sourceName,
      issuedAt,
      expiresAt: null,
      threshold: "≥ 40 km/h sustained or ≥ 60 km/h gusts",
      observedValue: `${Math.round(windPeak)} km/h${gust !== null ? ` · gust ${Math.round(gust)} km/h` : ""}`,
      isOfficialWarning: false,
      origin: "PROVIDER_FORECAST_DERIVED",
    });
  }

  if (maxTemp >= 40) {
    signals.push({
      id: "heatwave",
      title: "Heat conditions indicated",
      detail: `Forecast maximum temperature reaches about ${Math.round(maxTemp)} °C. Heat stress thresholds vary by district; this is a forecast-derived indicator, not an official heatwave declaration.`,
      severity: maxTemp >= 44 ? "HIGH" : "MODERATE",
      category: "HEATWAVE",
      sourceClass: "FORECAST",
      sourceName: snapshot.sourceName,
      issuedAt,
      expiresAt: null,
      threshold: "≥ 40 °C forecast maximum",
      observedValue: `${Math.round(maxTemp)} °C`,
      isOfficialWarning: false,
      origin: "PROVIDER_FORECAST_DERIVED",
    });
  }

  if (minVisibility !== null && minVisibility < 1000) {
    signals.push({
      id: "low-visibility",
      title: "Reduced visibility indicated",
      detail: `Visibility is forecast to fall to about ${Math.round(minVisibility)} m. Driving and coastal operations may be affected. Forecast information only.`,
      severity: minVisibility < 500 ? "HIGH" : "MODERATE",
      category: "LOW_VISIBILITY",
      sourceClass: "FORECAST",
      sourceName: snapshot.sourceName,
      issuedAt,
      expiresAt: null,
      threshold: "< 1000 m",
      observedValue: `${Math.round(minVisibility)} m`,
      isOfficialWarning: false,
      origin: "PROVIDER_FORECAST_DERIVED",
    });
  }

  if (peakUv >= 11) {
    signals.push({
      id: "extreme-uv",
      title: "Extreme UV index indicated",
      detail: `Forecast UV index reaches ${peakUv.toFixed(1)}. Avoid direct sun exposure around midday. Forecast information only.`,
      severity: "MODERATE",
      category: "EXTREME_UV",
      sourceClass: "FORECAST",
      sourceName: snapshot.sourceName,
      issuedAt,
      expiresAt: null,
      threshold: "UV index ≥ 11",
      observedValue: `UV ${peakUv.toFixed(1)}`,
      isOfficialWarning: false,
      origin: "PROVIDER_FORECAST_DERIVED",
    });
  }

  const order: Record<AlertSeverity, number> = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
  return signals.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function hasWetCode(code: number | null | undefined): boolean {
  return code !== null && code !== undefined && WET_CODES.has(code);
}

export const WEATHER_ALERT_GUIDANCE =
  "Signals marked FORECAST are derived locally from provider forecast values and are not official government warnings. Official IMD / TNSDMA bulletins are not ingested by DisasterLink; only alerts published by an authorised officer appear as DisasterLink notices, and SIMULATED demonstration records stay badged.";
