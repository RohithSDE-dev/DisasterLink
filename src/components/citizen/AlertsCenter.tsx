"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { useApi } from "../interactive";
import { apiRequest } from "../interactive";
import { Chip, DataClassBadge, EmptyState, Notice, SectionHeading, SourceBadge, formatDateTime } from "../ui";
import { useSelectedDistrict } from "./useDistrict";

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
  sourceUrl: string | null;
  sourceReference: string | null;
  sourceClass: string;
  verification: string;
  publishedByName: string | null;
  isActive: boolean;
  isSimulated: boolean;
  issuedAt: string | null;
  expiresAt: string | null;
  read: boolean | null;
  expired: boolean;
};

const STORAGE_KEY = "dl.readAlerts";

export default function AlertsCenter() {
  const [district, setDistrict] = useSelectedDistrict();
  const [scope, setScope] = useState<"ALL" | "MY">("ALL");
  const [localRead, setLocalRead] = useState<number[]>([]);
  const { data, loading, error, reload } = useApi<{ alerts: AlertRow[]; counts: Record<string, number>; authenticated: boolean; disclosure: string }>(
    `/api/alerts?district=${scope === "MY" ? district : ""}`,
    [district, scope],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLocalRead(JSON.parse(raw) as number[]);
    } catch {
      /* ignore */
    }
  }, []);

  async function markRead(alert: AlertRow) {
    if (!localRead.includes(alert.id)) {
      const next = [...localRead, alert.id];
      setLocalRead(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
    if (data?.authenticated) await apiRequest("/api/alerts", { method: "POST", body: { action: "mark-read", id: alert.id } });
    reload();
  }

  const alerts = data?.alerts ?? [];
  const isUnread = (alert: AlertRow) => (alert.read === null ? !localRead.includes(alert.id) : !alert.read);
  const unread = alerts.filter((alert) => alert.isActive && isUnread(alert)).length;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Alerts & notifications"
        title="District alerts and public safety notices"
        description="Flood, rainfall, cyclone, landslide, road closure and evacuation notices. Every alert carries its publisher, source class and expiry."
        action={
          <div className="flex items-center gap-2">
            <Chip tone={unread > 0 ? "red" : "neutral"}>{unread} unread</Chip>
            <button className="btn-outline btn-sm" onClick={reload}>Refresh</button>
          </div>
        }
      />

      <Notice tone="warn" title="Source policy">
        {data?.disclosure ??
          "Official IMD/TNSDMA bulletins are not ingested in this prototype. Notices published by authorised officers are attributed and labelled; demonstration alerts are marked SIMULATED."}
      </Notice>

      <div className="card card-pad">
        <div className="grid gap-2 sm:grid-cols-3">
          <label>
            <span className="label">District filter</span>
            <select className="input" value={district} onChange={(event) => setDistrict(event.target.value)}>
              {DISTRICTS.map((entry) => (
                <option key={entry.code} value={entry.code}>{entry.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Scope</span>
            <select className="input" value={scope} onChange={(event) => setScope(event.target.value as "ALL" | "MY")}>
              <option value="ALL">State-wide + all districts</option>
              <option value="MY">Selected district + state-wide</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Link href={`/weather?district=${district}`} className="btn-outline btn-sm">District weather</Link>
            <Link href="/map" className="btn-outline btn-sm">Open map</Link>
          </div>
        </div>
      </div>

      {error ? <Notice tone="danger" title="Alerts unavailable">{error}</Notice> : null}

      {loading && !data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-white" />)}
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState title="No alerts recorded" description="There is no active alert for this selection. That does not mean conditions are safe — check official sources." />
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const unreadAlert = alert.isActive && isUnread(alert);
            const tone =
              alert.sourceClass === "SIMULATED"
                ? "border-slate-300 bg-slate-50"
                : alert.sourceClass === "OFFICIAL_WARNING"
                  ? "border-red-200 bg-red-50/60"
                  : "border-blue-200 bg-blue-50/50";
            return (
              <article key={alert.id} className={`rounded-xl border p-3 ${tone} ${unreadAlert ? "ring-2 ring-blue-200" : ""}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SourceBadge source={alert.sourceClass} />
                  <Chip tone={alert.severity === "CRITICAL" ? "red" : alert.severity === "HIGH" ? "orange" : alert.severity === "MODERATE" ? "amber" : "green"}>
                    {alert.severity}
                  </Chip>
                  <Chip tone="blue">{alert.categoryLabel}</Chip>
                  <Chip>{alert.districtName}</Chip>
                  {alert.isSimulated ? <DataClassBadge dataClass="SIMULATED" /> : null}
                  {!alert.isActive ? <Chip tone="neutral">INACTIVE</Chip> : null}
                  {alert.expired ? <Chip tone="neutral">EXPIRED</Chip> : null}
                  {unreadAlert ? <Chip tone="red">NEW</Chip> : null}
                </div>
                <h3 className="mt-1.5 text-sm font-bold text-slate-900">{alert.title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{alert.summary}</p>
                {alert.instruction ? (
                  <p className="mt-1 rounded-md bg-white/70 px-2 py-1 text-[11px] font-medium text-slate-800">Action: {alert.instruction}</p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                  <span>
                    {alert.sourceName}
                    {alert.publishedByName ? ` · published by ${alert.publishedByName}` : ""}
                    {alert.sourceReference ? ` · ref ${alert.sourceReference}` : ""}
                  </span>
                  <span>
                    Issued {formatDateTime(alert.issuedAt)} · expires {formatDateTime(alert.expiresAt)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {unreadAlert ? (
                    <button className="btn-outline btn-sm" onClick={() => void markRead(alert)}>Mark as read</button>
                  ) : null}
                  {alert.sourceUrl ? (
                    <a className="btn-ghost btn-sm" href={alert.sourceUrl} target="_blank" rel="noreferrer">Source</a>
                  ) : null}
                  <a className="btn-ghost btn-sm" href="tel:112">Emergency: 112</a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
