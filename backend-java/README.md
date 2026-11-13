# DisasterLink Java backend (Spring Boot 3.5 / Java 21)

A deployable modular-monolith backend that mirrors the REST contract, PostgreSQL schema and safety rules of the Next.js API used by this repository's preview.

> **Status:** reference implementation included for the production architecture. It is **not** started or integration-tested by this sandbox because the preview runtime is Node.js only. The tested, fully functional API for the demo is `src/app/api/**` (TypeScript route handlers) against the same PostgreSQL tables.

## Modules

| Module | Status in Java module |
| --- | --- |
| Health, districts + intelligence, weather | Implemented (`GET /api/health`, `/api/districts`, `/api/districts/{code}`) |
| Incidents (public list/create, admin queue/review) | Implemented (`GET/POST /api/incidents`, `GET/PATCH /api/admin/incidents`) |
| SOS (create, admin queue, assign team, resolve via assignment status) | Implemented (`POST /api/sos`, `GET /api/sos`, `PATCH /api/admin/sos/{id}/assign`) |
| Emergency facilities + shelters (create, list) | Implemented (shelter requires source URL) |
| Response teams, assignments, status transitions | Implemented |
| Analytics + audit trail | Implemented (aggregates, `GET /api/governance/audit`) |
| Public tracking with masked phone | Implemented (`GET /api/track/{type}/{publicId}`) |
| Weather caching (15 min, per district) | Implemented (in-memory; use Redis/Caffeine for scale) |
| Flood risk + AI incident heuristics | Implemented (`IntelligenceService`) |
| Official warning ingestion (IMD CAP / TNSDMA) | **Not implemented** — no fabricated warnings |
| v2: geo layers, alerts publishing/read receipts, evacuation, intelligence analytics, user administration | **Not yet ported** — implemented and tested in the TypeScript API (`src/app/api/{geo,alerts,evacuation,intelligence,users,audit}`); port using the same SQL tables |
| Geolocation-based nearest-facility search (PostGIS) | **Not implemented** in Java module (schema uses numeric lat/lng) |
| Notifications (SMS/email) | **Not implemented** |
| File/photo storage | Photo field only; production needs object storage |
| Role administration UI / data-source CRUD | Read-only audit/governance endpoints |

## Run

```bash
# 1. PostgreSQL (same database as the Next.js app)
export DATABASE_URL=jdbc:postgresql://127.0.0.1:5432/app_db
export DATABASE_USER=postgres
export DATABASE_PASSWORD=postgres

# 2. Build and start
cd backend-java
mvn spring-boot:run          # http://localhost:8080

# 3. Point the frontend at it (optional; the Next.js API is self-contained)
export NEXT_PUBLIC_API_BASE=http://localhost:8080
```

The schema is owned by `src/db/schema.ts` (Drizzle). Run `npx drizzle-kit push` from the repository root before starting the Java service. For a standalone Java deployment you can switch `spring.jpa.hibernate.ddl-auto` to `create`/`update`, but in production use migrations (`validate`).

v2 schema additions to replicate in Flyway: `facilities.facility_class`, `facilities.availability_status`, `facilities.capacity`, `facilities.occupancy`, `facilities.capacity_data_class`, `alerts.category`, `alerts.instruction`, `alerts.source_reference`, `alerts.published_by_id`, `alerts.published_by_name`, `alerts.is_active`, and the `alert_reads` table (unique on `alert_id, user_id`).

Seed users with `npx tsx`-independent seeding by starting the Next.js app once (it seeds idempotently), or insert users with BCrypt hashes matching the demo credentials in the root README.

## Security notes

* Roles: `CITIZEN`, `ADMIN`, `SUPER_ADMIN`; enabled with `@EnableMethodSecurity` + `@PreAuthorize`.
* Reference auth: JDBC user details (email as username, `password_hash` as password, `role` as authority) with HTTP Basic/server sessions and BCrypt.
* Public endpoints: district intelligence, weather, verified incidents, incident/SOS submission, tracking, facility directory, AI classification.
* Admin endpoints: incident verification, SOS triage and assignment, facility management, analytics.
* Super-admin endpoints: data sources, simulation, audit trail.
* Citizen contact details are returned only to admins; tracking responses mask phone numbers and never expose precise coordinates.
* Production hardening still required: CSRF tokens, rate limiting/CAPTCHA on public submission, session rotation, MFA, CSP headers, secrets management and structured audit retention.

## Safety rules enforced in code

1. Incident creation always writes `status = PENDING` and `data_class = COMMUNITY_REPORT` — no automatic verification.
2. SOS creation never creates an assignment or dispatch; only an authorised admin action does.
3. Shelter designation requires a source URL.
4. Risk and AI endpoints label outputs `MODEL_RISK_ESTIMATE` and state they do not verify incidents, issue official warnings or dispatch teams.
5. Weather failures return an explicit unavailable/stale result; values are never invented.
6. Assignment of `SIMULATED` teams is clearly labelled as non-operational data.

## Suggested production split

```
com.disasterlink
├── auth        (users, sessions, roles)
├── geography   (districts, boundaries, rivers — PostGIS)
├── incidents   (reports, reviews, events)
├── sos         (requests, triage, assignment)
├── facilities  (hospitals, pharmacies, shelters)
├── response    (teams, resources, assignments)
├── weather     (Open-Meteo client, cache, forecasts)
├── intelligence(flood risk, AI assistance, situation reports)
├── analytics
└── governance  (audit, data sources, simulation)
```
