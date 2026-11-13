import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dataSources } from "@/db/schema";
import { ApiError, fail, handleError, ok, readJson, requireRole, str, writeAudit } from "@/lib/api";
import { getGovernanceData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const data = await getGovernanceData();
    return ok(data);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireRole(["SUPER_ADMIN"]);
    const body = await readJson(request);
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new ApiError("Data source id is required", 422);
    const rows = await db.select().from(dataSources).where(eq(dataSources.id, id)).limit(1);
    if (!rows[0]) return fail("Data source not found", 404);
    const update: Partial<typeof dataSources.$inferInsert> = {};
    if (body.enabled !== undefined) update.enabled = Boolean(body.enabled);
    if (body.notes !== undefined) update.notes = str(body.notes, "Notes", { optional: true, max: 800 });
    if (body.verificationStatus) update.verificationStatus = String(body.verificationStatus);
    if (!Object.keys(update).length) throw new ApiError("No supported fields supplied", 422);
    const updated = await db.update(dataSources).set(update).where(eq(dataSources.id, id)).returning();
    await writeAudit({
      actor,
      action: "DATA_SOURCE_UPDATED",
      entityType: "DATA_SOURCE",
      entityId: id,
      summary: `Data source "${rows[0].name}" updated`,
      details: update,
    });
    return ok({ dataSource: updated[0] });
  } catch (error) {
    return handleError(error);
  }
}
