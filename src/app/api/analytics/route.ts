import { handleError, ok, requireRole } from "@/lib/api";
import { getAnalytics } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole(["OFFICER", "ADMIN", "SUPER_ADMIN"]);
    const analytics = await getAnalytics();
    return ok({
      ...analytics,
      disclosure:
        "Counts describe records stored in DisasterLink only. Seed and demonstration records are labelled SIMULATED and are not real-world incident statistics.",
    });
  } catch (error) {
    return handleError(error);
  }
}
