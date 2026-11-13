import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  alerts,
  assignments,
  auditLogs,
  dataSources,
  districts,
  facilities,
  incidentEvents,
  incidents,
  resources,
  sosEvents,
  sosRequests,
  teams,
  users,
} from "@/db/schema";
import { CATEGORY_LABELS, FACILITY_CATEGORIES, INCIDENT_CATEGORIES, RISK_DISCLAIMER, SOS_STATUSES } from "./constants";
import { DISTRICTS, RIVERS, districtByCode, type DistrictSeed } from "./districts";
import { analyzeIncident, summarizeDistrictActivity } from "./ai";
import { estimateFloodRisk, type RiskAssessment } from "./risk";
import { refreshDistrictWeather, type WeatherMap, type WeatherSnapshot } from "./weather";

export type IncidentRow = typeof incidents.$inferSelect;
export type SosRow = typeof sosRequests.$inferSelect;
export type FacilityRow = typeof facilities.$inferSelect;

const OPEN_SOS = ["SUBMITTED", "RECEIVED", "UNDER_REVIEW", "VERIFIED", "TEAM_ASSIGNED"];

export type DistrictBoardEntry = {
  code: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  hasPolygon: boolean;
  incidents: { total: number; pending: number; verified: number; resolved: number; recentWater: number };
  openSos: number;
  facilities: number;
  shelters: number;
  risk: RiskAssessment;
  weather: {
    available: boolean;
    stale: boolean;
    temperature: number | null;
    apparentTemperature: number | null;
    rainfall: number | null;
    condition: string | null;
    weatherCode: number | null;
    next24hRainfall: number | null;
    precipProbability: number | null;
    windSpeed: number | null;
    windDirection: number | null;
    windGusts: number | null;
    humidity: number | null;
    cloudCover: number | null;
    pressure: number | null;
    uvIndex: number | null;
    isDay: boolean | null;
    fetchedAt: string;
  };
};

function summariseWeather(snapshot: WeatherSnapshot | undefined) {
  return {
    available: Boolean(snapshot?.available),
    stale: Boolean(snapshot?.stale),
    temperature: snapshot?.current?.temperature ?? null,
    apparentTemperature: snapshot?.current?.apparentTemperature ?? null,
    rainfall: snapshot?.current?.precipitation ?? null,
    condition: snapshot?.current?.condition ?? null,
    weatherCode: snapshot?.current?.weatherCode ?? null,
    next24hRainfall: snapshot?.next24hRainfall ?? null,
    precipProbability: snapshot?.next24h?.maxProbability ?? snapshot?.current?.precipitationProbability ?? null,
    windSpeed: snapshot?.current?.windSpeed ?? null,
    windDirection: snapshot?.current?.windDirection ?? null,
    windGusts: snapshot?.current?.windGusts ?? null,
    humidity: snapshot?.current?.humidity ?? null,
    cloudCover: snapshot?.current?.cloudCover ?? null,
    pressure: snapshot?.current?.pressure ?? null,
    uvIndex: snapshot?.current?.uvIndex ?? null,
    isDay: snapshot?.current?.isDay ?? null,
    fetchedAt: snapshot?.fetchedAt ?? new Date().toISOString(),
  };
}

export async function getDistrictBoard(): Promise<DistrictBoardEntry[]> {
  await ensureSeeded();
  const [weatherMap, incidentRows, sosRows, facilityRows] = await Promise.all([
    refreshDistrictWeather(DISTRICTS),
    db.select().from(incidents),
    db.select().from(sosRequests),
    db.select({ districtCode: facilities.districtCode, category: facilities.category, isOfficialShelter: facilities.isOfficialShelter }).from(facilities),
  ]);

  return DISTRICTS.map((district: DistrictSeed) => {
    const districtIncidents = incidentRows.filter((i) => i.districtCode === district.code);
    const since48 = Date.now() - 48 * 3600 * 1000;
    const recentWater = districtIncidents.filter(
      (i) => ["WATERLOGGING", "FLOODING"].includes(i.category) && new Date(i.createdAt).getTime() >= since48,
    ).length;
    const risk = estimateFloodRisk({ district, weather: weatherMap[district.code], incidents: districtIncidents });
    return {
      code: district.code,
      name: district.name,
      region: district.region,
      lat: district.lat,
      lng: district.lng,
      hasPolygon: district.code !== "TN-MYL",
      incidents: {
        total: districtIncidents.length,
        pending: districtIncidents.filter((i) => i.status === "PENDING" || i.status === "UNDER_REVIEW").length,
        verified: districtIncidents.filter((i) => i.status === "VERIFIED").length,
        resolved: districtIncidents.filter((i) => i.status === "RESOLVED").length,
        recentWater,
      },
      openSos: sosRows.filter((s) => s.districtCode === district.code && OPEN_SOS.includes(s.status)).length,
      facilities: facilityRows.filter((f) => f.districtCode === district.code).length,
      shelters: facilityRows.filter((f) => f.districtCode === district.code && f.isOfficialShelter).length,
      risk,
      weather: summariseWeather(weatherMap[district.code]),
    };
  });
}

