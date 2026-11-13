"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "./interactive";
import { Notice, SectionHeading } from "./ui";

const DEMO_ACCOUNTS = [
  { label: "Government officer (read-only)", email: "officer@disasterlink.demo", password: "Officer@123", role: "OFFICER", detail: "View dashboards, incident queue, SOS monitor, weather and audit — cannot verify or assign" },
  { label: "Citizen", email: "citizen@disasterlink.demo", password: "Citizen@123", role: "CITIZEN", detail: "Report incidents, raise SOS, track submissions" },
  { label: "Duty officer (Admin)", email: "admin@disasterlink.demo", password: "Admin@123", role: "ADMIN", detail: "Verify reports, triage SOS, assign teams, manage facilities" },
  { label: "State controller (Super Admin)", email: "super@disasterlink.demo", password: "Super@123", role: "SUPER_ADMIN", detail: "Audit log, data sources and simulation mode" },
];

export default function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("admin@disasterlink.demo");
  const [password, setPassword] = useState("Admin@123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiRequest<{ user: { role: string; name: string } }>("/api/auth", { method: "POST", body: { email, password } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Sign-in failed");
      return;
    }
    const role = result.data?.user.role;
    if (next) router.push(next);
    else if (role === "ADMIN" || role === "SUPER_ADMIN" || role === "OFFICER") router.push("/admin");
    else router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-[1fr_1fr]">
      <div>
        <SectionHeading eyebrow="Authentication" title="Sign in to DisasterLink" description="Role-based access: citizens, administrators and a super administrator." />
        <form onSubmit={submit} className="card card-pad space-y-3">
          <label className="block">
            <span className="label">Email</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </label>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="text-[11px] text-slate-500">
            Accounts are seeded for demonstration only. Passwords are stored as scrypt hashes and sessions use an HTTP-only cookie.
          </p>
        </form>
        <Link href="/" className="btn-ghost btn-sm mt-2">← Back to citizen portal</Link>
      </div>

      <div className="space-y-3">
        <SectionHeading eyebrow="Safe demo access" title="Demo credentials" description="Click an account to fill the form. Public demo accounts — no real personal data." />
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            onClick={() => {
              setEmail(account.email);
              setPassword(account.password);
            }}
            className="card w-full p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">{account.label}</p>
              <span className="chip bg-slate-100 text-slate-700 ring-slate-200">{account.role}</span>
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-slate-600">{account.email}</p>
            <p className="font-mono text-[11px] text-slate-500">{account.password}</p>
            <p className="mt-1 text-[11px] text-slate-500">{account.detail}</p>
          </button>
        ))}
        <Notice tone="warn" title="Demonstration only">
          These accounts exist only in the prototype database. Do not reuse real passwords. Personal data submitted here should be treated as
          public demo data.
        </Notice>
      </div>
    </div>
  );
}
