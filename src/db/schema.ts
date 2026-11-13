import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------- identity -------------------------------- */

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("CITIZEN"), // CITIZEN | ADMIN | SUPER_ADMIN
    phone: text("phone"),
    districtCode: text("district_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------- geography ------------------------------- */

export const districts = pgTable(
  "districts",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    geoName: text("geo_name"),
    region: text("region").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    boundarySource: text("boundary_source"),
    boundaryYear: text("boundary_year"),
    hasPolygon: boolean("has_polygon").notNull().default(false),
  },
  (t) => [index("districts_name_idx").on(t.name)],
);

/* -------------------------------- incidents ------------------------------ */

export const incidents = pgTable(
  "incidents",
  {
    id: serial("id").primaryKey(),
    publicId: text("public_id").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    districtCode: text("district_code").notNull(),
    locationName: text("location_name").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    reportedSeverity: text("reported_severity").notNull().default("MODERATE"),
    assessedSeverity: text("assessed_severity"),
    status: text("status").notNull().default("PENDING"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    photoUrl: text("photo_url"),
    dataClass: text("data_class").notNull().default("COMMUNITY_REPORT"), // COMMUNITY_REPORT | SIMULATED
    aiCategory: text("ai_category"),
    aiSeverity: text("ai_severity"),
    aiSummary: text("ai_summary"),
    aiDuplicateOf: text("ai_duplicate_of"),
    aiConfidence: integer("ai_confidence"),
    resolutionNote: text("resolution_note"),
    reporterUserId: integer("reporter_user_id"),
    trackingCodeHash: text("tracking_code_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("incidents_public_id_uq").on(t.publicId),
    index("incidents_district_idx").on(t.districtCode),
    index("incidents_status_idx").on(t.status),
  ],
);

export const incidentEvents = pgTable(
  "incident_events",
  {
    id: serial("id").primaryKey(),
    incidentId: integer("incident_id").notNull(),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    actorId: integer("actor_id"),
    actorName: text("actor_name"),
    actorRole: text("actor_role"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("incident_events_incident_idx").on(t.incidentId)],
);

/* ----------------------------------- SOS --------------------------------- */

export const sosRequests = pgTable(
  "sos_requests",
  {
    id: serial("id").primaryKey(),
    publicId: text("public_id").notNull(),
    emergencyType: text("emergency_type").notNull().default("OTHER"),
    description: text("description").notNull(),
    districtCode: text("district_code").notNull(),
    locationName: text("location_name"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    name: text("name"),
    phone: text("phone"),
    peopleAffected: integer("people_affected"),
    status: text("status").notNull().default("SUBMITTED"),
    priority: text("priority").notNull().default("NORMAL"), // LOW | NORMAL | HIGH | CRITICAL
    assignedTeamId: integer("assigned_team_id"),
    assignedTeamName: text("assigned_team_name"),
    resolutionNote: text("resolution_note"),
    dataClass: text("data_class").notNull().default("COMMUNITY_REPORT"),
    aiSummary: text("ai_summary"),
    aiSeverity: text("ai_severity"),
    reporterUserId: integer("reporter_user_id"),
    trackingCodeHash: text("tracking_code_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("sos_public_id_uq").on(t.publicId), index("sos_status_idx").on(t.status)],
);

export const sosEvents = pgTable(
  "sos_events",
  {
    id: serial("id").primaryKey(),
    sosId: integer("sos_id").notNull(),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    actorId: integer("actor_id"),
    actorName: text("actor_name"),
    actorRole: text("actor_role"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sos_events_sos_idx").on(t.sosId)],
);

/* ------------------------------- facilities ------------------------------ */

export const facilities = pgTable(
  "facilities",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    districtCode: text("district_code").notNull(),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    phone: text("phone"),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    sourceClass: text("source_class").notNull().default("COMMUNITY_REPORT"),
    verificationStatus: text("verification_status").notNull().default("CANDIDATE"),
    availabilityNote: text("availability_note"),
    availabilityConfirmedAt: timestamp("availability_confirmed_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    isOfficialShelter: boolean("is_official_shelter").notNull().default(false),
    shelterDesignation: text("shelter_designation"),
    facilityClass: text("facility_class").notNull().default("UNKNOWN"), // GOVERNMENT | PRIVATE | NGO | UNKNOWN
    availabilityStatus: text("availability_status").notNull().default("UNKNOWN"), // AVAILABLE | LIMITED | FULL | CLOSED | UNKNOWN
    capacity: integer("capacity"),
    occupancy: integer("occupancy"),
    capacityDataClass: text("capacity_data_class").notNull().default("UNVERIFIED"), // VERIFIED | SIMULATED | UNVERIFIED
    dataClass: text("data_class").notNull().default("CANDIDATE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("facilities_district_idx").on(t.districtCode),
    index("facilities_category_idx").on(t.category),
  ],
);

/* ----------------------------- teams & resources ------------------------- */

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  baseDistrict: text("base_district").notNull(),
  contact: text("contact"),
  memberCount: integer("member_count").notNull().default(0),
  status: text("status").notNull().default("AVAILABLE"),
  notes: text("notes"),
  dataClass: text("data_class").notNull().default("SIMULATED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  quantity: integer("quantity").notNull().default(0),
  unit: text("unit").notNull().default("units"),
  districtCode: text("district_code").notNull(),
  teamId: integer("team_id"),
  status: text("status").notNull().default("AVAILABLE"),
  dataClass: text("data_class").notNull().default("SIMULATED"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assignments = pgTable("assignments", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  teamName: text("team_name").notNull(),
  incidentId: integer("incident_id"),
  sosId: integer("sos_id"),
  resourcesAllocated: text("resources_allocated"),
  status: text("status").notNull().default("ASSIGNED"),
  notes: text("notes"),
  assignedById: integer("assigned_by_id"),
  assignedByName: text("assigned_by_name"),
  dataClass: text("data_class").notNull().default("SIMULATED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------- governance ------------------------------ */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id"),
    actorName: text("actor_name"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

/**
 * Per-user read state for the citizen notification centre. Notifications are
 * derived from alerts and the citizen's own submissions, so only read state is
 * persisted here.
 */
export const notificationReads = pgTable(
  "notification_reads",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    entityType: text("entity_type").notNull(), // ALERT | INCIDENT | SOS | ANNOUNCEMENT
    entityRef: text("entity_ref").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notification_reads_uq").on(t.userId, t.entityType, t.entityRef)],
);

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  districtCode: text("district_code"),
  severity: text("severity").notNull().default("MODERATE"),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url"),
  sourceClass: text("source_class").notNull().default("OFFICIAL_WARNING"),
  verification: text("verification").notNull().default("UNVERIFIED"),
  category: text("category").notNull().default("PUBLIC_SAFETY_NOTICE"),
  instruction: text("instruction"),
  sourceReference: text("source_reference"),
  publishedById: integer("published_by_id"),
  publishedByName: text("published_by_name"),
  isActive: boolean("is_active").notNull().default(true),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isSimulated: boolean("is_simulated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alertReads = pgTable(
  "alert_reads",
  {
    id: serial("id").primaryKey(),
    alertId: integer("alert_id").notNull(),
    userId: integer("user_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("alert_reads_uq").on(t.alertId, t.userId)],
);

export const dataSources = pgTable("data_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  coverage: text("coverage").notNull(),
  sourceClass: text("source_class").notNull(),
  verificationStatus: text("verification_status").notNull().default("CANDIDATE"),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }),
  refreshInterval: text("refresh_interval"),
  enabled: boolean("enabled").notNull().default(true),
  notes: text("notes"),
});

export const weatherCache = pgTable(
  "weather_cache",
  {
    id: serial("id").primaryKey(),
    districtCode: text("district_code").notNull(),
    payload: jsonb("payload").notNull(),
    ok: boolean("ok").notNull().default(true),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("weather_cache_district_uq").on(t.districtCode)],
);

export const aiAnalyses = pgTable("ai_analyses", {
  id: serial("id").primaryKey(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id"),
  kind: text("kind").notNull(),
  output: jsonb("output").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
