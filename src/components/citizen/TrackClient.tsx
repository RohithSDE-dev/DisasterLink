"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { INCIDENT_STATUS_LABELS, SOS_STATUSES } from "@/lib/constants";
import { apiRequest, useApi } from "../interactive";
import { Chip, DataClassBadge, EmptyState, Notice, SeverityBadge, SourceBadge, StatusBadge, formatDateTime, relativeTime } from "../ui";

type TrackEvent = { action: string; fromStatus: string | null; toStatus: string | null; note: string | null; actorRole: string | null; createdAt: string };

type TrackResult = {
  kind: "INCIDENT" | "SOS";
  accessLevel: "OWNER" | "GOVERNMENT" | "PUBLIC_VERIFIED" | "PUBLIC_LIMITED";
  record: Record<string, unknown> & {
    publicId: string;
    status: string;
    district: string;
    categoryLabel?: string;
    emergencyType?: string;
    createdAt: string;
    updatedAt: string;
    latestUpdate?: { status: string | null; note: string | null; at: string } | null;
    requiresCode?: boolean;
    description?: string | null;
    locationName?: string | null;
    resolutionNote?: string | null;
    assignedTeamName?: string | null;
    contactPhoneMasked?: string | null;
    phoneMasked?: string | null;
    dataClass?: string;
    reportedSeverity?: string | null;
    assessedSeverity?: string | null;
    photoUrl?: string | null;
  };
  events: TrackEvent[];
  note: string;
};

type MyReports = {
  incidents: {
    id: number;
    publicId: string;
    categoryLabel: string;
    description: string;
    district: string;
    locationName: string;
    status: string;
    statusLabel: string;
    reportedSeverity: string;
    assessedSeverity: string | null;
    dataClass: string;
    createdAt: string;
    updatedAt: string;
    resolvedAt: string | null;
    photoUrl: string | null;
    latestUpdate: { status: string | null; note: string | null; at: string } | null;
    history: { status: string | null; note: string | null; at: string }[];
    trackingLink: string;
  }[];
  sos: {
    id: number;
    publicId: string;
    categoryLabel: string;
    description: string;
    district: string;
    status: string;
    priority: string;
    assignedTeamName: string | null;
    dataClass: string;
    createdAt: string;
    latestUpdate: { status: string | null; note: string | null; at: string } | null;
    history: { status: string | null; note: string | null; at: string }[];
    trackingLink: string;
  }[];
  counts: { incidents: number; sos: number; open: number; resolved: number };
  account: { name: string; email: string; phoneMasked: string };
  note: string;
};

