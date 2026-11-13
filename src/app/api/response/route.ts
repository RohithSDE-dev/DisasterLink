import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assignments, incidents, resources, teams } from "@/db/schema";
import { ApiError, fail, handleError, num, ok, oneOf, readJson, requireRole, str, writeAudit } from "@/lib/api";
import { ASSIGNMENT_STATUSES, RESOURCE_CATEGORIES, TEAM_STATUSES, TEAM_TYPES } from "@/lib/constants";
import { districtByCode } from "@/lib/districts";
import { getResponseBoard } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole(["ADMIN", "SUPER_ADMIN"]);
    const data = await getResponseBoard();
    return ok({
      ...data,
      districts: data.teams.map((t) => ({ code: t.baseDistrict, name: districtByCode(t.baseDistrict)?.name ?? t.baseDistrict })),
      note: "Response teams, resources and assignments in this dataset are SIMULATED demonstration records. No real dispatch occurs.",
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRole(["ADMIN", "SUPER_ADMIN"]);
    const body = await readJson(request);
    const kind = oneOf(body.kind, ["TEAM", "RESOURCE"] as const, "Record kind");

    if (kind === "TEAM") {
      const baseDistrict = str(body.baseDistrict, "Base district", { max: 12 }).toUpperCase();
      if (!districtByCode(baseDistrict)) throw new ApiError("Unknown base district", 422);
      const inserted = await db
        .insert(teams)
        .values({
          name: str(body.name, "Team name", { max: 160 }),
          type: oneOf(body.type ?? "REVENUE", TEAM_TYPES, "Team type"),
          baseDistrict,
          contact: str(body.contact, "Contact", { optional: true, max: 120 }),
          memberCount: num(body.memberCount ?? 0, "Member count", { optional: true, min: 0, max: 5000 }) ?? 0,
          status: oneOf(body.status ?? "AVAILABLE", TEAM_STATUSES, "Team status"),
          notes: str(body.notes, "Notes", { optional: true, max: 400 }),
          dataClass: "SIMULATED",
        })
        .returning();
      await writeAudit({
        actor,
        action: "TEAM_CREATED",
        entityType: "TEAM",
        entityId: inserted[0].id,
        summary: `Response team "${inserted[0].name}" created (record class SIMULATED)`,
      });
      return ok({ team: inserted[0] }, 201);
    }

    const districtCode = str(body.districtCode, "District", { max: 12 }).toUpperCase();
    if (!districtByCode(districtCode)) throw new ApiError("Unknown district", 422);
    const inserted = await db
      .insert(resources)
      .values({
        name: str(body.name, "Resource name", { max: 160 }),
        category: oneOf(body.category ?? "RESCUE_GEAR", RESOURCE_CATEGORIES, "Resource category"),
        quantity: num(body.quantity ?? 0, "Quantity", { optional: true, min: 0, max: 1_000_000 }) ?? 0,
        unit: str(body.unit ?? "units", "Unit", { optional: true, max: 40 }) || "units",
        districtCode,
        status: oneOf(body.status ?? "AVAILABLE", ["AVAILABLE", "DEPLOYED", "MAINTENANCE"] as const, "Resource status"),
        dataClass: "SIMULATED",
      })
      .returning();
    await writeAudit({
      actor,
      action: "RESOURCE_CREATED",
      entityType: "RESOURCE",
      entityId: inserted[0].id,
      summary: `Resource "${inserted[0].name}" added in ${districtByCode(districtCode)?.name}`,
    });
    return ok({ resource: inserted[0] }, 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireRole(["ADMIN", "SUPER_ADMIN"]);
    const body = await readJson(request);
    const kind = oneOf(body.kind, ["TEAM", "RESOURCE", "ASSIGNMENT"] as const, "Record kind");
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new ApiError("Record id is required", 422);

    if (kind === "TEAM") {
      const rows = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
      if (!rows[0]) return fail("Team not found", 404);
      const update: Partial<typeof teams.$inferInsert> = {};
      if (body.status) update.status = oneOf(body.status, TEAM_STATUSES, "Team status");
      if (body.memberCount !== undefined) update.memberCount = num(body.memberCount, "Member count", { min: 0, max: 5000 }) ?? 0;
      if (body.contact !== undefined) update.contact = str(body.contact, "Contact", { optional: true, max: 120 });
      if (!Object.keys(update).length) throw new ApiError("No team fields supplied", 422);
      const updated = await db.update(teams).set(update).where(eq(teams.id, id)).returning();
      await writeAudit({
        actor,
        action: "TEAM_UPDATED",
        entityType: "TEAM",
        entityId: id,
        summary: `Team "${rows[0].name}" updated`,
        details: update,
      });
      return ok({ team: updated[0] });
    }

    if (kind === "RESOURCE") {
      const rows = await db.select().from(resources).where(eq(resources.id, id)).limit(1);
      if (!rows[0]) return fail("Resource not found", 404);
      const update: Partial<typeof resources.$inferInsert> = { updatedAt: new Date() };
      if (body.quantity !== undefined) update.quantity = num(body.quantity, "Quantity", { min: 0, max: 1_000_000 }) ?? 0;
      if (body.status) update.status = oneOf(body.status, ["AVAILABLE", "DEPLOYED", "MAINTENANCE"] as const, "Resource status");
      if (!Object.keys(update).length) throw new ApiError("No resource fields supplied", 422);
      const updated = await db.update(resources).set(update).where(eq(resources.id, id)).returning();
      await writeAudit({
        actor,
        action: "RESOURCE_UPDATED",
        entityType: "RESOURCE",
        entityId: id,
        summary: `Resource "${rows[0].name}" updated`,
        details: update,
      });
      return ok({ resource: updated[0] });
    }

    const rows = await db.select().from(assignments).where(eq(assignments.id, id)).limit(1);
    const assignment = rows[0];
    if (!assignment) return fail("Assignment not found", 404);
    const status = oneOf(body.status, ASSIGNMENT_STATUSES, "Assignment status");
    const updated = await db.update(assignments).set({ status, updatedAt: new Date() }).where(eq(assignments.id, id)).returning();
    if (status === "COMPLETED" || status === "CANCELLED") {
      await db.update(teams).set({ status: "AVAILABLE" }).where(eq(teams.id, assignment.teamId));
    }
    await writeAudit({
      actor,
      action: "ASSIGNMENT_UPDATED",
      entityType: "ASSIGNMENT",
      entityId: id,
      summary: `Assignment #${id} status set to ${status}`,
      details: { status },
    });
    return ok({ assignment: updated[0] });
  } catch (error) {
    return handleError(error);
  }
}

/** Manual team assignment to an incident (authorised administrator only). */
export async function PUT(request: Request) {
  try {
    const actor = await requireRole(["ADMIN", "SUPER_ADMIN"]);
    const body = await readJson(request);
    const teamId = Number(body.teamId);
    const incidentId = Number(body.incidentId);
    if (!Number.isInteger(teamId) || !Number.isInteger(incidentId)) throw new ApiError("teamId and incidentId are required", 422);
    const teamRows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    const incidentRows = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
    if (!teamRows[0]) return fail("Team not found", 404);
    if (!incidentRows[0]) return fail("Incident not found", 404);
    const inserted = await db
      .insert(assignments)
      .values({
        teamId,
        teamName: teamRows[0].name,
        incidentId,
        resourcesAllocated: str(body.resourcesAllocated, "Resources allocated", { optional: true, max: 400 }) || null,
        status: "ASSIGNED",
        notes: str(body.notes, "Notes", { optional: true, max: 400 }) || `Assigned to incident ${incidentRows[0].publicId}`,
        assignedById: actor.id,
        assignedByName: actor.name,
        dataClass: incidentRows[0].dataClass,
      })
      .returning();
    await db.update(teams).set({ status: "ASSIGNED" }).where(eq(teams.id, teamId));
    await writeAudit({
      actor,
      action: "ASSIGNMENT_CREATED",
      entityType: "ASSIGNMENT",
      entityId: inserted[0].id,
      summary: `Team "${teamRows[0].name}" assigned to incident ${incidentRows[0].publicId}`,
      details: { teamId, incidentId },
    });
    return ok({ assignment: inserted[0] }, 201);
  } catch (error) {
    return handleError(error);
  }
}
