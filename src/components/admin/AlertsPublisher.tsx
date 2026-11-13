"use client";

import { useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { SEVERITIES } from "@/lib/constants";
import { apiRequest, useApi } from "../interactive";
import { Chip, DataClassBadge, EmptyState, Field, Notice, SectionHeading, SourceBadge, Stat, formatDateTime } from "../ui";

type AlertRow = {
  id: number;
  title: string;
  summary: string;
  instruction: string | null;
  category: string;
  categoryLabel: string;
  severity: string;
  districtCode: string | null;
  districtName: string;
  sourceName: string;
  sourceReference: string | null;
  sourceUrl: string | null;
  sourceClass: string;
  publishedByName: string | null;
  isActive: boolean;
  isSimulated: boolean;
  issuedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
  read: boolean | null;
};

type Payload = { alerts: AlertRow[]; counts: Record<string, number>; categories: { value: string; label: string }[]; disclosure: string };

const EMPTY = {
  title: "",
  summary: "",
  instruction: "",
  category: "FLOOD_WARNING",
  severity: "MODERATE",
  districtCode: "",
  sourceName: "District Emergency Operations Centre (DisasterLink prototype)",
  sourceReference: "",
  sourceUrl: "",
  expiresInHours: "12",
  classification: "ADVISORY" as "ADVISORY" | "OFFICIAL_WARNING",
};

export default function AlertsPublisher() {
  const { data, loading, reload } = useApi<Payload>("/api/alerts?includeInactive=1");
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFeedback(null);
    const response = await apiRequest("/api/alerts", {
      method: "POST",
      body: {
        title: form.title,
        summary: form.summary,
        instruction: form.instruction || undefined,
        category: form.category,
        severity: form.severity,
        districtCode: form.districtCode || undefined,
        sourceName: form.sourceName,
        sourceReference: form.classification === "OFFICIAL_WARNING" ? form.sourceReference : form.sourceReference || undefined,
        sourceUrl: form.sourceUrl || undefined,
        sourceClass: form.classification === "OFFICIAL_WARNING" ? "OFFICIAL_WARNING" : "COMMUNITY_REPORT",
        expiresInHours: Number(form.expiresInHours),
      },
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.error ?? "Could not publish alert");
      return;
    }
    setFeedback("Alert published. It is now visible on citizen screens and the 3D map warning layer, and an audit entry was written.");
    setForm({ ...EMPTY });
    reload();
  }

  async function toggle(alert: AlertRow) {
    const response = await apiRequest("/api/alerts", { method: "PATCH", body: { id: alert.id, isActive: !alert.isActive } });
    if (!response.ok) setError(response.error ?? "Could not update alert");
    else {
      setFeedback(`${alert.isActive ? "Retired" : "Reactivated"} alert “${alert.title}”.`);
      reload();
    }
  }

  async function extend(alert: AlertRow) {
    const response = await apiRequest("/api/alerts", { method: "PATCH", body: { id: alert.id, expiresInHours: 12 } });
    if (!response.ok) setError(response.error ?? "Could not extend alert");
    else {
      setFeedback(`Extended “${alert.title}” by 12 hours.`);
      reload();
    }
  }

  const alerts = (data?.alerts ?? []).filter((alert) => (filter === "ALL" ? true : filter === "ACTIVE" ? alert.isActive : !alert.isActive));

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Alerts & notifications"
        title="Publish and retire authorised alerts"
        description="Only signed-in administrators can publish. Official-warning classification requires a source reference; every publication is attributed and audited."
        action={<SourceBadge source="OFFICIAL_WARNING" />}
      />

      <Notice tone="warn" title="Publication policy">
        {data?.disclosure ??
          "DisasterLink does not ingest IMD/TNSDMA bulletins. Alerts published here are prototype notices attributed to the publishing officer and must carry a source reference to be labelled OFFICIAL_WARNING."}
      </Notice>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total alerts" value={data?.counts.total ?? "—"} hint="all records" />
        <Stat label="Active" value={data?.counts.active ?? "—"} hint="currently visible" tone="good" />
        <Stat label="Official warnings" value={data?.counts.official ?? "—"} hint="with source reference" tone="danger" />
        <Stat label="Simulated" value={data?.counts.simulated ?? "—"} hint="demonstration records" tone="warn" />
      </div>

      {feedback ? <Notice tone="success">{feedback}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <form onSubmit={publish} className="card card-pad space-y-2">
          <h3 className="text-sm font-bold text-slate-900">Publish a new alert</h3>
          <Field label="Classification" hint="Official warnings require a bulletin number or official URL.">
            <select className="input" value={form.classification} onChange={(event) => setForm({ ...form, classification: event.target.value as typeof form.classification })}>
              <option value="ADVISORY">Advisory / public safety notice (authorised officer)</option>
              <option value="OFFICIAL_WARNING">Official warning (source reference required)</option>
            </select>
          </Field>
          <Field label="Category" required>
            <select className="input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {(data?.categories ?? []).map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Severity" required>
              <select className="input" value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}>
                {SEVERITIES.map((severity) => <option key={severity} value={severity}>{severity}</option>)}
              </select>
            </Field>
            <Field label="Expires in (hours)" required>
              <input className="input" type="number" min={1} max={168} value={form.expiresInHours} onChange={(event) => setForm({ ...form, expiresInHours: event.target.value })} />
            </Field>
          </div>
          <Field label="District" hint="Leave blank for a state-wide alert.">
            <select className="input" value={form.districtCode} onChange={(event) => setForm({ ...form, districtCode: event.target.value })}>
              <option value="">State-wide</option>
              {DISTRICTS.map((district) => <option key={district.code} value={district.code}>{district.name}</option>)}
            </select>
          </Field>
          <Field label="Title" required><input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={200} /></Field>
          <Field label="Summary / message" required>
            <textarea className="input min-h-[80px] text-xs" value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} maxLength={1500} />
          </Field>
          <Field label="Public instruction" hint="Short actionable guidance, e.g. avoid the coastal road.">
            <input className="input" value={form.instruction} onChange={(event) => setForm({ ...form, instruction: event.target.value })} maxLength={800} />
          </Field>
          <Field label="Publishing source" required><input className="input" value={form.sourceName} onChange={(event) => setForm({ ...form, sourceName: event.target.value })} maxLength={200} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Source reference" required={form.classification === "OFFICIAL_WARNING"}>
              <input className="input" value={form.sourceReference} onChange={(event) => setForm({ ...form, sourceReference: event.target.value })} placeholder="Bulletin / file number" />
            </Field>
            <Field label="Source URL"><input className="input" value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} placeholder="https://" /></Field>
          </div>
          <button className="btn-primary btn-sm" disabled={busy || !form.title || form.summary.length < 20}>
            {busy ? "Publishing…" : "Publish alert"}
          </button>
          <p className="text-[10px] text-slate-500">Publishing writes an ALERT_PUBLISHED audit record with your name and role.</p>
        </form>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {["ALL", "ACTIVE", "INACTIVE"].map((option) => (
              <button key={option} onClick={() => setFilter(option)} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${filter === option ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>
                {option}
              </button>
            ))}
            <button className="btn-outline btn-sm ml-auto" onClick={reload}>Refresh</button>
          </div>
          {loading && !data ? <div className="h-32 animate-pulse rounded bg-white" /> : null}
          {alerts.map((alert) => (
            <div key={alert.id} className="card card-pad">
              <div className="flex flex-wrap items-center gap-1.5">
                <SourceBadge source={alert.sourceClass} />
                <Chip tone={alert.severity === "CRITICAL" ? "red" : alert.severity === "HIGH" ? "orange" : alert.severity === "MODERATE" ? "amber" : "green"}>{alert.severity}</Chip>
                <Chip tone="blue">{alert.categoryLabel}</Chip>
                <Chip>{alert.districtName}</Chip>
                {alert.isSimulated ? <DataClassBadge dataClass="SIMULATED" /> : null}
                <Chip tone={alert.isActive ? "green" : "neutral"}>{alert.isActive ? "ACTIVE" : "INACTIVE"}</Chip>
                {alert.expired ? <Chip tone="neutral">EXPIRED</Chip> : null}
              </div>
              <p className="mt-1 text-xs font-bold text-slate-900">{alert.title}</p>
              <p className="text-[11px] text-slate-600">{alert.summary}</p>
              {alert.instruction ? <p className="mt-1 text-[11px] font-medium text-slate-700">Action: {alert.instruction}</p> : null}
              <p className="mt-1 text-[10px] text-slate-500">
                {alert.sourceName}
                {alert.sourceReference ? ` · ref ${alert.sourceReference}` : ""} · issued {formatDateTime(alert.issuedAt)} · expires {formatDateTime(alert.expiresAt)}
                {alert.publishedByName ? ` · by ${alert.publishedByName}` : ""}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button className="btn-outline btn-sm" onClick={() => void toggle(alert)}>{alert.isActive ? "Retire" : "Reactivate"}</button>
                <button className="btn-ghost btn-sm" onClick={() => void extend(alert)}>Extend 12h</button>
                <a className="btn-ghost btn-sm" href={`/alerts${alert.districtCode ? `?district=${alert.districtCode}` : ""}`} target="_blank" rel="noreferrer">Citizen view</a>
              </div>
            </div>
          ))}
          {data && !alerts.length ? <EmptyState title="No alerts for this filter" description="Publish an advisory to demonstrate the citizen notification flow." /> : null}
        </div>
      </div>
    </div>
  );
}
