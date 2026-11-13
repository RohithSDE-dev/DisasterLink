import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { incidentEvents, incidents, sosEvents, sosRequests } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { maskPhone } from "@/lib/auth";
import { fail, handleError, ok, requireUser } from "@/lib/api";
import { CATEGORY_LABELS, INCIDENT_STATUS_LABELS } from "@/lib/constants";
import { publicStatusNote } from "@/lib/citizen";
import { districtByCode } from "@/lib/districts";

export const dynamic = "force-dynamic";

/**
 * The signed-in citizen's own submissions. Records are matched on
 * reporter_user_id or on the account's verified contact phone, so reports
 * submitted before signing in can still be claimed by their owner. No other
 * citizen's record is ever returned.
 */
export async function GET() {
  try {
    await ensureSeeded();
    const user = await requireUser();

    const phoneMatch = user.phone?.replace(/\s/g, "") ?? null;
    const incidentRows = await db
      .select()
      .from(incidents)
      .where(
        phoneMatch
          ? or(eq(incidents.reporterUserId, user.id), eq(incidents.contactPhone, phoneMatch))
          : eq(incidents.reporterUserId, user.id),
      )
      .orderBy(desc(incidents.createdAt));

    const sosRows = await db
      .select()
      .from(sosRequests)
      .where(phoneMatch ? or(eq(sosRequests.reporterUserId, user.id), eq(sosRequests.phone, phoneMatch)) : eq(sosRequests.reporterUserId, user.id))
      .orderBy(desc(sosRequests.createdAt));

    const incidentIds = incidentRows.map((row) => row.id);
    const sosIds = sosRows.map((row) => row.id);
    const [incidentHistory, sosHistory] = await Promise.all([
      incidentIds.length
        ? db.select().from(incidentEvents).where(inArray(incidentEvents.incidentId, incidentIds)).orderBy(desc(incidentEvents.createdAt))
        : Promise.resolve([]),
      sosIds.length ? db.select().from(sosEvents).where(inArray(sosEvents.sosId, sosIds)).orderBy(desc(sosEvents.createdAt)) : Promise.resolve([]),
    ]);

    const latestFor = (events: { action: string; note: string | null; toStatus: string | null; actorRole: string | null; createdAt: Date }[]) =>
      events.find((event) => event.actorRole && event.actorRole !== "CITIZEN") ?? events[0] ?? null;

    return ok(
      {
        incidents: incidentRows.map((row) => {
          const events = incidentHistory.filter((event) => event.incidentId === row.id);
          const latest = latestFor(events);
          return {
            id: row.id,
            publicId: row.publicId,
            kind: "INCIDENT",
            category: row.category,
            categoryLabel: CATEGORY_LABELS[row.category] ?? row.category,
            description: row.description,
            district: districtByCode(row.districtCode)?.name ?? row.districtCode,
            locationName: row.locationName,
            status: row.status,
            statusLabel: INCIDENT_STATUS_LABELS[row.status] ?? row.status,
            reportedSeverity: row.reportedSeverity,
            assessedSeverity: row.assessedSeverity,
            dataClass: row.dataClass,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            verifiedAt: row.verifiedAt,
            resolvedAt: row.resolvedAt,
            photoUrl: row.photoUrl,
            contactPhoneMasked: maskPhone(row.contactPhone),
            latestUpdate: latest
              ? {
                  status: latest.toStatus,
                  note:
                    latest.actorRole === "CITIZEN"
                      ? "Submitted to DisasterLink."
                      : latest.note || publicStatusNote(latest.action),
                  at: latest.createdAt,
                }
              : null,
            history: events.map((event) => ({
              status: event.toStatus,
              note: event.actorRole === "CITIZEN" ? "Submitted to DisasterLink." : event.note || publicStatusNote(event.action),
              at: event.createdAt,
            })),
            trackingLink: `/track?id=${encodeURIComponent(row.publicId)}&type=INCIDENT`,
          };
        }),
        sos: sosRows.map((row) => {
          const events = sosHistory.filter((event) => event.sosId === row.id);
          const latest = latestFor(events);
          return {
            id: row.id,
            publicId: row.publicId,
            kind: "SOS",
            category: row.emergencyType,
            categoryLabel: row.emergencyType.replaceAll("_", " ").toLowerCase(),
            description: row.description,
            district: districtByCode(row.districtCode)?.name ?? row.districtCode,
            locationName: row.locationName,
            status: row.status,
            priority: row.priority,
            assignedTeamName: row.assignedTeamName,
            dataClass: row.dataClass,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            resolvedAt: row.resolvedAt,
            phoneMasked: maskPhone(row.phone),
            latestUpdate: latest
              ? {
                  status: latest.toStatus,
                  note: latest.actorRole === "CITIZEN" ? "Submitted to DisasterLink." : latest.note || publicStatusNote(latest.action),
                  at: latest.createdAt,
                }
              : null,
            history: events.map((event) => ({
              status: event.toStatus,
              note: event.actorRole === "CITIZEN" ? "Submitted to DisasterLink." : event.note || publicStatusNote(event.action),
              at: event.createdAt,
            })),
            trackingLink: `/track?id=${encodeURIComponent(row.publicId)}&type=SOS`,
          };
        }),
        counts: {
          incidents: incidentRows.length,
          sos: sosRows.length,
          open: incidentRows.filter((row) => !["RESOLVED", "REJECTED"].includes(row.status)).length + sosRows.filter((row) => row.status !== "RESOLVED").length,
          resolved: incidentRows.filter((row) => row.status === "RESOLVED").length + sosRows.filter((row) => row.status === "RESOLVED").length,
        },
        account: { name: user.name, email: user.email, phoneMasked: maskPhone(user.phone) },
        note: "Only submissions linked to your account (by sign-in or verified contact number) are listed. Safeguarding note: never publish personal contact details.",
      },
      undefined,
      "Your submissions retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}

/** Citizens may also claim an anonymous submission with its tracking code. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => null)) as { id?: string; type?: string; code?: string } | null;
    if (!body?.id || !body?.code) return fail("Provide the tracking ID and tracking code", 422);
    const type = (body.type ?? "INCIDENT").toUpperCase();
    const { hashTrackingCode } = await import("@/lib/citizen");
    const hash = hashTrackingCode(body.code);

    if (type === "INCIDENT") {
      const rows = await db.select().from(incidents).where(eq(incidents.publicId, body.id.trim().toUpperCase())).limit(1);
      const record = rows[0];
      if (!record) return fail("No record found for that ID and code", 404);
      if (record.reporterUserId === user.id) return ok({ claimed: true, alreadyLinked: true }, undefined, "This report is already linked to your account");
      if (record.trackingCodeHash !== hash) return fail("No record found for that ID and code", 404);
      await db.update(incidents).set({ reporterUserId: user.id }).where(and(eq(incidents.id, record.id)));
      return ok({ claimed: true, publicId: record.publicId }, undefined, "Report linked to your account");
    }

    const rows = await db.select().from(sosRequests).where(eq(sosRequests.publicId, body.id.trim().toUpperCase())).limit(1);
    const record = rows[0];
    if (!record) return fail("No record found for that ID and code", 404);
    if (record.reporterUserId === user.id) return ok({ claimed: true, alreadyLinked: true }, undefined, "This request is already linked to your account");
    if (record.trackingCodeHash !== hash) return fail("No record found for that ID and code", 404);
    await db.update(sosRequests).set({ reporterUserId: user.id }).where(eq(sosRequests.id, record.id));
    return ok({ claimed: true, publicId: record.publicId }, undefined, "SOS request linked to your account");
  } catch (error) {
    return handleError(error);
  }
}
