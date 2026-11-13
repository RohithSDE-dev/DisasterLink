# Phase 1 — Interactive 3D Tamil Nadu Disaster Map

Scope of this phase: **the map, geographic data, map layers and emergency facility markers only.**
Weather, the command centre and the other modules already present in this workspace were left untouched.

---

## 1. What was inspected before changing anything

| Area | Finding |
| --- | --- |
| Map components | `src/components/TamilNaduMap.tsx` (2D SVG map, used by several screens) and `src/components/map/TamilNadu3D.tsx` (first-generation MapLibre map) already existed. Both were kept; `/map` and `/admin/map` now use the new `DisasterMap` component. |
| Geo data | `src/data/tn-districts.geo.json` already contained 37 simplified 2011 Census district polygons (39 rings / 2,259 vertices). It was validated, not replaced. |
| Map library | `maplibre-gl@6.17.0` was already a dependency. No second mapping library was added. |
| APIs | `/api/geo`, `/api/facilities`, `/api/districts`, `/api/incidents`, `/api/alerts`, `/api/evacuation` already existed. `/api/geo` and `/api/facilities` were extended, and `/api/facilities/map` was added for markers. |
| Database | `facilities` already had category, address, coordinates, verification, availability and capacity columns. No table was dropped or renamed. |
| Backend | `backend-java/` Spring Boot 3.5 module exists. A PostGIS migration and `MapController` were added for the team deployment; the preview runtime is Node-only. |

**Stack note (unchanged from before, stated plainly):** this Arena workspace is a Next.js + React + PostgreSQL project and cannot run Vite or a JVM. Phase 1 was therefore implemented inside the existing workspace, and the Java/PostGIS implementation lives in `backend-java/`. No new frontend application, backend or database was introduced.

---

## 2. Geographic datasets

| Dataset | Source | Coverage | Format | Updated | Limitations |
| --- | --- | --- | --- | --- | --- |
| Tamil Nadu state boundary | Indian States GeoJSON, Survey of India derived (`Subhash9325/GeoJson-Data-of-Indian-States`) | Tamil Nadu (IN-TN) | GeoJSON MultiPolygon, simplified to 0.008° (703 vertices, 2 rings, 12.8 KB) | Community snapshot | Simplified; territorial water limits excluded; not survey grade |
| District boundaries | 2011 Census districts, simplified (`udit-001/india-maps-data`) | 37 undivided districts | Compact polygons in `src/data/tn-districts.geo.json`, served as GeoJSON | 2011 Census | **Mayiladuthurai has no polygon** — shown as a labelled point rather than an approximate polygon; simplified geometry |
| 3D terrain / elevation mesh | AWS Terrain Tiles (Mapzen terrarium, Copernicus/NASA DEM composites) | Global incl. Tamil Nadu | Raster DEM PNG tiles | Static open data | Fetched by the browser; keyless; boundary-only fallback if unreachable |
| District elevation readings | Open-Meteo Elevation API (Copernicus DEM GLO-90) | 38 district reference points + 5 peaks + 12 reservoirs | JSON metres, cached 24 h | Live/cached | Single sample per district reference point |
| Rivers / reservoirs / coastline | Schematic public-map derived overlay compiled for the prototype | 9 rivers, 12 reservoirs, coastline polyline | GeoJSON LineString/Point | Static | Illustrative only; never used to declare an official flood-prone zone |
| Major roads | **Not ingested** — Overpass API returned 502 during this phase | none | n/a | n/a | Layer is disabled in the UI with an explicit reason instead of drawing approximate roads |
| Emergency facilities | DisasterLink facility database | Hospitals, clinics, fire stations, ambulances, relief camps | PostgreSQL rows via JSON | Administrator controlled | Candidate records unless verified; SIMULATED capacity badged |
| Incidents | DisasterLink incidents | Public: verified/resolved. Admin: full queue | PostgreSQL rows via JSON | Realtime | Community reports are unverified until administrator review |
| Flood-risk fill | DisasterLink risk heuristic | 38 districts | Computed | Per request | `MODEL_RISK_ESTIMATE`, not an official hazard map |
| Rainfall fill | Open-Meteo forecast | 38 district points | JSON mm | Cached 15 min | Point forecast, not gridded radar |
| Warning areas | DisasterLink alerts | District or state-wide | PostgreSQL rows | Realtime | No IMD/TNSDMA bulletin ingestion |
| Evacuation corridors | DisasterLink schematic corridors | 6 planning corridors | GeoJSON LineString | Static + live hazard matching | Not a routing engine, not guaranteed safe |

The full register is served at runtime by `GET /api/geo` (`data.datasets`) and rendered in the map's **Data sources** drawer, so attribution ships with the product rather than only in documentation.

---

## 3. Layer architecture

`src/lib/map-data.ts` is the single source of truth for the 16 required layers. Each definition declares `available`, `on`, `groupId` and an `unavailableReason`, so the UI can never present a dead toggle as working.

| # | Layer | Status |
| --- | --- | --- |
| 1 | Tamil Nadu state boundary | Live |
| 2 | District boundaries | Live |
| 3 | District labels | Live (symbol layer, skipped when a fallback style has no glyphs) |
| 4 | 3D terrain | Live + exaggeration slider (0–2.5×) |
| 5 | Elevation readout | Live (DEM values per district/peak) |
| 6 | Rivers, reservoirs & coast | Live (schematic, labelled) |
| 7 | Major roads | **Unavailable** — explicit reason displayed |
| 8 | Hospitals & medical centres | Live (government / private / PHC split) |
| 9 | Fire stations | Live |
| 10 | Ambulances | Live (availability status) |
| 11 | Shelters & relief camps | Live (capacity/occupancy when recorded) |
| 12 | Active incidents | Live |
| 13 | Flood-risk areas | Live as `MODEL_RISK_ESTIMATE` |
| 14 | Rainfall distribution | Live (mutually exclusive with risk fill) |
| 15 | Weather warning areas | Live from published alerts |
| 16 | Evacuation corridors | Live (schematic) |