export async function getAlertsForDistrict(code: string | null) {
  const rows = await db.select().from(alerts).orderBy(desc(alerts.createdAt));
  return rows.filter((a) => !code || !a.districtCode || a.districtCode === code);
}

export async function getVerifiedUpdates(limit = 8) {
  return db
    .select()
    .from(incidents)
    .where(eq(incidents.status, "VERIFIED"))
    .orderBy(desc(incidents.verifiedAt))
    .limit(limit);
}

export async function getDistrictIntelligence(code: string) {
  await ensureSeeded();
  const district = districtByCode(code);
  if (!district) return null;
  const weatherMap = await refreshDistrictWeather([district]);
  const weather = weatherMap[district.code];
  const [incidentRows, facilityRows, alertRows, sosRows] = await Promise.all([
    db.select().from(incidents).where(eq(incidents.districtCode, district.code)).orderBy(desc(incidents.createdAt)),
    db.select().from(facilities).where(eq(facilities.districtCode, district.code)),
    getAlertsForDistrict(district.code),
    db.select({ status: sosRequests.status }).from(sosRequests).where(eq(sosRequests.districtCode, district.code)),
  ]);
  const risk = estimateFloodRisk({ district, weather, incidents: incidentRows });
  const activity = summarizeDistrictActivity({
    districtName: district.name,
    incidents: incidentRows,
    openSos: sosRows.filter((s) => OPEN_SOS.includes(s.status)).length,
    riskLevel: risk.level,
  });
  return {
    district,
    weather,
    risk,
    activity,
    incidents: incidentRows,
    facilities: facilityRows,
    alerts: alertRows,
    sosCounts: {
      total: sosRows.length,
      open: sosRows.filter((s) => OPEN_SOS.includes(s.status)).length,
    },
    rivers: RIVERS.map((r) => ({
      ...r,
      distanceKm: Math.min(
        ...r.points.map((p) => {
          const dx = (p[0] - district.lng) * 111 * Math.cos((district.lat * Math.PI) / 180);
          const dy = (p[1] - district.lat) * 111;
          return Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10;
        }),
      ),
    }))
      .filter((r) => r.distanceKm <= 90)
      .sort((a, b) => a.distanceKm - b.distanceKm),
    boundarySource: {
      name: "Census 2011 simplified district boundaries",
      url: "https://github.com/udit-001/india-maps-data",
      note: "Not survey-grade. Mayiladuthurai (2020) has no separate polygon in this dataset.",
    },
    riskDisclaimer: RISK_DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };
}

export async function getFacilities(filters?: { district?: string; category?: string; q?: string; includeInactive?: boolean }) {
  await ensureSeeded();
  const rows = await db.select().from(facilities).orderBy(facilities.name);
  return rows.filter((row) => {
    if (!filters) return true;
    if (!filters.includeInactive && !row.isActive) return false;
    if (filters.district && row.districtCode !== filters.district) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (filters.q) {
      const needle = filters.q.toLowerCase();
      if (!`${row.name} ${row.address ?? ""}`.toLowerCase().includes(needle)) return false;
    }
    return true;
  });
}

