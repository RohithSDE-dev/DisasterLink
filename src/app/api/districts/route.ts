import { handleError, ok } from "@/lib/api";
import { getDistrictBoard } from "@/lib/queries";
import { RIVER_SOURCE } from "@/lib/districts";
import { DEMO_NOTICE, RISK_DISCLAIMER } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const board = await getDistrictBoard();
    return ok({
      districts: board,
      count: board.length,
      meta: {
        riskSourceClass: "MODEL_RISK_ESTIMATE",
        riskDisclaimer: RISK_DISCLAIMER,
        riverSource: RIVER_SOURCE,
        demoNotice: DEMO_NOTICE,
        weatherSource: "Open-Meteo (observed + forecast)",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
