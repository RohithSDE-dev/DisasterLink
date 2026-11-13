"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { formatDateTime, relativeTime } from "@/components/ui";

export type CommandTotals = Record<string, number>;

type MetricDefinition = {
  key: string;
  label: string;
  hint?: string;
  tone: "default" | "danger" | "warn" | "good" | "info";
  href?: string;
  format?: (value: number, totals: CommandTotals) => string;
};

const DEFINITIONS: MetricDefinition[] = [
  { key: "active", label: "Active incidents", hint: "excludes resolved and rejected", tone: "info", href: "/admin/incidents" },
  { key: "critical", label: "Critical incidents", hint: "open, severity critical", tone: "danger", href: "/admin/incidents?severity=CRITICAL" },
  { key: "awaitingVerification", label: "Awaiting verification", hint: "reported or under review", tone: "warn", href: "/admin/incidents?status=PENDING" },
  { key: "districtsUnderWarning", label: "Districts under official warning", hint: "authorised DisasterLink alerts", tone: "danger", href: "/admin/alerts" },
  { key: "openSos", label: "Open SOS requests", hint: "no automatic dispatch", tone: "danger", href: "/admin/sos" },
  { key: "ambulancesAvailable", label: "Available ambulances", tone: "good", href: "/admin/ambulances", format: (value, totals) => `${value} / ${totals.ambulancesTotal ?? 0}` },
  { key: "availableFacilities", label: "Facilities available", hint: "hospital / fire / clinic records", tone: "info", href: "/admin/facilities" },
  {
    key: "shelterRemaining",
    label: "Shelter capacity free",
    tone: "warn",
    href: "/admin/shelters",
    format: (value, totals) => `${value} / ${totals.shelterCapacity ?? 0}`,
  },
  { key: "teamsActive", label: "Active rescue teams", hint: "status assigned", tone: "info", href: "/admin/response", format: (value, totals) => `${value} / ${totals.teamsTotal ?? 0}` },
  { key: "resolved", label: "Resolved incidents", hint: "closure recorded", tone: "good", href: "/admin/incidents?status=RESOLVED" },
];

const TONE: Record<MetricDefinition["tone"], string> = {
  default: "text-slate-900",
  danger: "text-red-600",
  warn: "text-amber-600",
  good: "text-emerald-600",
  info: "text-blue-700",
};

export default function CommandMetrics({
  totals,
  lastUpdated,
  children,
}: {
  totals: CommandTotals | null;
  lastUpdated?: string | null;
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {DEFINITIONS.map((definition) => {
          const raw = totals?.[definition.key];
          const available = typeof raw === "number";
          const value = available ? (definition.format ? definition.format(raw as number, totals ?? {}) : String(raw)) : "Data unavailable";
          const body = (
            <>
              <p className="text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-500">{definition.label}</p>
              <p className={`mt-0.5 text-lg font-extrabold leading-tight tabular-nums ${available ? TONE[definition.tone] : "text-xs font-semibold text-slate-400"}`}>
                {value}
              </p>
              {definition.hint ? <p className="text-[9px] leading-tight text-slate-400">{definition.hint}</p> : null}
            </>
          );
          const className = "rounded-lg border border-slate-200 bg-white px-2.5 py-2 transition hover:border-slate-300";
          return definition.href ? (
            <Link key={definition.key} href={definition.href} className={className}>
              {body}
            </Link>
          ) : (
            <div key={definition.key} className={className}>{body}</div>
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-500">
        <span>
          Live counts from the command API · awaiting verification = reported + under review · simulated records are included and badged
        </span>
        <span>{lastUpdated ? `Metrics as of ${formatDateTime(lastUpdated)} (${relativeTime(lastUpdated)})` : "Loading metrics…"}</span>
      </div>
      {children}
    </div>
  );
}