export async function getPublicOverview(districtCode: string) {
  await ensureSeeded();
  const district = districtByCode(districtCode) ?? districtByCode("TN-CBE")!;
  const board = await getDistrictBoard();
  const entry = board.find((b) => b.code === district.code)!;
  const [incidentRows, facilityRows, alertRows, updates] = await Promise.all([
    db.select().from(incidents).where(eq(incidents.districtCode, district.code)).orderBy(desc(incidents.createdAt)).limit(12),
    db.select({ category: facilities.category, count: sql<number>`count(*)::int` }).from(facilities).where(eq(facilities.districtCode, district.code)).groupBy(facilities.category),
    getAlertsForDistrict(district.code),
    getVerifiedUpdates(6),
  ]);
  const weatherMap = await refreshDistrictWeather([district]);
  return {
    district,
    districts: DISTRICTS,
    districtEntry: entry,
    weather: weatherMap[district.code],
    alerts: alertRows,
    incidents: incidentRows,
    facilityCounts: facilityRows,
    verifiedUpdates: updates,
    boardSummary: {
      districtsWithAlerts: board.filter((b) => b.risk.level === "HIGH" || b.risk.level === "VERY_HIGH").length,
      totalVerified: board.reduce((sum, b) => sum + b.incidents.verified, 0),
      openSos: board.reduce((sum, b) => sum + b.openSos, 0),
    },
  };
}

export async function getIncidentDetail(id: number) {
  const rows = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  const incident = rows[0];
  if (!incident) return null;
  const [events, teamList, others] = await Promise.all([
    db.select().from(incidentEvents).where(eq(incidentEvents.incidentId, id)).orderBy(desc(incidentEvents.createdAt)),
    db.select().from(teams),
    db
      .select()
      .from(incidents)
      .where(and(eq(incidents.districtCode, incident.districtCode), inArray(incidents.status, ["PENDING", "UNDER_REVIEW", "VERIFIED"])))
      .orderBy(desc(incidents.createdAt))
      .limit(30),
  ]);
  const analysis = analyzeIncident({
    description: incident.description,
    districtCode: incident.districtCode,
    reportedSeverity: incident.assessedSeverity ?? incident.reportedSeverity,
    existing: others.filter((o) => o.id !== incident.id),
  });
  return { incident, events, analysis, teams: teamList.filter((t) => t.status === "AVAILABLE") };
}

export async function getSosDetail(id: number) {
  const rows = await db.select().from(sosRequests).where(eq(sosRequests.id, id)).limit(1);
  const sos = rows[0];
  if (!sos) return null;
  const [events, teamList, assignmentRows] = await Promise.all([
    db.select().from(sosEvents).where(eq(sosEvents.sosId, id)).orderBy(desc(sosEvents.createdAt)),
    db.select().from(teams),
    db.select().from(assignments).where(eq(assignments.sosId, id)).orderBy(desc(assignments.createdAt)),
  ]);
  return { sos, events, teams: teamList, assignments: assignmentRows };
}

