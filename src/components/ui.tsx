import type { ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  dark,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  dark?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className={cx("text-[11px] font-bold uppercase tracking-[0.14em]", dark ? "text-sky-300" : "text-blue-700")}>{eyebrow}</p>
        ) : null}
        <h2 className={cx("text-lg font-bold tracking-tight sm:text-xl", dark ? "text-white" : "text-slate-900")}>{title}</h2>
        {description ? <p className={cx("mt-1 max-w-3xl text-sm", dark ? "text-slate-300" : "text-slate-600")}>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  dark,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "danger" | "warn" | "good" | "info";
  dark?: boolean;
}) {
  const tones = {
    default: "text-slate-900",
    danger: "text-red-600",
    warn: "text-amber-600",
    good: "text-emerald-600",
    info: "text-blue-700",
  };
  return (
    <div className={cx("rounded-xl border p-3.5 sm:p-4", dark ? "border-white/10 bg-ink-800/70" : "border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]")}>
      <p className={cx("text-[11px] font-semibold uppercase tracking-wide", dark ? "text-slate-400" : "text-slate-500")}>{label}</p>
      <p className={cx("mt-1 text-2xl font-bold tabular-nums", dark ? "text-white" : tones[tone])}>{value}</p>
      {hint ? <p className={cx("mt-0.5 text-xs", dark ? "text-slate-400" : "text-slate-500")}>{hint}</p> : null}
    </div>
  );
}

const TONES: Record<string, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  dark: "bg-white/10 text-slate-100 ring-white/20",
};

export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: keyof typeof TONES; className?: string }) {
  return <span className={cx("chip", TONES[tone] ?? TONES.neutral, className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, keyof typeof TONES> = {
    PENDING: "neutral",
    SUBMITTED: "neutral",
    IN_PROGRESS: "purple",
    RECEIVED: "blue",
    UNDER_REVIEW: "amber",
    VERIFIED: "green",
    REJECTED: "red",
    RESOLVED: "green",
    TEAM_ASSIGNED: "purple",
    AVAILABLE: "green",
    ASSIGNED: "purple",
    EN_ROUTE: "blue",
    ON_SITE: "amber",
    COMPLETED: "green",
    CANCELLED: "neutral",
    OFF_DUTY: "neutral",
    DEPLOYED: "blue",
    MAINTENANCE: "amber",
  };
  return <Chip tone={tone[status] ?? "neutral"}>{status.replaceAll("_", " ")}</Chip>;
}

export function SeverityBadge({ severity }: { severity: string | null | undefined }) {
  if (!severity) return <Chip>UNASSESSED</Chip>;
  const tone: Record<string, keyof typeof TONES> = { LOW: "green", MODERATE: "amber", HIGH: "orange", CRITICAL: "red" };
  return <Chip tone={tone[severity] ?? "neutral"}>{severity}</Chip>;
}

export function RiskBadge({ level }: { level: string }) {
  const tone: Record<string, keyof typeof TONES> = { LOW: "green", MODERATE: "amber", HIGH: "orange", VERY_HIGH: "red" };
  return <Chip tone={tone[level] ?? "neutral"}>{level.replaceAll("_", " ")} RISK</Chip>;
}

export function SourceBadge({ source }: { source: string }) {
  const tone: Record<string, keyof typeof TONES> = {
    OBSERVED: "blue",
    FORECAST: "blue",
    MODEL_RISK_ESTIMATE: "purple",
    OFFICIAL_WARNING: "red",
    COMMUNITY_REPORT: "amber",
    SIMULATED: "dark",
    VERIFIED: "green",
    UNVERIFIED: "neutral",
    CANDIDATE: "amber",
  };
  return <Chip tone={tone[source] ?? "neutral"}>{source.replaceAll("_", " ")}</Chip>;
}

export function DemoBadge({ label = "SIMULATED" }: { label?: string }) {
  return (
    <span className="chip bg-slate-900 text-white ring-slate-900">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      {label}
    </span>
  );
}

export function DataClassBadge({ dataClass }: { dataClass?: string | null }) {
  if (!dataClass) return null;
  return dataClass === "SIMULATED" ? <DemoBadge /> : <SourceBadge source={dataClass} />;
}

export function Field({
  label,
  hint,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label} {required ? <span className="text-red-600">*</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-slate-500">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "danger" | "success" | "demo";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-blue-200 bg-blue-50/80 text-blue-950",
    warn: "border-amber-200 bg-amber-50/80 text-amber-950",
    danger: "border-red-200 bg-red-50/80 text-red-950",
    success: "border-emerald-200 bg-emerald-50/80 text-emerald-950",
    demo: "border-slate-300 bg-slate-100 text-slate-800",
  };
  return (
    <div className={cx("rounded-lg border px-3.5 py-3 text-xs leading-relaxed", tones[tone])}>
      {title ? <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide">{title}</p> : null}
      {children}
    </div>
  );
}

export function KeyValue({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-slate-100 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-3 py-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{row.label}</dt>
          <dd className="text-right font-medium text-slate-800">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Meter({ value, max = 100, tone = "blue" }: { value: number; max?: number; tone?: "blue" | "green" | "amber" | "red" | "orange" }) {
  const colors = { blue: "bg-blue-600", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-600", orange: "bg-orange-500" };
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={cx("h-full rounded-full", colors[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function relativeTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const ms = Date.now() - new Date(value).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
