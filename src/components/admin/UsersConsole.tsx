"use client";

import { useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { ROLES } from "@/lib/constants";
import { apiRequest, useApi } from "../interactive";
import { Chip, EmptyState, Field, Notice, SectionHeading, Stat, formatDateTime } from "../ui";

type UserRow = { id: number; name: string; email: string; role: string; phone: string | null; districtCode: string | null; districtName: string | null; createdAt: string };

export default function UsersConsole() {
  const { data, loading, error, reload } = useApi<{ users: UserRow[]; roles: string[]; permissions: Record<string, string[]> }>("/api/users");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "ADMIN", districtCode: "" });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setFeedback(null);
    const response = await apiRequest("/api/users", {
      method: "POST",
      body: { ...form, districtCode: form.districtCode || undefined },
    });
    setBusy(false);
    if (!response.ok) setFormError(response.error ?? "Could not create user");
    else {
      setFeedback(`Account created for ${form.name} with role ${form.role}.`);
      setForm({ name: "", email: "", password: "", role: "ADMIN", districtCode: "" });
      reload();
    }
  }

  async function changeRole(user: UserRow, role: string) {
    const response = await apiRequest("/api/users", { method: "PATCH", body: { id: user.id, role } });
    if (!response.ok) setFormError(response.error ?? "Could not update role");
    else {
      setFeedback(`${user.name} is now ${role}. Role changes are audit logged.`);
      reload();
    }
  }

  if (error) {
    return (
      <div className="space-y-3">
        <SectionHeading eyebrow="Administration" title="User & role management" />
        <Notice tone="warn" title="Super administrator access required">
          {error}. Sign in with <strong>super@disasterlink.demo / Super@123</strong> to manage accounts and roles.
        </Notice>
      </div>
    );
  }

  const users = data?.users ?? [];

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="User & role management"
        title="Accounts, roles and permissions"
        description="Citizens, government officers, administrators and super administrators. Only a super administrator can change roles."
        action={<Chip tone="purple">SUPER ADMIN</Chip>}
      />

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}
      {formError ? <Notice tone="danger">{formError}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Accounts" value={users.length} hint="prototype database" tone="info" />
        <Stat label="Administrators" value={users.filter((user) => user.role === "ADMIN").length} hint="incident + SOS operations" tone="warn" />
        <Stat label="Super administrators" value={users.filter((user) => user.role === "SUPER_ADMIN").length} hint="governance + simulation" tone="default" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="card overflow-hidden">
          <table className="table-base min-w-[600px]">
            <thead>
              <tr><th>Name</th><th>Email</th><th>District</th><th>Role</th><th>Created</th></tr>
            </thead>
            <tbody>
              {loading && !data ? <tr><td colSpan={5} className="p-4 text-xs text-slate-500">Loading accounts…</td></tr> : null}
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="text-xs font-semibold">{user.name}</td>
                  <td className="text-[11px] font-mono">{user.email}</td>
                  <td className="text-[11px]">{user.districtName ?? "—"}</td>
                  <td>
                    <select value={user.role} onChange={(event) => void changeRole(user, event.target.value)} className="rounded border border-slate-300 px-1 py-0.5 text-[10px]">
                      {ROLES.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}
                    </select>
                  </td>
                  <td className="text-[10px] text-slate-500">{formatDateTime(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !users.length ? <div className="p-4"><EmptyState title="No accounts" /></div> : null}
        </div>

        <div className="space-y-4">
          <form onSubmit={createUser} className="card card-pad space-y-2">
            <h3 className="text-sm font-bold text-slate-900">Create account</h3>
            <Field label="Full name" required><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
            <Field label="Email" required><input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
            <Field label="Temporary password" required hint="Minimum 8 characters; stored as a scrypt hash."><input className="input" type="password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Role" required>
                <select className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                  {ROLES.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}
                </select>
              </Field>
              <Field label="District">
                <select className="input" value={form.districtCode} onChange={(event) => setForm({ ...form, districtCode: event.target.value })}>
                  <option value="">Not assigned</option>
                  {DISTRICTS.map((district) => <option key={district.code} value={district.code}>{district.name}</option>)}
                </select>
              </Field>
            </div>
            <button className="btn-primary btn-sm" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
            <p className="text-[10px] text-slate-500">Account creation is audit logged. Do not reuse real passwords in this prototype.</p>
          </form>

          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-bold text-slate-900">Role permissions</h3>
            {Object.entries(data?.permissions ?? {}).map(([role, permissions]) => (
              <div key={role} className="mb-2">
                <Chip tone={role === "SUPER_ADMIN" ? "purple" : role === "ADMIN" ? "blue" : "neutral"}>{role.replaceAll("_", " ")}</Chip>
                <ul className="mt-1 list-disc pl-4 text-[11px] leading-relaxed text-slate-600">
                  {permissions.map((permission) => <li key={permission}>{permission}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
