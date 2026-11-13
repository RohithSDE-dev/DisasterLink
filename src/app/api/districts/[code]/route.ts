import { fail, handleError, ok } from "@/lib/api";
import { getDistrictIntelligence } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const intelligence = await getDistrictIntelligence(code.toUpperCase());
    if (!intelligence) return fail("Unknown district code", 404);
    return ok(intelligence);
  } catch (error) {
    return handleError(error);
  }
}
