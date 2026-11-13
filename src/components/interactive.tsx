"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cx } from "./ui";

export function Tabs({
  tabs,
  active,
  onChange,
  dark,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
  dark?: boolean;
}) {
  return (
    <div className={cx("flex flex-wrap gap-1 rounded-lg p-1", dark ? "bg-ink-900/60 ring-1 ring-white/10" : "bg-slate-100")} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cx(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition",
            active === tab.id
              ? dark
                ? "bg-white text-ink-900 shadow"
                : "bg-white text-slate-900 shadow-sm"
              : dark
                ? "text-slate-300 hover:bg-white/10"
                : "text-slate-600 hover:bg-white/70",
          )}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="ml-1.5 tabular-nums opacity-70">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6">
      <div className={cx("w-full rounded-xl bg-white shadow-2xl", wide ? "max-w-5xl" : "max-w-2xl")} role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Accordion({ items }: { items: { title: string; body: ReactNode }[] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.title ?? null);
  return (
    <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {items.map((item) => (
        <div key={item.title}>
          <button
            onClick={() => setOpen(open === item.title ? null : item.title)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
            aria-expanded={open === item.title}
          >
            {item.title}
            <span className="text-slate-400">{open === item.title ? "−" : "+"}</span>
          </button>
          {open === item.title ? <div className="px-4 pb-4 text-sm leading-relaxed text-slate-600">{item.body}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function CopyButton({ value, label = "Copy ID" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn-outline btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(url, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !(payload.success ?? payload.ok)) throw new Error(payload.message ?? payload.error ?? "Request failed");
        if (!cancelled) setData(payload.data as T);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, nonce, ...deps]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1), setData };
}

export async function apiRequest<T = unknown>(
  url: string,
  options?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(url, {
      method: options?.method ?? "GET",
      headers: options?.body ? { "Content-Type": "application/json" } : undefined,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok || !(payload.success ?? payload.ok)) {
      return { ok: false, error: payload.message ?? payload.error ?? `Request failed (${response.status})` };
    }
    return { ok: true, data: payload.data as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error" };
  }
}