Facility markers additionally have seven independent category filters with live counts, driven by `/api/facilities/map`.

---

## 4. APIs

| Method | Endpoint | Purpose | Status |
| --- | --- | --- | --- |
| GET | `/api/geo` | State boundary, district GeoJSON with API-derived facility/incident counts, elevation, hydrology, dataset register, layer register, live validation report | Extended |
| GET | `/api/facilities/map?district=&category=&includeInactive=` | Map markers with grouping, capacity, remaining capacity, verification and data class | **New** |
| GET | `/api/facilities` | Existing directory, now returns `facilityClass`, `availabilityStatus`, `capacity`, `occupancy`, `capacityDataClass` | Extended |
| GET | `/api/districts`, `/api/incidents`, `/api/alerts`, `/api/evacuation` | Reused unchanged for risk/rainfall fills, incidents, warnings and corridors | Reused |
| GET | `/api/health` | Reports 3D map/terrain configuration | Extended |

All responses use the required envelope: `{ success, message, data, timestamp }` (`ok`/`error` aliases retained for backward compatibility).

Java/PostGIS parity: `backend-java/.../MapController.java` implements `/api/geo`, `/api/facilities/map`, `/api/map/nearest` (ST_DWithin) and `/api/map/district-at` (ST_Contains), with `V2__map_postgis.sql` adding `district_geometry`, `facilities.geom`, GiST indexes, a geometry-sync trigger, `district_at()` and `facility_map_view`.

---

## 5. Database changes

* **Preview database (PostgreSQL):** no destructive change. Reused existing `facilities` columns added in the previous upgrade (`facility_class`, `availability_status`, `capacity`, `occupancy`, `capacity_data_class`). One data correction: CMC Vellore reclassified `PRIVATE`; seed rule updated to match.
* **PostGIS:** `CREATE EXTENSION postgis` is **not possible in this sandbox** (extension files absent). The team deployment migration is provided instead; the preview serves equivalent GeoJSON from simplified assets and SQL aggregates verified by tests.
* **Flyway:** `backend-java/src/main/resources/db/migration/V2__map_postgis.sql`.

---

## 6. Configuration

No API keys are required.

| Provider | URL | Key |
| --- | --- | --- |
| OpenFreeMap vector basemap | `https://tiles.openfreemap.org/styles/liberty` | none |
| AWS Terrain Tiles (terrarium) | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | none |
| Open-Meteo elevation / forecast | `https://api.open-meteo.com/...` | none |
| PostgreSQL | `DATABASE_URL` | existing env var |

If a tile provider is unreachable, the map switches to a boundary-only dark style and says so in the status strip; elevation values display as unavailable rather than being estimated.

---

## 7. Commands

```bash
npm install
npx drizzle-kit push            # only needed on a fresh database
npm run dev                     # http://localhost:3000/map
npm run build && npm run start
node --test scripts/validate-map-data.mjs   # geographic + layer QA
npx next typegen && npx tsc --noEmit && npm run build
```

---

## 8. Verification performed

| Check | Result |
| --- | --- |
| `npx next typegen` | pass |
| `npm exec tsc --noEmit` | pass (0 errors) |
| `npm run build` | pass, `/map` and `/admin/map` compiled |
| `node --test scripts/validate-map-data.mjs` | **5/5 pass** (state shape, district rings/bounds, 38-district coverage with the documented Mayiladuthurai gap, 16-layer registry incl. `roads` unavailable, seed honesty) |
| `GET /api/geo` | 200, 37 polygon features + 1 documented point, `validation.valid = true`, 0 invalid rings, 0 out-of-bounds vertices, 12 datasets, 16 layers (15 available) |
| `GET /api/facilities/map` | 200, 61 mapped markers, 3 without coordinates reported, group counts returned |
| District filter | `?district=TN-CBE` → 8 markers with correct per-group counts |
| Page rendering | `/`, `/map`, `/map?district=TN-MDU`, `/districts`, `/facilities`, `/weather`, `/alerts`, `/evacuation`, `/admin/map` all 200 with no application errors |
| Marker records | Capacity/occupancy returned with `capacityDataClass: SIMULATED` badge |
| Regression | Existing modules still build and render; no API removed |

---

## 9. Known limitations

1. **Mayiladuthurai has no authentic polygon** in the 2011 Census dataset. It is listed and clickable as a labelled point; no boundary was approximated.
2. **Major roads layer is unavailable** because no reliable dataset could be fetched (Overpass 502). The toggle is disabled and explains why.
3. **PostGIS is not installed in the preview database.** PostGIS queries and indexes exist in the Java migration and controller, but the preview uses SQL aggregates + simplified GeoJSON.
4. **Hydrology is schematic**, not an authoritative waterway/reservoir dataset; reservoir levels are not ingested.
5. **PHC/clinic group currently has no records**, and no verified official-shelter designation exists; the panels show zero/“data unavailable” rather than inventing facilities.
6. **Browser-fetched tiles** (basemap, DEM) depend on network access; offline or blocked networks fall back to boundary-only rendering.
7. **The Java `MapController` has not been executed** in this sandbox (no JVM/PostGIS). It is written against the documented schema and must be compiled and integration-tested in the team's Spring Boot environment.
8. Risk/rainfall fills are estimates/forecasts, never official warnings; warning areas reflect only alerts published inside DisasterLink.
