import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import type { Role } from "./constants";

const COOKIE = "dl_session";
const SESSION_DAYS = 7;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, digest] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !digest) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  districtCode: string | null;
};

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ token, userId, expiresAt });
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  store.delete(COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(COOKIE)?.value;
    if (!token) return null;
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        phone: users.phone,
        districtCode: users.districtCode,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { ...row, role: row.role as Role };
  } catch {
    return null;
  }
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "Not provided";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function hashFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
