import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { hashPassword } from "@/lib/auth";
import { ApiError, fail, handleError, ok, oneOf, readJson, requireRole, str, writeAudit } from "@/lib/api";
import { ROLES } from "@/lib/constants";
import { districtByCode } from "@/lib/districts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN"]);
    await ensureSeeded();
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, phone: users.phone, districtCode: users.districtCode, createdAt: users.createdAt })
      .from(users)
      .orderBy(desc(users.createdAt));
    return ok(
      {
        users: rows.map((row) => ({ ...row, districtName: row.districtCode ? districtByCode(row.districtCode)?.name ?? row.districtCode : null })),
        roles: ROLES,
        permissions: {
          CITIZEN: ["View public information", "Report incidents", "Submit SOS", "Track own submissions", "Find facilities"],
          OFFICER: ["Read-only command centre", "View incident queue and SOS monitor", "View weather and district intelligence", "View audit trail", "No verification, assignment or publishing rights"],
          ADMIN: ["Review and verify incidents", "Triage SOS", "Assign response teams", "Manage facilities", "Publish advisories", "View analytics"],
          SUPER_ADMIN: ["All administrator actions", "Manage users and roles", "Manage data sources", "Run simulation mode", "Full audit access"],
        },
      },
      undefined,
      "Users retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRole(["SUPER_ADMIN"]);
    const body = await readJson(request);
    const name = str(body.name, "Name", { max: 120 });
    const email = str(body.email, "Email", { max: 200 }).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError("A valid email is required", 422);
    const password = str(body.password, "Password", { min: 8, max: 72 });
    const role = oneOf(body.role ?? "CITIZEN", ROLES, "Role");
    const districtCode = str(body.districtCode, "District", { optional: true, max: 12 }).toUpperCase();
    if (districtCode && !districtByCode(districtCode)) throw new ApiError("Unknown district code", 422);
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing[0]) return fail("An account with this email already exists", 409);

    const inserted = await db
      .insert(users)
      .values({ name, email, passwordHash: hashPassword(password), role, districtCode: districtCode || null })
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role, districtCode: users.districtCode, createdAt: users.createdAt });

    await writeAudit({
      actor,
      action: "USER_CREATED",
      entityType: "USER",
      entityId: inserted[0].id,
      summary: `Account created for ${name} with role ${role}`,
      details: { email, role },
    });
    return ok(inserted[0], 201, "User created successfully");
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireRole(["SUPER_ADMIN"]);
    const body = await readJson(request);
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new ApiError("User id is required", 422);
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const target = rows[0];
    if (!target) return fail("User not found", 404);
    const update: Partial<typeof users.$inferInsert> = {};
    if (body.role) {
      if (target.id === actor.id && body.role !== "SUPER_ADMIN") throw new ApiError("You cannot remove your own super administrator role", 409);
      update.role = oneOf(body.role, ROLES, "Role");
    }
    if (body.name !== undefined) update.name = str(body.name, "Name", { max: 120 });
    if (body.districtCode !== undefined) {
      const code = str(body.districtCode, "District", { optional: true, max: 12 }).toUpperCase();
      if (code && !districtByCode(code)) throw new ApiError("Unknown district code", 422);
      update.districtCode = code || null;
    }
    if (!Object.keys(update).length) throw new ApiError("No supported fields supplied", 422);
    const updated = await db.update(users).set(update).where(eq(users.id, id)).returning({ id: users.id, name: users.name, email: users.email, role: users.role });
    await writeAudit({
      actor,
      action: "USER_UPDATED",
      entityType: "USER",
      entityId: id,
      summary: `Account ${target.email} updated`,
      details: update,
    });
    return ok(updated[0], undefined, "User updated successfully");
  } catch (error) {
    return handleError(error);
  }
}
