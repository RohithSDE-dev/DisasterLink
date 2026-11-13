# Phase 3 — Tamil Nadu Government Disaster Management Command Centre

Scope: the government command centre, incident/SOS operational management, facility & shelter
administration, weather/district intelligence, alert publishing, RBAC and audit — all on the **same**
database, map (Phase 1) and weather service (Phase 2) as the citizen portal. No additional modules,
no duplicate datasets.

---

## 1. Approach

| Existing asset | Phase 3 change |
| --- | --- |
| `/admin/*` shell & 14-item navigation | Kept; navigation now role-filtered and each screen guarded server-side |
| `incidents` / `incident_events` / `audit_logs` | Reused; workflow extended with `ASSIGNED` and `IN_PROGRESS` (no schema change — status is text) |
| `OFFICER` role (read-only from Phase 2) | Given review/remark/in-progress duties; verification, assignment, publication stay with ADMIN |
| Phase 1 `DisasterMap` | Reused in `/admin/map`; added incident filters (category, severity, status, district) |
| Phase 2 weather engine | Reused in `/admin/weather`; added active-warning table with class + timestamps |
| Facilities/shelters/alerts APIs | Reused and hardened; shelter capacity validation already enforced |
| Analytics API | Extended with district severity distribution and resolution trend |

---

## 2. Features implemented

### Command Centre Overview
Ten metrics computed live from the database, each rendered as **“Data unavailable”** when the API
cannot supply it: active incidents, critical incidents, awaiting verification, districts under official
warning, open SOS, available ambulances (x/y), facilities available, shelter capacity free (x/y),
active rescue teams (x/y), resolved incidents. Plus workflow stage counts, the workflow diagram, active
warning notices, priority queue, SOS queue, highest-risk districts, recent audit activity and the AI
situation-report draft.

### Incident management (Reported → Under review → Verified → Assigned → In progress → Resolved)
* Filterable table with status tabs, district/category/severity filters, search and per-status counts.
* Detail review panel: full report, district, location, coordinates, reported vs assessed severity,
  source/data class, citizen photograph, AI suggestion + duplicate warning, and an immutable history.
* Actions: start review, verify (with assessed severity), reject (reason required), set severity,
  add official remark, assign response team (creates an assignment and sets `ASSIGNED`), mark in
  progress, resolve (details required, closes assignments), reopen.
* Every action persists `incident_events` (from → to status, actor, role, note) **and** an audit entry
  with `before`/`after` values.
* `PENDING` remains the stored value for the citizen-facing **Reported** state, so existing rows and
  API clients keep working.

### SOS monitoring
Queue with status/priority counters, search and filters; acknowledge, under-review, verify, set
priority, assign team (assignment ledger), resolve with notes, add remark. Citizen name, phone and
coordinates are **redacted for roles without `sos.view_contact`** (officers), while administrators keep
access for response purposes.

### Live Tamil Nadu map
Phase 1 3D map embedded with incidents, facilities, hospitals, fire stations, ambulances, shelters,
warning areas, flood-risk fills and weather layers, plus **incident filters** (category, severity,
status, district) and facility category filters. Filtered counts appear in the status strip. Marker
clicks open the corresponding facility/incident details.

### Facilities, shelters and ambulances
Add/edit facilities, verification, availability, phone, capacity/occupancy (marked VERIFIED on save),
activation, shelter designation with source URL requirement. Shelter occupancy is rejected by the API
when it exceeds capacity — verified by an automated live test. Ambulance availability board for
ambulance records. All writes propagate to citizen directory, map and dashboards.

### Weather and district intelligence
Statewide rainfall/temperature/risk registers, the Phase 2 provider metadata, active warning notices
with source class and issue/expiry timestamps, regional rainfall distribution and the AI district
panel (risk factors, clusters, resource demand, 7-day comparison). Forecast signals are never labelled
as official warnings.

