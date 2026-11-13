import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { alerts, incidentEvents, incidents, notificationReads, sosEvents, sosRequests } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { maskPhone } from "@/lib/auth";
import { fail, handleError, ok, readJson, requireUser } from "@/lib/api";
import { publicStatusNote } from "@/lib/citizen";
import { districtByCode } from "@/lib/districts";

export const dynamic = "force-dynamic";

type NotificationItem = {
  id: number;
  type: "ALERT" | "ANNOUNCEMENT" | "INCIDENT_UPDATE" | "SOS_UPDATE";
  title: string;
  body: string;
  severity: string | null;
  districtCode: string | null;
  districtName: string | null;
  sourceName: string | null;
  sourceClass: string | null;
  publicId: string | null;
  status: string | null;
  createdAt: string;
  read: boolean;
  href: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  FLOOD_WARNING: "Flood warning",
  HEAVY_RAINFALL: "Heavy rainfall",
  CYCLONE_WARNING: "Cyclone warning",
  LANDSLIDE_WARNING: "Landslide warning",
  EXTREME_WEATHER: "Extreme weather",
  ROAD_CLOSURE: "Road closure",
  EVACUATION: "Emergency evacuation",
  PUBLIC_SAFETY_NOTICE: "Public safety notice",
};

/**
 * Citizen notification centre. Notifications are derived from data other modules
 * already write (alerts, incident history, SOS history); only per-user read state
 * is stored. No delivery channel (SMS/push/email) is configured, and the API says
 * so rather than implying delivery.
 */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const user = await requireUser();
    const url = new URL(request.url);
    const districtFilter = url.searchParams.get("district")?.toUpperCase() || user.districtCode || null;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 60) || 60, 200);

    const [alertRows, incidentRows, sosRows, reads] = await Promise.all([
      db.select().from(alerts).where(eq(alerts.isActive, true)).orderBy(desc(alerts.createdAt)),
      db
        .select()
        .from(incidents)
        .where(eq(incidents.reporterUserId, user.id))
        .orderBy(desc(incidents.updatedAt)),
      db
        .select()
        .from(sosRequests)
        .where(eq(sosRequests.reporterUserId, user.id))
        .orderBy(desc(sosRequests.updatedAt)),
      db.select().from(notificationReads).where(eq(notificationReads.userId, user.id)),
    ]);

    const readKeys = new Set(reads.map((row) => `${row.entityType}:${row.entityRef}`));

    const incidentIds = incidentRows.map((row) => row.id);
    const sosIds = sosRows.map((row) => row.id);
    const [incidentHistory, sosHistory] = await Promise.all([
      incidentIds.length ? db.select().from(incidentEvents).where(inArray(incidentEvents.incidentId, incidentIds)) : Promise.resolve([]),
      sosIds.length ? db.select().from(sosEvents).where(inArray(sosEvents.sosId, sosIds)) : Promise.resolve([]),
    ]);

    const items: NotificationItem[] = [];

    for (const alert of alertRows) {
      if (districtFilter && alert.districtCode && alert.districtCode !== districtFilter) continue;
      const isAnnouncement = alert.category === "PUBLIC_SAFETY_NOTICE";
      const key = `${isAnnouncement ? "ANNOUNCEMENT" : "ALERT"}:${alert.id}`;
      items.push({
        id: alert.id,
        type: isAnnouncement ? "ANNOUNCEMENT" : "ALERT",
        title: alert.title,
        body: [alert.summary, alert.instruction ? `Action: ${alert.instruction}` : null].filter(Boolean).join(" "),
        severity: alert.severity,
        districtCode: alert.districtCode,
        districtName: alert.districtCode ? districtByCode(alert.districtCode)?.name ?? alert.districtCode : null,
        sourceName: alert.sourceName,
        sourceClass: alert.sourceClass,
        publicId: null,
        status: null,
        createdAt: (alert.issuedAt ?? alert.createdAt).toISOString(),
        read: readKeys.has(key) || readKeys.has(`ALERT:${alert.id}`),
        href: `/alerts${alert.districtCode ? `?district=${alert.districtCode}` : ""}`,
      });
    }

    for (const incident of incidentRows) {
      const events = incidentHistory
        .filter((event) => event.incidentId === incident.id && event.actorRole && event.actorRole !== "CITIZEN")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const latest = events[0];
      if (!latest) continue;
      const key = `INCIDENT:${incident.publicId}:${latest.id}`;
      items.push({
        id: latest.id,
        type: "INCIDENT_UPDATE",
        title: `Report ${incident.publicId}: ${(latest.toStatus ?? incident.status).replaceAll("_", " ").toLowerCase()}`,
        body: latest.note || publicStatusNote(latest.action) || "Status updated by an official.",
        severity: incident.assessedSeverity ?? incident.reportedSeverity,
        districtCode: incident.districtCode,
        districtName: districtByCode(incident.districtCode)?.name ?? incident.districtCode,
        sourceName: "DisasterLink incident update",
        sourceClass: "COMMUNITY_REPORT",
        publicId: incident.publicId,
        status: latest.toStatus ?? incident.status,
        createdAt: new Date(latest.createdAt).toISOString(),
        read: readKeys.has(key),
        href: `/track?id=${encodeURIComponent(incident.publicId)}&type=INCIDENT`,
      });
    }

    for (const sos of sosRows) {
      const events = sosHistory
        .filter((event) => event.sosId === sos.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const latest = events[0];
      if (!latest) continue;
      const key = `SOS:${sos.publicId}:${latest.id}`;
      items.push({
        id: latest.id,
        type: "SOS_UPDATE",
        title: `SOS ${sos.publicId}: ${(latest.toStatus ?? sos.status).replaceAll("_", " ").toLowerCase()}`,
        body:
          latest.actorRole === "CITIZEN"
            ? "Request submitted to DisasterLink. No emergency service has been contacted automatically — call 112 / 108 / 101 if lives are at risk."
            : latest.note || publicStatusNote(latest.action) || "An official updated this request.",
        severity: sos.priority,
        districtCode: sos.districtCode,
        districtName: districtByCode(sos.districtCode)?.name ?? sos.districtCode,
        sourceName: "DisasterLink SOS update",
        sourceClass: "COMMUNITY_REPORT",
        publicId: sos.publicId,
        status: latest.toStatus ?? sos.status,
        createdAt: new Date(latest.createdAt).toISOString(),
        read: readKeys.has(key),
        href: `/track?id=${encodeURIComponent(sos.publicId)}&type=SOS`,
      });
    }

    const sorted = items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);

    return ok(
      {
        notifications: sorted,
        counts: {
          total: sorted.length,
          unread: sorted.filter((item) => !item.read).length,
          alerts: sorted.filter((item) => item.type === "ALERT").length,
          announcements: sorted.filter((item) => item.type === "ANNOUNCEMENT").length,
          incidentUpdates: sorted.filter((item) => item.type === "INCIDENT_UPDATE").length,
          sosUpdates: sorted.filter((item) => item.type === "SOS_UPDATE").length,
        },
        delivery: {
          inApp: true,
          sms: false,
          email: false,
          push: false,
          note: "Only in-app notifications are enabled in this prototype. No SMS, email or push provider is configured, so DisasterLink never claims a message was delivered.",
        },
        account: { name: user.name, districtCode: user.districtCode, phoneMasked: maskPhone(user.phone) },
        districtFilter,
      },
      undefined,
      "Notifications retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ action?: string; type?: string; ref?: string }>(request);

    // mark-all-read: resolve the current notification refs server-side so the
    // client never has to enumerate them.
    if (body.action === "mark-all-read") {
      const [alertRows, ownedIncidents, ownedSos] = await Promise.all([
        db.select({ id: alerts.id, category: alerts.category }).from(alerts).where(eq(alerts.isActive, true)),
        db.select({ id: incidents.id, publicId: incidents.publicId }).from(incidents).where(eq(incidents.reporterUserId, user.id)),
        db.select({ id: sosRequests.id, publicId: sosRequests.publicId }).from(sosRequests).where(eq(sosRequests.reporterUserId, user.id)),
      ]);
      const incidentIds = ownedIncidents.map((row) => row.id);
      const sosIds = ownedSos.map((row) => row.id);
      const [incidentHistory, sosHistory] = await Promise.all([
        incidentIds.length ? db.select().from(incidentEvents).where(inArray(incidentEvents.incidentId, incidentIds)) : Promise.resolve([]),
        sosIds.length ? db.select().from(sosEvents).where(inArray(sosEvents.sosId, sosIds)) : Promise.resolve([]),
      ]);

      const refs: { type: string; ref: string }[] = alertRows.map((row) => ({
        type: row.category === "PUBLIC_SAFETY_NOTICE" ? "ANNOUNCEMENT" : "ALERT",
        ref: String(row.id),
      }));
      for (const incident of ownedIncidents) {
        for (const event of incidentHistory.filter((entry) => entry.incidentId === incident.id)) {
          refs.push({ type: "INCIDENT", ref: `${incident.publicId}:${event.id}` });
        }
      }
      for (const sos of ownedSos) {
        for (const event of sosHistory.filter((entry) => entry.sosId === sos.id)) {
          refs.push({ type: "SOS", ref: `${sos.publicId}:${event.id}` });
        }
      }
      if (refs.length) {
        await db
          .insert(notificationReads)
          .values(refs.map((entry) => ({ userId: user.id, entityType: entry.type, entityRef: entry.ref })))
          .onConflictDoNothing();
      }
      return ok({ marked: refs.length }, undefined, "All notifications marked as read");
    }

    const type = (body.type ?? "").trim().toUpperCase();
    const ref = (body.ref ?? "").trim();
    if (!type || !ref) return fail("Provide the notification type and reference to mark as read", 422);

    await db
      .insert(notificationReads)
      .values({ userId: user.id, entityType: type, entityRef: ref })
      .onConflictDoNothing();
    return ok({ marked: 1, type, ref }, undefined, "Notification marked as read");
  } catch (error) {
    return handleError(error);
  }
}
