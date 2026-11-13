"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "dl.district";
const EVENT = "dl-district-change";

export function useSelectedDistrict(fallback = "TN-CBE") {
  const [code, setCode] = useState(fallback);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored) setCode(stored);
    } catch {
      /* storage unavailable */
    }
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail) setCode(detail);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const select = useCallback((next: string) => {
    setCode(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }, []);

  return [code, select] as const;
}