export async function getCommandOverview() {
  await ensureSeeded();
  const [incidentRows, sosRows, facilityRows, teamRows, auditRows, resourceRows] = await Promise.all([
    db.select().from(incidents).orderBy(desc(incidents.createdAt)),
    db.select().from(sosRequests).orderBy(desc(sosRequests.createdAt)),
    db.select().from(facilities),
    db.select().from(teams),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(20),
    db.select().from(resources),
  ]);
  const board = await getDistrictBoard();
  const activeAssignments = await db
    .select()
    .from(assignments)
    .where(inArray(assignments.status, ["ASSIGNED", "EN_ROUTE", "ON_SITE"]));
  const now = Date.now();
  const activeAlerts = (await db.select().from(alerts)).filter(
    (alert) => alert.isActive && (!alert.expiresAt || new Date(alert.expiresAt).getTime() > now),
  );
  const officialWarningDistricts = new Set(
    activeAlerts.filter((alert) => alert.sourceClass === "OFFICIAL_WARNING").map((alert) => alert.districtCode ?? "STATEWIDE"),
  );
  return {
    totals: {
      total: incidentRows.length,
      pending: incidentRows.filter((i) => i.status === "PENDING" || i.status === "UNDER_REVIEW").length,
      verified: incidentRows.filter((i) => i.status === "VERIFIED").length,
      assigned: incidentRows.filter((i) => i.status === "ASSIGNED").length,
      inProgress: incidentRows.filter((i) => i.status === "IN_PROGRESS").length,
      awaitingVerification: incidentRows.filter((i) => i.status === "PENDING" || i.status === "UNDER_REVIEW").length,
      critical: incidentRows.filter(
        (i) => (i.assessedSeverity ?? i.reportedSeverity) === "CRITICAL" && !["RESOLVED", "REJECTED"].includes(i.status),
      ).length,
      active: incidentRows.filter((i) => !["RESOLVED", "REJECTED"].includes(i.status)).length,
      rejected: incidentRows.filter((i) => i.status === "REJECTED").length,
      resolved: incidentRows.filter((i) => i.status === "RESOLVED").length,
      resolvedWithTimestamps: incidentRows.filter((i) => i.resolvedAt).length,
      simulated: incidentRows.filter((i) => i.dataClass === "SIMULATED").length,
      openSos: sosRows.filter((s) => OPEN_SOS.includes(s.status)).length,
      totalSos: sosRows.length,
      facilities: facilityRows.filter((f) => f.isActive).length,
      verifiedFacilities: facilityRows.filter((f) => f.verificationStatus === "VERIFIED").length,
      candidateFacilities: facilityRows.filter((f) => f.verificationStatus === "CANDIDATE").length,
      officialShelters: facilityRows.filter((f) => f.isOfficialShelter).length,
      ambulancesAvailable: facilityRows.filter((f) => f.category === "AMBULANCE_SERVICE" && f.isActive && f.availabilityStatus === "AVAILABLE").length,
      ambulancesTotal: facilityRows.filter((f) => f.category === "AMBULANCE_SERVICE" && f.isActive).length,
      sheltersActive: facilityRows.filter((f) => (f.category === "SHELTER" || f.isOfficialShelter) && f.isActive).length,
      shelterCapacity: facilityRows
        .filter((f) => f.category === "SHELTER" && f.isActive && f.capacity !== null && f.capacityDataClass !== "UNVERIFIED")
        .reduce((sum, f) => sum + (f.capacity ?? 0), 0),
      shelterOccupancy: facilityRows
        .filter((f) => f.category === "SHELTER" && f.isActive && f.occupancy !== null && f.capacityDataClass !== "UNVERIFIED")
        .reduce((sum, f) => sum + (f.occupancy ?? 0), 0),
      hospitalCapacityVerified: facilityRows
        .filter((f) => f.category === "HOSPITAL" && f.capacity !== null && f.capacityDataClass === "VERIFIED")
        .reduce((sum, f) => sum + (f.capacity ?? 0), 0),
      hospitalBedsVerifiedCount: facilityRows.filter((f) => f.category === "HOSPITAL" && f.capacity !== null && f.capacityDataClass === "VERIFIED").length,
      capacityRecordsSimulated: facilityRows.filter((f) => f.capacityDataClass === "SIMULATED").length,
      teamsAvailable: teamRows.filter((t) => t.status === "AVAILABLE").length,
      teamsTotal: teamRows.length,
      teamsActive: teamRows.filter((t) => t.status === "ASSIGNED").length,
      activeAssignments: activeAssignments.length,
      resourcesAvailable: resourceRows.filter((r) => r.status === "AVAILABLE").length,
      availableFacilities: facilityRows.filter((f) => f.isActive && f.availabilityStatus === "AVAILABLE").length,
      limitedFacilities: facilityRows.filter((f) => f.isActive && f.availabilityStatus === "LIMITED").length,
      shelterRemaining: Math.max(
        0,
        facilityRows
          .filter((f) => f.category === "SHELTER" && f.isActive && f.capacity !== null)
          .reduce((sum, f) => sum + ((f.capacity ?? 0) - (f.occupancy ?? 0)), 0),
      ),
      alertsActive: activeAlerts.length,
      alertsOfficial: activeAlerts.filter((a) => a.sourceClass === "OFFICIAL_WARNING").length,
      alertsSimulated: activeAlerts.filter((a) => a.isSimulated || a.sourceClass === "SIMULATED").length,
      districtsUnderWarning: officialWarningDistricts.size,
    },
    activeAlerts: activeAlerts.slice(0, 6),
    activeAssignments,
    recentIncidents: incidentRows.slice(0, 8),
    recentSos: sosRows.slice(0, 6),
    recentAudit: auditRows,
    board,
    districtName: (code: string) => districtByCode(code)?.name ?? code,
  };
}

