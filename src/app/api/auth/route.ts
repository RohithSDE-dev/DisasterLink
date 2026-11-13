import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { createSession, destroySession, getSessionUser, verifyPassword } from "@/lib/auth";
import { fail, handleError, ok, readJson, str } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    return ok({ user });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ action?: string; email?: string; password?: string }>(request);
    if (body.action === "logout") {
      await destroySession();
      return ok({ user: null });
    }
    const email = str(body.email, "Email", { max: 200 }).toLowerCase();
    const password = str(body.password, "Password", { max: 200 });
    await ensureSeeded();
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const row = rows[0];
    if (!row || !verifyPassword(password, row.passwordHash)) {
      return fail("Invalid email or password", 401);
    }
    await createSession(row.id);
    return ok({
      user: { id: row.id, name: row.name, email: row.email, role: row.role, phone: row.phone, districtCode: row.districtCode },
    });
  } catch (error) {
    return handleError(error);
  }
}
