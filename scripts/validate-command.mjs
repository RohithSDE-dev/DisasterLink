/**
 * Phase 3 command-centre QA (static + live API).
 * Run with: node --test scripts/validate-command.mjs
 *
 * Set BASE_URL to test a running server (default http://127.0.0.1:3000).
 * Live tests are skipped automatically when the server is unreachable.
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
    const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
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
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const payload = await response.json();
  return { ok: response.ok && payload.success, cookie, role: payload?.data?.user?.role ?? null };
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

test("incident workflow covers every Phase 3 stage", () => {
  const constants = read("src/lib/constants.ts");
  for (const status of ["PENDING", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED"]) {
    assert.ok(constants.includes(`"${status}"`), `status ${status} must be declared`);
  }
  assert.ok(constants.includes("INCIDENT_WORKFLOW"), "ordered workflow must be exported");
  const labels = read("src/lib/constants.ts");
  assert.match(labels, /PENDING: "Reported"/, "REPORTED must be presented as a label over the stored PENDING value");
});

test("capability matrix separates officer, admin and super admin duties", () => {
  const permissions = read("src/lib/permissions.ts");
  assert.match(permissions, /ROLE_CAPABILITIES/, "role capability map required");
  for (const capability of ["incident.review", "incident.verify", "incident.assign", "alert.publish", "alert.official", "user.manage", "audit.view", "sos.view_contact"]) {
    assert.ok(permissions.includes(capability), `capability ${capability} must exist`);
  }
  // Officers must not be able to verify, assign or publish.
  const officer = permissions.slice(permissions.indexOf("const OFFICER"), permissions.indexOf("const ADMIN"));
  for (const forbidden of ["incident.verify", "incident.assign", "alert.publish", "user.manage", "sos.view_contact"]) {
    assert.ok(!officer.includes(`"${forbidden}"`), `OFFICER must not hold ${forbidden}`);
  }
  assert.ok(permissions.includes('CITIZEN: []'), "citizens get no command-centre capabilities");
});

test("incident API enforces per-action capabilities server-side", () => {
  const route = read("src/app/api/incidents/[id]/route.ts");
  assert.match(route, /ACTION_CAPABILITY/, "actions must map to capabilities");
  assert.match(route, /if \(!capability \|\| !can\(actor\.role, capability\)\)/, "capability must be checked before mutations");
  for (const action of ["START_REVIEW", "VERIFY", "REJECT", "ASSIGN", "START_WORK", "RESOLVE", "SET_SEVERITY", "ADD_REMARK", "REOPEN"]) {
    assert.ok(route.includes(action), `action ${action} must be supported`);
  }
  assert.match(route, /before:/, "audit must record previous values");
  assert.match(route, /after:/, "audit must record new values");
  assert.match(route, /incidentEvents/, "status history must be persisted");
  assert.match(route, /contactRedacted/, "contact redaction flag must be exposed");
});

test("assignment links incidents to teams and sets ASSIGNED", () => {
  const route = read("src/app/api/incidents/[id]/route.ts");
  assert.match(route, /update\.status = "ASSIGNED"/, "assignment must move status to ASSIGNED");
  assert.match(route, /insert\(assignments\)/, "an assignment record must be written");
  assert.match(route, /status: "COMPLETED"/, "resolution must close assignments");
  const sos = read("src/app/api/sos/route.ts");
  assert.match(sos, /can\(actor\.role, "sos\.view_contact"\)/, "SOS contacts must be capability-gated");
});

test("audit records are append-only", () => {
  const audit = read("src/app/api/audit/route.ts");
  for (const method of ["POST", "PATCH", "DELETE"]) {
    assert.ok(audit.includes(`export async function ${method}()`), `${method} must be explicitly handled`);
  }
  assert.match(audit, /append-only/, "the API must explain that audit records are append-only");
});

test("dashboard metrics derive from backend data and never invent values", () => {
  const queries = read("src/lib/queries.ts");
  for (const metric of [
    "critical",
    "awaitingVerification",
    "districtsUnderWarning",
    "openSos",
    "ambulancesAvailable",
    "availableFacilities",
    "shelterRemaining",
    "teamsActive",
    "resolved",
  ]) {
    assert.ok(queries.includes(metric), `metric ${metric} must be computed from records`);
  }
  const metrics = read("src/components/admin/CommandMetrics.tsx");
  assert.ok(metrics.includes("Data unavailable"), "missing metrics must render as unavailable");
});

test("government screens exist for all fourteen navigation areas", () => {
  const nav = read("src/components/admin/AdminNav.tsx");
  const paths = ["/admin", "/admin/map", "/admin/incidents", "/admin/sos", "/admin/facilities", "/admin/shelters", "/admin/ambulances", "/admin/response", "/admin/weather", "/admin/districts", "/admin/analytics", "/admin/alerts", "/admin/users", "/admin/audit"];
  for (const path of paths) {
    assert.ok(nav.includes(`href: "${path}"`), `navigation must include ${path}`);
  }
  assert.match(nav, /SCREEN_ROLES/, "navigation must gate by role");
});

/* -------------------------------- live QA -------------------------------- */

