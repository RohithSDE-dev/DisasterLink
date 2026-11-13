import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assignments, sosEvents, sosRequests, teams } from "@/db/schema";
import { ApiError, fail, handleError, ok, oneOf, readJson, requireRole, str, writeAudit } from "@/lib/api";
import { PRIORITIES, SOS_STATUSES } from "@/lib/constants";
import { getSosDetail } from "@/lib/queries";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(["OFFICER", "ADMIN", "SUPER_ADMIN"]);
    const { id } = await params;
    const detail = await getSosDetail(Number(id));
    if (!detail) return fail("SOS request not found", 404);
    const canSeeContact = can(actor.role, "sos.view_contact");
    return ok(
      {
        ...detail,
        sos: canSeeContact ? detail.sos : { ...detail.sos, name: detail.sos.name ? "Restricted" : null, phone: null, lat: null, lng: null },
        contactRedacted: !canSeeContact,
        capabilities: {
          acknowledge: can(actor.role, "sos.acknowledge"),
          assign: can(actor.role, "sos.assign"),
          resolve: can(actor.role, "sos.resolve"),
        },
      },
      undefined,
      "SOS request retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(["OFFICER", "ADMIN", "SUPER_ADMIN"]);
    const { id } = await params;
    const sosId = Number(id);
    if (!Number.isInteger(sosId)) throw new ApiError("Invalid SOS id", 422);
    const body = await readJson(request);
    const action = oneOf(
      body.action,
      ["RECEIVE", "REVIEW", "VERIFY", "ASSIGN", "RESOLVE", "SET_PRIORITY", "ADD_REMARK", "REOPEN"],
      "Action",
    );
    const note = str(body.note ?? body.remarks, "Remarks", { optional: true, max: 1500 });

    const ACTION_CAPABILITY = {
      RECEIVE: "sos.acknowledge",
      REVIEW: "sos.acknowledge",
      VERIFY: "sos.assign",
      ASSIGN: "sos.assign",
      SET_PRIORITY: "sos.assign",
      RESOLVE: "sos.resolve",
      ADD_REMARK: "sos.acknowledge",
      REOPEN: "sos.assign",
    } as const;
    const needed = ACTION_CAPABILITY[action];
    if (!needed || !can(actor.role, needed)) {
      throw new ApiError(`Your role (${actor.role}) is not permitted to ${action.replaceAll("_", " ")} SOS requests`, 403);
    }

    const rows = await db.select().from(sosRequests).where(eq(sosRequests.id, sosId)).limit(1);
    const sos = rows[0];
    if (!sos) return fail("SOS request not found", 404);
    if (sos.status === "RESOLVED" && action !== "REOPEN" && action !== "ADD_REMARK") {
      throw new ApiError("This SOS request is already resolved", 409);
    }

    const update: Partial<typeof sosRequests.$inferInsert> = { updatedAt: new Date() };
    let summary = "";
    let eventAction: string = action;
    let nextStatus: string = sos.status;

    switch (action) {
      case "RECEIVE":
        update.status = "RECEIVED";
        nextStatus = "RECEIVED";
        summary = `SOS ${sos.publicId} marked RECEIVED by duty officer`;
        break;
      case "REVIEW":
        update.status = "UNDER_REVIEW";
        nextStatus = "UNDER_REVIEW";
        summary = `SOS ${sos.publicId} moved to UNDER_REVIEW`;
        break;
      case "VERIFY":
        update.status = "VERIFIED";
        nextStatus = "VERIFIED";
        summary = `SOS ${sos.publicId} VERIFIED by administrator (no team dispatched yet)`;
        break;
      case "SET_PRIORITY": {
        const priority = oneOf(body.priority, PRIORITIES, "Priority");
        update.priority = priority;
        summary = `SOS ${sos.publicId} priority set to ${priority}`;
        eventAction = "PRIORITY_UPDATED";
        break;
      }
      case "ASSIGN": {
        if (!["VERIFIED", "UNDER_REVIEW", "RECEIVED", "SUBMITTED"].includes(sos.status)) {
          throw new ApiError("Verify the request before assigning a team", 409);
        }
        const teamId = Number(body.teamId);
        if (!Number.isInteger(teamId)) throw new ApiError("A response team must be selected", 422);
        const teamRows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
        const team = teamRows[0];
        if (!team) throw new ApiError("Response team not found", 404);
        if (team.status === "OFF_DUTY") throw new ApiError("This team is off duty", 409);
        const resourcesAllocated = str(body.resourcesAllocated, "Resources allocated", { optional: true, max: 400 });
        update.status = "TEAM_ASSIGNED";
        update.assignedTeamId = team.id;
        update.assignedTeamName = team.name;
        nextStatus = "TEAM_ASSIGNED";
        await db.update(teams).set({ status: "ASSIGNED" }).where(eq(teams.id, team.id));
        await db.insert(assignments).values({
          teamId: team.id,
          teamName: team.name,
          sosId: sos.id,
          resourcesAllocated: resourcesAllocated || null,
          status: "ASSIGNED",
          notes: note || "Assignment created from SOS control panel",
          assignedById: actor.id,
          assignedByName: actor.name,
          dataClass: sos.dataClass,
        });
        summary = `Team ${team.name} assigned to SOS ${sos.publicId} by ${actor.name}`;
        break;
      }
      case "RESOLVE": {
        if (!note) throw new ApiError("Resolution details are required", 422);
        update.status = "RESOLVED";
        update.resolutionNote = note;
        update.resolvedAt = new Date();
        nextStatus = "RESOLVED";
        if (sos.assignedTeamId) {
          await db.update(teams).set({ status: "AVAILABLE" }).where(eq(teams.id, sos.assignedTeamId));
          await db
            .update(assignments)
            .set({ status: "COMPLETED", updatedAt: new Date() })
            .where(eq(assignments.sosId, sos.id));
        }
        summary = `SOS ${sos.publicId} RESOLVED: ${note}`;
        break;
      }
      case "ADD_REMARK":
        if (!note) throw new ApiError("Remarks cannot be empty", 422);
        summary = `Remark added to SOS ${sos.publicId}`;
        eventAction = "REMARK_ADDED";
        break;
      case "REOPEN":
        update.status = "UNDER_REVIEW";
        update.resolvedAt = null;
        nextStatus = "UNDER_REVIEW";
        summary = `SOS ${sos.publicId} reopened for review`;
        break;
      default:
        throw new ApiError("Unsupported action", 422);
    }

    if (!SOS_STATUSES.includes(nextStatus as never)) throw new ApiError("Invalid status transition", 422);
    const updated = await db.update(sosRequests).set(update).where(eq(sosRequests.id, sosId)).returning();

    await db.insert(sosEvents).values({
      sosId,
      action: eventAction,
      fromStatus: sos.status,
      toStatus: nextStatus,
      note: note || summary,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
    });

    await writeAudit({
      actor,
      action: `SOS_${eventAction}`,
      entityType: "SOS",
      entityId: sos.publicId,
      summary,
      details: { fromStatus: sos.status, toStatus: nextStatus, note },
    });

    return ok({ sos: updated[0] });
  } catch (error) {
    return handleError(error);
  }
}