### Reports & analytics
Incident mix, severity, workflow status, weekly incidents/SOS, monthly volume, **weekly verified vs
resolved trend**, avg verification/resolution hours, SOS statistics, facility distribution, risk levels
and a **district table with severity distribution and verified/unverified counts**. All figures derive
from stored records (simulated rows included and labelled).

### Alerts & notifications
Publish notices with category, severity, title, description, instruction, affected district (or
state-wide), source name, source reference, expiry and classification. `OFFICIAL_WARNING` requires a
source reference. Retire/reactivate/extend. Every publication and change is audited. Published alerts
appear immediately in the citizen portal (`/alerts`, weather page, map warning layer).

### Users, roles and audit
Super-admin user creation and role changes; audit console with action/entity filters and expandable
**previous → new value** detail. Audit rows are append-only: `POST/PATCH/DELETE` return 405.

---

## 3. Role-based security

Central matrix: `src/lib/permissions.ts` (`ROLE_CAPABILITIES`, `can()`, `SCREEN_ROLES`,
`WORKFLOW_ACTIONS`). Enforced in three layers:

1. **Layout** — unauthenticated → login; `CITIZEN` → citizen portal.
2. **Per-screen guard** (`src/lib/screen-guard.ts`) — e.g. officers are redirected (307) from
   `/admin/users`, `/admin/governance`, `/admin/alerts`.
3. **API** — every mutation checks a capability server-side and returns 403; reads of sensitive
   endpoints require a role. Buttons are disabled in the UI, but hiding is never the control.

| Role | Capabilities (summary) |
| --- | --- |
| CITIZEN | Report incidents, submit SOS, view public alerts/facilities/weather. **No command-centre API access.** |
| OFFICER (GOVERNMENT_OFFICER) | Read dashboards/queue/SOS/analytics/audit; start review, add remarks, mark in progress. Cannot verify, reject, assign, resolve, publish alerts, see citizen contacts or manage users. |
| ADMIN | Everything officers can, plus verify/reject/severity/assign/resolve, facility & shelter management, ambulance availability, SOS assignment/resolution, alert publishing (advisory class). |
| SUPER_ADMIN | Everything, plus official-warning classification, user/role management, governance and simulation mode. |

Verified live: citizen → 403 on `/api/command`, `/api/analytics`, `/api/audit`, `/api/sos`,
`/api/users`, `/api/alerts?includeInactive=1`; unauthenticated → 401; officer → 403 on verify,
`/api/users`, `/api/governance`, alert publishing; officer → 200 on reads.

---

## 4. Citizen ↔ government integration

Single PostgreSQL database and single set of APIs. Live verification performed:

1. Admin created a simulated incident → appeared in the queue.
2. Officer started review → `UNDER_REVIEW`; officer attempted verification → **403**.
3. Admin verified → `VERIFIED`; assigned a team → `ASSIGNED` with assignment row; marked in progress;
   resolving without details → **422**; resolved with details → `RESOLVED`.
4. Public tracker `/api/track` then returned the same record as `RESOLVED` with the full event history
   — i.e. the citizen sees the government outcome.
5. Audit log contained `START_REVIEW`, `VERIFY`, `ASSIGN`, `START_WORK`, `RESOLVE` with actor names and
   before/after values; `DELETE /api/audit` → 405.
6. Admin published an alert → the citizen alerts endpoint returned it.
7. Shelter occupancy above capacity → 422; valid update → 200 and persisted for citizen/map views.

Map filters, district selection and facility markers all read the same endpoints the citizen portal
uses, so no duplicated datasets exist.

---

## 5. APIs