export async function getAnalytics() {
  await ensureSeeded();
  const [incidentRows, sosRows, facilityRows, assignmentRows] = await Promise.all([
    db.select().from(incidents),
    db.select().from(sosRequests),
    db.select().from(facilities),
    db.select().from(assignments),
  ]);
  const board = await getDistrictBoard();

  const byDistrict = board
    .map((b) => ({ district: b.name, code: b.code, total: b.incidents.total, verified: b.incidents.verified, risk: b.risk.level }))
    .sort((a, b) => b.total - a.total);
  const districtSeverity = board
    .map((entry) => {
      const rows = incidentRows.filter((incident) => incident.districtCode === entry.code);
      const severityOf = (incident: (typeof incidentRows)[number]) => incident.assessedSeverity ?? incident.reportedSeverity;
      return {
        code: entry.code,
        district: entry.name,
        total: rows.length,
        low: rows.filter((row) => severityOf(row) === "LOW").length,
        moderate: rows.filter((row) => severityOf(row) === "MODERATE").length,
        high: rows.filter((row) => severityOf(row) === "HIGH").length,
        critical: rows.filter((row) => severityOf(row) === "CRITICAL").length,
        verified: rows.filter((row) => ["VERIFIED", "RESOLVED"].includes(row.status)).length,
        unverified: rows.filter((row) => ["PENDING", "UNDER_REVIEW"].includes(row.status)).length,
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.critical - a.critical || b.total - a.total);
  const byCategory = INCIDENT_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    count: incidentRows.filter((i) => i.category === category).length,
  })).filter((c) => c.count > 0);
  const bySeverity = ["LOW", "MODERATE", "HIGH", "CRITICAL"].map((severity) => ({
    severity,
    count: incidentRows.filter((i) => (i.assessedSeverity ?? i.reportedSeverity) === severity).length,
  }));
  const byStatus = ["PENDING", "UNDER_REVIEW", "VERIFIED", "REJECTED", "RESOLVED"].map((status) => ({
    status,
    count: incidentRows.filter((i) => i.status === status).length,
  }));

  const weeks: { label: string; incidents: number; sos: number }[] = [];
  for (let w = 7; w >= 0; w -= 1) {
    const start = Date.now() - (w + 1) * 7 * 24 * 3600 * 1000;
    const end = Date.now() - w * 7 * 24 * 3600 * 1000;
    weeks.push({
      label: w === 0 ? "This week" : `${w}w ago`,
      incidents: incidentRows.filter((i) => {
        const t = new Date(i.createdAt).getTime();
        return t >= start && t < end;
      }).length,
      sos: sosRows.filter((s) => {
        const t = new Date(s.createdAt).getTime();
        return t >= start && t < end;
      }).length,
    });
  }

  const months: { label: string; incidents: number }[] = [];
  for (let m = 5; m >= 0; m -= 1) {
    const date = new Date();
    date.setMonth(date.getMonth() - m);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    months.push({
      label: date.toLocaleString("en-IN", { month: "short" }),
      incidents: incidentRows.filter((i) => {
        const d = new Date(i.createdAt);
        return `${d.getFullYear()}-${d.getMonth()}` === key;
      }).length,
    });
  }

  const resolvedIncidents = incidentRows.filter((i) => i.verifiedAt && i.resolvedAt);
  const resolutionHours = resolvedIncidents.length
    ? resolvedIncidents.reduce((sum, i) => sum + (new Date(i.resolvedAt!).getTime() - new Date(i.createdAt).getTime()) / 3600_000, 0) / resolvedIncidents.length
    : null;
  const verifiedHours = incidentRows.filter((i) => i.verifiedAt);
  const verificationHours = verifiedHours.length
    ? verifiedHours.reduce((sum, i) => sum + (new Date(i.verifiedAt!).getTime() - new Date(i.createdAt).getTime()) / 3600_000, 0) / verifiedHours.length
    : null;

  const sosByStatus = SOS_STATUSES.map((status) => ({ status, count: sosRows.filter((s) => s.status === status).length }));
  const byFacilityCategory = FACILITY_CATEGORIES.map((category) => ({
    category,
    count: facilityRows.filter((f) => f.category === category).length,
  })).filter((c) => c.count > 0);

  return {
    byDistrict,
    districtSeverity,
    byCategory,
    bySeverity,
    byStatus,
    weeks,
    months,
    sos: {
      total: sosRows.length,
      byStatus: sosByStatus,
      open: sosRows.filter((s) => OPEN_SOS.includes(s.status)).length,
      resolved: sosRows.filter((s) => s.status === "RESOLVED").length,
      avgResponseHours: resolvedIncidents.length ? Math.round((resolutionHours ?? 0) * 10) / 10 : null,
    },
    resolution: {
      trend: Array.from({ length: 8 }, (_, index) => {
        const weekStart = Date.now() - (8 - index) * 7 * 86400000;
        const weekEnd = weekStart + 7 * 86400000;
        return {
          label: index === 7 ? "This week" : `${8 - index}w ago`,
          verified: incidentRows.filter((row) => row.verifiedAt && new Date(row.verifiedAt).getTime() >= weekStart && new Date(row.verifiedAt).getTime() < weekEnd).length,
          resolved: incidentRows.filter((row) => row.resolvedAt && new Date(row.resolvedAt).getTime() >= weekStart && new Date(row.resolvedAt).getTime() < weekEnd).length,
        };
      }),
      avgResolutionHours: resolutionHours === null ? null : Math.round(resolutionHours * 10) / 10,
      avgVerificationHours: verificationHours === null ? null : Math.round(verificationHours * 10) / 10,
      resolvedSample: resolvedIncidents.length,
    },
    byFacilityCategory,
    assignments: {
      total: assignmentRows.length,
      active: assignmentRows.filter((a) => ["ASSIGNED", "EN_ROUTE", "ON_SITE"].includes(a.status)).length,
      completed: assignmentRows.filter((a) => a.status === "COMPLETED").length,
    },
    riskLevels: ["LOW", "MODERATE", "HIGH", "VERY_HIGH"].map((level) => ({
      level,
      districts: board.filter((b) => b.risk.level === level).length,
    })),
    simulated: {
      incidents: incidentRows.filter((i) => i.dataClass === "SIMULATED").length,
      sos: sosRows.filter((s) => s.dataClass === "SIMULATED").length,
      facilities: facilityRows.filter((f) => f.dataClass === "SIMULATED").length,
    },
  };
}

