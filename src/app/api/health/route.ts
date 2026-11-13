import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let database = "unavailable";
  let districts = 0;
  try {
    const result = await db.execute(sql`select count(*)::int as count from districts`);
    const rows = result.rows as { count: number }[];
    districts = rows[0]?.count ?? 0;
    database = "connected";
  } catch {
    database = "unavailable";
  }
  const payload = {
    status: database === "connected" ? "ok" : "degraded",
    service: "DisasterLink API",
    runtime: "Next.js route handlers (TypeScript) — Java Spring Boot module documented in /backend-java",
    database,
    districts,
    maplibre: "3D terrain map with OpenFreeMap vector tiles + AWS Terrain Tiles",
    latencyMs: Date.now() - startedAt,
    time: new Date().toISOString(),
  };
  return Response.json({
    ...payload,
    success: database === "connected",
    message: database === "connected" ? "Service healthy" : "Database unavailable",
    data: payload,
    timestamp: new Date().toISOString(),
  });
}
