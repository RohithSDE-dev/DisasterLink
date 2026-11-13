"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { useApi } from "@/components/interactive";
import { Chip, DataClassBadge, Notice, SourceBadge, formatDateTime } from "@/components/ui";
import TamilNaduMap from "@/components/TamilNaduMap";
import { useSelectedDistrict } from "@/components/citizen/useDistrict";

/* --------------------------------- types --------------------------------- */

type Weather = {
  available: boolean;
  stale: boolean;
  fetchedAt: string;
  sourceName: string;
  sourceUrl: string;
  sourceClass: string;
  error?: string;
  next24hRainfall: number | null;
  current: {
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
  } | null;
  hourly: {
    time: string;
    temperature: number | null;
    precipitation: number;
    probability: number | null;
    weatherCode: number | null;
    condition: string | null;
    windSpeed: number | null;
    windDirection: number | null;
    visibilityMetres: number | null;
    pressure: number | null;
  }[];
  daily: {
    date: string;
    precipitationSum: number;
    precipitationProbability: number | null;
    tempMax: number;
    tempMin: number;
    weatherCode: number | null;
    condition: string | null;
    sunrise: string | null;
    sunset: string | null;
    uvIndexMax: number | null;
    windMax: number | null;
    windDirectionDominant: number | null;
    precipitationHours: number | null;
  }[];
  sun: { sunrise: string | null; sunset: string | null };
  next24h: { rainfallMm: number; maxProbability: number | null; peakWind: number | null; peakGusts: number | null; peakUv: number | null; minVisibilityMetres: number | null };
  provider: { name: string; attribution: string; keyRequired: boolean; apiKeyConfigured: boolean; cacheTtlMinutes: number };
};

type WeatherResponse = {
  district: { code: string; name: string; region: string; lat: number; lng: number };
  weather: Weather;
  provider: Weather["provider"];
  cache: { ttlMinutes: number; stale: boolean; fetchedAt: string };
  classification: { current: string; hourly: string; daily: string; note: string };
};

type AlertResponse = {
  districtName: string;
  officialAlerts: {
    id: number;
    title: string;
    summary: string;
    instruction: string | null;
    categoryLabel: string;
    severity: string;
    sourceName: string;
    sourceReference: string | null;
    sourceClass: string;
    publishedByName: string | null;
    isSimulated: boolean;
    issuedAt: string | null;
    expiresAt: string | null;
    expired: boolean;
  }[];
  forecastSignals: {
    id: string;
    title: string;
    detail: string;
    severity: string;
    category: string;
    sourceName: string;
    issuedAt: string;
    expiresAt: string | null;
    threshold: string;
    observedValue: string;
    origin: string;
  }[];
  counts: { official: number; forecastSignals: number; officialWarnings: number; simulated: number };
  guidance: string;
  providerIssueTime: string | null;
};

type BoardRow = {
  code: string;
  name: string;
  region: string;
  risk: { level: string };
  weather: {
    available: boolean;
    temperature: number | null;
    next24hRainfall: number | null;
    precipProbability: number | null;
    windSpeed: number | null;
    condition: string | null;
  };
};

/* -------------------------------- helpers -------------------------------- */

const THEMES: Record<string, { sky: string; ring: string }> = {
  clearDay: { sky: "from-[#0b3d91] via-[#1e6ad1] to-[#8ec5f5]", ring: "ring-white/25" },
  clearNight: { sky: "from-[#020617] via-[#0b1b34] to-[#1e3a5f]", ring: "ring-white/15" },
  cloudy: { sky: "from-[#1e293b] via-[#3b5268] to-[#8598a8]", ring: "ring-white/20" },
  fog: { sky: "from-[#334155] via-[#55657a] to-[#a3b3c2]", ring: "ring-white/20" },
  rain: { sky: "from-[#0f2438] via-[#17466b] to-[#41809f]", ring: "ring-white/20" },
  showers: { sky: "from-[#12283c] via-[#1c5568] to-[#57a2b6]", ring: "ring-white/20" },
  storm: { sky: "from-[#1a1035] via-[#33245c] to-[#57457f]", ring: "ring-white/20" },
};

