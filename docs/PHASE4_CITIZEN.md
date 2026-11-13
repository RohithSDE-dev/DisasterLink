# Phase 4 — Citizen Emergency Response Portal

Scope: the citizen experience — dashboard, reporting, SOS, private tracking, facility/shelter discovery,
district alerts, weather/map reuse, safety guidance and notifications — wired to the **same** database
and APIs as the government command centre. No separate app, no duplicate data. Phase 5 not started.

---

## 1. What existed before and what changed

| Area | Before Phase 4 | Phase 4 change |
| --- | --- | --- |
| Submissions | Incidents/SOS stored, `INC-…`/`SOS-…` IDs issued | Also store `reporter_user_id` + **hashed one-time tracking code**; response returns the code once |
| Tracking | Anyone with an ID could read the description, history notes and masked phone | Layered access: owner/code-holder/government vs a public timeline that hides description, location, notes and contact data |
| "My reports" | Did not exist | `/api/my-reports` (authenticated, owner-scoped) + `/track` account tab + "link an anonymous report" by code |
| Notifications | Only alert read state | `/api/notifications` aggregating district alerts, announcements, own incident updates and SOS updates with persisted per-user read state; `/notifications` screen |
| Shelters | Listed inside the facilities directory | Dedicated `/shelters` finder with capacity/occupancy/remaining, operational status, stale flags, distance ordering and map |
| Facilities | Directory with filters | Distance from shared location, verified-only default, shelter capacity summary, verified/candidate badges |
| Home | Weather, risk, alerts, quick actions | Adds emergency situation overview, nearby shelters, public safety announcements and notification link |
| Uploads | data-URL prefix + length check | Magic-byte validation (JPEG/PNG/WebP), MIME cross-check, decoded byte ceiling, SVG/HTML rejected |
| Safety | 8 topics | Adds fire safety, heatwave precautions and general preparedness (11 topics) |

---

## 2. Files created / modified

**Created**
`src/lib/citizen.ts` (tracking codes, access levels, public note sanitising, staleness)
`src/lib/image.ts` (upload validation) · `src/lib/geo-distance.ts` (distance + permissioned geolocation)
`src/app/api/my-reports/route.ts` · `src/app/api/notifications/route.ts`
`src/components/citizen/SheltersClient.tsx` · `src/components/citizen/NotificationsClient.tsx`
`src/app/(citizen)/shelters/page.tsx` · `src/app/(citizen)/notifications/page.tsx`
`scripts/validate-citizen.mjs` · `docs/PHASE4_CITIZEN.md`

**Modified**
`src/db/schema.ts` (owner + tracking hash columns, `notification_reads`)
`src/app/api/incidents/route.ts`, `src/app/api/sos/route.ts` (owner linking, codes, upload validation)
`src/app/api/track/route.ts` (privacy layers) · `src/app/api/facilities/route.ts` (distance, shelters, counts)
`src/app/api/overview/route.ts` (shelters, announcements, warning count, account)
`src/components/citizen/{HomeClient,TrackClient,FacilitiesClient,ReportSosClient,CitizenNav}.tsx`
`src/app/(citizen)/track/page.tsx`, `src/app/(citizen)/layout.tsx`
`src/lib/safety.ts` · `README.md`

---

## 3. API endpoints

| Endpoint | Status | Purpose |
| --- | --- | --- |
| `POST /api/incidents` | Extended | Report submission; returns ID **and** one-time tracking code; hardened upload |
| `POST /api/sos` | Extended | SOS submission; returns ID + code; explicit non-dispatch disclaimer |
| `GET /api/track?id&type&code` | Rebuilt | Layered privacy tracking with sanitised public timeline |
| `GET /api/my-reports` | **New** | Signed-in citizen's own incidents + SOS with latest official update and history |
| `POST /api/my-reports` | **New** | Claim an anonymous submission with its tracking code |
| `GET /api/notifications?district=` | **New** | District alerts, announcements, own incident/SOS updates + counts + delivery capabilities |
| `POST /api/notifications` | **New** | Persist read state (`mark-read`, `mark-all-read`) |
| `GET /api/facilities?lat&lng` | Extended | Distance-sorted facilities + shelter capacity summary + counts |
| `GET /api/overview?district=` | Extended | Dashboard aggregate incl. shelters, announcements, official warning count |
| `/api/geo`, `/api/weather*`, `/api/alerts`, `/api/evacuation` | Reused | Phase 1 map, Phase 2 weather, alerts and evacuation corridors |

All responses use `{ success, message, data, timestamp }`.

---

## 4. Database changes

Added to `incidents` and `sos_requests`: `reporter_user_id` (nullable FK to users) and
`tracking_code_hash` (SHA-256 of the code; the code itself is never stored).
New table `notification_reads` with a unique `(user_id, entity_type, entity_ref)` index.
No table, column or existing migration was dropped; `drizzle-kit push` applied the additions.

---

