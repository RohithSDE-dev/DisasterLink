# DisasterLink

**Know the Risk. Find Safety. Get Help.**

DisasterLink is an AI-assisted disaster intelligence and emergency coordination platform built for Tamil Nadu. It is a **decision-support prototype**, not an officially authorised government emergency system.

It ships three distinct experiences:

| Experience | Route | Purpose |
| --- | --- | --- |
| **Citizen Portal** | `/` | District weather, risk, alerts, incident reporting, SOS, facility directory, safety guidance and submission tracking |
| **Disaster Management Command Centre** | `/admin` | Incident verification, SOS triage, team assignment, facility management, analytics and audit logs |
| **Disaster Intelligence Engine** | `/intelligence`, `/districts`, `/districts/[code]` | Interactive Tamil Nadu map with toggleable layers, flood-risk estimation with explanations, AI incident intelligence |

A guided 12-step flow for judges is at **`/demo`**.

### Phase 4 — citizen emergency portal (current focus)

The citizen experience is now a complete emergency portal on the same database and APIs as the command centre: dashboard with emergency overview, nearby shelters and public safety announcements; reporting and SOS with a **one-time private tracking code**; `/track` "My reports" for signed-in citizens (plus linking anonymous submissions by code); privacy-layered tracking where an ID alone reveals only a status timeline; a persisted notification centre (district alerts, announcements, own report/SOS updates) that explicitly states SMS/email/push are not configured; a dedicated `/shelters` finder with capacity, occupancy, remaining places, stale flags and map; facility discovery with distance sorting and verified-only filtering; and 11 safety topics. Uploads are validated by magic bytes, not just MIME.

* Documentation, privacy model and test evidence: [`docs/PHASE4_CITIZEN.md`](docs/PHASE4_CITIZEN.md)
* Citizen QA suite: `BASE_URL=http://127.0.0.1:3000 node --test scripts/validate-citizen.mjs`

### Phase 3 — government command centre

`/admin` is now a full emergency operations centre on the same database, map and weather service as the citizen portal: ten live metrics (with "Data unavailable" fallbacks), the complete six-stage incident workflow (Reported → Under review → Verified → Assigned → In progress → Resolved) with assignment, official remarks, immutable history and before/after audit values, SOS monitoring with contact redaction, facility/shelter/ambulance administration, weather & district intelligence, analytics with severity distribution and resolution trends, alert publishing, user/role management and an append-only audit log.

* Documentation, RBAC matrix and verification evidence: [`docs/PHASE3_COMMAND.md`](docs/PHASE3_COMMAND.md)
* Authorisation matrix: `src/lib/permissions.ts` · screen guards: `src/lib/screen-guard.ts`
* Command/QA suite: `BASE_URL=http://127.0.0.1:3000 node --test scripts/validate-command.mjs`

### Phase 2 — premium Tamil Nadu weather

`/weather` is now a premium district weather experience: searchable 38-district selector with quick picks and recents, Apple-inspired condition-themed hero (temperature, feels-like, hi/lo, humidity, wind + direction, gusts, rain, rain probability, pressure, UV, visibility, cloud, sunrise/sunset), 24-hour scrollable forecast starting at the current hour, seven-day forecast with rain amounts, severe-weather alerts (officer notices + clearly-labelled forecast-derived signals) and four weather map layers that drive the Phase 1 3D map.

* Full documentation, provider config, caching and limitations: [`docs/PHASE2_WEATHER.md`](docs/PHASE2_WEATHER.md)
* Weather QA tests: `node --test scripts/validate-weather.mjs`
* New endpoint: `GET /api/weather/alerts`; extended: `GET /api/weather`, `GET /api/geo`.

### Phase 1 — 3D Tamil Nadu map

The map is now the centrepiece: `/map` (citizen) and `/admin/map` (command centre) render `src/components/map/DisasterMap.tsx` — MapLibre GL with real DEM terrain, the state outline, 37 authentic district polygons, elevation readout, hydrology, clustered facility markers, incidents, risk/rainfall fills, warnings and evacuation corridors, plus an explicit dataset register and a disabled "major roads" layer with a stated reason.

* Full documentation, dataset provenance and known limitations: [`docs/PHASE1_MAP.md`](docs/PHASE1_MAP.md)
* Geographic QA tests: `node --test scripts/validate-map-data.mjs`
* New map endpoints: `GET /api/geo`, `GET /api/facilities/map`; Java/PostGIS parity in `backend-java` (`MapController`, `V2__map_postgis.sql`).