test("live command centre RBAC and workflow", async (t) => {
  if (!(await serverUp())) {
    t.skip(`No server at ${BASE}; live RBAC/workflow assertions skipped.`);
    return;
  }

  const citizen = await login("citizen@disasterlink.demo", "Citizen@123");
  const officer = await login("officer@disasterlink.demo", "Officer@123");
  const admin = await login("admin@disasterlink.demo", "Admin@123");
  const superAdmin = await login("super@disasterlink.demo", "Super@123");
  assert.ok(citizen.ok && officer.ok && admin.ok && superAdmin.ok, "demo accounts must authenticate");
  assert.equal(citizen.role, "CITIZEN");
  assert.equal(officer.role, "OFFICER");
  assert.equal(admin.role, "ADMIN");
  assert.equal(superAdmin.role, "SUPER_ADMIN");

  // Citizens are blocked from every government API.
  for (const path of ["/api/command", "/api/analytics", "/api/audit", "/api/sos", "/api/users", "/api/alerts?includeInactive=1"]) {
    const response = await call(path, citizen.cookie);
    assert.equal(response.status, 403, `citizen must be blocked from ${path}`);
  }
  const anon = await call("/api/command", "");
  assert.equal(anon.status, 401, "unauthenticated access must be rejected");

  // Officers can read operational data but cannot verify or publish.
  for (const path of ["/api/command", "/api/analytics", "/api/audit", "/api/sos"]) {
    const response = await call(path, officer.cookie);
    assert.equal(response.status, 200, `officer should read ${path}`);
    assert.equal(response.payload.success, true);
  }
  assert.equal((await call("/api/users", officer.cookie)).status, 403, "officer cannot manage users");
  assert.equal((await call("/api/governance", officer.cookie)).status, 403, "officer cannot access governance");
  const officerPublish = await call("/api/alerts", officer.cookie, {
    method: "POST",
    body: JSON.stringify({ title: "Officer publish attempt", summary: "This publication must be rejected for the officer role.", sourceName: "Test" }),
  });
  assert.equal(officerPublish.status, 403, "officer cannot publish alerts");

  // Dashboard metrics are numeric and internally consistent.
  const command = await call("/api/command", admin.cookie);
  assert.equal(command.status, 200);
  const totals = command.payload.data.totals;
  assert.equal(typeof totals.active, "number");
  assert.equal(typeof totals.districtsUnderWarning, "number");
  assert.ok(totals.pending >= 0 && totals.resolved >= 0);
  assert.equal(command.payload.data.board.length, 38, "district board must cover 38 districts");

  // Facility + shelter integrity: occupancy may never exceed capacity.
  const facilities = await call("/api/facilities?includeInactive=1", admin.cookie);
  assert.equal(facilities.status, 200);
  const shelter = facilities.payload.data.facilities.find((facility) => facility.category === "SHELTER" && facility.capacity);
  if (shelter) {
    const invalid = await call("/api/facilities", admin.cookie, {
      method: "PATCH",
      body: JSON.stringify({ id: shelter.id, capacity: 10, occupancy: 50 }),
    });
    assert.equal(invalid.status, 422, "occupancy above capacity must be rejected");
    const valid = await call("/api/facilities", admin.cookie, {
      method: "PATCH",
      body: JSON.stringify({ id: shelter.id, capacity: shelter.capacity, occupancy: shelter.occupancy ?? 0 }),
    });
    assert.equal(valid.status, 200, "valid capacity update must persist");
  }

  // Full incident workflow on a fresh simulated record.
  const created = await call("/api/demo", admin.cookie, { method: "POST", body: JSON.stringify({ action: "create-demo-record" }) });
  assert.equal(created.status, 201);
  const incidentId = created.payload.data.incident.id;
  const publicId = created.payload.data.incident.publicId;

  const officerVerify = await call(`/api/incidents/${incidentId}`, officer.cookie, { method: "PATCH", body: JSON.stringify({ action: "VERIFY" }) });
  assert.equal(officerVerify.status, 403, "officer must not verify incidents");
  const officerReview = await call(`/api/incidents/${incidentId}`, officer.cookie, { method: "PATCH", body: JSON.stringify({ action: "START_REVIEW", note: "Review started by officer" }) });
  assert.equal(officerReview.status, 200, "officer may start review");
  assert.equal(officerReview.payload.data.incident.status, "UNDER_REVIEW");

  const verified = await call(`/api/incidents/${incidentId}`, admin.cookie, { method: "PATCH", body: JSON.stringify({ action: "VERIFY", severity: "HIGH" }) });
  assert.equal(verified.status, 200);
  assert.equal(verified.payload.data.incident.status, "VERIFIED");

  const teamsPayload = await call("/api/response", admin.cookie);
  const team = teamsPayload.payload.data.teams.find((entry) => entry.status !== "OFF_DUTY");
  const assigned = await call(`/api/incidents/${incidentId}`, admin.cookie, {
    method: "PATCH",
    body: JSON.stringify({ action: "ASSIGN", teamId: team.id, note: "Assigning response team" }),
  });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.payload.data.incident.status, "ASSIGNED");
  assert.ok(assigned.payload.data.assignment?.id, "an assignment record must be returned");

  const inProgress = await call(`/api/incidents/${incidentId}`, admin.cookie, { method: "PATCH", body: JSON.stringify({ action: "START_WORK" }) });
  assert.equal(inProgress.payload.data.incident.status, "IN_PROGRESS");
  const noNoteResolve = await call(`/api/incidents/${incidentId}`, admin.cookie, { method: "PATCH", body: JSON.stringify({ action: "RESOLVE" }) });
  assert.equal(noNoteResolve.status, 422, "resolution requires details");
  const resolved = await call(`/api/incidents/${incidentId}`, admin.cookie, { method: "PATCH", body: JSON.stringify({ action: "RESOLVE", note: "Drain cleared and road reopened" }) });
  assert.equal(resolved.payload.data.incident.status, "RESOLVED");

  // Citizens see the government-recorded outcome through the public tracker.
  const tracked = await call(`/api/track?id=${publicId}&type=INCIDENT`, "");
  assert.equal(tracked.status, 200);
  assert.equal(tracked.payload.data.record.status, "RESOLVED", "government update must reach the citizen view");
  assert.ok(Array.isArray(tracked.payload.data.events) && tracked.payload.data.events.length >= 4, "history must be retained");

  // Every stage was audit logged with actor attribution.
  const audit = await call("/api/audit?entity=INCIDENT", admin.cookie);
  const entries = audit.payload.data.audit.filter((entry) => entry.entityId === publicId);
  const actions = entries.map((entry) => entry.action);
  for (const expected of ["START_REVIEW", "VERIFY", "ASSIGN", "START_WORK", "RESOLVE"]) {
    assert.ok(actions.includes(expected), `audit must contain ${expected}`);
  }
  assert.ok(entries.every((entry) => entry.actorName), "every entry must name the acting account");
  assert.ok(entries.some((entry) => entry.details && entry.details.before && entry.details.after), "audit must store previous and new values");

  const mutation = await call("/api/audit", superAdmin.cookie, { method: "DELETE" });
  assert.equal(mutation.status, 405, "audit records must be immutable");

  // Alert publication is admin-only and appears in the citizen portal.
  const alert = await call("/api/alerts", admin.cookie, {
    method: "POST",
    body: JSON.stringify({
      title: "Phase 3 verification notice",
      summary: "Automated verification notice published by an administrator to confirm citizen propagation.",
      category: "PUBLIC_SAFETY_NOTICE",
      severity: "MODERATE",
      districtCode: "TN-CBE",
      sourceName: "Phase 3 test",
      expiresInHours: 2,
    }),
  });
  assert.equal(alert.status, 201);
  const citizenAlerts = await call("/api/alerts?district=TN-CBE", citizen.cookie);
  assert.ok(
    citizenAlerts.payload.data.alerts.some((entry) => entry.id === alert.payload.data.id),
    "published alert must appear on citizen endpoints",
  );

  // Clean up the demo record so repeated test runs stay stable.
  await call("/api/demo", admin.cookie, { method: "POST", body: JSON.stringify({ action: "reset-demo-records" }) });
});
