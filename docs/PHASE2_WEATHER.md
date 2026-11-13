# Phase 2 — Premium Tamil Nadu Weather Experience

Scope of this phase: **weather only** — district selection, current conditions, hourly and
seven-day forecasts, severe-weather alerts, weather geographic layers and weather↔map integration.
The government command centre was not started.

---

## 1. What was inspected and reused

| Area | Finding / decision |
| --- | --- |
| Existing weather | `src/lib/weather.ts` (Open-Meteo client + 15 min PostgreSQL cache) and `src/components/citizen/WeatherExperience.tsx` (v1 weather page) existed. The v1 component was **replaced** by `src/components/weather/WeatherPremium.tsx`; the library was **extended**, not rewritten. |
| Phase 1 map | Reused. `DisasterMap` gained three weather layers and wind arrows; no Phase 1 layer was removed. |
| District selection | Reuses the shared `useSelectedDistrict` hook (localStorage + `dl-district-change` event), so map, portal, facilities and weather stay in sync. |
| APIs | `/api/weather`, `/api/districts`, `/api/geo`, `/api/alerts` reused; `/api/weather/alerts` added. |
| Design system | Reuses `btn-*`, `input`, `chip`, `card` primitives and existing badge components. |
| Backend/DB | No schema change. Existing `weather_cache` table reused with an added snapshot schema version. |

**Stack note (unchanged):** this workspace is Next.js + PostgreSQL and cannot run Vite or the JVM.
Phase 2 is implemented in the existing workspace; Java parity is documented below.

---

## 2. Weather provider

**Open-Meteo** (`https://api.open-meteo.com/v1/forecast`) — keyless, CC BY 4.0 attribution, called
**server-side only** from `src/lib/weather.ts`.

| Element | Value |
| --- | --- |
| Provider name / docs | Open-Meteo · <https://open-meteo.com/en/docs> |
| Key required | No (hooks exist for a keyed commercial host) |
| Requested current fields | temperature, apparent temperature, humidity, is_day, precipitation + rain, weather code, cloud cover, MSL pressure, wind speed/direction/gusts, UV index, visibility |
| Requested hourly fields (168 h, served as next 24 from **now**) | temperature, precipitation, precipitation probability, weather code, UV, wind speed/direction, visibility, pressure |
| Requested daily fields (7 days) | weather code, precipitation sum/probability/hours, min/max temperature, sunrise, sunset, UV max, wind max, dominant wind direction |
| Timezone | `Asia/Kolkata` (district-local hours) |
| Attribution | "Weather data by Open-Meteo.com (CC BY 4.0). Elevation data by Copernicus DEM." shown in the UI |

### Classification

| Data | Class |
| --- | --- |
| Current conditions block | `OBSERVED` |
| Hourly + daily blocks | `FORECAST` |
| Locally derived severe-weather signals | `FORECAST` (explicitly **not** an official warning) |
| Alerts published by an officer with a source reference | `OFFICIAL_WARNING` |
| Demo alerts and demo camps | `SIMULATED` (badged) |

No IMD/TNSDMA bulletin ingestion exists, and the UI states this on the weather page and alert panel.

---

## 3. Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | – | Weather cache persistence |
| `OPEN_METEO_API_KEY` | no | unset | Only for a keyed commercial host; read server-side, never serialised |
| `OPEN_METEO_BASE_URL` | no | `https://api.open-meteo.com/v1/forecast` | Alternate provider endpoint |
| `WEATHER_CACHE_TTL_MINUTES` | no | `15` (validated 1–120) | Cache freshness window |
| `WEATHER_TIMEOUT_MS` | no | `9000` (validated 1–30 s) | Provider request timeout |

`providerInfo()` exposes only `{ id, name, docsUrl, attribution, keyRequired, apiKeyConfigured, cacheTtlMinutes }` —
never the key itself. Verified by an automated test and by scanning the built client bundles.

---

## 4. Caching

1. **PostgreSQL table cache** — one row per district in `weather_cache` (`payload` JSONB, `fetchedAt`).
   Requests inside the TTL (default 15 min) are served from the database, so the map, weather page and
   district board all share one provider call.
2. **Schema versioning** — snapshots carry `schemaVersion: 2`. Rows written by an older shape are
   rejected by `isUsableSnapshot()` and refetched, so a deployment can never serve half-populated weather
   (this actually happened during the upgrade and was caught in testing).
3. **Batched refresh** — `refreshDistrictWeather()` fetches all 38 districts in one comma-separated
   Open-Meteo call for the map/district board, writing each snapshot back to the cache.
4. **Elevation cache** — DEM elevations cached 24 h in memory (Phase 1 module).
5. **Stale-on-error** — if the provider fails, the last successful snapshot is returned with
   `stale: true` and the error text; if no cache exists, values are `null` with an explicit
   "unavailable" state. Nothing is fabricated.
6. `?refresh=1` forces a provider refetch from the UI "Refresh" control.

---

