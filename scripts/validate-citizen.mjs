/**
 * Phase 4 citizen portal QA (static + live).
 * Run with: BASE_URL=http://127.0.0.1:3000 node --test scripts/validate-citizen.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

async function serverUp() {
  try {
    return (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) })).ok;
  } catch {
    return false;
  }
}

async function login(email, password) {
  const response = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => null);
  return { cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "", role: payload?.data?.user?.role ?? null, ok: Boolean(payload?.success) };
}

async function call(path, cookie, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(options.headers ?? {}) },
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

/* ------------------------------- static QA ------------------------------- */

test("citizen submission privacy helpers are in place", () => {
  const citizen = read("src/lib/citizen.ts");
  assert.match(citizen, /generateTrackingCode/, "tracking codes must be generated server-side");
  assert.match(citizen, /hashTrackingCode/, "only hashes may be stored");
  assert.match(citizen, /accessLevelFor/, "access levels must be enforced");
  assert.match(citizen, /PUBLIC_LIMITED/, "a limited public view must exist");
  assert.match(citizen, /publicStatusNote/, "public notes must be sanitised");
  const schema = read("src/db/schema.ts");
  assert.ok(schema.includes("trackingCodeHash"), "tracking code hash column required");
  assert.ok(schema.includes("reporterUserId"), "owner link required");
  assert.ok(schema.includes("notificationReads"), "read state table required");
});

test("tracking endpoint hides private detail without the code", () => {
  const track = read("src/app/api/track/route.ts");
  assert.match(track, /accessLevelFor/, "must resolve access level");
  assert.match(track, /description: null/, "public view must null the description");
  assert.match(track, /resolutionNote: null/, "public view must null official notes");
  assert.match(track, /contactPhoneMasked: null/, "public view must null contact data");
  assert.match(track, /publicStatusNote\(event\.action\)/, "public timeline must use sanitised notes");
});

test("my reports is authenticated and owner-scoped", () => {
  const mine = read("src/app/api/my-reports/route.ts");
  assert.match(mine, /requireUser\(\)/, "must require a signed-in user");
  assert.match(mine, /eq\(incidents\.reporterUserId, user\.id\)/, "incidents must be scoped to the account");
  assert.match(mine, /eq\(sosRequests\.reporterUserId, user\.id\)/, "SOS must be scoped to the account");
  assert.match(mine, /hashTrackingCode/, "claiming must verify the tracking code");
});

test("uploads are validated by content, not just declared type", () => {
  const image = read("src/lib/image.ts");
  for (const signature of ["image/jpeg", "image/png", "image/webp"]) {
    assert.ok(image.includes(signature), `${signature} must be supported`);
  }
  assert.match(image, /MAX_IMAGE_BYTES/, "a byte ceiling must be enforced");
  assert.match(image, /signature\.mime !== declaredMime/, "declared and actual types must match");
  assert.ok(!image.includes("image/svg"), "SVG must not be accepted");
  const incidents = read("src/app/api/incidents/route.ts");
  assert.match(incidents, /validateImageDataUrl/, "the submission route must use the validator");
  assert.match(incidents, /reporterUserId/, "submissions must link signed-in reporters");
});

test("notifications never claim an unavailable delivery channel", () => {
  const notifications = read("src/app/api/notifications/route.ts");
  assert.match(notifications, /sms: false/, "SMS must be reported as not configured");
  assert.match(notifications, /email: false/, "email must be reported as not configured");
  assert.match(notifications, /push: false/, "push must be reported as not configured");
  const ui = read("src/components/citizen/NotificationsClient.tsx");
  assert.ok(ui.includes("delivery.note"), "the UI must display the delivery limitation");
});

test("citizen surfaces reuse shared APIs and the Phase 1/2 modules", () => {
  const shelters = read("src/components/citizen/SheltersClient.tsx");
  assert.ok(shelters.includes("/api/facilities"), "shelters must use the facilities API");
  assert.ok(shelters.includes("TamilNaduMap"), "shelters must reuse the Phase 1 map");
  assert.ok(shelters.includes("SIMULATED"), "simulated capacity must be labelled");
  assert.ok(shelters.includes("STALE UPDATE"), "stale occupancy must be flagged");
  const home = read("src/components/citizen/HomeClient.tsx");
  for (const section of ["Emergency situation", "Public safety announcements", "Nearby shelters"]) {
    assert.ok(home.includes(section), `home dashboard must show ${section}`);
  }
  const safety = read("src/lib/safety.ts");
  for (const topic of ["fire", "heatwave", "general-preparedness"]) {
    assert.ok(safety.includes(`id: "${topic}"`), `safety topic ${topic} required`);
  }
});

