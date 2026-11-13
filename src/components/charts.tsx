"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "#10b981",
  MODERATE: "#eab308",
  HIGH: "#f97316",
  CRITICAL: "#dc2626",
  VERY_HIGH: "#b91c1c",
};

const PALETTE = ["#1d4ed8", "#0ea5e9", "#f97316", "#dc2626", "#7c3aed", "#059669", "#ca8a04", "#64748b"];

const axis = { fontSize: 11, fill: "#64748b" };

export function CategoryBars({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={axis} interval={0} angle={-18} textAnchor="end" height={54} />
        <YAxis tick={axis} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Bar dataKey="count" name="Reports" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLines({ data }: { data: { label: string; incidents: number; sos?: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={axis} />
        <YAxis tick={axis} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="incidents" name="Incidents" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="sos" name="SOS requests" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Donut({
  data,
  height = 220,
}: {
  data: { name: string; value: number; color?: string }[];
  height?: number;
}) {
  if (!data.some((d) => d.value > 0)) {
    return <div className="flex h-[180px] items-center justify-center text-xs text-slate-500">No records for this dimension yet.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={entry.color ?? PALETTE[index % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DistrictBars({ data }: { data: { district: string; total: number; verified: number }[] }) {
  const top = data.filter((d) => d.total > 0).slice(0, 10);
  if (!top.length) return <div className="py-10 text-center text-xs text-slate-500">No district reports recorded yet.</div>;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 22 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tick={axis} allowDecimals={false} />
        <YAxis type="category" dataKey="district" tick={axis} width={92} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="total" name="Reports" fill="#64748b" radius={[0, 3, 3, 0]} />
        <Bar dataKey="verified" name="Verified" fill="#059669" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SeverityDonut({ data }: { data: { severity: string; count: number }[] }) {
  return (
    <Donut
      data={data.map((d) => ({ name: d.severity, value: d.count, color: SEVERITY_COLORS[d.severity] ?? "#64748b" }))}
    />
  );
}

export function MiniBars({ data }: { data: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((row, index) => (
        <div key={row.label}>
          <div className="mb-1 flex justify-between text-[11px] font-medium text-slate-600">
            <span>{row.label}</span>
            <span className="tabular-nums">{row.value}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{ width: `${(row.value / max) * 100}%`, background: row.color ?? PALETTE[index % PALETTE.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
