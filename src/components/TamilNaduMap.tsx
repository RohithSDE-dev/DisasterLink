"use client";

import { useMemo, useRef, useState } from "react";
import { DISTRICT_GEOMETRY, RIVERS } from "@/lib/districts";
import { cx } from "./ui";

export type MapMarkerType = "INCIDENT" | "SOS" | "FACILITY" | "SHELTER";

export type MapMarker = {
  id: string | number;
  type: MapMarkerType;
  lat: number;
  lng: number;
  title: string;
  description?: string;
  severity?: string | null;
  status?: string | null;
  dataClass?: string | null;
  districtName?: string;
};

export type MapDistrictDatum = {
  code: string;
  name: string;
  riskLevel?: string;
  incidents?: number;
  pending?: number;
  openSos?: number;
  temperature?: number | null;
};

export type MapLayerKey = "risk" | "incidents" | "sos" | "facilities" | "shelters" | "rivers" | "labels";

const LAYER_LABELS: { key: MapLayerKey; label: string }[] = [
  { key: "risk", label: "Risk estimate" },
  { key: "incidents", label: "Reports" },
  { key: "sos", label: "SOS" },
  { key: "facilities", label: "Facilities" },
  { key: "shelters", label: "Shelters" },
  { key: "rivers", label: "Rivers" },
  { key: "labels", label: "Labels" },
];

const RISK_FILL: Record<string, string> = {
  LOW: "#10b981",
  MODERATE: "#eab308",
  HIGH: "#f97316",
  VERY_HIGH: "#dc2626",
};

const SEVERITY_MARKER: Record<string, string> = {
  LOW: "#059669",
  MODERATE: "#ca8a04",
  HIGH: "#ea580c",
  CRITICAL: "#dc2626",
};

const W = 640;
const H = 760;

type View = { k: number; x: number; y: number };