function themeFor(code: number | null | undefined, isDay: boolean) {
  if (!isDay) return THEMES.clearNight;
  if (code === null || code === undefined) return THEMES.clearDay;
  if (code <= 1) return THEMES.clearDay;
  if (code <= 3) return THEMES.cloudy;
  if (code <= 48) return THEMES.fog;
  if (code <= 57) return THEMES.rain;
  if (code <= 67) return THEMES.rain;
  if (code <= 77) return THEMES.showers;
  if (code <= 82) return THEMES.showers;
  return THEMES.storm;
}

function iconFor(code: number | null | undefined, isDay = true) {
  if (code === null || code === undefined) return "🌡️";
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code === 1) return isDay ? "🌤️" : "🌙";
  if (code === 2) return isDay ? "⛅" : "☁️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  return "⛈️";
}

function bearing(degrees: number | null | undefined) {
  if (degrees === null || degrees === undefined) return "—";
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round(degrees / 22.5) % 16];
}

function uvBand(uv: number | null | undefined) {
  if (uv === null || uv === undefined) return { label: "Not provided", tone: "text-slate-200" };
  if (uv < 3) return { label: "Low", tone: "text-emerald-200" };
  if (uv < 6) return { label: "Moderate", tone: "text-amber-200" };
  if (uv < 8) return { label: "High", tone: "text-orange-200" };
  if (uv < 11) return { label: "Very high", tone: "text-red-200" };
  return { label: "Extreme", tone: "text-red-300" };
}

function clockTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function hourLabel(value: string, first: boolean) {
  if (first) return "Now";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", hour12: true });
}

const QUICK_PICKS = [
  { code: "TN-CHN", label: "Chennai" },
  { code: "TN-CBE", label: "Coimbatore" },
  { code: "TN-MDU", label: "Madurai" },
  { code: "TN-SLM", label: "Salem" },
  { code: "TN-TRC", label: "Tiruchirappalli" },
];

const RECENT_KEY = "dl.weather.recent";

type MapMode = "temperature" | "rainfall" | "probability" | "wind";

/* ------------------------------- component ------------------------------- */

