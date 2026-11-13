"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { useSelectedDistrict } from "./useDistrict";
import { cx } from "../ui";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/map", label: "3D Map" },
  { href: "/weather", label: "Weather" },
  { href: "/alerts", label: "Alerts" },
  { href: "/districts", label: "Districts" },
  { href: "/intelligence", label: "Intelligence" },
  { href: "/facilities", label: "Find Help" },
  { href: "/shelters", label: "Shelters" },
  { href: "/evacuation", label: "Evacuation" },
  { href: "/safety", label: "Safety" },
  { href: "/track", label: "My Reports" },
  { href: "/notifications", label: "Notifications" },
  { href: "/demo", label: "Demo" },
];

export default function CitizenNav({ user }: { user: { name: string; role: string; signedIn?: boolean } | null }) {
  const pathname = usePathname();
  const [code, select] = useSelectedDistrict();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2.5 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="DisasterLink home">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink-900 text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 3 4.5 6.5v5.2c0 4.4 3.1 7.9 7.5 9.3 4.4-1.4 7.5-4.9 7.5-9.3V6.5Z" />
              <path d="M9 12.5h2l1-2.5 1.5 4 1-1.5H17" />
            </svg>
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-extrabold tracking-tight text-slate-900">DisasterLink</span>
            <span className="hidden text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 sm:block">Tamil Nadu · Prototype</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 overflow-x-auto lg:flex">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cx(
                  "rounded-md px-2.5 py-1.5 text-xs font-semibold transition",
                  active ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label="Selected district"
            value={code}
            onChange={(event) => select(event.target.value)}
            className="hidden max-w-[150px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 sm:block"
          >
            {DISTRICTS.map((district) => (
              <option key={district.code} value={district.code}>
                {district.name}
              </option>
            ))}
          </select>
          <Link href="/sos" className="btn-sos btn-sm shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-white live-dot" /> SOS
          </Link>
          <Link href="/report" className="btn-dark btn-sm hidden sm:inline-flex">
            Report
          </Link>
          {user ? (
            <Link href={user.role === "CITIZEN" ? "/track" : "/admin"} className="btn-outline btn-sm hidden md:inline-flex" title={`Signed in as ${user.name}`}>
              {user.name.split(" ")[0]}
            </Link>
          ) : (
            <Link href="/login" className="btn-outline btn-sm hidden md:inline-flex">
              Sign in
            </Link>
          )}
          <button className="btn-ghost btn-sm lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation" aria-expanded={open}>
            ☰
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-slate-200 bg-white px-3 py-2 lg:hidden">
          <div className="mb-2 flex items-center gap-2">
            <select
              aria-label="Selected district"
              value={code}
              onChange={(event) => select(event.target.value)}
              className="input py-1.5 text-xs"
            >
              {DISTRICTS.map((district) => (
                <option key={district.code} value={district.code}>
                  {district.name}
                </option>
              ))}
            </select>
            <Link href="/report" className="btn-dark btn-sm" onClick={() => setOpen(false)}>
              Report
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {link.label}
              </Link>
            ))}
            <Link href={user ? "/notifications" : "/login?next=/notifications"} onClick={() => setOpen(false)} className="rounded-md px-2.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">
              {user ? `Signed in: ${user.name}` : "Sign in"}
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