export async function getGovernanceData() {
  await ensureSeeded();
  const [auditRows, sourceRows, userRows, districtRows] = await Promise.all([
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200),
    db.select().from(dataSources).orderBy(dataSources.id),
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt }).from(users).orderBy(users.id),
    db.select().from(districts).orderBy(districts.name),
  ]);
  return { audit: auditRows, dataSources: sourceRows, users: userRows, districts: districtRows };
}

export async function getResponseBoard() {
  await ensureSeeded();
  const [teamRows, resourceRows, assignmentRows, incidentRows, sosRows, facilityList] = await Promise.all([
    db.select().from(teams).orderBy(teams.name),
    db.select().from(resources).orderBy(resources.name),
    db.select().from(assignments).orderBy(desc(assignments.createdAt)),
    db.select().from(incidents).orderBy(desc(incidents.createdAt)).limit(100),
    db.select().from(sosRequests).orderBy(desc(sosRequests.createdAt)).limit(100),
    db.select().from(facilities),
  ]);
  return { teams: teamRows, resources: resourceRows, assignments: assignmentRows, incidents: incidentRows, sos: sosRows, facilities: facilityList };
}

export async function getRecentTrackable(type: "INCIDENT" | "SOS", publicId: string) {
  if (type === "INCIDENT") {
    const rows = await db.select().from(incidents).where(eq(incidents.publicId, publicId.toUpperCase())).limit(1);
    if (!rows[0]) return null;
    const events = await db.select().from(incidentEvents).where(eq(incidentEvents.incidentId, rows[0].id)).orderBy(desc(incidentEvents.createdAt));
    return { kind: "INCIDENT" as const, record: rows[0], events };
  }
  const rows = await db.select().from(sosRequests).where(eq(sosRequests.publicId, publicId.toUpperCase())).limit(1);
  if (!rows[0]) return null;
  const events = await db.select().from(sosEvents).where(eq(sosEvents.sosId, rows[0].id)).orderBy(desc(sosEvents.createdAt));
  return { kind: "SOS" as const, record: rows[0], events };
}