## 5. APIs

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/weather?district=TN-CBE&refresh=1` | Current, hourly (next 24 h from now), seven-day, sun times, next-24 h aggregates, provider metadata, cache metadata, classification notes |
| GET | `/api/weather/alerts?district=TN-CBE` | Officer-published alerts + forecast-derived signals, counts, thresholds, provider issue time, guidance |
| GET | `/api/districts` | Board used by the weather map layers (now also returns rain probability, wind, condition) |
| GET | `/api/geo` | Phase 1 map geometry — district properties extended with temperature, rain probability, wind speed/direction/gusts, humidity, pressure, UV, cloud, condition |

All responses use `{ success, message, data, timestamp }`.

### Java parity

`backend-java/src/main/java/in/disasterlink/service/WeatherService.java` already caches and maps
temperature/humidity/precipitation/wind. Porting Phase 2 means adding the same request lists,
`next24h` aggregate and `providerInfo()`, plus a `WeatherAlertController` implementing the alert
classification in `src/lib/weather-alerts.ts`. This is documented rather than claimed.

---

## 6. Severe-weather alerts

**Officer-published (from the `alerts` table):** title, category, severity, district, source name,
source reference, publisher, issue time, expiry, `isSimulated` badge, and class
(`OFFICIAL_WARNING` only when a source reference was supplied at publication).

**Forecast signals (derived locally, always `FORECAST`, `isOfficialWarning: false`):**

| Signal | Rule |
| --- | --- |
| Extremely heavy rainfall | 24 h accumulation > 204.4 mm |
| Very heavy rainfall | 115.6–204.4 mm |
| Heavy rainfall | 64.5–115.6 mm, or ≥ 30 mm with ≥ 80 % probability |
| Thunderstorm | WMO code ≥ 95 in the next 12 h (or current) |
| Strong winds | ≥ 40 km/h sustained or ≥ 60 km/h gusts |
| Heat | forecast max ≥ 40 °C |
| Low visibility | < 1000 m |
| Extreme UV | UV index ≥ 11 |

IMD bands are used only to *describe the forecast*; the panel states plainly that these are not
issued warnings. Every item carries source, threshold, observed value, issue time and validity.

---

## 7. Weather geographic layers

Available on both the Phase 2 weather page (compact ranking) and the **Phase 1 3D map**:

| Layer | Source | Presentation |
| --- | --- | --- |
| Temperature distribution | OBSERVED | District fill (blue → red) |
| Rainfall distribution (24 h) | FORECAST | District fill (dark → red) |
| Precipitation probability | FORECAST | District fill (dark → deep blue) |
| Wind direction & speed | OBSERVED | Canvas-generated arrows pointing where the wind is going, rotated by direction, sized/opacified by speed |
| Weather warning areas | Officer alerts | Pulsing severity circles at district centroids |

Fill modes are mutually exclusive; a map with no provider data shows no overlay and says so. The
moat: **no interpolated weather surface is generated** — values are district reference-point data.

---

## 8. Tests executed

```
node --test scripts/validate-weather.mjs     → 9/9 pass
node --test scripts/validate-map-data.mjs    → 5/5 pass
npx next typegen                             → pass
npm exec tsc --noEmit                        → pass
npm run build                                → pass
```

Live checks against the running app:

| Check | Result |
| --- | --- |
| All 38 districts requestable | **38/38 available**, 0 failures |
| Values differ per district | 23 distinct temperatures, 26 humidities, 17 pressures, 30 wind directions |
| Example spread | Chennai 27.2 °C / 72 % / 1011.7 hPa / wind 20° vs Nilgiris 14.2 °C / 98 % / 1018.3 hPa / wind 357° |
| Hourly window | `hourly[0]` = 19:00 for an 18:45 observation, `hourly[23]` = next day 18:00 |
| Fields present | pressure, cloud cover, gusts, visibility, UV, sunrise/sunset, daily rain hours, dominant wind direction |
| `/api/weather/alerts` | 200; Nagapattinam → thunderstorm (HIGH), Nilgiris → low visibility (HIGH), Kanyakumari → low visibility (MODERATE); all `FORECAST`, `isOfficialWarning:false` |
| Invalid district | 404 |
| Pages | `/weather?district=TN-MDU`, `/weather?district=TN-KKI`, `/map`, `/alerts`, `/districts`, `/` → all 200, no application errors |
| Key leakage | `OPEN_METEO_API_KEY` and `apikey=` occurrences in `.next/static` client chunks: **0** |
| Phase 1 regression | `/api/geo` returns weather-enriched properties for 37/37 polygon districts; map page still 200 |

---

## 9. Known limitations

1. **No official warning ingestion.** IMD CAP / TNSDMA bulletins are not connected; the interface states
   this and labels locally derived signals as `FORECAST`.
2. **Point data, not gridded.** Current conditions and forecasts are sampled at district reference
   coordinates, so a large district gets one value and no microclimate variation.
3. **No radar/satellite rainfall mosaic**, so the "rainfall distribution" layer is a district-value
   choropleth rather than a radar product.
4. **Provider dependency.** If Open-Meteo is unreachable, weather shows cached or unavailable states;
   a keyed provider can be configured through env vars but was not exercised here.
5. **Daily rain probability** is the provider's daily maximum, not an hourly-integrated figure.
6. **No push/email notifications** — alerts are pull-based (page, map layer, `/alerts`).
7. **Java backend** weather/alerts parity is documented, not implemented/compiled in this workspace.
8. **Historical weather** is not ingested; only the forecast window (7 days) plus the current observation.

---

## 10. Commands

```bash
npm install
npx drizzle-kit push                 # fresh database only
npm run dev                          # http://localhost:3000/weather
npm run build && npm run start
node --test scripts/validate-weather.mjs
node --test scripts/validate-map-data.mjs
npx next typegen && npx tsc --noEmit && npm run build
```