## 5. Authentication & authorisation

* Submissions are allowed anonymously (emergency access matters) but are **linked** when a citizen is signed in.
* `/api/my-reports` and `/api/notifications` require a session (`requireUser`) and query strictly by
  `reporter_user_id` (plus the account's verified phone for pre-sign-in submissions).
* Tracking access: `OWNER` (signed-in reporter or correct code) / `GOVERNMENT` (officer, admin, super admin) /
  `PUBLIC_LIMITED` (ID only) — the latter returns no description, location, notes, photo or contact data.
* Citizens cannot publish alerts (403), cannot read the admin queues (401/403 verified in Phase 3 tests),
  and officer views of SOS still redact citizen contact data.
* Phone numbers are always masked as `••••1234`, even for the owner.

---

## 6. File upload implementation

Client downscales to ≤900 px JPEG (~0.68 quality) before upload. The server (`src/lib/image.ts`):
1. requires a `data:` URL and a strict base64 payload pattern;
2. enforces `MAX_DATA_URL_LENGTH` ≈ 1 MB and `MAX_IMAGE_BYTES` = 700 KB decoded;
3. verifies **magic bytes** for JPEG (`FF D8 FF`), PNG (`89 50 4E 47…`) and WebP (`RIFF….WEBP`);
4. rejects a declared MIME that disagrees with the actual content and rejects SVG/HTML outright.
Validated live: a text payload labelled `image/png` returns **422**.

---

## 7. Citizen ↔ government integration (verified live)

Report submitted by a signed-in citizen → appears in the government incident queue → administrator
verifies it → `/api/my-reports` immediately shows `VERIFIED` with the officer's note → the same event
appears in `/api/notifications` → marking it read persists → facility/shelter updates made by an
administrator are returned by the citizen facilities API (same rows) → an SOS submitted by a citizen
appears in `/api/sos` for both admin and officer (officer sees redacted contact data).

---

## 8. Tests

```
BASE_URL=http://127.0.0.1:3100 node --test scripts/validate-citizen.mjs   → 7/7 pass
BASE_URL=http://127.0.0.1:3100 node --test scripts/validate-command.mjs   → 8/8 pass
node --test scripts/validate-map-data.mjs                                 → 5/5 pass
node --test scripts/validate-weather.mjs                                  → 9/9 pass
npx next typegen / tsc --noEmit / npm run build / build_and_start          → pass
```

Phase 4 live assertions include: ID + code format, `PENDING` default, public view hides description/
location/contact, code unlocks the full record with masked phone, `my-reports` 401 unauthenticated and
owner-scoped when signed in, linked submission appears automatically, government verification reflected
in citizen tracking, notification created and read state stored, SOS reaches government monitoring with
officer redaction, disguised upload rejected (422), facility distance computed, shelter remaining ≤
capacity, citizen alert publication blocked (403), and cleanup afterwards.

Browser checks: all 14 citizen pages return 200 with no application errors (signed-in `/track` and
`/notifications` included); all government screens still 200; `/api/geo`, `/api/weather`,
`/api/facilities`, `/api/overview` all 200.

---

## 9. Known limitations

1. **No SMS/email/push delivery.** Notifications are in-app only and the API states `sms:false, email:false, push:false`.
2. **Tracking codes are unrecoverable** by design (only hashes are stored). A password-reset-style recovery flow does not exist.
3. **Account linking by phone** relies on an exact normalised match; there is no phone-verification (OTP) step, so a matching unverified phone could claim a submission. Production should require OTP before claiming.
4. **Images are stored inline** in PostgreSQL as data URLs. Object storage with signed URLs is recommended for production; EXIF stripping is not performed server-side.
5. **No CAPTCHA/rate limiting** on anonymous submissions, so abuse throttling is not implemented.
6. **Geolocation distances are straight-line**, not routed road distances.
7. **Shelter capacity is SIMULATED** in the seeded data and badged; no official shelter feed exists.
8. **Java backend Phase 4 parity** (tracking codes, my-reports, notifications) is not implemented in `backend-java` yet.
9. **Pre-existing lint warnings** (React-compiler `setState`-in-effect rules) remain in some older components; they do not affect type-checking or the production build.

---

## 10. Commands

```bash
npm install
npx drizzle-kit push                 # applies reporter/tracking columns + notification_reads
npm run dev                          # http://localhost:3000
npm run build && npm run start
BASE_URL=http://127.0.0.1:3000 node --test scripts/validate-citizen.mjs
BASE_URL=http://127.0.0.1:3000 node --test scripts/validate-command.mjs
node --test scripts/validate-map-data.mjs
node --test scripts/validate-weather.mjs
```

Demo accounts: `citizen@disasterlink.demo / Citizen@123` (sign in before reporting to have submissions
appear under **My reports**), `officer@disasterlink.demo / Officer@123`, `admin@disasterlink.demo /
Admin@123`, `super@disasterlink.demo / Super@123`.
