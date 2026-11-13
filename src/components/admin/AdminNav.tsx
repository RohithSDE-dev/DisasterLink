"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cx } from "../ui";
import { SCREEN_ROLES } from "@/lib/permissions";

const GROUPS: { label: string; items: { href: string; label: string; icon: string; superOnly?: boolean }[] }[] = [
  {
    label: "Command",
    items: [
      { href: "/admin", label: "Command Centre Overview", icon: "▦" },
      { href: "/admin/map", label: "Live Tamil Nadu Map", icon: "◎" },
      { href: "/admin/incidents", label: "Incident Management", icon: "⚠" },
      { href: "/admin/sos", label: "SOS Monitoring", icon: "🆘" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/facilities", label: "Emergency Facilities", icon: "🏥" },
      { href: "/admin/shelters", label: "Safety Zones & Shelters", icon: "⛺" },
      { href: "/admin/ambulances", label: "Ambulance Management", icon: "🚑" },
      { href: "/admin/response", label: "Rescue Team Coordination", icon: "🚒" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/admin/weather", label: "Weather Intelligence", icon: "🌧" },
      { href: "/admin/districts", label: "District Intelligence", icon: "🧠" },
      { href: "/admin/analytics", label: "Reports & Analytics", icon: "📈" },
      { href: "/admin/alerts", label: "Alerts & Notifications", icon: "📣" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "User & Role Management", icon: "👤", superOnly: true },
      { href: "/admin/audit", label: "Audit Logs", icon: "🛡" },
      { href: "/admin/governance", label: "Governance & Simulation", icon: "⚙", superOnly: true },
    ],
  },
];

export default function AdminNav({ user }: { user: { name: string; email: string; role: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  }

  // Presentation-level gating only. The API independently enforces every
  // permission, so hiding a link is never treated as security.
  function allowed(href: string) {
    const key = href === "/admin" ? "overview" : href.replace("/admin/", "");
    const roles = SCREEN_ROLES[key];
    if (!roles) return true;
    return (roles as string[]).includes(user.role);
  }

  const links = (
    <nav className="space-y-3">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1 px-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.filter((item) => allowed(item.href)).map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cx(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition",
                    isActive(item.href)
                      ? "bg-teal-400/15 text-white ring-1 ring-inset ring-teal-300/30"
                      : "text-slate-300 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <span className="w-4 text-center text-[11px] opacity-80">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.superOnly ? <span className="text-[8px] font-bold uppercase tracking-wide text-amber-300/80">SA</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-900/95 backdrop-blur xl:hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-red-600 text-white">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3 4.5 6.5v5.2c0 4.4 3.1 7.9 7.5 9.3 4.4-1.4 7.5-4.9 7.5-9.3V6.5Z" />
              </svg>
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-extrabold text-white">DisasterLink</span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-red-300">Command Centre</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            <Link href="/" className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200">Citizen</Link>
            <button onClick={logout} className="btn bg-white/10 px-2 py-1 text-[11px] text-white">Sign out</button>
            <button onClick={() => setOpen((v) => !v)} className="btn bg-white/10 px-2 py-1 text-[11px] text-white" aria-label="Toggle navigation">☰</button>
          </div>
        </div>
        {open ? <div className="max-h-[70vh] overflow-y-auto border-t border-white/10 px-2 py-2">{links}</div> : null}
      </header>

      <aside className="hidden w-[248px] shrink-0 flex-col border-r border-white/10 bg-ink-900/80 xl:flex">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="border-b border-white/10 px-3 py-3">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-red-600 text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3 4.5 6.5v5.2c0 4.4 3.1 7.9 7.5 9.3 4.4-1.4 7.5-4.9 7.5-9.3V6.5Z" />
                  <path d="M9 12.5h2l1-2.5 1.5 4 1-1.5H17" />
                </svg>
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-extrabold tracking-tight text-white">DisasterLink</span>
                <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-red-300">Tamil Nadu EOC</span>
              </span>
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-3">{links}</div>
          <div className="border-t border-white/10 px-3 py-3">
            <p className="text-[11px] font-bold text-white">{user.name}</p>
            <p className="text-[10px] uppercase tracking-wide text-teal-300">{user.role.replaceAll("_", " ")}</p>
            <div className="mt-2 flex gap-1.5">
              <Link href="/" className="btn border border-white/15 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/10">Citizen portal</Link>
              <button onClick={logout} className="btn bg-white/10 px-2 py-1 text-[10px] text-white hover:bg-white/20">Sign out</button>
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-slate-500">
              Role: {user.role.replaceAll("_", " ")} · permissions enforced server-side. SIMULATED records badged.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
