"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DISTRICTS } from "@/lib/districts";
import { CATEGORY_LABELS, EMERGENCY_TYPES, INCIDENT_CATEGORIES, SEVERITIES, SOS_DISCLAIMER, SOS_STATUSES } from "@/lib/constants";
import { apiRequest } from "../interactive";
import { CopyButton } from "../interactive";
import { Chip, Field, Notice, SectionHeading, SeverityBadge, SourceBadge, StatusBadge } from "../ui";
import { useSelectedDistrict } from "./useDistrict";

type Analysis = {
  category: string;
  categoryLabel: string;
  categoryConfidence: number;
  severitySuggestion: string;
  severityRationale: string[];
  summary: string;
  matchedPhrases: string[];
  suggestedActions: string[];
  duplicate: { publicId: string; similarity: number; status: string } | null;
  advisory: string;
  alternativeCategories: { category: string; score: number }[];
};

function useGeo() {
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoState, setGeoState] = useState<"IDLE" | "REQUESTING" | "GRANTED" | "DENIED" | "UNSUPPORTED">("IDLE");
  const [geoError, setGeoError] = useState<string | null>(null);

  function request() {
    if (!("geolocation" in navigator)) {
      setGeoState("UNSUPPORTED");
      setGeoError("This browser does not expose geolocation.");
      return;
    }
    setGeoState("REQUESTING");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: Math.round(position.coords.latitude * 1e5) / 1e5,
          lng: Math.round(position.coords.longitude * 1e5) / 1e5,
          accuracy: Math.round(position.coords.accuracy),
        });
        setGeoState("GRANTED");
        setGeoError(null);
      },
      (error) => {
        setGeoState("DENIED");
        setGeoError(error.message || "Location permission was not granted.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  return { coords, setCoords, geoState, geoError, request };
}

function GeoField({ geo }: { geo: ReturnType<typeof useGeo> }) {
  return (
    <Field label="GPS coordinates" hint="Requested only with your browser permission. If denied, the report is still accepted with your typed location.">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={geo.request} className="btn-outline btn-sm">
          {geo.geoState === "REQUESTING" ? "Locating…" : geo.coords ? "Update GPS fix" : "Use my current location"}
        </button>
        {geo.coords ? (
          <Chip tone="green">
            {geo.coords.lat}, {geo.coords.lng} · ±{geo.coords.accuracy} m
          </Chip>
        ) : (
          <Chip tone={geo.geoState === "DENIED" ? "amber" : "neutral"}>{geo.geoState === "DENIED" ? "Permission denied" : "No GPS fix"}</Chip>
        )}
        {geo.coords ? (
          <button type="button" className="btn-ghost btn-sm" onClick={() => geo.setCoords(null)}>
            Clear
          </button>
        ) : null}
      </div>
      {geo.geoError ? <p className="mt-1 text-[11px] text-amber-700">{geo.geoError}</p> : null}
    </Field>
  );
}

export function IncidentReportForm() {
  const [district, setDistrict] = useSelectedDistrict();
  const [category, setCategory] = useState("WATERLOGGING");
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");
  const [severity, setSeverity] = useState("MODERATE");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ publicId: string; status: string; aiSummary?: string; trackingCode?: string; link?: string; linked?: boolean } | null>(null);
  const geo = useGeo();
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preset = params.get("district");
    if (preset && DISTRICTS.some((d) => d.code === preset)) setDistrict(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function compress(file: File) {
    if (!file.type.startsWith("image/")) {
      setPhotoError("Only image files are supported.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(file);
    });
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Invalid image"));
      img.src = dataUrl;
    });
    const maxSide = 900;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setPhotoError("Image compression not supported in this browser.");
      return;
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL("image/jpeg", 0.68));
    setPhotoError(null);
  }

  async function runAnalysis() {
    if (description.trim().length < 12) {
      setError("Add a little more description before running the AI check.");
      return;
    }
    setAnalysing(true);
    setError(null);
    const result = await apiRequest<{ analysis: Analysis }>("/api/ai", {
      method: "POST",
      body: { mode: "classify", description, districtCode: district, category },
    });
    setAnalysing(false);
    if (!result.ok) setError(result.error ?? "AI check failed");
    else setAnalysis(result.data?.analysis ?? null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await apiRequest<{
      incident: { publicId: string; status: string };
      analysis: Analysis;
      tracking: { publicId: string; trackingCode: string; link: string; linkedToAccount: boolean };
    }>("/api/incidents", {
      method: "POST",
      body: {
        category,
        description,
        districtCode: district,
        locationName,
        reportedSeverity: severity,
        contactName: contactName || undefined,
        contactPhone: contactPhone || undefined,
        lat: geo.coords?.lat,
        lng: geo.coords?.lng,
        photoUrl: photo ?? undefined,
      },
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Submission failed");
      return;
    }
    setSuccess({
      publicId: result.data!.incident.publicId,
      status: result.data!.incident.status,
      aiSummary: result.data!.analysis.summary,
      trackingCode: result.data!.tracking?.trackingCode,
      link: result.data!.tracking?.link,
      linked: result.data!.tracking?.linkedToAccount,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card card-pad">
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white">✓</span>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Report submitted</h1>
              <p className="text-xs text-slate-500">Saved to the DisasterLink command centre queue.</p>
            </div>
          </div>
          <div className="my-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your incident ID</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="font-mono text-lg font-bold text-slate-900">{success.publicId}</p>
              <CopyButton value={success.publicId} />
              <Link href={`/track?id=${success.publicId}&type=INCIDENT`} className="btn-outline btn-sm">Track status</Link>
            </div>
            <p className="mt-1 text-xs text-slate-600">Current status: <StatusBadge status={success.status} /></p>
            {success.trackingCode ? (
              <div className="mt-2 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-teal-800">One-time tracking code</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-extrabold tracking-wider text-teal-950">{success.trackingCode}</span>
                  <CopyButton value={success.trackingCode} label="Copy code" />
                  {success.link ? <Link className="btn-outline btn-sm" href={success.link}>Open private status</Link> : null}
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-teal-900">
                  Write this code down. It is shown only once and is needed to view the private details of this report.
                  {success.linked ? " This report is linked to your signed-in account, so it also appears under My reports." : " Sign in before reporting next time to have reports appear automatically under My reports."}
                </p>
              </div>
            ) : null}
          </div>
          <Notice tone="warn" title="What happens next">
            Your report is <strong>PENDING</strong> administrator review. It is not a verified incident and has not been dispatched to any
            team. Only an authorised administrator can verify it. If lives are at risk, call 112 / 108 / 101 directly.
          </Notice>
          {success.aiSummary ? (
            <p className="mt-3 rounded-lg bg-indigo-50 p-2.5 text-[11px] text-indigo-900">
              <SourceBadge source="MODEL_RISK_ESTIMATE" /> AI summary for reviewer context: {success.aiSummary}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/" className="btn-primary btn-sm">Back to home</Link>
            <button
              className="btn-outline btn-sm"
              onClick={() => {
                setSuccess(null);
                setDescription("");
                setLocationName("");
                setPhoto(null);
                setAnalysis(null);
              }}
            >
              Report another incident
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeading
        eyebrow="Citizen reporting"
        title="Report an incident"
        description="Reports are stored as community submissions with a unique incident ID. They are never verified automatically."
        action={<SourceBadge source="COMMUNITY_REPORT" />}
      />
      <form onSubmit={submit} className="space-y-4">
        <div className="card card-pad grid gap-3 sm:grid-cols-2">
          <Field label="Incident category" required>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {INCIDENT_CATEGORIES.map((value) => (
                <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>
              ))}
            </select>
          </Field>
          <Field label="District" required>
            <select className="input" value={district} onChange={(e) => setDistrict(e.target.value)}>
              {DISTRICTS.map((d) => (
                <option key={d.code} value={d.code}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Location / landmark" required hint="Street, junction, ward or building. Precise coordinates are optional.">
            <input className="input" value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="e.g. Gandhipuram bus stand, near platform 2" required minLength={3} />
          </Field>
          <Field label="Severity as you see it" required hint="Your assessment. An administrator sets the official assessed severity.">
            <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {SEVERITIES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="What is happening?" required hint="Minimum 15 characters. Include depth, access problems, trapped people or immediate hazards.">
              <textarea className="input min-h-[110px]" value={description} onChange={(e) => setDescription(e.target.value)} required minLength={15} maxLength={2000} placeholder="Describe the incident, who is affected and whether water is rising…" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <GeoField geo={geo} />
          </div>
          <Field label="Photograph (optional)" hint="Images are compressed in your browser and stored with the report.">
            <input ref={fileRef} type="file" accept="image/*" className="input py-1.5 text-xs" onChange={(e) => { const file = e.target.files?.[0]; if (file) void compress(file); }} />
            {photoError ? <p className="mt-1 text-[11px] text-red-600">{photoError}</p> : null}
            {photo ? (
              <div className="mt-2 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="Incident upload preview" className="h-16 w-24 rounded-md object-cover" />
                <button type="button" className="btn-ghost btn-sm" onClick={() => { setPhoto(null); if (fileRef.current) fileRef.current.value = ""; }}>Remove</button>
              </div>
            ) : null}
          </Field>
          <div className="space-y-3">
            <Field label="Contact name (optional)" hint="Never displayed publicly.">
              <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Contact phone (optional)" hint="Masked in every public or tracking view.">
              <input className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={20} placeholder="+91…" />
            </Field>
          </div>
        </div>

        <div className="card card-pad">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">AI pre-check (optional)</h3>
              <p className="text-[11px] text-slate-500">Suggests a category, severity and possible duplicate. It never submits, verifies or dispatches.</p>
            </div>
            <button type="button" className="btn-dark btn-sm" onClick={runAnalysis} disabled={analysing}>
              {analysing ? "Analysing…" : "Analyse description"}
            </button>
          </div>
          {analysis ? (
            <div className="mt-3 space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-slate-700">
              <div className="flex flex-wrap items-center gap-1.5">
                <SourceBadge source="MODEL_RISK_ESTIMATE" />
                <Chip tone="purple">AI-ASSISTED</Chip>
              </div>
              <p><strong>Suggested category:</strong> {analysis.categoryLabel} ({analysis.categoryConfidence}% keyword confidence)</p>
              <p className="flex items-center gap-2"><strong>Suggested severity:</strong> <SeverityBadge severity={analysis.severitySuggestion} /></p>
              <p><strong>Summary:</strong> {analysis.summary}</p>
              {analysis.duplicate ? (
                <p className="rounded-md bg-amber-100 px-2 py-1 text-amber-900">
                  Possible duplicate of <strong>{analysis.duplicate.publicId}</strong> ({analysis.duplicate.similarity}% similarity, status {analysis.duplicate.status}).
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">No similar recent report detected in this district.</p>
              )}
              <ul className="list-disc pl-4 text-[11px] text-slate-600">
                {analysis.severityRationale.map((line) => <li key={line}>{line}</li>)}
              </ul>
              <p className="text-[10px] text-slate-500">{analysis.advisory}</p>
            </div>
          ) : null}
        </div>

        {error ? <Notice tone="danger" title="Could not submit report">{error}</Notice> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit incident report"}
          </button>
          <Link href="/sos" className="btn-outline">Life-threatening? Open SOS</Link>
          <p className="text-[11px] text-slate-500">By submitting you agree this is a best-effort community report, not an official record.</p>
        </div>
      </form>
    </div>
  );
}

export function SosRequestForm() {
  const [district, setDistrict] = useSelectedDistrict();
  const [emergencyType, setEmergencyType] = useState("FLOOD_RESCUE");
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");
  const [peopleAffected, setPeopleAffected] = useState("1");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ publicId: string; status: string; disclaimer: string; trackingCode?: string; link?: string } | null>(null);
  const geo = useGeo();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed) {
      setError("Please confirm you understand that this does not automatically dispatch a team.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await apiRequest<{
      sos: { publicId: string; status: string };
      disclaimer: string;
      tracking: { publicId: string; trackingCode: string; link: string; linkedToAccount: boolean };
    }>("/api/sos", {
      method: "POST",
      body: {
        emergencyType,
        description,
        districtCode: district,
        locationName: locationName || undefined,
        lat: geo.coords?.lat,
        lng: geo.coords?.lng,
        name: name || undefined,
        phone: phone || undefined,
        peopleAffected: peopleAffected === "" ? undefined : Number(peopleAffected),
      },
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "SOS submission failed");
      return;
    }
    setSuccess({
      publicId: result.data!.sos.publicId,
      status: result.data!.sos.status,
      disclaimer: result.data!.disclaimer,
      trackingCode: result.data!.tracking?.trackingCode,
      link: result.data!.tracking?.link,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="card border-red-200 card-pad">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-red-600 text-white">🆘</span>
            <div>
              <h1 className="text-lg font-bold text-slate-900">SOS request recorded</h1>
              <p className="text-xs text-slate-500">Your request is queued for duty-officer review.</p>
            </div>
          </div>
          <div className="my-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your SOS ID</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="font-mono text-lg font-bold text-slate-900">{success.publicId}</p>
              <CopyButton value={success.publicId} />
              <Link href={`/track?id=${success.publicId}&type=SOS`} className="btn-outline btn-sm">Track SOS</Link>
            </div>
            <p className="mt-1 text-xs text-slate-600">Current status: <StatusBadge status={success.status} /></p>
            {success.trackingCode ? (
              <div className="mt-2 rounded-md border border-slate-300 bg-white px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">One-time SOS tracking code</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-extrabold tracking-wider text-slate-900">{success.trackingCode}</span>
                  <CopyButton value={success.trackingCode} label="Copy code" />
                  {success.link ? <Link className="btn-outline btn-sm" href={success.link}>Open private status</Link> : null}
                </div>
                <p className="mt-1 text-[10px] text-slate-600">Needed to view your private SOS details. It cannot be recovered, so save it now.</p>
              </div>
            ) : null}
          </div>
          <ol className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {SOS_STATUSES.map((status, index) => (
              <li key={status} className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold ${index === 0 ? "border-red-300 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-500"}`}>
                {index + 1}. {status.replaceAll("_", " ")}
              </li>
            ))}
          </ol>
          <Notice tone="danger" title="Important">
            {success.disclaimer}
          </Notice>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <a href="tel:112" className="btn-sos">Call 112</a>
            <a href="tel:108" className="btn-outline">Call 108</a>
            <a href="tel:101" className="btn-outline">Call 101</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-red-700">Emergency request</p>
            <h1 className="text-xl font-extrabold text-red-950">SOS — request emergency assistance</h1>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-red-900">{SOS_DISCLAIMER}</p>
          </div>
          <SourceBadge source="COMMUNITY_REPORT" />
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="card card-pad grid gap-3 sm:grid-cols-2">
          <Field label="Emergency type" required>
            <select className="input" value={emergencyType} onChange={(e) => setEmergencyType(e.target.value)}>
              {EMERGENCY_TYPES.map((type) => (
                <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
              ))}
            </select>
          </Field>
          <Field label="District" required>
            <select className="input" value={district} onChange={(e) => setDistrict(e.target.value)}>
              {DISTRICTS.map((d) => (
                <option key={d.code} value={d.code}>{d.name}</option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Describe the emergency" required hint="Who is affected, where they are, and what is needed. Minimum 10 characters.">
              <textarea className="input min-h-[100px]" value={description} onChange={(e) => setDescription(e.target.value)} required minLength={10} maxLength={1500} placeholder="Two people stranded on the first floor, water at waist level, no boat access…" />
            </Field>
          </div>
          <Field label="Landmark / address">
            <input className="input" value={locationName} onChange={(e) => setLocationName(e.target.value)} maxLength={240} />
          </Field>
          <Field label="People affected">
            <input className="input" type="number" min={0} max={100000} value={peopleAffected} onChange={(e) => setPeopleAffected(e.target.value)} />
          </Field>
          <div className="sm:col-span-2"><GeoField geo={geo} /></div>
          <Field label="Your name (optional)" hint="Visible only to authorised administrators.">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Callback phone (optional)" hint="Masked in public and tracking views.">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="+91…" />
          </Field>
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-950">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-400" />
          I understand that submitting this SOS does not guarantee that a rescue team has been dispatched, and that I should call 112 / 108 / 101
          directly in an immediate life-threatening situation.
        </label>

        {error ? <Notice tone="danger" title="Could not submit SOS">{error}</Notice> : null}

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-sos" disabled={submitting}>
            {submitting ? "Submitting SOS…" : "Submit SOS request"}
          </button>
          <Link href="/report" className="btn-outline">Report a non-urgent incident</Link>
        </div>
      </form>
    </div>
  );
}
