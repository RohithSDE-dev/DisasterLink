import { randomBytes } from "node:crypto";
import { desc, like } from "drizzle-orm";
import { db } from "@/db";
import { incidentEvents, sosEvents, sosRequests, incidents } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { ApiError, handleError, ok, readJson, requireRole, writeAudit } from "@/lib/api";
import { DEMO_NOTICE } from "@/lib/constants";
import { districtByCode } from "@/lib/districts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const rows = await db.select().from(incidents).orderBy(desc(incidents.createdAt));
    const sosRows = await db.select().from(sosRequests).orderBy(desc(sosRequests.createdAt));
    return ok({
      notice: DEMO_NOTICE,
      simulated: {
        incidents: rows.filter((r) => r.dataClass === "SIMULATED").length,
        sos: sosRows.filter((r) => r.dataClass === "SIMULATED").length,
      },
      live: {
        incidents: rows.filter((r) => r.dataClass === "COMMUNITY_REPORT").length,
        sos: sosRows.filter((r) => r.dataClass === "COMMUNITY_REPORT").length,
      },
      demoRecords: {
        incidents: rows.filter((r) => r.publicId.startsWith("DEMO-")).map((r) => ({ publicId: r.publicId, status: r.status })),
        sos: sosRows.filter((r) => r.publicId.startsWith("DEMO-")).map((r) => ({ publicId: r.publicId, status: r.status })),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRole(["ADMIN", "SUPER_ADMIN"]);
    const body = await readJson<{ action?: string }>(request);
    const action = body.action;

    if (action === "create-demo-record") {
      const stamp = randomBytes(2).toString("hex").toUpperCase();
      const coimbatore = districtByCode("TN-CBE")!;
      const incident = await db
        .insert(incidents)
        .values({
          publicId: `DEMO-INC-${stamp}`,
          category: "WATERLOGGING",
          description:
            "DEMO RUN: Knee deep water logging reported near Gandhipuram bus stand in Coimbatore after sustained rainfall. Buses are moving slowly and pedestrians are wading through the water.",
          districtCode: coimbatore.code,
          locationName: "Gandhipuram, Coimbatore (demo location)",
          lat: 11.0168,
          lng: 76.9558,
          reportedSeverity: "HIGH",
          status: "PENDING",
          contactName: "Demo citizen",
          contactPhone: "+91 90000 00099",
          dataClass: "SIMULATED",
          aiCategory: "WATERLOGGING",
          aiSeverity: "HIGH",
          aiSummary: "DEMO RUN: waterlogging near Gandhipuram bus stand, Coimbatore, reported as knee deep.",
          aiConfidence: 82,
        })
        .returning();
      const sos = await db
        .insert(sosRequests)
        .values({
          publicId: `DEMO-SOS-${stamp}`,
          emergencyType: "FLOOD_RESCUE",
          description:
            "DEMO RUN: Two residents are stranded on the ground floor of a house in Singanallur, Coimbatore. Water is rising and they need boat support.",
          districtCode: coimbatore.code,
          locationName: "Singanallur, Coimbatore (demo location)",
          lat: 11.0021,
          lng: 77.0271,
          name: "Demo citizen",
          phone: "+91 90000 00098",
          peopleAffected: 2,
          status: "SUBMITTED",
          priority: "CRITICAL",
          dataClass: "SIMULATED",
          aiSummary: "DEMO RUN: two people stranded, requested boat rescue, Coimbatore.",
          aiSeverity: "CRITICAL",
        })
        .returning();
      await db.insert(incidentEvents).values({
        incidentId: incident[0].id,
        action: "CREATED",
        toStatus: "PENDING",
        note: "DEMO RUN simulated report created for judge demonstration.",
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
      });
      await db.insert(sosEvents).values({
        sosId: sos[0].id,
        action: "CREATED",
        toStatus: "SUBMITTED",
        note: "DEMO RUN simulated SOS created for judge demonstration.",
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
      });
      await writeAudit({
        actor,
        action: "DEMO_RECORD_CREATED",
        entityType: "SYSTEM",
        entityId: incident[0].publicId,
        summary: `DEMO RUN records created: ${incident[0].publicId} and ${sos[0].publicId}`,
      });
      return ok({ incident: incident[0], sos: sos[0], notice: DEMO_NOTICE }, 201);
    }

    if (action === "reset-demo-records") {
      const demoIncidents = await db.select().from(incidents).where(like(incidents.publicId, "DEMO-%")).orderBy(incidents.id);
      const demoSos = await db.select().from(sosRequests).where(like(sosRequests.publicId, "DEMO-%")).orderBy(sosRequests.id);
      for (const row of demoIncidents) {
        await db.delete(incidentEvents).where(like(incidentEvents.incidentId, String(row.id)));
      }
      for (const row of demoSos) {
        await db.delete(sosEvents).where(like(sosEvents.sosId, String(row.id)));
      }
      await db.delete(incidents).where(like(incidents.publicId, "DEMO-%"));
      await db.delete(sosRequests).where(like(sosRequests.publicId, "DEMO-%"));
      await writeAudit({
        actor,
        action: "DEMO_RECORDS_RESET",
        entityType: "SYSTEM",
        entityId: "demo",
        summary: `Removed ${demoIncidents.length} demo incident(s) and ${demoSos.length} demo SOS record(s)`,
      });
      return ok({ removed: { incidents: demoIncidents.length, sos: demoSos.length } });
    }

    throw new ApiError("Unsupported demo action", 422);
  } catch (error) {
    return handleError(error);
  }
}
