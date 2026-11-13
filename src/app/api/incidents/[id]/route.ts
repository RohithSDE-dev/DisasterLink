import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assignments, incidentEvents, incidents, teams } from "@/db/schema";
import { ApiError, fail, handleError, ok, oneOf, readJson, requireRole, str, writeAudit } from "@/lib/api";
import { SEVERITIES } from "@/lib/constants";
import { can, type Capability } from "@/lib/permissions";
import { getIncidentDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Action → capability required to perform it (enforced server-side). */
const ACTION_CAPABILITY: Record<string, Capability> = {
  START_REVIEW: "incident.review",
  VERIFY: "incident.verify",
  REJECT: "incident.reject",
  SET_SEVERITY: "incident.severity",
  ADD_REMARK: "incident.remark",
  ASSIGN: "incident.assign",
  START_WORK: "incident.progress",
  RESOLVE: "incident.resolve",
  REOPEN: "incident.review",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(["OFFICER", "ADMIN", "SUPER_ADMIN"]);
    const { id } = await params;
    const detail = await getIncidentDetail(Number(id));
    if (!detail) return fail("Incident not found", 404);

    // Citizen contact data is restricted to roles with an explicit capability.
    const restricted = can(actor.role, "incident.view_contact");
    const incident = restricted
      ? detail.incident
      : { ...detail.incident, contactName: null, contactPhone: null, lat: null, lng: null };

    return ok(
      {
        ...detail,
        incident,
        contactRedacted: !restricted,
        capabilities: {
          review: can(actor.role, "incident.review"),
          verify: can(actor.role, "incident.verify"),
          reject: can(actor.role, "incident.reject"),
          assign: can(actor.role, "incident.assign"),
          progress: can(actor.role, "incident.progress"),
          resolve: can(actor.role, "incident.resolve"),
          severity: can(actor.role, "incident.severity"),
          remark: can(actor.role, "incident.remark"),
        },
        actorRole: actor.role,
      },
      undefined,
      "Incident retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(["OFFICER", "ADMIN", "SUPER_ADMIN"]);
    const { id } = await params;
    const incidentId = Number(id);
    if (!Number.isInteger(incidentId)) throw new ApiError("Invalid incident id", 422);
    const body = await readJson(request);
    const action = oneOf(
      body.action,
      ["START_REVIEW", "VERIFY", "REJECT", "SET_SEVERITY", "ADD_REMARK", "ASSIGN", "START_WORK", "RESOLVE", "REOPEN"],
      "Action",
    );
    const capability = ACTION_CAPABILITY[action];
    if (!capability || !can(actor.role, capability)) {
      throw new ApiError(`Your role (${actor.role}) is not permitted to perform ${action.replaceAll("_", " ")}`, 403);
    }
    const note = str(body.note ?? body.remarks, "Official remarks", { optional: true, max: 1200 });

    const rows = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
    const incident = rows[0];
    if (!incident) return fail("Incident not found", 404);

    const update: Partial<typeof incidents.$inferInsert> = { updatedAt: new Date() };
    let summary = "";
    let eventAction: string = action;
    let assignmentInfo: { id: number; teamName: string } | null = null;

    switch (action) {
      case "START_REVIEW": {
        if (incident.status === "RESOLVED") throw new ApiError("Resolved incidents cannot re-enter review without REOPEN", 409);
        update.status = "UNDER_REVIEW";
        summary = `Incident ${incident.publicId} moved to UNDER_REVIEW`;
        break;
      }
      case "VERIFY": {
        if (incident.status === "RESOLVED") throw new ApiError("Incident is already resolved", 409);
        if (incident.status === "REJECTED") throw new ApiError("Rejected reports must be reopened before verification", 409);
        const severity = body.severity
          ? oneOf(body.severity, SEVERITIES, "Severity")
          : (incident.assessedSeverity ?? incident.aiSeverity ?? incident.reportedSeverity);
        update.status = "VERIFIED";
        update.assessedSeverity = severity;
        update.verifiedAt = new Date();
        if (note) update.resolutionNote = note;
        summary = `Incident ${incident.publicId} VERIFIED at severity ${severity}`;
        break;
      }
      case "ASSIGN": {
        if (!["VERIFIED", "ASSIGNED", "IN_PROGRESS"].includes(incident.status)) {
          throw new ApiError("Verify the incident before marking it assigned", 409);
        }
        const teamId = Number(body.teamId);
        if (!Number.isInteger(teamId)) throw new ApiError("A response team must be selected to mark an incident assigned", 422);
        const teamRows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
        const team = teamRows[0];
        if (!team) throw new ApiError("Response team not found", 404);
        if (team.status === "OFF_DUTY") throw new ApiError("This team is off duty", 409);
        const inserted = await db
          .insert(assignments)
          .values({
            teamId: team.id,
            teamName: team.name,
            incidentId: incident.id,
            resourcesAllocated: str(body.resourcesAllocated, "Resources allocated", { optional: true, max: 400 }) || null,
            status: "ASSIGNED",
            notes: note || `Assigned to incident ${incident.publicId} by ${actor.name}`,
            assignedById: actor.id,
            assignedByName: actor.name,
            dataClass: incident.dataClass,
          })
          .returning();
        await db.update(teams).set({ status: "ASSIGNED" }).where(eq(teams.id, team.id));
        update.status = "ASSIGNED";
        assignmentInfo = { id: inserted[0].id, teamName: team.name };
        summary = `Incident ${incident.publicId} ASSIGNED to ${team.name} by ${actor.name}`;
        break;
      }
      case "START_WORK": {
        if (!["VERIFIED", "ASSIGNED", "IN_PROGRESS"].includes(incident.status)) {
          throw new ApiError("Only verified or assigned incidents can move to in-progress", 409);
        }
        update.status = "IN_PROGRESS";
        summary = `Incident ${incident.publicId} marked IN_PROGRESS`;
        break;
      }
      case "REJECT": {
        if (!note) throw new ApiError("A rejection reason is required", 422);
        update.status = "REJECTED";
        update.resolutionNote = note;
        summary = `Incident ${incident.publicId} REJECTED: ${note}`;
        break;
      }
      case "RESOLVE": {
        if (!note) throw new ApiError("Resolution details are required", 422);
        if (!["VERIFIED", "ASSIGNED", "IN_PROGRESS"].includes(incident.status)) {
          throw new ApiError("Only verified, assigned or in-progress incidents can be resolved", 409);
        }
        update.status = "RESOLVED";
        update.resolutionNote = note;
        update.resolvedAt = new Date();
        await db.update(assignments).set({ status: "COMPLETED", updatedAt: new Date() }).where(eq(assignments.incidentId, incident.id));
        summary = `Incident ${incident.publicId} RESOLVED`;
        break;
      }
      case "SET_SEVERITY": {
        const severity = oneOf(body.severity, SEVERITIES, "Severity");
        update.assessedSeverity = severity;
        summary = `Severity for ${incident.publicId} set to ${severity}`;
        eventAction = "SEVERITY_UPDATED";
        break;
      }
      case "ADD_REMARK": {
        if (!note) throw new ApiError("Remarks cannot be empty", 422);
        summary = `Official remark added to ${incident.publicId}`;
        eventAction = "REMARK_ADDED";
        break;
      }
      case "REOPEN": {
        if (incident.status !== "RESOLVED" && incident.status !== "REJECTED") {
          throw new ApiError("Only resolved or rejected incidents can be reopened", 409);
        }
        update.status = "UNDER_REVIEW";
        update.resolvedAt = null;
        summary = `Incident ${incident.publicId} reopened for review`;
        break;
      }
      default:
        throw new ApiError("Unsupported action", 422);
    }

    const updated = await db.update(incidents).set(update).where(eq(incidents.id, incidentId)).returning();

    await db.insert(incidentEvents).values({
      incidentId,
      action: eventAction,
      fromStatus: incident.status,
      toStatus: update.status ?? incident.status,
      note: note || summary,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
    });

    await writeAudit({
      actor,
      action: eventAction,
      entityType: "INCIDENT",
      entityId: incident.publicId,
      summary,
      details: {
        before: {
          status: incident.status,
          assessedSeverity: incident.assessedSeverity,
          resolvedAt: incident.resolvedAt,
        },
        after: {
          status: update.status ?? incident.status,
          assessedSeverity: update.assessedSeverity ?? incident.assessedSeverity,
          resolvedAt: update.resolvedAt ?? incident.resolvedAt,
        },
        note: note || null,
        assignment: assignmentInfo,
      },
    });

    return ok({ incident: updated[0], assignment: assignmentInfo }, undefined, "Incident updated successfully");
  } catch (error) {
    return handleError(error);
  }
}