### Version 2 — premium state command platform

| Capability | Route | Notes |
| --- | --- | --- |
| Interactive **3D Tamil Nadu map** | `/map`, `/admin/map` | MapLibre GL, real terrain (AWS Terrain Tiles), OpenFreeMap vector basemap, 13 toggleable layers, district click-through, clustering of nearby facilities, graceful boundary-only fallback |
| **iPhone-style weather** | `/weather` | Gradient hero, glass hourly strip, 7-day bars, feels-like, UV, visibility, wind direction, sunrise/sunset, rainfall/temperature state maps |
| **Alerts & notifications** | `/alerts`, `/admin/alerts` | Eight categories, district targeting, severity, expiry, publisher attribution, source reference requirement for official-warning classification, read/unread state |
| **Smart evacuation** | `/evacuation` | Schematic corridors, hazard matching within 6 km, distance/time heuristics, capacity-aware camp suggestions, data-freshness stamps |
| **Safety zones & shelters** | `/admin/shelters` | Capacity/occupancy updates marked VERIFIED + audit logged, availability status |
| **Ambulance management** | `/admin/ambulances` | Availability board, clear SIMULATED labelling |
| **Weather & district intelligence** | `/admin/weather`, `/admin/districts` | Batched provider data, risk explanations, rainfall ranking, spatial clusters, resource-demand heuristics, 7-day comparisons |
| **User & role management** | `/admin/users` | SUPER_ADMIN only; four roles |
| **Audit logs** | `/admin/audit` | ADMIN+, append-only, filterable |

The government console is a 14-item grouped sidebar (`/admin`), and every citizen-facing module reads the same database records the command centre writes.

---

## 1. Architecture

```
Next.js 16 (App Router, React 19, TypeScript, Tailwind v4)
├── src/app/(citizen)/…        Citizen experience (public)
├── src/app/admin/…            Command Centre (role-guarded, dark navy shell)
├── src/app/api/…              REST API (route handlers, validation, RBAC, audit)
├── src/lib/…                  weather, risk model, AI heuristics, queries, auth, constants
├── src/components/…           SVG Tamil Nadu map, charts, consoles, panels
└── src/db/…                   Drizzle schema + idempotent seed

PostgreSQL (Drizzle ORM, 16 tables)
backend-java/                  Deployable Spring Boot 3.5 reference module with the same REST contract
```

### Framework mapping (read this before merging into the team repo)

The supplied Arena workspace is a **Next.js 16 / React 19 / PostgreSQL** application with no JVM and no Vite project, and the preview runtime cannot host Spring Boot. Per instruction, the team's architecture was **not silently replaced**:

* The upgrade in this workspace is implemented in the supplied stack so it remains buildable, deployable and demonstrable here.
* `backend-java/` contains the deployable **Java 21 / Spring Boot 3.5.x** modular monolith with the same modules, tables and REST contract. `backend-java/README.md` lists exactly which endpoints are ported and which still need porting (the v2 endpoints — alerts publishing, evacuation, intelligence, geo layers, user administration — are the remaining work).
* To move this into the React 18 + Vite frontend: the UI components are plain React + TypeScript and portal-ready (`src/components/**`). Replace the `useApi`/`apiRequest` helpers in `src/components/interactive.tsx` with the team's fetch service layer pointed at `VITE_API_BASE_URL`; the response envelope is already `{ success, message, data, timestamp }`, so no component contract changes are needed.
* Database: the Drizzle schema in `src/db/schema.ts` maps 1:1 to the SQL that the Spring Boot module expects; port the four v2 columns (`facility_class`, `availability_status`, `capacity`, `occupancy`, `capacity_data_class`) plus `alert_reads` into the existing Flyway migration set and add PostGIS geometry later.

### Important, honest note on the backend

The preview in this sandbox runs **Node.js only** (Next.js route handlers + PostgreSQL). Every screen is backed by real HTTP endpoints, real validation, role checks, database persistence and audit logging — nothing is a frontend mock.

Because the deployment target for this sandbox cannot run a JVM, a complete **Java 21 / Spring Boot 3.5** module is included in [`backend-java/`](backend-java/README.md) implementing the same modules, schema and REST contract. It is the intended production backend; it is **not** executed by the preview. The README of that module lists exactly what is implemented and what must be added before production.

### Map implementation