| Endpoint | Change |
| --- | --- |
| `GET /api/command` | Extended metrics (`active`, `critical`, `awaitingVerification`, `districtsUnderWarning`, `availableFacilities`, `shelterRemaining`, `teamsActive`, `assigned`, `inProgress`), `activeAlerts`, `activeAssignments`, `workflow`, `actor`; now readable by OFFICER |
| `GET/PATCH /api/incidents/[id]` | Capability-gated actions incl. `ASSIGN`, `START_WORK`; contact redaction; `capabilities` + `contactRedacted`; before/after audit |
| `GET /api/incidents?scope=admin` | OFFICER read added |
| `GET/PATCH /api/sos`, `/api/sos/[id]` | Officer acknowledge/review/remark; contact redaction; capability flags |
| `GET/PATCH /api/facilities` | Unchanged contract; capacity ≤ capacity validation exercised |
| `GET /api/analytics` | Added `districtSeverity`, `resolution.trend` |
| `GET /api/audit` | Open to OFFICER+; `POST/PATCH/DELETE` → 405 |
| `GET /api/alerts` | `includeInactive=1` now requires OFFICER+ |
| `/api/weather*`, `/api/geo`, `/api/facilities/map`, `/api/evacuation` | Reused unchanged from Phases 1–2 |

Envelope preserved: `{ success, message, data, timestamp }`.

### Java parity
`backend-java` still needs the Phase 3 port: `ASSIGNED`/`IN_PROGRESS` transitions, capability matrix,
assignment-on-verify, contact redaction and the extended command aggregates. This is documented, not
claimed as done.

---

## 6. Database migrations

**None required.** Status values live in a text column already supporting the new stages; audit
`details` is JSONB and now stores `before`/`after`; no table or column was added or removed. The
PostGIS/Flyway additions from Phase 1 (`V2__map_postgis.sql`) are unchanged.

---

## 7. Tests

```
BASE_URL=http://127.0.0.1:3100 node --test scripts/validate-command.mjs   → 8/8 pass
node --test scripts/validate-map-data.mjs                                 → 5/5 pass
node --test scripts/validate-weather.mjs                                  → 9/9 pass
npx next typegen / tsc --noEmit / npm run build                            → pass
```

`scripts/validate-command.mjs` covers static guarantees (workflow, capability matrix, per-action
guards, audit immutability, metric derivation, 14 navigation screens) **and** a live end-to-end run:
four roles logging in, citizen/anon/officer denials, metrics consistency, shelter validation, the full
incident workflow, tracker propagation, audit contents and alert propagation.

Browser checks: all 14 government screens returned 200 with no errors for an administrator; officers
received 307 redirects on administrator-only screens; all nine citizen pages remained 200; Phase 1
(`/api/geo`, `/api/facilities/map`) and Phase 2 (`/api/weather`, `/api/weather/alerts`) endpoints still 200.

---

## 8. Known limitations

1. **Districts under official warning is 0 by default** because the seeded alert is `SIMULATED`, not
   an officer-published official warning. The metric is honest rather than inflated.
2. **No real dispatch integration.** Teams, resources and assignments are SIMULATED; assignment writes
   records only.
3. **Concurrency**: updates are last-write-wins with optimistic status checks (e.g. only
   verified/assigned incidents can resolve). There is no ETag/version column, so two simultaneous edits
   may overwrite one another; a `version` column is the recommended next step.
4. **No notification delivery** (SMS/email/push) on status changes or new alerts.
5. **AI remains advisory** and cannot verify, publish or dispatch.
6. **Java backend Phase 3 parity is not implemented/compiled** in this workspace.
7. **No pagination** on the incident table beyond a 400-row cap.
8. **Screen redirects** land on `/admin` without a dedicated “access denied” page.

---

## 9. Commands

```bash
npm install
npx drizzle-kit push                 # fresh database only
npm run dev                          # http://localhost:3000/admin
npm run build && npm run start
BASE_URL=http://127.0.0.1:3000 node --test scripts/validate-command.mjs
node --test scripts/validate-map-data.mjs
node --test scripts/validate-weather.mjs
npx next typegen && npx tsc --noEmit && npm run build
```

Demo accounts: `citizen@disasterlink.demo / Citizen@123`, `officer@disasterlink.demo / Officer@123`,
`admin@disasterlink.demo / Admin@123`, `super@disasterlink.demo / Super@123`.
