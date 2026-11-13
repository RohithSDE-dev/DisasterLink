import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./auth";
import { SCREEN_ROLES } from "./permissions";
import type { Role } from "./constants";

/**
 * Server-side guard for command-centre screens.
 *
 * The layout blocks unauthenticated and citizen access; this guard adds the
 * per-screen role restriction so an officer cannot render administrator-only
 * pages even by typing the URL. APIs enforce the same rules independently.
 */
export async function requireScreen(screen: string): Promise<SessionUser> {
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect(`/login?next=/admin`);
  const allowed = SCREEN_ROLES[screen];
  if (allowed && !allowed.includes(user.role as Role)) {
    redirect(`/admin?denied=${encodeURIComponent(screen)}`);
  }
  return user;
}
