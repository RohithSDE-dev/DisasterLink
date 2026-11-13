import type { Role } from "./constants";

/**
 * Phase 3 capability matrix.
 *
 * This module is the single source of truth for authorisation. The API enforces
 * it server-side (never relying on hidden buttons) and the UI uses it only to
 * avoid offering actions an account cannot perform.
 */
export const CAPABILITIES = [
  "incident.view_queue",
  "incident.review",
  "incident.remark",
  "incident.verify",
  "incident.reject",
  "incident.severity",
  "incident.assign",
  "incident.progress",
  "incident.resolve",
  "incident.view_contact",
  "sos.view_queue",
  "sos.acknowledge",
  "sos.assign",
  "sos.resolve",
  "sos.view_contact",
  "facility.view",
  "facility.create",
  "facility.update",
  "shelter.occupancy",
  "ambulance.availability",
  "response.view",
  "response.manage",
  "weather.view",
  "intelligence.view",
  "analytics.view",
  "alert.publish",
  "alert.official",
  "alert.retire",
  "user.manage",
  "audit.view",
  "governance.manage",
  "simulation.run",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const OFFICER: Capability[] = [
  "incident.view_queue",
  "incident.review",
  "incident.remark",
  "incident.progress",
  "sos.view_queue",
  "sos.acknowledge",
  "facility.view",
  "response.view",
  "weather.view",
  "intelligence.view",
  "analytics.view",
  "audit.view",
];

const ADMIN: Capability[] = [
  ...OFFICER,
  "incident.verify",
  "incident.reject",
  "incident.severity",
  "incident.assign",
  "incident.resolve",
  "incident.view_contact",
  "sos.assign",
  "sos.resolve",
  "sos.view_contact",
  "facility.create",
  "facility.update",
  "shelter.occupancy",
  "ambulance.availability",
  "response.manage",
  "alert.publish",
  "alert.retire",
];

const SUPER_ADMIN: Capability[] = [
  ...ADMIN,
  "alert.official",
  "user.manage",
  "governance.manage",
  "simulation.run",
];

export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  CITIZEN: [],
  OFFICER,
  ADMIN,
  SUPER_ADMIN,
};

export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  const list = ROLE_CAPABILITIES[role as Role];
  return Boolean(list?.includes(capability));
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Anonymous";
  if (role === "OFFICER") return "Government officer";
  if (role === "ADMIN") return "Administrator";
  if (role === "SUPER_ADMIN") return "Super administrator";
  return "Citizen";
}

/** Roles allowed to reach each command-centre area. */
export const SCREEN_ROLES: Record<string, Role[]> = {
  overview: ["OFFICER", "ADMIN", "SUPER_ADMIN"],
  map: ["OFFICER", "ADMIN", "SUPER_ADMIN"],
  incidents: ["OFFICER", "ADMIN", "SUPER_ADMIN"],
  sos: ["OFFICER", "ADMIN", "SUPER_ADMIN"],
  facilities: ["OFFICER", "ADMIN", "SUPER_ADMIN"],
  shelters: ["OFFICER", "ADMIN", "SUPER_ADMIN"],
  ambulances: ["OFFICER", "ADMIN", "SUPER_ADMIN"],
  response: ["OFFICER", "ADMIN", "SUPER_ADMIN"],
  weather: ["OFFICER", "ADMIN", "SUPER_ADMIN"],
  districts: ["OFFICER", "ADMIN", "SUPER_ADMIN"],
  analytics: ["OFFICER", "ADMIN", "SUPER_ADMIN"],
  alerts: ["ADMIN", "SUPER_ADMIN"],
  users: ["SUPER_ADMIN"],
  audit: ["OFFICER", "ADMIN", "SUPER_ADMIN"],
  governance: ["SUPER_ADMIN"],
};

export const WORKFLOW_ACTIONS: {
  action: string;
  label: string;
  capability: Capability;
  to: string;
  requiresNote?: boolean;
}[] = [
  { action: "START_REVIEW", label: "Start review", capability: "incident.review", to: "UNDER_REVIEW" },
  { action: "VERIFY", label: "Verify incident", capability: "incident.verify", to: "VERIFIED" },
  { action: "ASSIGN", label: "Mark assigned", capability: "incident.assign", to: "ASSIGNED" },
  { action: "START_WORK", label: "Mark in progress", capability: "incident.progress", to: "IN_PROGRESS" },
  { action: "RESOLVE", label: "Resolve incident", capability: "incident.resolve", to: "RESOLVED", requiresNote: true },
  { action: "REJECT", label: "Reject report", capability: "incident.reject", to: "REJECTED", requiresNote: true },
];