/* -------------------------------- live QA -------------------------------- */

test("live citizen submissions, privacy, tracking and government propagation", async (t) => {
  if (!(await serverUp())) {
    t.skip(`No server at ${BASE}; live citizen assertions skipped.`);
    return;
  }

  const admin = await login("admin@disasterlink.demo", "Admin@123");
  const citizen = await login("citizen@disasterlink.demo", "Citizen@123");
  assert.ok(admin.ok && citizen.ok, "demo accounts must authenticate");

  // 1. Anonymous citizen submits a report and receives a private tracking code.
  const report = await call("/api/incidents", "", {
    method: "POST",
    body: JSON.stringify({
      category: "WATERLOGGING",
      description: "Phase 4 verification: knee-deep water covering the service road near the bus stand, two-wheelers stranded.",
      districtCode: "TN-CBE",
      locationName: "Phase 4 test junction, Coimbatore",
      reportedSeverity: "MODERATE",
      contactPhone: "+91 90000 12345",
    }),
  });
  assert.equal(report.status, 201, "citizen submission must succeed");
  assert.equal(report.payload.success, true);
  const publicId = report.payload.data.incident.publicId;
  const trackingCode = report.payload.data.tracking.trackingCode;
  assert.match(publicId, /^INC-\d{8}-[A-F0-9]{6}$/, "a unique tracking ID must be generated");
  assert.match(trackingCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/, "a one-time tracking code must be generated");
  assert.equal(report.payload.data.incident.status, "PENDING", "new reports must await verification");

  // 2. Without the code, a stranger only sees the public status timeline.
  const limited = await call(`/api/track?id=${publicId}&type=INCIDENT`, "");
  assert.equal(limited.status, 200);
  assert.equal(limited.payload.data.accessLevel, "PUBLIC_LIMITED");
  assert.equal(limited.payload.data.record.description, null, "description must be hidden");
  assert.equal(limited.payload.data.record.locationName, null, "location must be hidden");
  assert.equal(limited.payload.data.record.contactPhoneMasked, null, "contact data must be hidden");
  assert.ok(limited.payload.data.record.status, "status must remain visible");
  assert.ok(limited.payload.data.events.every((event) => event.actorRole === "OFFICIAL"), "public timeline must be sanitised");

  // 3. With the code (or as its owner) the full record is visible.
  const unlocked = await call(`/api/track?id=${publicId}&type=INCIDENT&code=${encodeURIComponent(trackingCode)}`, "");
  assert.equal(unlocked.payload.data.accessLevel, "OWNER");
  assert.ok(unlocked.payload.data.record.description.includes("knee-deep"), "description visible to code holder");
  assert.ok(unlocked.payload.data.record.contactPhoneMasked.includes("•"), "contact must stay masked even for the owner");

  // 4. My reports requires authentication and only returns the caller's records.
  assert.equal((await call("/api/my-reports", "")).status, 401, "unauthenticated my-reports must be rejected");
  const mineBefore = await call("/api/my-reports", citizen.cookie);
  assert.equal(mineBefore.status, 200);
  assert.ok(!mineBefore.payload.data.incidents.some((incident) => incident.publicId === publicId), "another citizen's report must not leak");

  // 5. A signed-in citizen's submission is linked automatically.
  const linked = await call("/api/incidents", citizen.cookie, {
    method: "POST",
    body: JSON.stringify({
      category: "FALLEN_TREE",
      description: "Phase 4 verification: a tree has fallen across the lane and is blocking two-wheelers near the school gate.",
      districtCode: "TN-CBE",
      locationName: "Phase 4 school lane, Coimbatore",
      reportedSeverity: "LOW",
    }),
  });
  assert.equal(linked.status, 201);
  assert.equal(linked.payload.data.tracking.linkedToAccount, true, "signed-in submissions must be linked");
  const linkedId = linked.payload.data.incident.publicId;
  const mineAfter = await call("/api/my-reports", citizen.cookie);
  assert.ok(mineAfter.payload.data.incidents.some((incident) => incident.publicId === linkedId), "own report must appear under my reports");

  // 6. The report is visible to government staff and can be verified.
  const queue = await call("/api/incidents?scope=admin&limit=200", admin.cookie);
  const queued = queue.payload.data.incidents.find((incident) => incident.publicId === linkedId);
  assert.ok(queued, "citizen report must appear in the government queue");
  const verified = await call(`/api/incidents/${queued.id}`, admin.cookie, {
    method: "PATCH",
    body: JSON.stringify({ action: "VERIFY", severity: "MODERATE", note: "Verified by duty officer during Phase 4 testing." }),
  });
  assert.equal(verified.status, 200);

  // 7. The government update is reflected in the citizen's own view and notifications.
  const mineVerified = await call("/api/my-reports", citizen.cookie);
  const updated = mineVerified.payload.data.incidents.find((incident) => incident.publicId === linkedId);
  assert.equal(updated.status, "VERIFIED", "tracking must reflect government verification");
  assert.ok(updated.latestUpdate?.note, "latest official update must be exposed");
  const notifications = await call("/api/notifications", citizen.cookie);
  assert.equal(notifications.status, 200);
  assert.ok(
    notifications.payload.data.notifications.some((item) => item.publicId === linkedId && item.type === "INCIDENT_UPDATE"),
    "status change must generate a notification",
  );
  assert.equal(notifications.payload.data.delivery.sms, false);
  const target = notifications.payload.data.notifications.find((item) => item.publicId === linkedId);
  const marked = await call("/api/notifications", citizen.cookie, {
    method: "POST",
    body: JSON.stringify({ action: "mark-read", type: "INCIDENT", ref: `${linkedId}:${target.id}` }),
  });
  assert.equal(marked.status, 200);
  const afterRead = await call("/api/notifications", citizen.cookie);
  assert.ok(afterRead.payload.data.counts.unread <= notifications.payload.data.counts.unread, "read state must be stored");

  // 8. SOS submission carries a confirmation and reaches government monitoring.
  const sos = await call("/api/sos", citizen.cookie, {
    method: "POST",
    body: JSON.stringify({
      emergencyType: "SUPPLIES",
      description: "Phase 4 verification: drinking water required for a small relief gathering, no medical emergency.",
      districtCode: "TN-CBE",
      locationName: "Phase 4 community hall",
      peopleAffected: 12,
    }),
  });
  assert.equal(sos.status, 201);
  assert.match(sos.payload.data.sos.publicId, /^SOS-/);
  assert.ok(sos.payload.data.disclaimer.includes("does not guarantee"), "no false dispatch claim is allowed");
  const govSos = await call("/api/sos", admin.cookie);
  assert.ok(govSos.payload.data.sos.some((row) => row.publicId === sos.payload.data.sos.publicId), "SOS must reach government monitoring");
  const officer = await login("officer@disasterlink.demo", "Officer@123");
  const officerSos = await call("/api/sos", officer.cookie);
  const officerRow = officerSos.payload.data.sos.find((row) => row.publicId === sos.payload.data.sos.publicId);
  assert.equal(officerRow.phone, null, "officer view must redact citizen contact numbers");
  assert.equal(officerSos.payload.data.contactRedacted, true);

  // 9. Rejecting an unverified upload: text pretending to be an image.
  const badUpload = await call("/api/incidents", "", {
    method: "POST",
    body: JSON.stringify({
      category: "OTHER",
      description: "Phase 4 verification: upload validation probe with a text payload disguised as an image.",
      districtCode: "TN-CBE",
      locationName: "Upload probe",
      reportedSeverity: "LOW",
      photoUrl: `data:image/png;base64,${Buffer.from("<html>not an image</html>").toString("base64")}`,
    }),
  });
  assert.equal(badUpload.status, 422, "non-image content must be rejected even when labelled image/png");

  // 10. Facility discovery and shelter capacity data are shared with citizens.
  const facilities = await call("/api/facilities?district=TN-CBE&lat=11.0168&lng=76.9558", "");
  assert.equal(facilities.status, 200);
  assert.ok(facilities.payload.data.facilities.length > 0, "citizens must find facilities");
  assert.ok(
    facilities.payload.data.facilities.some((row) => row.distanceKm !== null),
    "distance must be computed when coordinates are supplied",
  );
  assert.ok(Array.isArray(facilities.payload.data.shelters), "shelter summary must be returned");
  const shelter = facilities.payload.data.shelters.find((row) => row.capacity !== null);
  if (shelter) {
    assert.ok(shelter.remaining === null || shelter.remaining <= shelter.capacity, "remaining capacity must never exceed total");
  }

  // 11. Alerts remain public and citizens cannot publish.
  const alerts = await call("/api/alerts?district=TN-CBE", "");
  assert.equal(alerts.status, 200);
  const publish = await call("/api/alerts", citizen.cookie, {
    method: "POST",
    body: JSON.stringify({ title: "Citizen publish attempt", summary: "This must be rejected because citizens cannot publish alerts.", sourceName: "test" }),
  });
  assert.equal(publish.status, 403, "citizens must not publish official alerts");

  // 12. Clean up the linked government-flow records created above.
  await call("/api/demo", admin.cookie, { method: "POST", body: JSON.stringify({ action: "reset-demo-records" }) });
});