export default function TamilNaduMap({
  districts,
  markers = [],
  selectedCode,
  onSelectDistrict,
  onMarkerClick,
  heightClass = "h-[440px] sm:h-[580px]",
  initialLayers,
  showControls = true,
  compact = false,
}: {
  districts: MapDistrictDatum[];
  markers?: MapMarker[];
  selectedCode?: string | null;
  onSelectDistrict?: (code: string) => void;
  onMarkerClick?: (marker: MapMarker) => void;
  heightClass?: string;
  initialLayers?: MapLayerKey[];
  showControls?: boolean;
  compact?: boolean;
}) {
  const [layers, setLayers] = useState<Set<MapLayerKey>>(
    () => new Set(initialLayers ?? ["risk", "incidents", "sos", "facilities", "rivers", "labels"]),
  );
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState("");
  const [showLayerPanel, setShowLayerPanel] = useState(!compact);
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const drag = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const shell = useRef<HTMLDivElement | null>(null);

  const projection = useMemo(() => {
    let minLat = 90,
      maxLat = -90,
      minLng = 180,
      maxLng = -180;
    for (const feature of DISTRICT_GEOMETRY) {
      for (const ring of feature.rings) {
        for (const [lng, lat] of ring) {
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
        }
      }
    }
    const midLat = (minLat + maxLat) / 2;
    const midLng = (minLng + maxLng) / 2;
    const latSpan = maxLat - minLat || 1;
    const lngSpan = (maxLng - minLng) * Math.cos((midLat * Math.PI) / 180) || 1;
    const scale = Math.min((W * 0.86) / lngSpan, (H * 0.9) / latSpan);
    const project = (lat: number, lng: number): [number, number] => [
      W / 2 + (lng - midLng) * Math.cos((midLat * Math.PI) / 180) * scale,
      H / 2 - (lat - midLat) * scale,
    ];
    return { project };
  }, []);

  const paths = useMemo(
    () =>
      DISTRICT_GEOMETRY.map((feature) => ({
        code: feature.code,
        name: feature.name,
        hasPolygon: feature.hasPolygon,
        centroid: projection.project(feature.centroid[1], feature.centroid[0]),
        d: feature.rings
          .map((ring) => {
            const points = ring.map(([lng, lat]) => projection.project(lat, lng));
            return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + " Z";
          })
          .join(" "),
      })),
    [projection],
  );

  const districtData = useMemo(() => new Map(districts.map((d) => [d.code, d])), [districts]);

  const displayedMarkers = useMemo(() => {
    const layerFor: Record<MapMarkerType, MapLayerKey> = {
      INCIDENT: "incidents",
      SOS: "sos",
      FACILITY: "facilities",
      SHELTER: "shelters",
    };
    return markers
      .filter((m) => layers.has(layerFor[m.type]))
      .map((marker) => {
        const [bx, by] = projection.project(marker.lat, marker.lng);
        return { ...marker, x: bx * view.k + view.x, y: by * view.k + view.y };
      });
  }, [markers, layers, projection, view]);

  const clusters = useMemo(() => {
    const cells = new Map<string, { x: number; y: number; members: typeof displayedMarkers }>();
    for (const marker of displayedMarkers) {
      const key = `${Math.round(marker.x / 42)}:${Math.round(marker.y / 42)}`;
      const existing = cells.get(key);
      if (existing) {
        existing.members.push(marker);
        existing.x = existing.members.reduce((s, m) => s + m.x, 0) / existing.members.length;
        existing.y = existing.members.reduce((s, m) => s + m.y, 0) / existing.members.length;
      } else {
        cells.set(key, { x: marker.x, y: marker.y, members: [marker] });
      }
    }
    return [...cells.values()];
  }, [displayedMarkers]);

  const riverPaths = useMemo(
    () =>
      RIVERS.map((river) => ({
        name: river.name,
        d: river.points
          .map(([lng, lat], index) => {
            const [x, y] = projection.project(lat, lng);
            return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(" "),
      })),
    [projection],
  );

  function toggleLayer(key: MapLayerKey) {
    setLayers((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function zoomBy(factor: number, center?: { x: number; y: number }) {
    setView((current) => {
      const k = Math.max(1, Math.min(7, current.k * factor));
      const cx = center?.x ?? W / 2;
      const cy = center?.y ?? H / 2;
      return { k, x: cx - ((cx - current.x) * k) / current.k, y: cy - ((cy - current.y) * k) / current.k };
    });
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const svg = event.currentTarget;
    svg.setPointerCapture(event.pointerId);
    drag.current = { active: true, startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y };
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width) setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (!drag.current?.active) return;
    const factor = W / (rect.width || W);
    setView((current) => ({
      ...current,
      x: drag.current!.originX + (event.clientX - drag.current!.startX) * factor,
      y: drag.current!.originY + (event.clientY - drag.current!.startY) * factor,
    }));
  }

  function onPointerUp() {
    if (drag.current) drag.current.active = false;
  }

  async function toggleFullscreen() {
    const node = shell.current;
    if (!node) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await node.requestFullscreen();
    } catch {
      /* fullscreen not permitted */
    }
  }

  const filteredNames = query.trim()
    ? districts.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 7)
    : [];
  const hoveredDistrict = hovered ? districtData.get(hovered) : null;
  const hoveredPath = hovered ? paths.find((p) => p.code === hovered) : null;

  return (
    <div ref={shell} className="tn-map-shell">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-2">
          <div className="relative">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search district…"
              className="input h-8 w-40 py-1 text-xs sm:w-48"
              aria-label="Search district on map"
            />
            {filteredNames.length > 0 ? (
              <div className="absolute z-20 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {filteredNames.map((d) => (
                  <button
                    key={d.code}
                    onClick={() => {
                      onSelectDistrict?.(d.code);
                      setQuery("");
                    }}
                    className="block w-full px-3 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-blue-50"
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {showControls ? (
            <button className="btn-outline btn-sm" onClick={() => setShowLayerPanel((v) => !v)}>
              Layers ({layers.size})
            </button>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <button className="btn-outline btn-sm" onClick={() => zoomBy(1.35)} aria-label="Zoom in">
              +
            </button>
            <button className="btn-outline btn-sm" onClick={() => zoomBy(1 / 1.35)} aria-label="Zoom out">
              −
            </button>
            <button className="btn-outline btn-sm" onClick={() => setView({ k: 1, x: 0, y: 0 })}>
              Reset
            </button>
            <button className="btn-outline btn-sm" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
              ⛶
            </button>
          </div>
        </div>

        {showControls && showLayerPanel ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-slate-200 bg-white px-3 py-2">
            {LAYER_LABELS.map((layer) => (
              <label key={layer.key} className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={layers.has(layer.key)}
                  onChange={() => toggleLayer(layer.key)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                />
                {layer.label}
              </label>
            ))}
          </div>
        ) : null}

        <div className={cx("relative w-full touch-none select-none bg-slate-50", heightClass)}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-full w-full cursor-grab active:cursor-grabbing"
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => {
              onPointerUp();
              setHovered(null);
              setTooltip(null);
            }}
            role="img"
            aria-label="Interactive map of Tamil Nadu districts with risk and incident layers"
          >
            <defs>
              <pattern id="waterHatch" width="6" height="6" patternUnits="userSpaceOnUse">
                <path d="M0 6 L6 0" stroke="#38bdf8" strokeWidth="0.7" opacity="0.5" />
              </pattern>
            </defs>
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              <rect x={-W} y={-H} width={W * 3} height={H * 3} fill="#f8fafc" />
              {paths.map((path) => {
                const data = districtData.get(path.code);
                const level = data?.riskLevel ?? "LOW";
                const fill = layers.has("risk") ? RISK_FILL[level] ?? "#94a3b8" : "#e2e8f0";
                const isSelected = selectedCode === path.code;
                const isHovered = hovered === path.code;
                if (!path.hasPolygon) return null;
                return (
                  <path
                    key={path.code}
                    d={path.d}
                    fill={fill}
                    fillOpacity={layers.has("risk") ? (isSelected ? 0.85 : isHovered ? 0.7 : 0.45) : 0.8}
                    stroke={isSelected ? "#0f172a" : isHovered ? "#1d4ed8" : "#ffffff"}
                    strokeWidth={isSelected ? 2.2 : isHovered ? 1.6 : 0.9}
                    className="transition-[fill-opacity] duration-150"
                    onMouseEnter={() => setHovered(path.code)}
                    onClick={() => onSelectDistrict?.(path.code)}
                    role="button"
                    aria-label={`${path.name}${data ? `, ${data.riskLevel ?? "unknown"} risk estimate` : ""}`}
                  />
                );
              })}

              {layers.has("rivers")
                ? riverPaths.map((river) => (
                    <path key={river.name} d={river.d} fill="none" stroke="#0284c7" strokeWidth={1.5} strokeOpacity={0.65} strokeLinecap="round" />
                  ))
                : null}

              {layers.has("labels")
                ? paths.map((path) => {
                    const data = districtData.get(path.code);
                    if (!data) return null;
                    const showLabel = view.k >= 1.6 || ["TN-CHN", "TN-CBE", "TN-MDU", "TN-TRC", "TN-SLM", "TN-TNV", "TN-NGP", "TN-ERD", "TN-VLR", "TN-TNJ"].includes(path.code);
                    if (!showLabel) return null;
                    return (
                      <text
                        key={`label-${path.code}`}
                        x={path.centroid[0]}
                        y={path.centroid[1]}
                        textAnchor="middle"
                        className="pointer-events-none"
                        style={{ fontSize: view.k >= 1.6 ? 8 / view.k * 2.4 : 7 / view.k * 2.2, fill: "#0f172a", fontWeight: 600, paintOrder: "stroke", stroke: "#ffffff", strokeWidth: 1.6 }}
                      >
                        {data.name}
                      </text>
                    );
                  })
                : null}
            </g>

            {/* Markers are drawn outside the pan group so their size stays constant. */}
            {clusters.map((cluster, index) => {
              if (cluster.members.length === 1) {
                const marker = cluster.members[0];
                const color =
                  marker.type === "SOS"
                    ? "#dc2626"
                    : marker.type === "FACILITY"
                      ? "#1d4ed8"
                      : marker.type === "SHELTER"
                        ? "#059669"
                        : SEVERITY_MARKER[marker.severity ?? "MODERATE"] ?? "#ea580c";
                return (
                  <g
                    key={`${marker.type}-${marker.id}`}
                    transform={`translate(${marker.x} ${marker.y})`}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelectedMarker(marker);
                      if (marker.districtName) {
                        const match = districts.find((d) => d.name === marker.districtName);
                        if (match) onSelectDistrict?.(match.code);
                      }
                      onMarkerClick?.(marker);
                    }}
                  >
                    {marker.type === "SOS" ? (
                      <>
                        <circle r="11" fill={color} opacity="0.18" className="live-dot" />
                        <rect x="-5" y="-5" width="10" height="10" rx="1.5" fill={color} stroke="#fff" strokeWidth="1.6" transform="rotate(45)" />
                      </>
                    ) : marker.type === "FACILITY" ? (
                      <rect x="-4.5" y="-4.5" width="9" height="9" rx="1" fill={color} stroke="#fff" strokeWidth="1.4" />
                    ) : marker.type === "SHELTER" ? (
                      <path d="M0 -6 L6 4 L-6 4 Z" fill={color} stroke="#fff" strokeWidth="1.4" />
                    ) : (
                      <circle r="5" fill={color} stroke="#fff" strokeWidth="1.6" strokeDasharray={marker.dataClass === "SIMULATED" ? "2 1.5" : undefined} />
                    )}
                  </g>
                );
              }
              return (
                <g
                  key={`cluster-${index}`}
                  transform={`translate(${cluster.x} ${cluster.y})`}
                  className="cursor-pointer"
                  onClick={() => zoomBy(1.9, { x: cluster.x, y: cluster.y })}
                >
                  <circle r="12" fill="#0f172a" opacity="0.85" />
                  <text textAnchor="middle" y="3.5" style={{ fontSize: 9, fill: "#fff", fontWeight: 700 }}>
                    {cluster.members.length}
                  </text>
                </g>
              );
            })}

            {paths
              .filter((p) => !p.hasPolygon)
              .map((p) => {
                const data = districtData.get(p.code);
                return (
                  <g key={`no-poly-${p.code}`} transform={`translate(${p.centroid[0] * view.k + view.x} ${p.centroid[1] * view.k + view.y})`} className="cursor-pointer" onClick={() => onSelectDistrict?.(p.code)}>
                    <circle r="5" fill={RISK_FILL[data?.riskLevel ?? "LOW"] ?? "#94a3b8"} stroke="#0f172a" strokeWidth="1.4" />
                  </g>
                );
              })}
          </svg>

          {hoveredDistrict && tooltip ? (
            <div
              className="pointer-events-none absolute z-10 max-w-[190px] rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] shadow-lg"
              style={{ left: Math.min(tooltip.x + 12, 360), top: Math.max(8, tooltip.y - 8) }}
            >
              <p className="font-bold text-slate-900">{hoveredDistrict.name}</p>
              <p className="text-slate-600">
                {hoveredDistrict.riskLevel?.replace("_", " ") ?? "No"} risk estimate
              </p>
              <p className="text-slate-500">
                {hoveredDistrict.incidents ?? 0} reports · {hoveredDistrict.openSos ?? 0} open SOS
              </p>
              {hoveredPath && !hoveredPath.hasPolygon ? <p className="mt-0.5 text-amber-700">Boundary polygon unavailable</p> : null}
            </div>
          ) : null}

          {selectedMarker ? (
            <div className="absolute bottom-2 right-2 z-10 max-w-[240px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-slate-900">{selectedMarker.title}</p>
                <button onClick={() => setSelectedMarker(null)} className="text-slate-400" aria-label="Close marker details">
                  ×
                </button>
              </div>
              {selectedMarker.description ? <p className="mt-0.5 text-slate-600">{selectedMarker.description}</p> : null}
              <p className="mt-1 text-slate-500">
                {selectedMarker.type} · {selectedMarker.status ?? "status n/a"} {selectedMarker.dataClass === "SIMULATED" ? "· SIMULATED" : ""}
              </p>
            </div>
          ) : null}

          <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-1 text-[10px] text-slate-500 shadow-sm">
            {layers.has("risk") ? "Fill = MODEL_RISK_ESTIMATE (heuristic)" : "Risk fill layer off"} · boundaries simplified
          </div>
        </div>

        {!compact ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-600">
            <span className="font-semibold uppercase tracking-wide text-slate-400">Legend</span>
            {Object.entries(RISK_FILL).map(([level, color]) => (
              <span key={level} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                {level.replace("_", " ")}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-600" /> SOS
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 bg-blue-700" /> Facility
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 bg-emerald-600" /> Official shelter
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-4 bg-sky-600" /> River (schematic)
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
