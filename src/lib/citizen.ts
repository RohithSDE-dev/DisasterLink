import { createHash, randomInt } from "node:crypto";
import type { SessionUser } from "./auth";

/**
 * Citizen privacy helpers.
 *
 * Submissions can be made by signed-in citizens (linked via reporter_user_id) or
 * anonymously. Every submission receives a one-time tracking code; only its
 * hash is stored, so a leaked database cannot reveal live tracking codes.
 */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion

export function generateTrackingCode(): string {
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function hashTrackingCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export type AccessLevel = "OWNER" | "GOVERNMENT" | "PUBLIC_VERIFIED" | "PUBLIC_LIMITED";

/**
 * Decides how much of a submission a caller may see.
 * - OWNER: signed-in citizen who submitted it, or someone holding the tracking code.
 * - GOVERNMENT: officer/admin/super admin (full operational view).
 * - PUBLIC_LIMITED: anyone else — status timeline only, no description, notes,
 *   contact details or coordinates.
 */
export function accessLevelFor(input: {
  user: SessionUser | null;
  reporterUserId: number | null;
  trackingCodeHash: string | null;
  suppliedCode: string | null;
}): AccessLevel {
  if (input.user && (input.user.role === "OFFICER" || input.user.role === "ADMIN" || input.user.role === "SUPER_ADMIN")) {
    return "GOVERNMENT";
  }
  if (input.user && input.reporterUserId !== null && input.user.id === input.reporterUserId) return "OWNER";
  if (input.suppliedCode && input.trackingCodeHash && hashTrackingCode(input.suppliedCode) === input.trackingCodeHash) {
    return "OWNER";
  }
  return "PUBLIC_LIMITED";
}

/** Text safe to show to anonymous visitors / other citizens. */
export function publicStatusNote(action: string | null): string | null {
  if (!action) return null;
  const map: Record<string, string> = {
    CREATED: "Report received by DisasterLink and queued for official review.",
    START_REVIEW: "An official has started reviewing this report.",
    REVIEW: "An official has started reviewing this report.",
    VERIFY: "An official verified this report.",
    VERIFIED: "An official verified this report.",
    ASSIGN: "A response team has been assigned.",
    TEAM_ASSIGNED: "A response team has been assigned.",
    START_WORK: "Response activity is in progress.",
    RECEIVE: "An official acknowledged this request.",
    EN_ROUTE: "A response team is on the way.",
    ON_SITE: "A response team reported arrival on site.",
    RESOLVE: "This record has been resolved and closed.",
    RESOLVED: "This record has been resolved and closed.",
    REJECT: "This report was reviewed and not accepted as an incident.",
    REJECTED: "This report was reviewed and not accepted as an incident.",
    REOPEN: "This record has been reopened for review.",
    SEVERITY_UPDATED: "An official updated the assessed severity.",
    PRIORITY_UPDATED: "An official updated the response priority.",
    REMARK_ADDED: "An official added an operational note.",
  };
  return map[action] ?? "Status updated by an official.";
}

/** A submission is stale if no official update has arrived for this long. */
export const STALE_AFTER_HOURS = 12;

export function hoursSince(value: string | Date | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.round(((now - time) / 3_600_000) * 10) / 10;
}

export function isStale(value: string | Date | null | undefined, thresholdHours = STALE_AFTER_HOURS): boolean {
  const hours = hoursSince(value);
  return hours !== null && hours > thresholdHours;
}
