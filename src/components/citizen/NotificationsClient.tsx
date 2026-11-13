"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { useApi } from "../interactive";
import { apiRequest } from "../interactive";
import { Chip, EmptyState, Notice, SectionHeading, SourceBadge, formatDateTime, relativeTime } from "../ui";
import { useSelectedDistrict } from "./useDistrict";

type Item = {
  id: number;
  type: "ALERT" | "ANNOUNCEMENT" | "INCIDENT_UPDATE" | "SOS_UPDATE";
  title: string;
  body: string;
  severity: string | null;
  districtCode: string | null;
  districtName: string | null;
  sourceName: string | null;
  sourceClass: string | null;
  publicId: string | null;
  status: string | null;
  createdAt: string;
  read: boolean;
  href: string;
};

type Payload = {
  notifications: Item[];
  counts: Record<string, number>;
  delivery: { inApp: boolean; sms: boolean; email: boolean; push: boolean; note: string };
  account: { name: string; districtCode: string | null; phoneMasked: string };
  districtFilter: string | null;
};

const TYPE_LABEL: Record<Item["type"], string> = {
  ALERT: "Official alert",
  ANNOUNCEMENT: "Public safety announcement",
  INCIDENT_UPDATE: "Report update",
  SOS_UPDATE: "SOS update",
};

const TYPE_TONE: Record<Item["type"], "red" | "orange" | "blue" | "purple"> = {
  ALERT: "red",
  ANNOUNCEMENT: "orange",
  INCIDENT_UPDATE: "blue",
  SOS_UPDATE: "purple",
};

export default function NotificationsClient({ signedIn }: { signedIn: boolean }) {
  const [district, setDistrict] = useSelectedDistrict();
  const [filter, setFilter] = useState<"ALL" | "UNREAD" | Item["type"]>("ALL");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, error: fetchError, reload } = useApi<Payload>(
    signedIn ? `/api/notifications?district=${district}` : null,
    [district, signedIn],
  );

  const visible = useMemo(() => {
    const rows = data?.notifications ?? [];
    if (filter === "ALL") return rows;
    if (filter === "UNREAD") return rows.filter((row) => !row.read);
    return rows.filter((row) => row.type === filter);
  }, [data, filter]);

  async function markRead(item: Item) {
    setBusy(true);
    setError(null);
    const ref = item.type === "INCIDENT_UPDATE" || item.type === "SOS_UPDATE" ? `${item.publicId}:${item.id}` : String(item.id);
    const entityType = item.type === "INCIDENT_UPDATE" ? "INCIDENT" : item.type === "SOS_UPDATE" ? "SOS" : item.type;
    const response = await apiRequest("/api/notifications", { method: "POST", body: { action: "mark-read", type: entityType, ref } });
    setBusy(false);
    if (!response.ok) setError(response.error ?? "Could not mark as read");
    else reload();
  }

  async function markAll() {
    setBusy(true);
    setError(null);
    const response = await apiRequest<{ marked: number }>("/api/notifications", { method: "POST", body: { action: "mark-all-read" } });
    setBusy(false);
    if (!response.ok) setError(response.error ?? "Could not mark all as read");
    else {
      setFeedback(`${response.data?.marked ?? 0} notification(s) marked as read.`);
      reload();
    }
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <SectionHeading eyebrow="Notifications" title="Sign in to see your updates" description="Alerts for your district plus official updates on your own reports and SOS requests." />
        <Notice tone="info" title="Account required">
          Notifications combine district alerts with private updates on your own submissions, so you need to sign in. You can still browse
          public alerts without an account.
        </Notice>
        <div className="flex flex-wrap gap-2">
          <Link href="/login?next=/notifications" className="btn-primary">Sign in</Link>
          <Link href="/alerts" className="btn-outline">Public alerts</Link>
          <Link href="/track" className="btn-outline">Track a report</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SectionHeading
        eyebrow="Notifications"
        title="Your alerts and updates"
        description="District alerts, public safety announcements and official updates on your own reports and SOS requests."
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={(data?.counts.unread ?? 0) > 0 ? "red" : "neutral"}>{data?.counts.unread ?? 0} unread</Chip>
            <button className="btn-outline btn-sm" onClick={markAll} disabled={busy}>Mark all read</button>
          </div>
        }
      />

      <Notice tone="demo" title="Delivery channels">
        {data?.delivery.note ?? "Only in-app notifications are enabled. No SMS, email or push provider is configured."}
      </Notice>

      <div className="card card-pad">
        <div className="grid gap-2 sm:grid-cols-3">
          <label>
            <span className="label">District</span>
            <select className="input" value={district} onChange={(event) => setDistrict(event.target.value)}>
              {DISTRICTS.map((entry) => (
                <option key={entry.code} value={entry.code}>{entry.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Show</span>
            <select className="input" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option value="ALL">Everything</option>
              <option value="UNREAD">Unread only</option>
              <option value="ALERT">Official alerts</option>
              <option value="ANNOUNCEMENT">Announcements</option>
              <option value="INCIDENT_UPDATE">Report updates</option>
              <option value="SOS_UPDATE">SOS updates</option>
            </select>
          </label>
          <div className="flex items-end gap-1.5">
            <button className="btn-outline btn-sm" onClick={reload}>Refresh</button>
            <Link href="/track" className="btn-ghost btn-sm">My reports</Link>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          Signed in as {data?.account.name ?? "citizen"} · contact {data?.account.phoneMasked ?? "not provided"} · read state is stored on the server per account.
        </p>
      </div>

      {fetchError ? <Notice tone="danger" title="Notifications unavailable">{fetchError}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {feedback ? <Notice tone="success">{feedback}</Notice> : null}

      {loading && !data ? [0, 1, 2].map((index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-white" />) : null}

      {!loading && visible.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="When an official publishes an alert for your district, or acts on one of your reports, the update appears here."
          action={<Link href="/alerts" className="btn-outline btn-sm">Browse public alerts</Link>}
        />
      ) : null}

      <div className="space-y-2">
        {visible.map((item) => (
          <article
            key={`${item.type}-${item.publicId ?? ""}-${item.id}`}
            className={`rounded-xl border p-3 ${item.read ? "border-slate-200 bg-white" : "border-teal-300 bg-teal-50/50"}`}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone={TYPE_TONE[item.type]}>{TYPE_LABEL[item.type]}</Chip>
              {item.severity ? <Chip tone={item.severity === "CRITICAL" ? "red" : item.severity === "HIGH" ? "orange" : "amber"}>{item.severity}</Chip> : null}
              {item.districtName ? <Chip tone="blue">{item.districtName}</Chip> : <Chip tone="neutral">State-wide</Chip>}
              {item.sourceClass ? <SourceBadge source={item.sourceClass} /> : null}
              {!item.read ? <Chip tone="red">NEW</Chip> : null}
              <span className="ml-auto text-[10px] text-slate-500">{relativeTime(item.createdAt)}</span>
            </div>
            <h3 className="mt-1 text-sm font-bold text-slate-900">{item.title}</h3>
            <p className="text-[11px] leading-relaxed text-slate-700">{item.body}</p>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>
                {item.sourceName ?? "DisasterLink"} · {formatDateTime(item.createdAt)}
                {item.publicId ? ` · ${item.publicId}` : ""}
              </span>
              <span className="flex gap-1.5">
                <Link className="font-semibold text-blue-700 underline" href={item.href}>Open</Link>
                {!item.read ? (
                  <button className="font-semibold text-slate-600 underline" onClick={() => void markRead(item)} disabled={busy}>
                    Mark read
                  </button>
                ) : null}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
