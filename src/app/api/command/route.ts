import { handleError, ok, requireRole } from "@/lib/api";
import { getCommandOverview } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireRole(["OFFICER", "ADMIN", "SUPER_ADMIN"]);
    const overview = await getCommandOverview();
    return ok({
      totals: overview.totals,
      recentIncidents: overview.recentIncidents,
      recentSos: overview.recentSos,
      recentAudit: overview.recentAudit,
      activeAlerts: overview.activeAlerts,
      activeAssignments: overview.activeAssignments,
      board: overview.board,
      actor: { role: actor.role, name: actor.name },
      workflow: ["PENDING", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS", "RESOLVED"],
      note: "Command centre metrics count DisasterLink records only. SIMULATED demonstration records are included and badged.",
    });
  } catch (error) {
    return handleError(error);
  }
}
