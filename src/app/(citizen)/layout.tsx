import Link from "next/link";
import type { ReactNode } from "react";
import CitizenNav from "@/components/citizen/CitizenNav";
import { getSessionUser } from "@/lib/auth";

export default async function CitizenLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser().catch(() => null);
  // Notifications need an account; rendered client-side accordingly.
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="bg-ink-950 px-3 py-1 text-center text-[10px] font-medium tracking-wide text-slate-300">
        DISASTER DECISION-SUPPORT PROTOTYPE · Not an official government emergency system · Life-threatening emergency: call{" "}
        <a href="tel:112" className="font-bold text-white underline">
          112
        </a>
      </div>
      <CitizenNav user={user ? { name: user.name, role: user.role, signedIn: true } : null} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-6 sm:py-7">{children}</main>
      <footer className="mt-8 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm font-extrabold text-slate-900">DisasterLink</p>
            <p className="mt-1 leading-relaxed">
              Know the Risk. Find Safety. Get Help. AI-assisted disaster intelligence and emergency coordination prototype for Tamil Nadu.
            </p>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Citizen tools</p>
            <ul className="space-y-1">
              <li><Link className="hover:underline" href="/report">Report an incident</Link></li>
              <li><Link className="hover:underline" href="/sos">Emergency SOS</Link></li>
              <li><Link className="hover:underline" href="/facilities">Nearby help directory</Link></li>
              <li><Link className="hover:underline" href="/track">Track a submission</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Data &amp; trust</p>
            <ul className="space-y-1">
              <li>Weather: Open-Meteo (OBSERVED/FORECAST)</li>
              <li>Boundaries: simplified Census 2011</li>
              <li>Facilities: candidate public listings</li>
              <li>Official warnings: not ingested</li>
              <li>Demo records: clearly marked SIMULATED</li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Emergency numbers</p>
            <ul className="space-y-1">
              <li>112 — Emergency Response Support System</li>
              <li>108 — Ambulance</li>
              <li>101 — Fire &amp; Rescue</li>
              <li>1078 — State disaster control room</li>
            </ul>
            <Link href="/admin" className="mt-3 inline-block font-semibold text-blue-700 hover:underline">
              Command Centre →
            </Link>
          </div>
        </div>
        <div className="border-t border-slate-200 px-4 py-3 text-center text-[10px] text-slate-500">
          Data shown in this prototype may be simulated. Never rely on this application for life-safety decisions.
        </div>
      </footer>
    </div>
  );
}
