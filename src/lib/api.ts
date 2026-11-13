import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { getSessionUser, type SessionUser } from "./auth";
import type { Role } from "./constants";

/**
 * Canonical response envelope: { success, message, data, timestamp }.
 * `ok` and `error` are retained for backwards compatibility with clients
 * written against the original DisasterLink contract.
 */
export function ok<T>(data: T, init?: number, message = "Request completed successfully") {
  return NextResponse.json(
    { success: true, ok: true, message, data, timestamp: new Date().toISOString() },
    { status: init ?? 200 },
  );
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { success: false, ok: false, message, error: message, timestamp: new Date().toISOString(), ...extra },
    { status },
  );
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError("Authentication required", 401);
  return user;
}

export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new ApiError("You do not have permission for this action", 403);
  return user;
}

export function handleError(error: unknown) {
  if (error instanceof ApiError) return fail(error.message, error.status);
  console.error("[api]", error);
  return fail("Unexpected server error. Please retry.", 500);
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") throw new Error("bad body");
    return body as T;
  } catch {
    throw new ApiError("Request body must be valid JSON", 400);
  }
}

export function str(value: unknown, field: string, opts?: { min?: number; max?: number; optional?: boolean }): string {
  const { min = 1, max = 4000, optional = false } = opts ?? {};
  if (value === undefined || value === null || value === "") {
    if (optional) return "";
    throw new ApiError(`${field} is required`, 422);
  }
  if (typeof value !== "string") throw new ApiError(`${field} must be text`, 422);
  const trimmed = value.trim();
  if (!optional && trimmed.length < min) throw new ApiError(`${field} is too short`, 422);
  if (trimmed.length > max) throw new ApiError(`${field} must be under ${max} characters`, 422);
  return trimmed;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ApiError(`${field} must be one of: ${allowed.join(", ")}`, 422);
  }
  return value as T;
}

export function num(value: unknown, field: string, opts?: { min?: number; max?: number; optional?: boolean }): number | null {
  const { min = -90, max = 90, optional = false } = opts ?? {};
  if (value === undefined || value === null || value === "") {
    if (optional) return null;
    throw new ApiError(`${field} is required`, 422);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ApiError(`${field} must be a number between ${min} and ${max}`, 422);
  }
  return parsed;
}

export function inList<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(",");
  return raw.map((v) => String(v).trim()).filter((v) => allowed.includes(v as T)) as T[];
}

export async function writeAudit(input: {
  actor: SessionUser;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  summary: string;
  details?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId === undefined || input.entityId === null ? null : String(input.entityId),
    summary: input.summary,
    details: input.details ?? {},
  });
}

export function matches(value: string | null | undefined, search: string): boolean {
  if (!search) return true;
  return (value ?? "").toLowerCase().includes(search.toLowerCase());
}

export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total, page, pageSize };
}

export { and, eq, inArray };
