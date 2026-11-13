/** Shared domain vocabulary for DisasterLink. */

export const ROLES = ["CITIZEN", "OFFICER", "ADMIN", "SUPER_ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const SOURCE_CLASSES = [
  "OBSERVED",
  "FORECAST",
  "MODEL_RISK_ESTIMATE",
  "OFFICIAL_WARNING",
  "COMMUNITY_REPORT",
  "SIMULATED",
] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

export const VERIFICATION_CLASSES = ["VERIFIED", "UNVERIFIED", "CANDIDATE"] as const;
export type Verification = (typeof VERIFICATION_CLASSES)[number];

export const INCIDENT_CATEGORIES = [
  "FLOODING",
  "WATERLOGGING",
  "FALLEN_TREE",
  "ROAD_BLOCKAGE",
  "BUILDING_DAMAGE",
  "FIRE",
  "LANDSLIDE",
  "OTHER",
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  FLOODING: "Flooding",
  WATERLOGGING: "Waterlogging",
  FALLEN_TREE: "Fallen tree",
  ROAD_BLOCKAGE: "Road blockage",
  BUILDING_DAMAGE: "Building damage",
  FIRE: "Fire",
  LANDSLIDE: "Landslide",
  OTHER: "Other emergency",
};

/**
 * Incident workflow (Phase 3):
 *   REPORTED → UNDER_REVIEW → VERIFIED → ASSIGNED → IN_PROGRESS → RESOLVED
 * REJECTED is a terminal branch for invalid/duplicate reports.
 * `PENDING` is retained as the stored value for REPORTED so existing rows and
 * API clients keep working; it is presented as "Reported" in the UI.
 */
export const INCIDENT_STATUSES = [
  "PENDING",
  "UNDER_REVIEW",
  "VERIFIED",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const SOS_STATUSES = [
  "SUBMITTED",
  "RECEIVED",
  "UNDER_REVIEW",
  "VERIFIED",
  "TEAM_ASSIGNED",
  "RESOLVED",
] as const;
export type SosStatus = (typeof SOS_STATUSES)[number];

export const SEVERITIES = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;

export const FACILITY_CATEGORIES = [
  "HOSPITAL",
  "CLINIC",
  "PHARMACY",
  "FIRE_STATION",
  "AMBULANCE_SERVICE",
  "POLICE_STATION",
  "SHELTER",
  "GROCERY",
  "SUPERMARKET",
  "RESTAURANT_FOOD",
] as const;
export type FacilityCategory = (typeof FACILITY_CATEGORIES)[number];

export const FACILITY_LABELS: Record<string, string> = {
  HOSPITAL: "Hospitals",
  CLINIC: "Clinics",
  PHARMACY: "Pharmacies",
  FIRE_STATION: "Fire stations",
  AMBULANCE_SERVICE: "Ambulance services",
  POLICE_STATION: "Police stations",
  SHELTER: "Official shelters",
  GROCERY: "Grocery stores",
  SUPERMARKET: "Supermarkets",
  RESTAURANT_FOOD: "Food resources",
};

export const TEAM_TYPES = [
  "FIRE_RESCUE",
  "MEDICAL",
  "POLICE",
  "REVENUE",
  "NGO",
  "UTILITY",
] as const;

export const TEAM_STATUSES = ["AVAILABLE", "ASSIGNED", "OFF_DUTY"] as const;
export const ASSIGNMENT_STATUSES = ["ASSIGNED", "EN_ROUTE", "ON_SITE", "COMPLETED", "CANCELLED"] as const;
export const RESOURCE_CATEGORIES = [
  "BOATS",
  "PUMPS",
  "AMBULANCE",
  "RESCUE_GEAR",
  "SHELTER_KITS",
  "FOOD_WATER",
  "GENERATOR",
] as const;

export const EMERGENCY_TYPES = [
  "TRAPPED_PERSON",
  "MEDICAL",
  "FLOOD_RESCUE",
  "FIRE",
  "LANDSLIDE",
  "SUPPLIES",
  "OTHER",
] as const;

export const SEVERITY_TONE: Record<string, string> = {
  LOW: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  MODERATE: "bg-amber-50 text-amber-700 ring-amber-200",
  HIGH: "bg-orange-50 text-orange-700 ring-orange-200",
  CRITICAL: "bg-red-50 text-red-700 ring-red-200",
  VERY_HIGH: "bg-red-50 text-red-700 ring-red-200",
};

export const INCIDENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Reported",
  UNDER_REVIEW: "Under review",
  VERIFIED: "Verified",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "Response in progress",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

/** Ordered workflow used by the command centre timeline. */
export const INCIDENT_WORKFLOW = ["PENDING", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS", "RESOLVED"] as const;

export const STATUS_TONE: Record<string, string> = {
  ASSIGNED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  IN_PROGRESS: "bg-purple-50 text-purple-700 ring-purple-200",
  PENDING: "bg-slate-100 text-slate-700 ring-slate-200",
  SUBMITTED: "bg-slate-100 text-slate-700 ring-slate-200",
  RECEIVED: "bg-sky-50 text-sky-700 ring-sky-200",
  UNDER_REVIEW: "bg-amber-50 text-amber-700 ring-amber-200",
  VERIFIED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 ring-rose-200",
  RESOLVED: "bg-teal-50 text-teal-700 ring-teal-200",
  TEAM_ASSIGNED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
};

export const AI_MODEL = "DisasterLink Heuristic Intelligence v1 (offline, no external LLM)";

export const SOS_DISCLAIMER =
  "Submitting an SOS does not guarantee that a rescue team has been dispatched. DisasterLink is a decision-support prototype. In an immediate life-threatening situation call 112 (Emergency Response Support System), 108 (Ambulance) or 101 (Fire & Rescue) directly.";

export const RISK_DISCLAIMER =
  "Flood risk shown here is a MODEL_RISK_ESTIMATE produced by a transparent heuristic. It is not an official flood-prone-zone determination and must not replace warnings from the Tamil Nadu State Disaster Management Authority or the India Meteorological Department.";

export const DEMO_NOTICE =
  "DEMO MODE — simulated records are labelled SIMULATED and are never mixed with observed weather or official warnings without an explicit label.";

export const TN_STATE = "Tamil Nadu, India";