The map is a **self-contained SVG map** rendered from a simplified 2011 Census district boundary GeoJSON (42 KB, 37 undivided districts). It supports district hover/click, risk fill, marker layers, simple clustering, zoom, pan, search, legend, reset and fullscreen. MapLibre GL + external raster tiles were intentionally not used so the map works offline and in restricted networks; the same component can be swapped for MapLibre later without changing page contracts.

---

## 2. Run locally

```bash
# 1. install
npm install

# 2. configure environment (see .env / .env.example)
#    DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db

# 3. create the schema
npx drizzle-kit push

# 4. run
npm run dev        # http://localhost:3000
# production
npm run build && npm run start
```

The database seeds itself **idempotently** on first data access: 38 districts, 46 candidate facilities, 3 demo users, 7 data-source records, 16 clearly-labelled SIMULATED incidents, 3 SIMULATED SOS requests, 6 SIMULATED teams, 10 SIMULATED resources and 1 SIMULATED alert.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string used by Drizzle |
| `NODE_ENV` | no | Enables secure cookies in production |

No external API key is needed. Weather comes from the free [Open-Meteo](https://open-meteo.com/) API, called **server-side only**. No AI provider key is required because the AI assistant is a local, deterministic heuristic model.

---

## 3. Demo credentials (safe, public, demo-only)

| Role | Email | Password | Capabilities |
| --- | --- | --- | --- |
| Citizen | `citizen@disasterlink.demo` | `Citizen@123` | Report, SOS, track |
| Admin (duty officer) | `admin@disasterlink.demo` | `Admin@123` | Verify/reject incidents, SOS triage, assign teams, facilities |
| Government officer (read-only) | `officer@disasterlink.demo` | `Officer@123` | Views dashboards, incident queue, SOS monitor, weather, district intelligence and audit — cannot verify, assign or publish |
| Admin (duty officer) | `admin@disasterlink.demo` | `Admin@123` | Verify/reject incidents, SOS triage, team assignment, facilities, shelters, ambulances, alerts |
| Super Admin (state controller) | `super@disasterlink.demo` | `Super@123` | Everything + user/role management, data sources, simulation mode |

Sign in at `/login`. Passwords are stored as scrypt hashes; sessions are random 256-bit tokens in an HTTP-only, SameSite=Lax cookie. Admin routes redirect unauthenticated users and block `CITIZEN` roles server-side. Every mutating admin API re-checks the role server-side.

---

## 4. Roles & security

* **CITIZEN** — public data, incident report, SOS submission, own-submission tracking, facility directory.
* **ADMIN** — incident review/verify/reject/severity/remarks/status, SOS review/prioritise/verify/team assignment/resolution, facility verification and availability, teams/resources/assignments, analytics.
* **SUPER_ADMIN** — administrator/data-source governance, simulation mode, full audit log.

Protections implemented:

* Contact names/phones are never included in public listings; the tracking endpoint returns **masked** phone numbers and never precise coordinates.
* Precise coordinates are only shown to authenticated administrators.
* Incident/District public endpoints publish only `VERIFIED` / `RESOLVED` records; pending reports require an admin session.
* Official-shelter flags require a supporting source URL in the API.
* Every admin mutation writes to `audit_logs` (actor, role, action, entity, summary, details), and incidents/SOS keep their own event timelines.

---

## 5. Data sources & trust model

| Data | Source | Classification | Verification | Live? |
| --- | --- | --- | --- | --- |
| Current weather, 24 h rainfall, 5-day forecast | [Open-Meteo](https://open-meteo.com/) | `OBSERVED` / `FORECAST` | CANDIDATE | Yes (cached 15 min, batched for 38 districts) |
| District boundaries | 2011 Census (simplified) via [india-maps-data](https://github.com/udit-001/india-maps-data) | `MODEL_RISK_ESTIMATE` (context layer) | CANDIDATE | Static |
| Rivers/water bodies | schematic public-map derived centrelines | `MODEL_RISK_ESTIMATE` | CANDIDATE | Static |
| Flood risk | DisasterLink heuristic v1 | `MODEL_RISK_ESTIMATE` | — | Recomputed on request |
| Citizen reports & SOS | platform users | `COMMUNITY_REPORT` → admin verification | UNVERIFIED until verified | Realtime |
| Facilities | public institution listings (OSM-derived) | `COMMUNITY_REPORT` | CANDIDATE (or admin VERIFIED) | Admin-managed |
| Official shelters | none ingested | `OFFICIAL_WARNING` reserved | — | **Not connected** |
| IMD / TNSDMA warnings | declared in Data Sources registry | `OFFICIAL_WARNING` | UNVERIFIED | **Not connected** |
| Demo records | simulation engine | `SIMULATED` | — | On demand / seeded |

* The UI shows an explicit **“No official warning is available in DisasterLink”** state instead of inventing bulletins.
* Weather failures show an unavailable message plus the last cached observation and its timestamp — values are never fabricated.
* No hospital/pharmacy bed, medicine or stock availability is ever claimed. Phone numbers appear only when an administrator records one.
* Every simulated record is badged **SIMULATED** in tables, detail panels and maps; the risk overlay and observed weather are never labelled simulated.

### Flood-risk model (explainable)

`estimateFloodRisk()` in `src/lib/risk.ts` produces a 0–100 score with a factor breakdown:

1. Forecast rainfall next 24 h (Open-Meteo, `FORECAST`) — up to 34 points
2. Observed rainfall now (`OBSERVED`) — up to 12 points
3. Recent flood/waterlogging reports in 48 h, weighted verified > pending (`COMMUNITY_REPORT`) — up to 30 points
4. Distance from district reference point to mapped waterway (`MODEL_RISK_ESTIMATE`) — up to 16 points
5. Delta/coastal/hilly terrain prior (`MODEL_RISK_ESTIMATE`) — up to 21 points

Levels: `LOW` (<20), `MODERATE` (20–39), `HIGH` (40–61), `VERY_HIGH` (≥62). Every district response includes the factor list, explanation, confidence, model name and a disclaimer that this is **not** an official flood-prone-zone determination.

### AI incident intelligence (offline, explainable)

`src/lib/ai.ts` implements keyword+rule scoring that:

* suggests a category with confidence and alternatives,
* suggests severity with explicit rationale (detected phrases such as “trapped”, sensitive facilities, group size),
* summarises long descriptions,
* flags likely duplicates (token Jaccard similarity + district/category/recency weighting, returns the matching ID),
* produces district activity summaries and administrative situation-report drafts.

It is labelled `MODEL_RISK_ESTIMATE` / “AI-ASSISTED” and states on every response that it **does not verify incidents, issue official warnings or dispatch teams**.

---

## 6. API documentation

All responses are `{ ok: true, data }` or `{ ok: false, error }`. Auth is cookie based. `RBAC` marks endpoints that require an admin session.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | – | Service + DB status |
| GET | `/api/auth` | – | Current session user |
| POST | `/api/auth` | – | `{action:"login"\|"logout", email, password}` |
| GET | `/api/districts` | – | 38-district board: weather, risk factors, counts (batched Open-Meteo refresh) |
| GET | `/api/districts/{code}` | – | District intelligence: weather, risk, alerts, incidents, facilities, rivers, AI activity |
| GET | `/api/overview?district=` | – | Citizen homepage aggregate |
| GET | `/api/weather?district=&refresh=1` | – | Single-district weather with cache handling |
| GET | `/api/incidents?scope=public\|admin&…` | admin for `scope=admin` | Filterable list (status/category/district/severity/q) |
| POST | `/api/incidents` | – | Submit report → `PENDING` + AI pre-analysis + public ID |
| GET | `/api/incidents/{id}` | RBAC | Full record + history + live AI analysis + available teams |
| PATCH | `/api/incidents/{id}` | RBAC | `START_REVIEW`, `VERIFY`, `REJECT`, `RESOLVE`, `SET_SEVERITY`, `ADD_REMARK`, `REOPEN` |
| GET | `/api/sos` | RBAC | SOS queue + teams + counts |
| POST | `/api/sos` | – | Submit SOS → `SUBMITTED`, triage suggestion, public ID |
| GET | `/api/sos/{id}` | RBAC | SOS detail + events + assignment ledger |
| PATCH | `/api/sos/{id}` | RBAC | `RECEIVE`, `REVIEW`, `VERIFY`, `SET_PRIORITY`, `ASSIGN`, `RESOLVE`, `ADD_REMARK`, `REOPEN` |
| GET | `/api/track?id=&type=INCIDENT\|SOS` | – | Public tracking with masked contact data |
| GET | `/api/facilities?district=&category=&q=&includeInactive=` | – | Facility directory candidates |
| POST | `/api/facilities` | RBAC | Create facility (shelter requires source URL) |
| PATCH | `/api/facilities` | RBAC | Verification, availability note, active flag, phone, shelter flag |
| GET | `/api/response` | RBAC | Teams, resources, assignments, incident/SOS pick lists |
| POST | `/api/response` | RBAC | Create team/resource (`kind`) |
| PATCH | `/api/response` | RBAC | Update team/resource/assignment status (`kind`) |
| PUT | `/api/response` | RBAC | Assign a team to an incident |
| GET | `/api/command` | RBAC | Command centre dashboard aggregate |
| GET | `/api/analytics` | RBAC | District/category/severity/trend/SOS/resolution analytics |
| GET | `/api/governance` | SUPER_ADMIN | Audit log, data sources, users |
| PATCH | `/api/governance` | SUPER_ADMIN | Enable/disable a data source, edit notes |
| GET/POST | `/api/ai` | POST `sitrep` RBAC | `classify`, `district-summary`, `sitrep` |
| GET/POST | `/api/demo` | POST RBAC | Demo record creation/reset (SIMULATED) |
| GET | `/api/geo` | – | District/hydrology GeoJSON, reservoirs, landmarks, basemap provenance |
| GET | `/api/alerts?district=&includeInactive=` | – | Alert feed with publisher, category, expiry and read state for signed-in users |
| POST | `/api/alerts` | ADMIN+ | Publish advisory (`COMMUNITY_REPORT`) or official warning (`OFFICIAL_WARNING`, source reference required) / `mark-read` |
| PATCH | `/api/alerts` | ADMIN+ | Retire, reactivate or extend an alert |
| GET | `/api/evacuation?district=&lat=&lng=` | – | Corridor assessments, hazard flags, capacity-aware shelter suggestions, freshness |
| GET | `/api/intelligence?district=` | – | Risk ranking with factors, rainfall trends, spatial clusters, resource demand, historical comparison |
| GET | `/api/audit?action=&entity=` | OFFICER+ | Filtered administrative audit trail |
| GET/POST/PATCH | `/api/users` | SUPER_ADMIN | Account listing, creation and role changes |

Validation: required fields, enum whitelists, Tamil Nadu coordinate bounds, description lengths, phone format, photo size limits. Errors return 422/401/403/404 with readable messages.

---

### Response envelope

Every endpoint returns:

```json
{ "success": true, "message": "Facilities retrieved successfully", "data": {}, "timestamp": "2026-11-10T10:00:00Z" }
```

`ok`/`error` aliases are retained so existing clients written against v1 keep working.

## 7. Implemented features

**Citizen portal** — district selector (38 districts, remembered locally), real weather + forecast panel with source/fetch time and unavailable fallback, official-warning panel with honest empty state, explainable risk card, SOS workflow with geolocation permission + status timeline + emergency-call guidance, incident report form (category, description, district, location, GPS, compressed photo, severity, contact), unique IDs (`INC-…`, `SOS-…`), tracking page with event history, facility directory with search/category/district/map/directions/source links, shelter honesty policy, safety guides (before/during/after × 8 hazards), verified updates feed, interactive map.

**Command Centre** — dark navy shell, KPI dashboard, category/severity/district/weekly charts, incident console (filters, photo, GPS, AI panel, verify/reject/severity/remarks/resolve/reopen, team assignment, history), SOS control panel (priority, receive/review/verify/assign/resolve, assignment ledger, history, restricted contact data), facility management (create/edit/verify/activate/availability/shelter), teams/resources/assignments with status transitions, analytics with resolution-time metrics, governance (audit log, data-source controls, users, simulation).

**Intelligence engine** — layered district map (risk fill, reports, SOS, facilities, shelters, rivers, labels), search, legend, clustering, zoom/pan/reset/fullscreen, district intelligence pages (weather, rainfall, risk explanation, incidents, facilities, waterways, alerts, preparedness, provenance), all-district risk table with level filter, AI incident analyst, AI district briefing, caching of weather (15 min, batched) with refresh controls.

**Trust & demonstration** — source classes and verification badges everywhere, simulation mode with clearly badged records and reset, refusal to fabricate warnings/availability, guided judge workflow at `/demo`.

---

## 8. Known gaps & incomplete integrations

1. **Official warning ingestion (IMD CAP / TNSDMA)** — not implemented. No official alert rows are ever created; the UI states this explicitly. Requires an authorised ingest service, signature verification and expiry handling.
2. **Official shelter designations** — none verified. Administrators can add one only with a source URL; the directory intentionally shows an empty state until then.
3. **Facility phone numbers, bed counts and stock** — not ingested or verified. Records are candidates; availability is shown only when an administrator records it.
4. **Response teams, resources, assignments and seeded incidents** — SIMULATED demonstration data. No integration with real dispatch systems, and no dispatch is ever automatic.
5. **External LLM** — not used. AI is a deterministic heuristic for offline reliability and explainability; an LLM can be added behind `/api/ai` with the same safety copy.
6. **Notifications** — no SMS/email/WhatsApp delivery; citizens must poll the tracking page. Contact details are stored for admin use only.
7. **Photo storage** — compressed images are stored inline in PostgreSQL (size-capped). Production should use object storage with signed URLs.
8. **PostGIS** — the sandbox PostgreSQL has no PostGIS extension; geometry is stored as the district registry + client-rendered GeoJSON with numeric lat/lng. Production should add PostGIS `geography` columns and spatial indexes.
9. **River/water-body layer** — schematic centrelines, not an authoritative hydrology dataset; clearly labelled and not used to declare flood-proneness.
10. **Boundary completeness** — 37 undivided Census 2011 polygons; Mayiladuthurai (2020) is selectable without a polygon.
11. **Hardening** — no rate limiting, CAPTCHA, password reset, MFA, session rotation, CSP headers or i18n/Tamil localisation yet.
12. **3D map tile dependencies** — the vector basemap (OpenFreeMap) and terrain (AWS Terrain Tiles) are fetched by the browser at runtime. Without them the map degrades to a boundary-only dark style and says so; it never invents terrain.
13. **Hydrology and reservoirs** — schematic river centrelines and approximate dam reference points. Reservoir storage levels, releases and official flood-prone zones are **not** ingested.
14. **Evacuation corridors** — six schematic planning corridors (Chennai, Coimbatore, Madurai, Nagapattinam delta, Nilgiris, Tirunelveli). Not a routing engine, not guaranteed safe, and no live road-condition feed.
15. **Shelter/ambulance capacity** — demonstration records are SIMULATED. The platform never converts a simulated capacity into a verified figure; administrator updates mark data VERIFIED explicitly.
16. **v2 endpoints in the Java module** — geo, alerts, evacuation, intelligence and user administration are implemented and tested in the TypeScript API but still need porting to `backend-java/`.
12. **Java backend execution** — included as a separate deployable module, not run in this sandbox preview (Node-only runtime), so it has not been integration-tested here.

---

## 9. Judge demo script (≈5 minutes)

1. Open `/` → select **Coimbatore**; review live weather, forecast rainfall, the risk factor breakdown and the honest “no official warnings” state.
2. Open `/report` → describe “knee-deep water near Gandhipuram bus stand, buses stranded”, use **Use my current location**, run **AI pre-check**, submit → note the `INC-YYYYMMDD-XXXXXX` ID and `PENDING` status.
3. Open `/sos` → submit an SOS → note the ID, status sequence and the explicit non-dispatch warning.
4. Sign in as `admin@disasterlink.demo` → `/admin/incidents` → open the report, review AI suggestion and photo/GPS, set severity, **Verify**.
5. Open `/districts/TN-CBE` (or `/track?id=…&type=INCIDENT`) → the report is now a verified update and contributes to the risk explanation.
6. `/admin/sos` → open the SOS → receive, verify, assign a team → `/admin/response` → advance the assignment to `EN_ROUTE`.
7. `/admin/analytics` and `/admin/governance` (super admin) → charts, audit trail, data-source registry, simulation controls.
8. `/demo` → run the scripted 12-step workflow; every record is badged **SIMULATED**.
9. `/map` → rotate and pitch the 3D terrain, switch district fill between flood risk / rainfall / temperature, toggle facility and evacuation layers, click a district and open its briefing.
10. `/weather` → premium district weather with hourly/7-day panels; switch to another district and watch every module follow.
11. `/admin/alerts` → publish an advisory (or an official warning, which requires a source reference), then open `/alerts` as a citizen to see it, mark it read and retry `/admin/users` as an officer account to show the read-only role boundary.

---

## 10. Project layout

```
src/app/(citizen)/        home, districts, intelligence, report, sos, facilities, safety, track, demo, login
src/app/admin/            layout guard + overview, incidents, sos, facilities, response, analytics, governance
src/app/api/              auth, districts, overview, weather, incidents, sos, track, facilities, response,
                          command, analytics, governance, ai, demo, health
src/components/           TamilNaduMap, charts, interactive, ui, citizen/*, admin/*
src/lib/                  constants, districts, auth, api, weather, risk, ai, queries, safety
src/db/                   schema.ts, seed.ts
backend-java/             Spring Boot 3.5 reference backend (same contract) + its README
```