const INCIDENT_STEPS = ["PENDING", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS", "RESOLVED"];

export default function TrackClient({ signedIn }: { signedIn: boolean }) {
  const [tab, setTab] = useState<"MY" | "LOOKUP">(signedIn ? "MY" : "LOOKUP");
  const [type, setType] = useState<"INCIDENT" | "SOS">("INCIDENT");
  const [id, setId] = useState("");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [claim, setClaim] = useState({ open: false, id: "", code: "", message: null as string | null, busy: false });
  const my = useApi<MyReports>(signedIn ? "/api/my-reports" : null);

  const lookup = useCallback(async (kind: "INCIDENT" | "SOS", reference: string, trackingCode: string) => {
    if (!reference.trim()) {
      setError("Enter the tracking ID issued at submission.");
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ id: reference.trim(), type: kind });
    if (trackingCode.trim()) params.set("code", trackingCode.trim());
    const response = await apiRequest<TrackResult>(`/api/track?${params.toString()}`);
    setLoading(false);
    if (!response.ok) {
      setResult(null);
      setError(response.error ?? "No record found");
      return;
    }
    setResult(response.data ?? null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramId = params.get("id");
    const paramType = params.get("type") === "SOS" ? "SOS" : "INCIDENT";
    const paramCode = params.get("code") ?? "";
    if (paramId) {
      setTab("LOOKUP");
      setId(paramId);
      setCode(paramCode);
      setType(paramType);
      void lookup(paramType, paramId, paramCode);
    }
  }, [lookup]);

  const steps = result?.kind === "SOS" ? [...SOS_STATUSES] : INCIDENT_STEPS;
  const currentIndex = result ? steps.indexOf(result.record.status) : -1;

  async function claimReport(event: React.FormEvent) {
    event.preventDefault();
    setClaim((current) => ({ ...current, busy: true, message: null }));
    const response = await apiRequest<{ claimed: boolean }>("/api/my-reports", {
      method: "POST",
      body: { id: claim.id.trim(), code: claim.code.trim(), type },
    });
    setClaim((current) => ({
      ...current,
      busy: false,
      message: response.ok ? "Linked to your account. It now appears under My reports." : response.error ?? "Could not link this report",
    }));
    if (response.ok) my.reload();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">My reports</p>
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">Track your reports and SOS requests</h1>
        <p className="mt-1 text-sm text-slate-600">
          Follow official verification and response progress. Private details are visible only to you, the holder of the tracking code, or
          authorised officials.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => setTab("MY")}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition ${tab === "MY" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
        >
          My submissions{signedIn && my.data ? ` (${my.data.counts.incidents + my.data.counts.sos})` : ""}
        </button>
        <button
          onClick={() => setTab("LOOKUP")}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition ${tab === "LOOKUP" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
        >
          Track with ID + code
        </button>
      </div>

      {tab === "MY" ? (
        !signedIn ? (
          <div className="space-y-3">
            <Notice tone="info" title="Sign in to see your own reports">
              Signing in lets DisasterLink show only your submissions. You can also track any report with the ID and one-time tracking code
              issued at submission, without an account.
            </Notice>
            <div className="flex flex-wrap gap-2">
              <Link href="/login?next=/track" className="btn-primary">Sign in</Link>
              <button onClick={() => setTab("LOOKUP")} className="btn-outline">Use ID + code instead</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {my.error ? <Notice tone="danger" title="Could not load your submissions">{my.error}</Notice> : null}
            {my.data ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Reports", value: my.data.counts.incidents },
                    { label: "SOS requests", value: my.data.counts.sos },
                    { label: "Open", value: my.data.counts.open },
                    { label: "Resolved", value: my.data.counts.resolved },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
                      <p className="text-lg font-extrabold tabular-nums text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>

                {my.data.counts.incidents + my.data.counts.sos === 0 ? (
                  <EmptyState
                    title="No submissions linked to this account"
                    description="Reports you submit while signed in appear here automatically. If you reported anonymously, use the ID and tracking code to link it."
                    action={
                      <div className="flex flex-wrap justify-center gap-2">
                        <Link href="/report" className="btn-primary btn-sm">Report an incident</Link>
                        <Link href="/sos" className="btn-sos btn-sm">Submit SOS</Link>
                        <button className="btn-outline btn-sm" onClick={() => setClaim((current) => ({ ...current, open: !current.open }))}>Link with a code</button>
                      </div>
                    }
                  />
                ) : null}

                {my.data.incidents.map((incident) => (
                  <article key={incident.publicId} className="card card-pad">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={incident.status} />
                      <SeverityBadge severity={incident.assessedSeverity ?? incident.reportedSeverity} />
                      {incident.dataClass === "SIMULATED" ? <DataClassBadge dataClass="SIMULATED" /> : null}
                      <span className="ml-auto text-[10px] text-slate-500">submitted {formatDateTime(incident.createdAt)}</span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] font-bold text-slate-900">{incident.publicId}</p>
                    <p className="text-xs font-semibold text-slate-800">{incident.categoryLabel} · {incident.locationName}, {incident.district}</p>
                    <p className="text-[11px] leading-snug text-slate-600">{incident.description}</p>
                    {incident.latestUpdate ? (
                      <div className="mt-1.5 rounded-md bg-slate-50 px-2 py-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Latest official update · {relativeTime(incident.latestUpdate.at)}</p>
                        <p className="text-[11px] text-slate-700">{incident.latestUpdate.note}</p>
                      </div>
                    ) : null}
                    {incident.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={incident.photoUrl} alt="Your attached photograph" className="mt-1.5 max-h-28 rounded-md object-cover" />
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Link className="btn-outline btn-sm" href={incident.trackingLink}>Full status</Link>
                      <Link className="btn-ghost btn-sm" href={`/facilities?district=${incident.district}`}>Nearby help</Link>
                    </div>
                  </article>
                ))}

                {my.data.sos.map((sos) => (
                  <article key={sos.publicId} className="card card-pad border-red-100">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip tone="red">SOS</Chip>
                      <StatusBadge status={sos.status} />
                      <Chip tone={sos.priority === "CRITICAL" ? "red" : "amber"}>{sos.priority}</Chip>
                      <span className="ml-auto text-[10px] text-slate-500">submitted {formatDateTime(sos.createdAt)}</span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] font-bold text-slate-900">{sos.publicId}</p>
                    <p className="text-xs font-semibold text-slate-800">{sos.categoryLabel} · {sos.district}</p>
                    <p className="text-[11px] leading-snug text-slate-600">{sos.description}</p>
                    {sos.assignedTeamName ? <p className="text-[11px] font-semibold text-teal-800">Team assigned: {sos.assignedTeamName}</p> : null}
                    {sos.latestUpdate ? (
                      <div className="mt-1.5 rounded-md bg-slate-50 px-2 py-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Latest official update · {relativeTime(sos.latestUpdate.at)}</p>
                        <p className="text-[11px] text-slate-700">{sos.latestUpdate.note}</p>
                      </div>
                    ) : null}
                    <p className="mt-1 rounded bg-red-50 px-2 py-1 text-[10px] text-red-900">
                      An SOS submission does not guarantee dispatch. Call 112 / 108 / 101 in a life-threatening emergency.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Link className="btn-outline btn-sm" href={sos.trackingLink}>Full status</Link>
                      <a className="btn-sos btn-sm" href="tel:112">Call 112</a>
                    </div>
                  </article>
                ))}
                <p className="text-[10px] text-slate-500">{my.data.note}</p>
              </>
            ) : (
              <div className="h-32 animate-pulse rounded-xl bg-white" />
            )}

            <div className="flex flex-wrap gap-2">
              <button className="btn-outline btn-sm" onClick={() => setClaim((current) => ({ ...current, open: !current.open }))}>
                {claim.open ? "Close" : "Link an anonymous report"}
              </button>
              <Link href="/notifications" className="btn-ghost btn-sm">Notifications</Link>
            </div>

            {claim.open ? (
              <form onSubmit={claimReport} className="card card-pad space-y-2">
                <p className="text-sm font-bold text-slate-900">Link a report to this account</p>
                <p className="text-[11px] text-slate-500">Use the tracking code issued when you submitted the report. Codes cannot be recovered.</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label>
                    <span className="label">Type</span>
                    <select className="input" value={type} onChange={(event) => setType(event.target.value as "INCIDENT" | "SOS")}>
                      <option value="INCIDENT">Incident report</option>
                      <option value="SOS">SOS request</option>
                    </select>
                  </label>
                  <label>
                    <span className="label">Tracking ID</span>
                    <input className="input font-mono" value={claim.id} onChange={(event) => setClaim((current) => ({ ...current, id: event.target.value }))} placeholder="INC-…" required />
                  </label>
                  <label>
                    <span className="label">Tracking code</span>
                    <input className="input font-mono" value={claim.code} onChange={(event) => setClaim((current) => ({ ...current, code: event.target.value }))} placeholder="XXXX-XXXX" required />
                  </label>
                </div>
                <button className="btn-primary btn-sm" disabled={claim.busy}>{claim.busy ? "Linking…" : "Link report"}</button>
                {claim.message ? <p className="text-[11px] text-slate-600">{claim.message}</p> : null}
              </form>
            ) : null}
          </div>
        )
      ) : (
        <div className="space-y-3">
          <form
            className="card card-pad"
            onSubmit={(event) => {
              event.preventDefault();
              void lookup(type, id, code);
            }}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <label>
                <span className="label">Record type</span>
                <select className="input" value={type} onChange={(event) => setType(event.target.value as "INCIDENT" | "SOS")}>
                  <option value="INCIDENT">Incident report</option>
                  <option value="SOS">SOS request</option>
                </select>
              </label>
              <label>
                <span className="label">Tracking ID</span>
                <input className="input font-mono" value={id} onChange={(event) => setId(event.target.value)} placeholder={type === "SOS" ? "SOS-YYYYMMDD-XXXXXX" : "INC-YYYYMMDD-XXXXXX"} />
              </label>
              <label>
                <span className="label">Tracking code</span>
                <input className="input font-mono" value={code} onChange={(event) => setCode(event.target.value)} placeholder="XXXX-XXXX" autoComplete="off" />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className="btn-primary" disabled={loading}>{loading ? "Looking up…" : "Track"}</button>
              <span className="text-[10px] text-slate-500">
                The tracking code was shown once at submission. Without it, only the public status timeline is visible — never the description,
                location or personal details.
              </span>
            </div>
          </form>

          <p className="text-[11px] text-slate-500">
            Demonstration records you can inspect:{" "}
            <button className="font-mono font-semibold text-blue-700 underline" onClick={() => { setType("INCIDENT"); setId("SIM-INC-1001"); setCode(""); void lookup("INCIDENT", "SIM-INC-1001", ""); }}>
              SIM-INC-1001
            </button>{" "}
            or{" "}
            <button className="font-mono font-semibold text-blue-700 underline" onClick={() => { setType("SOS"); setId("SIM-SOS-2001"); setCode(""); void lookup("SOS", "SIM-SOS-2001", ""); }}>
              SIM-SOS-2001
            </button>{" "}
            (public timeline only).
          </p>

          {error ? <Notice tone="danger" title="Nothing found">{error}</Notice> : null}

          {result ? (
            <>
              <div className="card card-pad">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-bold text-slate-900">{result.record.publicId}</p>
                    <p className="text-xs text-slate-500">
                      {result.kind} · {result.record.district} · submitted {formatDateTime(result.record.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={result.record.status} />
                    <Chip tone={result.accessLevel === "PUBLIC_LIMITED" ? "amber" : "green"}>
                      {result.accessLevel === "PUBLIC_LIMITED" ? "PUBLIC VIEW" : "VERIFIED VIEWER"}
                    </Chip>
                    <DataClassBadge dataClass={result.record.dataClass} />
                    {result.kind === "INCIDENT" ? <SeverityBadge severity={(result.record.assessedSeverity as string) ?? (result.record.reportedSeverity as string)} /> : null}
                  </div>
                </div>

                <ol className="mt-3 grid gap-1.5 sm:grid-cols-3">
                  {steps.map((step, index) => {
                    const reached = currentIndex >= index;
                    return (
                      <li key={step} className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold ${reached ? "border-teal-200 bg-teal-50 text-teal-900" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
                        <span className="mr-1">{index + 1}.</span>
                        {INCIDENT_STATUS_LABELS[step] ?? step.replaceAll("_", " ")}
                      </li>
                    );
                  })}
                </ol>

                {result.record.latestUpdate ? (
                  <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Latest official update</p>
                    <p className="text-xs text-slate-800">{result.record.latestUpdate.note}</p>
                    <p className="text-[10px] text-slate-500">{formatDateTime(result.record.latestUpdate.at)}</p>
                  </div>
                ) : null}

                {result.accessLevel === "PUBLIC_LIMITED" ? (
                  <div className="mt-3">
                    <Notice tone="warn" title="Private details hidden">
                      {result.note}
                    </Notice>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <label>
                        <span className="label">Tracking code</span>
                        <input className="input font-mono" value={code} onChange={(event) => setCode(event.target.value)} placeholder="XXXX-XXXX" />
                      </label>
                      <div className="flex items-end">
                        <button className="btn-outline btn-sm w-full" onClick={() => void lookup(result.kind, result.record.publicId, code)}>Unlock full details</button>
                      </div>
                      <div className="flex items-end">
                        <Link className="btn-ghost btn-sm w-full" href={`/login?next=${encodeURIComponent(`/track?id=${result.record.publicId}&type=${result.kind}`)}`}>Sign in as reporter</Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    <p className="font-semibold text-slate-900">{String(result.record.locationName ?? "Location on record")}</p>
                    <p className="mt-1 leading-relaxed">{String(result.record.description ?? "")}</p>
                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                      {result.record.contactPhoneMasked ? <p>Your contact on file: {String(result.record.contactPhoneMasked)}</p> : null}
                      {result.record.phoneMasked ? <p>Your callback number: {String(result.record.phoneMasked)}</p> : null}
                      {result.record.assignedTeamName ? <p>Team assigned: <strong>{String(result.record.assignedTeamName)}</strong></p> : null}
                    </div>
                    {result.record.resolutionNote ? <p className="mt-2 rounded-md bg-white p-2 text-[11px]">Official resolution notes: {String(result.record.resolutionNote)}</p> : null}
                    {result.record.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={String(result.record.photoUrl)} alt="Photograph attached to your report" className="mt-2 max-h-40 rounded-md object-cover" />
                    ) : null}
                  </div>
                )}
                <p className="mt-2 text-[10px] text-slate-500">{result.note}</p>
              </div>

              <div className="card card-pad">
                <h2 className="mb-2 text-sm font-bold text-slate-900">Recorded history</h2>
                {result.events.length === 0 ? <EmptyState title="No events recorded yet" /> : (
                  <ol className="space-y-2">
                    {result.events.map((event, index) => (
                      <li key={`${event.action}-${index}`} className="flex gap-2.5">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-600" />
                        <div>
                          <p className="text-xs font-semibold text-slate-800">
                            {event.action.replaceAll("_", " ")} {event.toStatus ? <span className="text-slate-500">→ {event.toStatus.replaceAll("_", " ")}</span> : null}
                          </p>
                          <p className="text-[11px] text-slate-600">{event.note}</p>
                          <p className="text-[10px] text-slate-400">{formatDateTime(event.createdAt)} · {event.actorRole ?? "SYSTEM"}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-2 text-[10px] text-slate-500">Status names follow the government workflow: reported → under review → verified → assigned → in progress → resolved.</p>
              </div>
            </>
          ) : null}
        </div>
      )}

      <div className="card card-pad">
        <h2 className="mb-1.5 text-sm font-bold text-slate-900">What the statuses mean</h2>
        <ul className="grid gap-1.5 text-[11px] text-slate-600 sm:grid-cols-2">
          <li><StatusBadge status="PENDING" /> Received — waiting for official review</li>
          <li><StatusBadge status="UNDER_REVIEW" /> An official is reviewing the details</li>
          <li><StatusBadge status="VERIFIED" /> Verified as a real incident</li>
          <li><StatusBadge status="ASSIGNED" /> A response team has been assigned</li>
          <li><StatusBadge status="IN_PROGRESS" /> Response action underway</li>
          <li><StatusBadge status="RESOLVED" /> Closed with resolution notes</li>
          <li><StatusBadge status="REJECTED" /> Not accepted (duplicate/invalid)</li>
          <li><SourceBadge source="COMMUNITY_REPORT" /> Citizen submission — never auto-verified</li>
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/report" className="btn-outline btn-sm">New report</Link>
          <Link href="/sos" className="btn-sos btn-sm">New SOS</Link>
          <Link href="/alerts" className="btn-ghost btn-sm">District alerts</Link>
        </div>
      </div>
    </div>
  );
}
