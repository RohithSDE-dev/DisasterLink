import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { fail, handleError, ok, requireRole } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Audit records are append-only: no mutation endpoint exists by design. */
export async function POST() {
  return fail("Audit records are append-only and cannot be modified through the API", 405);
}

export async function PATCH() {
  return fail("Audit records are append-only and cannot be modified through the API", 405);
}

export async function DELETE() {
  return fail("Audit records are append-only and cannot be modified through the API", 405);
}

export async function GET(request: Request) {
  try {
    await requireRole(["OFFICER", "ADMIN", "SUPER_ADMIN"]);
    const url = new URL(request.url);
    const action = url.searchParams.get("action")?.toUpperCase();
    const entity = url.searchParams.get("entity")?.toUpperCase();
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200) || 200, 500);
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
    const filtered = rows.filter((row) => {
      if (action && !row.action.toUpperCase().includes(action)) return false;
      if (entity && row.entityType.toUpperCase() !== entity) return false;
      return true;
    });
    return ok(
      {
        audit: filtered,
        counts: {
          total: rows.length,
          incidents: rows.filter((row) => row.entityType === "INCIDENT").length,
          sos: rows.filter((row) => row.entityType === "SOS").length,
          facilities: rows.filter((row) => row.entityType === "FACILITY").length,
          alerts: rows.filter((row) => row.entityType === "ALERT").length,
          users: rows.filter((row) => row.entityType === "USER").length,
          system: rows.filter((row) => row.entityType === "SYSTEM").length,
        },
        disclosure: "Every administrative mutation is recorded with actor, role, entity, summary and timestamp. Records are append-only.",
      },
      undefined,
      "Audit log retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}
