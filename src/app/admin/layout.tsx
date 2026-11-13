import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import AdminNav from "@/components/admin/AdminNav";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Command Centre — DisasterLink" };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect("/login?next=/admin");
  if (user.role === "CITIZEN") redirect("/?notice=admin-only");

  return (
    <div className="min-h-screen bg-ink-950 text-slate-100 xl:flex">
      <AdminNav user={{ name: user.name, email: user.email, role: user.role }} />
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1400px] px-2 pb-10 pt-3 sm:px-5">
          <div className="rounded-2xl bg-slate-100 p-3 text-slate-900 shadow-2xl sm:p-5">{children}</div>
          <p className="mt-3 px-1 text-[10px] leading-relaxed text-slate-400">
            DISASTERLINK COMMAND CENTRE · Prototype decision-support environment for Tamil Nadu. Administrative actions are audit-logged.
            SIMULATED demonstration records are badged and are not real-world statistics. Official IMD/TNSDMA warning ingestion is not configured.
            No emergency service is dispatched by this platform.
          </p>
        </div>
      </div>
    </div>
  );
}