export default function WeatherPremium() {
  const [district, selectDistrict] = useSelectedDistrict();
  const [recent, setRecent] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>("temperature");
  const [mapOpen, setMapOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const weatherApi = useApi<WeatherResponse>(`/api/weather?district=${district}`, [district]);
  const alertApi = useApi<AlertResponse>(`/api/weather/alerts?district=${district}`, [district]);
  const boardApi = useApi<{ districts: BoardRow[] }>("/api/districts");

  /* recent districts */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      if (Array.isArray(parsed)) setRecent(parsed.filter((code) => DISTRICTS.some((d) => d.code === code)));
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    if (!district) return;
    setRecent((current) => {
      const next = [district, ...current.filter((code) => code !== district)].slice(0, 5);
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [district]);

  /* deep link support: /weather?district=TN-MDU */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preset = params.get("district")?.toUpperCase();
    if (preset && DISTRICTS.some((d) => d.code === preset)) selectDistrict(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseDistrict = useCallback(
    (code: string) => {
      selectDistrict(code);
      setPickerOpen(false);
      setSearch("");
      const url = new URL(window.location.href);
      url.searchParams.set("district", code);
      window.history.replaceState(null, "", url.toString());
    },
    [selectDistrict],
  );

  const data = weatherApi.data;
  const weather = data?.weather ?? null;
  const board = boardApi.data?.districts ?? [];
  const districtMeta = DISTRICTS.find((entry) => entry.code === district);
  const theme = themeFor(weather?.current?.weatherCode, weather?.current?.isDay ?? true);
  const alertData = alertApi.data;

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return DISTRICTS;
    return DISTRICTS.filter((entry) => entry.name.toLowerCase().includes(query));
  }, [search]);

  const mapValues = useMemo(() => {
    const read = (row: BoardRow) => {
      if (!row.weather.available) return null;
      if (mapMode === "temperature") return row.weather.temperature;
      if (mapMode === "rainfall") return row.weather.next24hRainfall;
      if (mapMode === "probability") return row.weather.precipProbability;
      return row.weather.windSpeed;
    };
    const rows = board
      .map((row) => ({ code: row.code, name: row.name, value: read(row) }))
      .filter((row): row is { code: string; name: string; value: number } => row.value !== null && row.value !== undefined);
    return { rows: rows.sort((a, b) => b.value - a.value), max: Math.max(1, ...rows.map((row) => row.value)) };
  }, [board, mapMode]);

  const mapUnit = mapMode === "temperature" ? "°C" : mapMode === "wind" ? "km/h" : "mm";
  const mapLabel = mapMode === "temperature" ? "Temperature" : mapMode === "rainfall" ? "Rainfall (24h)" : mapMode === "probability" ? "Rain probability" : "Wind speed";
  const mapAvailable = board.length > 0 && mapValues.rows.length > 0;

  const mapMarkers = districtMeta
    ? [
        {
          id: "selected",
          type: "FACILITY" as const,
          lat: districtMeta.lat,
          lng: districtMeta.lng,
          title: districtMeta.name,
          description: "Selected district reference point",
          status: "SELECTED",
        },
      ]
    : [];

  function refresh() {
    weatherApi.reload();
    alertApi.reload();
    boardApi.reload();
  }

  return (
    <div className="space-y-4">
      {/* ---------------------------- district bar ---------------------------- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Phase 2 · District weather</p>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">{districtMeta?.name ?? "Tamil Nadu"}</h1>
            <p className="text-[11px] text-slate-500">
              {districtMeta?.region} region · {districtMeta?.lat.toFixed(3)}° N, {districtMeta?.lng.toFixed(3)}° E ·{" "}
              {weather?.available ? `updated ${formatDateTime(weather.fetchedAt)}` : "provider pending"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button className="btn-outline btn-sm" onClick={() => setPickerOpen((value) => !value)} aria-expanded={pickerOpen}>
              {pickerOpen ? "Close selector" : "Change district"}
            </button>
            <button className="btn-outline btn-sm" onClick={() => setMapOpen((value) => !value)}>
              {mapOpen ? "Hide map" : "Select on map"}
            </button>
            <Link className="btn-outline btn-sm" href={`/map?district=${district}`}>3D map</Link>
            <Link className="btn-primary btn-sm" href={`/districts/${district}`}>District brief</Link>
            <button className="btn-ghost btn-sm" onClick={refresh}>Refresh</button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Quick select</span>
          {QUICK_PICKS.map((pick) => (
            <button
              key={pick.code}
              onClick={() => chooseDistrict(pick.code)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset transition ${
                district === pick.code ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {pick.label}
            </button>
          ))}
        </div>

        {recent.length > 1 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Recent</span>
            {recent.map((code) => {
              const entry = DISTRICTS.find((districtEntry) => districtEntry.code === code);
              if (!entry) return null;
              return (
                <button
                  key={code}
                  onClick={() => chooseDistrict(code)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                    code === district ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {entry.name}
                </button>
              );
            })}
          </div>
        ) : null}

        {pickerOpen ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <input
              ref={searchRef}
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${DISTRICTS.length} districts…`}
              className="input mb-2 py-1.5 text-sm"
              aria-label="Search districts"
            />
            <div className="grid max-h-[220px] grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
              {searchResults.map((entry) => (
                <button
                  key={entry.code}
                  onClick={() => chooseDistrict(entry.code)}
                  className={`rounded-md px-2 py-1.5 text-left text-[11px] font-medium transition ${
                    entry.code === district ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-blue-50"
                  }`}
                >
                  {entry.name}
                </button>
              ))}
              {searchResults.length === 0 ? <p className="col-span-full p-2 text-[11px] text-slate-500">No district matches “{search}”.</p> : null}
            </div>
            <p className="mt-1.5 text-[10px] text-slate-500">
              {DISTRICTS.length} districts available. Selecting a district updates current conditions, hourly and seven-day forecasts, alerts and every map layer.
            </p>
          </div>
        ) : null}

        {mapOpen ? (
          <div className="mt-3">
            <TamilNaduMap
              compact
              heightClass="h-[280px] sm:h-[340px]"
              districts={board.map((row) => ({
                code: row.code,
                name: row.name,
                riskLevel: row.risk.level,
                temperature: row.weather.temperature,
              }))}
              markers={mapMarkers}
              selectedCode={district}
              onSelectDistrict={(code) => chooseDistrict(code)}
            />
            <p className="mt-1 text-[10px] text-slate-500">District selection map (2D, fast). Open the 3D map for terrain and operational layers.</p>
          </div>
        ) : null}
      </div>

      {weatherApi.error ? (
        <Notice tone="danger" title="Weather request failed">
          {weatherApi.error}. No values are substituted — retry, or check official IMD bulletins directly.
        </Notice>
      ) : null}

      {weather && !weather.available ? (
        <Notice tone="warn" title="Live weather unavailable">
          {weather.error ?? "The weather provider could not be reached."} Last attempt {formatDateTime(weather.fetchedAt)}. District selection,
          alerts and the map remain usable.
        </Notice>
      ) : null}

      {/* ------------------------------ hero card ----------------------------- */}
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${theme.sky} p-5 text-white shadow-xl ring-1 ring-inset ${theme.ring} sm:p-7`}>
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold tracking-wide text-white/85">{districtMeta?.name}, Tamil Nadu</p>
            <p className="text-[11px] text-white/65">
              {weather?.current ? `${weather.current.condition} · observed ${clockTime(weather.current.time)}` : "No observation available"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="rounded-full bg-white/15 px-2 py-1 font-semibold ring-1 ring-inset ring-white/25">OBSERVED NOW</span>
            <span className="rounded-full bg-white/15 px-2 py-1 font-semibold ring-1 ring-inset ring-white/25">HOURLY · 7-DAY FORECAST</span>
            <span className="rounded-full bg-white/15 px-2 py-1 font-semibold ring-1 ring-inset ring-white/25">{weather?.provider?.name ?? "Provider"}</span>
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-end gap-3">
            <span className="text-6xl leading-none drop-shadow sm:text-7xl">{iconFor(weather?.current?.weatherCode, weather?.current?.isDay ?? true)}</span>
            <div>
              <p className="text-6xl font-thin leading-none tracking-tighter sm:text-7xl">
                {weather?.current ? Math.round(weather.current.temperature) : "—"}°
              </p>
              <p className="mt-1 text-sm font-semibold text-white/90">
                {weather?.current?.condition ?? "Unavailable"}
                {weather?.current?.apparentTemperature !== null && weather?.current?.apparentTemperature !== undefined
                  ? ` · feels like ${Math.round(weather.current.apparentTemperature)}°`
                  : ""}
              </p>
              <p className="text-xs text-white/70">
                H {weather?.daily[0] ? Math.round(weather.daily[0].tempMax) : "—"}° · L {weather?.daily[0] ? Math.round(weather.daily[0].tempMin) : "—"}°
                {weather?.next24h?.rainfallMm !== undefined ? ` · ${weather.next24h.rainfallMm} mm next 24 h` : ""}
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-3">
            {[
              { label: "Humidity", value: weather?.current ? `${Math.round(weather.current.humidity)}%` : "—" },
              { label: "Wind", value: weather?.current ? `${Math.round(weather.current.windSpeed)} km/h ${bearing(weather.current.windDirection)}` : "—" },
              { label: "Gusts", value: weather?.current?.windGusts !== null && weather?.current?.windGusts !== undefined ? `${Math.round(weather.current.windGusts)} km/h` : "—" },
              { label: "Rain now", value: weather?.current ? `${weather.current.precipitation.toFixed(1)} mm` : "—" },
              { label: "Rain chance", value: weather?.next24h?.maxProbability !== null && weather?.next24h?.maxProbability !== undefined ? `${weather.next24h.maxProbability}%` : "—" },
              { label: "Pressure", value: weather?.current?.pressure !== null && weather?.current?.pressure !== undefined ? `${Math.round(weather.current.pressure)} hPa` : "—" },
              { label: "UV index", value: `${weather?.current?.uvIndex?.toFixed(0) ?? "—"} · ${uvBand(weather?.current?.uvIndex).label}` },
              { label: "Visibility", value: weather?.current?.visibilityMetres !== null && weather?.current?.visibilityMetres !== undefined ? `${(weather.current.visibilityMetres / 1000).toFixed(1)} km` : "—" },
              { label: "Cloud cover", value: weather?.current?.cloudCover !== null && weather?.current?.cloudCover !== undefined ? `${Math.round(weather.current.cloudCover)}%` : "—" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-white/10 px-2.5 py-2 backdrop-blur-sm ring-1 ring-inset ring-white/15">
                <p className="text-[9px] font-bold uppercase tracking-wide text-white/60">{item.label}</p>
                <p className="text-sm font-bold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-4 grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2 ring-1 ring-inset ring-white/15">
            <span className="text-xl">🌅</span>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-white/60">Sunrise</p>
              <p className="text-sm font-bold">{clockTime(weather?.sun.sunrise)}</p>
            </div>
            <span className="ml-auto text-[10px] text-white/60">Sunset {clockTime(weather?.sun.sunset)}</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2 ring-1 ring-inset ring-white/15">
            <span className="text-xl">💧</span>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-white/60">Next 24 hours</p>
              <p className="text-sm font-bold">
                {weather?.next24h?.rainfallMm ?? "—"} mm · peak {weather?.next24h?.maxProbability ?? "—"}%
              </p>
            </div>
            <span className="ml-auto text-[10px] text-white/60">Wind peak {weather?.next24h?.peakWind ?? "—"} km/h</span>
          </div>
        </div>
      </div>

      {/* ------------------------------- hourly ------------------------------- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">Hourly forecast</p>
            <h2 className="text-sm font-bold text-slate-900">Next 24 hours</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <SourceBadge source="FORECAST" />
            <span className="text-[10px] text-slate-500">{weather?.hourly.length ?? 0} hours from provider</span>
          </div>
        </div>
        {weather?.hourly.length ? (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {weather.hourly.map((hour, index) => (
              <div
                key={hour.time}
                className={`min-w-[70px] rounded-xl border px-2 py-2 text-center ${
                  index === 0 ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{hourLabel(hour.time, index === 0)}</p>
                <p className="my-1 text-lg">{iconFor(hour.weatherCode, true)}</p>
                <p className="text-sm font-bold text-slate-900">{hour.temperature !== null ? `${Math.round(hour.temperature)}°` : "—"}</p>
                <p className="text-[10px] font-semibold text-blue-700">{hour.probability ?? 0}%</p>
                <p className="text-[9px] text-slate-500">{hour.precipitation.toFixed(1)} mm</p>
                <p className="text-[9px] text-slate-400">{hour.windSpeed !== null ? `${Math.round(hour.windSpeed)} km/h` : "—"}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500">Hourly forecast unavailable from the provider right now.</p>
        )}
        <p className="mt-1 text-[9px] text-slate-500">Hourly values are provider forecasts. Missing fields are shown as “—”, never filled with invented values.</p>
      </div>

      {/* ---------------------------- seven-day ------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">Seven-day forecast</p>
            <h2 className="text-sm font-bold text-slate-900">Daily outlook</h2>
          </div>
          <SourceBadge source="FORECAST" />
        </div>
        {weather?.daily.length ? (
          <ul className="divide-y divide-slate-100">
            {weather.daily.map((day, index) => {
              const span = Math.max(1, ...weather.daily.map((entry) => entry.tempMax - entry.tempMin));
              const low = Math.min(...weather.daily.map((entry) => entry.tempMin));
              const left = ((day.tempMin - low) / span) * 100;
              const width = Math.max(6, ((day.tempMax - day.tempMin) / span) * 100);
              return (
                <li key={day.date} className="flex flex-wrap items-center gap-2 py-2 text-xs sm:flex-nowrap">
                  <span className="w-[92px] shrink-0 font-bold text-slate-800">
                    {index === 0 ? "Today" : new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" })}
                    <span className="ml-1 font-normal text-slate-500">
                      {new Date(day.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </span>
                  </span>
                  <span className="text-lg">{iconFor(day.weatherCode, true)}</span>
                  <span className="w-[112px] shrink-0 text-[11px] text-slate-600">{day.condition ?? "—"}</span>
                  <span className="w-[74px] shrink-0 text-[11px] font-semibold text-blue-700">
                    {day.precipitationProbability ?? 0}% · {day.precipitationSum.toFixed(1)} mm
                  </span>
                  <span className="w-9 shrink-0 text-right text-[11px] text-slate-500">{Math.round(day.tempMin)}°</span>
                  <span className="relative h-1.5 min-w-[70px] flex-1 rounded-full bg-slate-100">
                    <span className="absolute h-1.5 rounded-full bg-gradient-to-r from-sky-400 via-amber-300 to-rose-400" style={{ left: `${left}%`, width: `${width}%` }} />
                  </span>
                  <span className="w-9 shrink-0 text-right text-[11px] font-bold text-slate-800">{Math.round(day.tempMax)}°</span>
                  <span className="w-[86px] shrink-0 text-right text-[10px] text-slate-400">
                    {day.precipitationHours !== null ? `${Math.round(day.precipitationHours)} h rain` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500">Seven-day forecast unavailable.</p>
        )}
      </div>

      {/* ------------------------------- alerts ------------------------------- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-700">Weather alerts</p>
            <h2 className="text-sm font-bold text-slate-900">
              Severe weather for {alertData?.districtName ?? districtMeta?.name ?? "district"}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={alertData?.counts.official ? "red" : "neutral"}>{alertData?.counts.official ?? 0} official warning(s)</Chip>
            <Chip tone="blue">{alertData?.counts.forecastSignals ?? 0} forecast signal(s)</Chip>
            <SourceBadge source="OFFICIAL_WARNING" />
          </div>
        </div>

        <Notice tone="warn" title="Official vs forecast">
          {alertData?.guidance ??
            "Forecast signals are derived locally from provider values and are not official government warnings. No IMD/TNSDMA bulletin ingestion is configured."}
        </Notice>

        <div className="mt-2 space-y-2">
          {(alertData?.officialAlerts ?? []).map((alert) => (
            <article key={alert.id} className="rounded-xl border border-red-200 bg-red-50/70 p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <SourceBadge source={alert.sourceClass} />
                <Chip tone={alert.severity === "CRITICAL" ? "red" : alert.severity === "HIGH" ? "orange" : alert.severity === "MODERATE" ? "amber" : "green"}>{alert.severity}</Chip>
                <Chip tone="blue">{alert.categoryLabel}</Chip>
                {alert.isSimulated ? <DataClassBadge dataClass="SIMULATED" /> : null}
                {alert.expired ? <Chip tone="neutral">EXPIRED</Chip> : null}
              </div>
              <h3 className="mt-1 text-xs font-bold text-slate-900">{alert.title}</h3>
              <p className="text-[11px] leading-snug text-slate-700">{alert.summary}</p>
              {alert.instruction ? <p className="mt-1 rounded bg-white/80 px-2 py-1 text-[10px] font-medium text-slate-800">Action: {alert.instruction}</p> : null}
              <p className="mt-1 text-[10px] text-slate-500">
                Source: {alert.sourceName}
                {alert.publishedByName ? ` · ${alert.publishedByName}` : ""}
                {alert.sourceReference ? ` · ref ${alert.sourceReference}` : " · no source reference"} · issued {formatDateTime(alert.issuedAt)} · expires{" "}
                {alert.expiresAt ? formatDateTime(alert.expiresAt) : "not stated"}
              </p>
            </article>
          ))}

          {(alertData?.forecastSignals ?? []).map((signal) => (
            <article key={signal.id} className="rounded-xl border border-blue-200 bg-blue-50/60 p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <SourceBadge source="FORECAST" />
                <Chip tone={signal.severity === "CRITICAL" ? "red" : signal.severity === "HIGH" ? "orange" : "amber"}>{signal.severity}</Chip>
                <Chip tone="dark">DERIVED</Chip>
                <span className="text-[10px] text-slate-500">{signal.threshold} → {signal.observedValue}</span>
              </div>
              <h3 className="mt-1 text-xs font-bold text-slate-900">{signal.title}</h3>
              <p className="text-[11px] leading-snug text-slate-700">{signal.detail}</p>
              <p className="mt-1 text-[10px] text-slate-500">
                Source: {signal.sourceName} forecast · issued {formatDateTime(signal.issuedAt)} · valid to{" "}
                {signal.expiresAt ? formatDateTime(signal.expiresAt) : "end of forecast window"} · not an official warning
              </p>
            </article>
          ))}

          {!alertApi.loading && (alertData?.officialAlerts.length ?? 0) + (alertData?.forecastSignals.length ?? 0) === 0 ? (
            <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500">
              No alert or forecast signal for this district. Conditions may still change — check official sources before travel.
            </p>
          ) : null}
          {alertApi.loading ? <p className="text-[11px] text-slate-500">Loading alerts…</p> : null}
          {alertApi.error ? <Notice tone="danger">{alertApi.error}</Notice> : null}
        </div>
      </div>

      {/* --------------------------- weather map layers ---------------------- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">Weather map layers</p>
            <h2 className="text-sm font-bold text-slate-900">{mapLabel} across Tamil Nadu</h2>
          </div>
          <div className="flex flex-wrap gap-1">
            {([
              ["temperature", "Temperature"],
              ["rainfall", "Rainfall"],
              ["probability", "Rain probability"],
              ["wind", "Wind"],
            ] as [MapMode, string][]).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setMapMode(mode)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${
                  mapMode === mode ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
            <Link href={`/map?district=${district}`} className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10px] font-semibold text-teal-800 hover:bg-teal-100">
              3D map layer
            </Link>
          </div>
        </div>

        {!mapAvailable ? (
          <Notice tone="warn" title="Weather overlay unavailable">
            District weather values are not currently available from the provider, so no geographical weather overlay is drawn. DisasterLink
            never renders a fabricated weather surface.
          </Notice>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {mapValues.rows.map((row) => (
              <button
                key={row.code}
                onClick={() => chooseDistrict(row.code)}
                className={`flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-slate-50 ${
                  row.code === district ? "bg-blue-50" : ""
                }`}
              >
                <span className="w-24 shrink-0 truncate text-[11px] font-medium text-slate-700">{row.name}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${Math.max(3, (row.value / mapValues.max) * 100)}%`,
                      background:
                        mapMode === "temperature"
                          ? "linear-gradient(90deg,#38bdf8,#f59e0b,#dc2626)"
                          : mapMode === "probability"
                            ? "linear-gradient(90deg,#0f172a,#0e7490,#1d4ed8)"
                            : mapMode === "wind"
                              ? "linear-gradient(90deg,#134e4a,#0d9488,#fbbf24)"
                              : "linear-gradient(90deg,#0e7490,#f59e0b,#dc2626)",
                    }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right text-[10px] font-bold tabular-nums text-slate-700">
                  {row.value}
                  {mapUnit}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <SourceBadge source="FORECAST" />
          <span>{mapValues.rows.length} of {board.length} districts with available provider data</span>
          <span>· Values are district reference-point {mapMode === "temperature" ? "observations" : "forecasts"} from {weather?.provider?.name ?? "the provider"}.</span>
          <span>· Wind arrows and the same four weather fills are available on the Phase 1 3D map (“Hazard &amp; weather” layers).</span>
        </div>
      </div>

      {/* ------------------------------- footer ------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[10px] leading-relaxed text-slate-500 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source="OBSERVED" />
          <span className="font-semibold text-slate-700">{weather?.provider?.name ?? "Open-Meteo"}</span>
          <span>· {weather?.provider?.attribution ?? "Weather data by Open-Meteo.com (CC BY 4.0)."}</span>
          <span>· cache {data?.cache.ttlMinutes ?? weather?.provider?.cacheTtlMinutes ?? 15} min</span>
          <span>· key required: {weather?.provider?.keyRequired ? "yes" : "no"}</span>
          <span>· key configured: {weather?.provider?.apiKeyConfigured ? "yes (server-side only)" : "not needed"}</span>
          <span>· last updated {weather ? formatDateTime(weather.fetchedAt) : "—"}</span>
          {weather?.stale ? <Chip tone="amber">CACHED</Chip> : <Chip tone="green">FRESH</Chip>}
        </div>
        <p className="mt-1">{data?.classification.note}</p>
        <p className="mt-1">
          Weather values are fetched server-side; no provider key is exposed to the browser. Alerts published inside DisasterLink are attributed to
          their officer and badged when simulated — official IMD/TNSDMA bulletins are not ingested.
        </p>
      </div>
    </div>
  );
}
