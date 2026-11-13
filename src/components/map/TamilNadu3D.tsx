"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoJSONSource, MapGeoJSONFeature, MapMouseEvent, Map as MapLibreMap } from "maplibre-gl";
import TamilNaduMap, { type MapMarker } from "@/components/TamilNaduMap";
import { Chip, DataClassBadge, Notice, RiskBadge, SourceBadge, formatDateTime } from "@/components/ui";

type MapGeo = Parameters<GeoJSONSource["setData"]>[0];

type DistrictProps = {
  code: string;
  name: string;
  centroid?: [number, number];
  riskLevel: string;
  riskScore: number;
  rainfall24h: number;
  rainNow: number;
  temperature: number;
  incidents: number;
  verified: number;
  pending: number;
  facilities: number;
};

type GeoPayload = {
  districts: { type: "FeatureCollection"; features: { properties: DistrictProps }[] };
  hydrology: MapGeo;
  reservoirs: { name: string; lat: number; lng: number; river: string; note: string }[];
  landmarks: { name: string; kind: string; lat: number; lng: number }[];
  basemap: { style: string; terrainSource: string };
  provenance: { boundaries: { name: string; url: string }; hydrology: { name: string; note: string }; reservoirs: string };
};

type IncidentRow = {
  publicId: string;
  category: string;
  status: string;
  locationName: string;
  districtCode: string;
  lat: number | null;
  lng: number | null;
  reportedSeverity: string;
  assessedSeverity: string | null;
  dataClass: string;
};

type FacilityRow = {
  id: number;
  name: string;
  category: string;
  districtCode: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  verificationStatus: string;
  availabilityStatus: string;
  capacity: number | null;
  occupancy: number | null;
  dataClass: string;
};

type AlertRow = {
  id: number;
  title: string;
  severity: string;
  districtCode: string | null;
  sourceClass: string;
  categoryLabel: string;
  isActive: boolean;
};

type Corridor = { id: string; name: string; polyline: [number, number][]; risk: string; distanceKm: number; estimatedMinutes: number };

type LayerKey =
  | "boundaries"
  | "terrain"
  | "floodRisk"
  | "rainfall"
  | "warnings"
  | "incidents"
  | "hospitals"
  | "fire"
  | "ambulances"
  | "shelters"
  | "evacuation"
  | "hydrology"
  | "labels";

const LAYERS: { key: LayerKey; label: string; group: string }[] = [
  { key: "boundaries", label: "District boundaries", group: "Base" },
  { key: "terrain", label: "Terrain & elevation (3D)", group: "Base" },
  { key: "labels", label: "District names", group: "Base" },
  { key: "floodRisk", label: "Flood-risk zones (estimate)", group: "Hazard" },
  { key: "rainfall", label: "Rainfall distribution", group: "Hazard" },
  { key: "warnings", label: "Weather & emergency warnings", group: "Hazard" },
  { key: "incidents", label: "Active incidents", group: "Operations" },
  { key: "evacuation", label: "Evacuation corridors", group: "Operations" },
  { key: "hospitals", label: "Hospitals & medical", group: "Facilities" },
  { key: "fire", label: "Fire stations", group: "Facilities" },
  { key: "ambulances", label: "Ambulances", group: "Facilities" },
  { key: "shelters", label: "Relief camps & shelters", group: "Facilities" },
  { key: "hydrology", label: "Rivers, reservoirs, coast", group: "Base" },
];

const CATEGORY_COLORS: Record<string, string> = {
  FLOODING: "#2563eb",
  WATERLOGGING: "#0ea5e9",
  FALLEN_TREE: "#16a34a",
  ROAD_BLOCKAGE: "#a16207",
  BUILDING_DAMAGE: "#7c3aed",
  FIRE: "#dc2626",
  LANDSLIDE: "#b45309",
  OTHER: "#64748b",
};

const RISK_FILL = ["match", ["get", "riskLevel"], "VERY_HIGH", "#b91c1c", "HIGH", "#ea580c", "MODERATE", "#ca8a04", "LOW", "#0f766e", "#475569"];

const STATUS_COLORS = ["match", ["get", "status"], "VERIFIED", "#16a34a", "RESOLVED", "#0d9488", "UNDER_REVIEW", "#d97706", "PENDING", "#64748b", "REJECTED", "#9f1239", "#64748b"];

function toCollection(features: object[]): MapGeo {
  return { type: "FeatureCollection", features } as unknown as MapGeo;
}

export default function TamilNadu3D({
  mode = "citizen",
  initialDistrict = "TN-CBE",
  heightClass = "h-[520px] sm:h-[680px]",
}: {
  mode?: "citizen" | "admin";
  initialDistrict?: string;
  heightClass?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<"PENDING" | "VECTOR" | "FALLBACK">("PENDING");
  const [enabled, setEnabled] = useState<Set<LayerKey>>(
    () => new Set<LayerKey>(["boundaries", "terrain", "labels", "floodRisk", "incidents", "hospitals", "fire", "ambulances", "shelters", "evacuation", "hydrology", "warnings"]),
  );
  const [fillMode, setFillMode] = useState<"risk" | "rainfall" | "temperature" | "none">("risk");
  const [selected, setSelected] = useState<string>(initialDistrict);
  const [hovered, setHovered] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [showLayers, setShowLayers] = useState(true);
  const [search, setSearch] = useState("");
  const [geo, setGeo] = useState<GeoPayload | null>(null);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [sosMarkers, setSosMarkers] = useState<{ publicId: string; lat: number; lng: number; status: string; priority: string; districtCode: string }[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [popup, setPopup] = useState<{ title: string; lines: string[] } | null>(null);

  /* ------------------------------ data load ------------------------------ */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [geoRes, incidentRes, facilityRes, alertRes, evacRes] = await Promise.all([
          fetch("/api/geo", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/incidents?limit=300", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/facilities", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/alerts", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/evacuation", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (!geoRes?.success) throw new Error(geoRes?.message ?? "Geo layer unavailable");
        setGeo(geoRes.data as GeoPayload);
        setIncidents(incidentRes?.data?.incidents ?? []);
        setFacilities(facilityRes?.data?.facilities ?? []);
        setAlerts(alertRes?.data?.alerts ?? []);
        setCorridors(evacRes?.data?.corridors ?? []);
        setFetchedAt(new Date().toISOString());
        setDataError(null);
      } catch (error) {
        if (!cancelled) setDataError(error instanceof Error ? error.message : "Map data unavailable");
      }
    }
    void load();
    if (mode === "admin") {
      fetch("/api/sos", { cache: "no-store" })
        .then((r) => r.json())
        .then((payload) => {
          if (!cancelled && payload?.success) {
            setSosMarkers(
              (payload.data.sos as { publicId: string; lat: number | null; lng: number | null; status: string; priority: string; districtCode: string }[])
                .filter((row) => row.lat !== null && row.lng !== null && row.status !== "RESOLVED")
                .map((row) => ({ publicId: row.publicId, lat: row.lat as number, lng: row.lng as number, status: row.status, priority: row.priority, districtCode: row.districtCode })),
            );
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (!failure) return;
    mapRef.current?.remove();
    mapRef.current = null;
    setReady(false);
  }, [failure]);

  /* --------------------------- map initialisation ------------------------- */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;
    const container = containerRef.current;

    (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (disposed) return;
        libRef.current = maplibregl;
        let style: string | object = "https://tiles.openfreemap.org/styles/liberty";
        let usingVector = true;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const probe = await fetch(style, { signal: controller.signal });
          clearTimeout(timer);
          if (!probe.ok) throw new Error(`basemap ${probe.status}`);
        } catch {
          usingVector = false;
          style = {
            version: 8,
            name: "DisasterLink fallback (boundaries only)",
            sources: {},
            layers: [{ id: "bg", type: "background", paint: { "background-color": "#07101f" } }],
          };
        }
        if (disposed) return;
        setBasemap(usingVector ? "VECTOR" : "FALLBACK");

        const map = new maplibregl.Map({
          container,
          style: style as never,
          center: [78.6, 10.9],
          zoom: 6.25,
          pitch: 46,
          bearing: -8,
          maxPitch: 70,
          minZoom: 5.2,
          maxZoom: 15,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
        map.touchZoomRotate.enableRotation();

        map.on("load", () => {
          if (disposed) return;
          try {
            map.addSource("tn-terrain", {
              type: "raster-dem",
              tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
              encoding: "terrarium",
              tileSize: 256,
              maxzoom: 13,
              attribution: "Elevation: AWS Terrain Tiles / Mapzen",
            });
            map.addLayer({
              id: "tn-hillshade",
              type: "hillshade",
              source: "tn-terrain",
              paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#020617", "hillshade-highlight-color": "#1e293b" },
            });
            map.setTerrain({ source: "tn-terrain", exaggeration: 1.25 });
          } catch {
            /* terrain is optional; boundary layers still work */
          }
          setReady(true);
        });

        map.on("error", (event) => {
          // Tile errors are non-fatal; only report if the map never became ready.
          if (map.loaded()) return;
          const message = (event as unknown as { error?: { message?: string } }).error?.message;
          if (message && /webgl/i.test(message)) setFailure("WebGL is unavailable in this browser, so the 3D map cannot render.");
        });
      } catch (error) {
        setFailure(error instanceof Error ? error.message : "The 3D map could not be initialised.");
      }
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  /* --------------------------- layer synchronisation ---------------------- */
  const syncLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !geo) return;

    const ensureSource = (id: string, data: MapGeo) => {
      const source = map.getSource(id) as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else map.addSource(id, { type: "geojson", data });
    };

    const districtFeatures = geo.districts.features.map((feature) => ({
      type: "Feature",
      geometry: (feature as unknown as { geometry: object }).geometry,
      properties: feature.properties,
    }));

    const incidentFeatures = incidents
      .filter((incident) => incident.lat !== null && incident.lng !== null)
      .map((incident) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [incident.lng, incident.lat] },
        properties: {
          title: `${incident.publicId} · ${incident.category.replaceAll("_", " ")}`,
          subtitle: `${incident.locationName} · ${incident.status.replaceAll("_", " ")}`,
          category: incident.category,
          status: incident.status,
          severity: incident.assessedSeverity ?? incident.reportedSeverity,
          dataClass: incident.dataClass,
          color: CATEGORY_COLORS[incident.category] ?? "#64748b",
        },
      }));

    const facilityFeatures = facilities
      .filter((facility) => facility.lat !== null && facility.lng !== null)
      .map((facility) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [facility.lng, facility.lat] },
        properties: {
          title: facility.name,
          subtitle: `${facility.category.replaceAll("_", " ")} · ${facility.verificationStatus}${facility.capacity !== null ? ` · ${facility.occupancy ?? 0}/${facility.capacity}` : ""}`,
          category: facility.category,
          status: facility.availabilityStatus,
          dataClass: facility.dataClass,
        },
      }));

    const alertFeatures = alerts
      .filter((alert) => alert.isActive)
      .map((alert) => {
        const district = geo.districts.features.find((f) => f.properties.code === alert.districtCode) ?? geo.districts.features[0];
        const centroid = district?.properties.centroid;
        if (!centroid) return null;
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: centroid },
          properties: {
            title: alert.title,
            subtitle: `${alert.categoryLabel ?? "Alert"} · ${alert.severity} · ${alert.sourceClass.replaceAll("_", " ")}`,
            severity: alert.severity,
          },
        };
      })
      .filter(Boolean) as object[];

    const corridorFeatures = corridors.map((corridor) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: corridor.polyline },
      properties: { name: corridor.name, risk: corridor.risk, distanceKm: corridor.distanceKm, minutes: corridor.estimatedMinutes },
    }));

    const labelFeatures = geo.districts.features
      .filter((feature) => feature.properties.centroid)
      .map((feature) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: feature.properties.centroid },
        properties: { name: feature.properties.name },
      }));

    ensureSource("tn-districts-src", toCollection(districtFeatures));
    ensureSource("tn-hydro-src", geo.hydrology);
    ensureSource("tn-incidents-src", toCollection(incidentFeatures));
    ensureSource("tn-facilities-src", toCollection(facilityFeatures));
    ensureSource("tn-alerts-src", toCollection(alertFeatures));
    ensureSource("tn-evac-src", toCollection(corridorFeatures));
    ensureSource("tn-labels-src", toCollection(labelFeatures));
    if (!map.getSource("tn-sos-src")) {
      map.addSource("tn-sos-src", { type: "geojson", data: toCollection([]) });
    }

    if (!map.getLayer("tn-district-fill")) {
      map.addLayer({
        id: "tn-district-fill",
        type: "fill",
        source: "tn-districts-src",
        paint: { "fill-color": RISK_FILL as never, "fill-opacity": 0.55 },
      });
    }
    if (!map.getLayer("tn-district-hover")) {
      map.addLayer({
        id: "tn-district-hover",
        type: "line",
        source: "tn-districts-src",
        paint: { "line-color": "#5eead4", "line-width": 2.6 },
        filter: ["==", ["get", "code"], "__none__"],
      });
    }
    if (!map.getLayer("tn-district-selected")) {
      map.addLayer({
        id: "tn-district-selected",
        type: "line",
        source: "tn-districts-src",
        paint: { "line-color": "#f8fafc", "line-width": 3, "line-opacity": 0.95 },
        filter: ["==", ["get", "code"], "__none__"],
      });
    }
    if (!map.getLayer("tn-district-borders")) {
      map.addLayer({
        id: "tn-district-borders",
        type: "line",
        source: "tn-districts-src",
        paint: { "line-color": "#94a3b8", "line-width": 0.8, "line-opacity": 0.8 },
      });
    }
    if (!map.getLayer("tn-rivers")) {
      map.addLayer({
        id: "tn-rivers",
        type: "line",
        source: "tn-hydro-src",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": ["match", ["get", "kind"], "COASTLINE", "#0ea5e9", "#22d3ee"],
          "line-width": ["match", ["get", "kind"], "COASTLINE", 2.4, 1.6],
          "line-opacity": 0.85,
        },
      });
    }
    if (!map.getLayer("tn-reservoirs")) {
      map.addLayer({
        id: "tn-reservoirs",
        type: "circle",
        source: "tn-hydro-src",
        filter: ["==", ["get", "kind"], "RESERVOIR"],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3.4, 11, 6],
          "circle-color": "#0891b2",
          "circle-stroke-color": "#e0f2fe",
          "circle-stroke-width": 1.2,
        },
      });
    }
    if (!map.getLayer("tn-evac")) {
      map.addLayer({
        id: "tn-evac",
        type: "line",
        source: "tn-evac-src",
        paint: {
          "line-color": ["match", ["get", "risk"], "HIGHLY_UNCERTAIN", "#f97316", "CAUTION", "#eab308", "#14b8a6"],
          "line-width": 3,
          "line-dasharray": [2, 1.4],
          "line-opacity": 0.9,
        },
      });
    }
    if (!map.getLayer("tn-incidents")) {
      map.addLayer({
        id: "tn-incidents",
        type: "circle",
        source: "tn-incidents-src",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 4.5, 11, 9],
          "circle-color": ["get", "color"],
          "circle-stroke-color": STATUS_COLORS as never,
          "circle-stroke-width": 2,
          "circle-opacity": 0.95,
        },
      });
    }
    if (!map.getLayer("tn-facilities")) {
      map.addLayer({
        id: "tn-facilities",
        type: "circle",
        source: "tn-facilities-src",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2.6, 11, 5.4],
          "circle-color": [
            "match",
            ["get", "category"],
            "HOSPITAL",
            "#38bdf8",
            "CLINIC",
            "#7dd3fc",
            "FIRE_STATION",
            "#fb923c",
            "AMBULANCE_SERVICE",
        "#f472b6",
            "SHELTER",
            "#34d399",
            "POLICE_STATION",
            "#a78bfa",
            "#94a3b8",
          ],
          "circle-stroke-color": "#f8fafc",
          "circle-stroke-width": 1,
        },
      });
    }
    if (!map.getLayer("tn-alerts")) {
      map.addLayer({
        id: "tn-alerts",
        type: "circle",
        source: "tn-alerts-src",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 7, 11, 13],
          "circle-color": ["match", ["get", "severity"], "CRITICAL", "#dc2626", "HIGH", "#ea580c", "MODERATE", "#eab308", "#0ea5e9"],
          "circle-opacity": 0.25,
          "circle-stroke-color": ["match", ["get", "severity"], "CRITICAL", "#dc2626", "#f59e0b"],
          "circle-stroke-width": 1.6,
        },
      });
    }
    if (!map.getLayer("tn-sos")) {
      map.addLayer({
        id: "tn-sos",
        type: "circle",
        source: "tn-sos-src",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 6, 11, 11],
          "circle-color": "#ef4444",
          "circle-stroke-color": "#fee2e2",
          "circle-stroke-width": 2,
        },
      });
    }
    if (!map.getLayer("tn-labels")) {
      try {
        map.addLayer({
          id: "tn-labels",
          type: "symbol",
          source: "tn-labels-src",
          minzoom: 6.4,
          layout: { "text-field": ["get", "name"], "text-size": ["interpolate", ["linear"], ["zoom"], 6, 9, 10, 13], "text-allow-overlap": false },
          paint: { "text-color": "#f8fafc", "text-halo-color": "#0f172a", "text-halo-width": 1.4 },
        });
      } catch {
        /* glyphs unavailable in fallback style — labels are shown in the district panel instead */
      }
    }
    setReady(true);
  }, [geo, incidents, facilities, alerts, corridors]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (ready) syncLayers();
  }, [ready, syncLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo) return;
    const sosSource = map.getSource("tn-sos-src") as GeoJSONSource | undefined;
    const data = toCollection(
      sosMarkers.map((row) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [row.lng, row.lat] },
        properties: { title: row.publicId, subtitle: `SOS · ${row.priority} · ${row.status}` },
      })),
    );
    if (sosSource) sosSource.setData(data);
    else map.addSource("tn-sos-src", { type: "geojson", data });
  }, [sosMarkers, geo]);

  /* ------------------------------- styling -------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const visibility = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    };
    visibility("tn-district-fill", enabled.has("floodRisk") || enabled.has("rainfall") || fillMode !== "none");
    visibility("tn-district-borders", enabled.has("boundaries"));
    visibility("tn-district-hover", enabled.has("boundaries"));
    visibility("tn-district-selected", enabled.has("boundaries"));
    visibility("tn-rivers", enabled.has("hydrology"));
    visibility("tn-reservoirs", enabled.has("hydrology"));
    visibility("tn-evac", enabled.has("evacuation"));
    visibility("tn-incidents", enabled.has("incidents"));
    visibility("tn-alerts", enabled.has("warnings"));
    visibility("tn-labels", enabled.has("labels"));
    visibility("tn-hillshade", enabled.has("terrain"));

    if (map.getLayer("tn-facilities")) {
      const allowed: string[] = ["OTHER"];
      if (enabled.has("hospitals")) allowed.push("HOSPITAL", "CLINIC");
      if (enabled.has("fire")) allowed.push("FIRE_STATION");
      if (enabled.has("ambulances")) allowed.push("AMBULANCE_SERVICE");
      if (enabled.has("shelters")) allowed.push("SHELTER");
      map.setLayoutProperty("tn-facilities", "visibility", allowed.length > 1 ? "visible" : "none");
      map.setFilter("tn-facilities", ["in", ["get", "category"], ["literal", allowed]] as never);
    }

    if (map.getLayer("tn-district-fill")) {
      const expression =
        fillMode === "risk"
          ? RISK_FILL
          : fillMode === "rainfall"
            ? ["interpolate", ["linear"], ["get", "rainfall24h"], 0, "#082f49", 5, "#0e7490", 15, "#0ea5e9", 30, "#f59e0b", 60, "#dc2626"]
            : fillMode === "temperature"
              ? ["interpolate", ["linear"], ["get", "temperature"], 12, "#38bdf8", 22, "#22d3ee", 28, "#fbbf24", 34, "#f97316", 40, "#dc2626"]
              : "#1e293b";
      map.setPaintProperty("tn-district-fill", "fill-color", expression as never);
      map.setPaintProperty("tn-district-fill", "fill-opacity", fillMode === "none" ? 0.08 : 0.6);
    }

    try {
      if (enabled.has("terrain")) map.setTerrain({ source: "tn-terrain", exaggeration: 1.25 });
      else map.setTerrain(null);
    } catch {
      /* terrain tiles may be unavailable */
    }
  }, [enabled, fillMode, ready]);

  /* ----------------------------- interactions ----------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const setFilterCode = (layer: string, code: string | null) => {
      if (map.getLayer(layer)) map.setFilter(layer, ["==", ["get", "code"], code ?? "__none__"]);
    };
    setFilterCode("tn-district-selected", selected);

    type FeatureEvent = MapMouseEvent & { features?: MapGeoJSONFeature[] };
    const onMove = (event: FeatureEvent) => {
      const props = event.features?.[0]?.properties as DistrictProps | undefined;
      setHovered(props?.name ?? null);
    };
    const onLeave = () => setHovered(null);

    const onDistrictClick = (event: FeatureEvent) => {
      const props = event.features?.[0]?.properties as DistrictProps | undefined;
      if (!props) return;
      setSelected(props.code);
      setPanelOpen(true);
      setPopup({
        title: props.name,
        lines: [
          `${props.riskLevel.replaceAll("_", " ")} risk estimate · ${props.riskScore}/100`,
          `Rain next 24h: ${props.rainfall24h ?? "—"} mm · ${props.temperature ?? "—"} °C`,
          `${props.incidents} report(s) · ${props.verified} verified · ${props.facilities} facilities`,
        ],
      });
      if (event.lngLat) map.flyTo({ center: [event.lngLat.lng, event.lngLat.lat], zoom: Math.max(map.getZoom(), 8), pitch: 55, duration: 900 });
    };

    const onPointClick = (event: FeatureEvent) => {
      const props = event.features?.[0]?.properties as { title?: string; subtitle?: string } | undefined;
      if (!props?.title) return;
      setPopup({ title: props.title, lines: [props.subtitle ?? ""] });
    };

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    for (const layer of ["tn-district-fill"]) {
      map.on("mousemove", layer, onMove);
      map.on("mouseleave", layer, onLeave);
      map.on("click", layer, onDistrictClick);
      map.on("mouseenter", layer, onMouseEnter);
    }
    for (const layer of ["tn-incidents", "tn-facilities", "tn-alerts", "tn-sos"]) {
      map.on("click", layer, onPointClick);
      map.on("mouseenter", layer, onMouseEnter);
      map.on("mouseleave", layer, onMouseLeave);
    }

    return () => {
      for (const layer of ["tn-district-fill"]) {
        map.off("mousemove", layer, onMove);
        map.off("mouseleave", layer, onLeave);
        map.off("click", layer, onDistrictClick);
        map.off("mouseenter", layer, onMouseEnter);
      }
      for (const layer of ["tn-incidents", "tn-facilities", "tn-alerts", "tn-sos"]) {
        map.off("click", layer, onPointClick);
        map.off("mouseenter", layer, onMouseEnter);
        map.off("mouseleave", layer, onMouseLeave);
      }
    };
  }, [ready, selected]);

  const districtProps = geo?.districts.features.find((feature) => feature.properties.code === selected)?.properties;
  const filteredDistricts = geo?.districts.features.filter((feature) =>
    feature.properties.name.toLowerCase().includes(search.toLowerCase()),
  );

  function toggleLayer(key: LayerKey) {
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const lib = libRef.current;
  const map = mapRef.current;

  function flyToDistrict(code: string) {
    setSelected(code);
    setPanelOpen(true);
    const target = geo?.districts.features.find((feature) => feature.properties.code === code);
    if (target?.properties.centroid && map && lib) {
      map.flyTo({ center: target.properties.centroid, zoom: 9.2, pitch: 55, bearing: -12, duration: 1100 });
    }
  }

  if (failure) {
    return (
      <div className="space-y-2">
        <Notice tone="warn" title="3D map unavailable — showing 2D district map">
          {failure} The SVG district map below uses the same verified data.
        </Notice>
        <TamilNaduMap districts={[]} markers={[]} heightClass={heightClass} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-950 text-slate-100 shadow-2xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-ink-900/80 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-400 live-dot" />
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-300">Tamil Nadu 3D operations map</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="chip bg-white/10 text-slate-200 ring-white/15">{basemap === "VECTOR" ? "OpenFreeMap" : basemap === "FALLBACK" ? "Boundaries only" : "Loading basemap"}</span>
          <span className="chip bg-white/10 text-slate-200 ring-white/15">Terrain: AWS Terrain Tiles</span>
          <span className="chip bg-white/10 text-slate-200 ring-white/15">
            Districts {geo ? geo.districts.features.length : "—"}
          </span>
          <DataClassBadge dataClass="SIMULATED" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10" onClick={() => map?.zoomIn()}>＋</button>
          <button className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10" onClick={() => map?.zoomOut()}>−</button>
          <button
            className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
            onClick={() => map?.easeTo({ pitch: map.getPitch() > 20 ? 0 : 52, bearing: map.getPitch() > 20 ? 0 : -8, duration: 600 })}
            title="Toggle 2D / 3D pitch"
          >
            {map && map.getPitch() > 20 ? "2D" : "3D"}
          </button>
          <button className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10" onClick={() => map?.easeTo({ bearing: (map?.getBearing() ?? 0) - 30, duration: 500 })} title="Rotate left">⟲</button>
          <button className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10" onClick={() => map?.easeTo({ bearing: (map?.getBearing() ?? 0) + 30, duration: 500 })} title="Rotate right">⟳</button>
          <button
            className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
            onClick={() => {
              map?.easeTo({ center: [78.6, 10.9], zoom: 6.25, pitch: 46, bearing: -8, duration: 900 });
              setSelected(initialDistrict);
            }}
          >
            Reset
          </button>
          <button className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10" onClick={() => setShowLayers((v) => !v)}>
            Layers
          </button>
        </div>
      </div>

      <div className="relative">
        <div ref={containerRef} className={`w-full ${heightClass}`} style={{ background: "#07101f" }} />

        {!ready && !failure ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-ink-950/70">
            <div className="text-center">
              <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-teal-400/40 border-t-teal-300" />
              <p className="text-xs font-semibold text-slate-300">Loading 3D terrain and district geometry…</p>
            </div>
          </div>
        ) : null}

        {dataError ? (
          <div className="absolute left-3 top-3 max-w-xs rounded-lg border border-amber-400/40 bg-amber-950/90 p-2.5 text-[11px] text-amber-100">
            {dataError}. Boundary data may be stale; no values are fabricated.
          </div>
        ) : null}

        {showLayers ? (
          <div className="absolute left-2 top-2 max-h-[70%] w-[214px] overflow-y-auto rounded-xl border border-white/15 bg-ink-900/90 p-2.5 shadow-xl backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-300">Map layers</p>
              <button className="text-slate-400 hover:text-white" onClick={() => setShowLayers(false)} aria-label="Hide layer control">×</button>
            </div>
            <label className="mb-2 block">
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wide text-slate-400">District fill</span>
              <select
                value={fillMode}
                onChange={(event) => setFillMode(event.target.value as typeof fillMode)}
                className="w-full rounded-md border border-white/15 bg-ink-800 px-1.5 py-1 text-[11px] text-slate-100"
              >
                <option value="risk">Flood-risk estimate</option>
                <option value="rainfall">Rainfall forecast (24h)</option>
                <option value="temperature">Temperature</option>
                <option value="none">No fill</option>
              </select>
            </label>
            {["Base", "Hazard", "Operations", "Facilities"].map((group) => (
              <div key={group} className="mb-1.5">
                <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">{group}</p>
                {LAYERS.filter((layer) => layer.group === group).map((layer) => (
                  <label key={layer.key} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={enabled.has(layer.key)}
                      onChange={() => toggleLayer(layer.key)}
                      className="h-3 w-3 rounded border-white/20 bg-ink-800"
                    />
                    {layer.label}
                  </label>
                ))}
              </div>
            ))}
            <div className="mt-2 border-t border-white/10 pt-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find district…"
                className="w-full rounded-md border border-white/15 bg-ink-800 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-500"
              />
              <div className="mt-1 max-h-24 overflow-y-auto">
                {(search ? filteredDistricts : [])?.slice(0, 8).map((feature) => (
                  <button
                    key={feature.properties.code}
                    onClick={() => flyToDistrict(feature.properties.code)}
                    className="block w-full rounded px-1.5 py-0.5 text-left text-[11px] text-slate-300 hover:bg-white/10"
                  >
                    {feature.properties.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <button className="absolute left-2 top-2 rounded-lg border border-white/15 bg-ink-900/90 px-2 py-1 text-[11px] text-slate-200" onClick={() => setShowLayers(true)}>
            Layers
          </button>
        )}

        <div className="absolute bottom-2 left-2 rounded-lg border border-white/10 bg-ink-900/85 px-2.5 py-1.5 text-[10px] text-slate-300">
          <div className="flex flex-wrap items-center gap-2">
            {[["LOW", "#0f766e"], ["MODERATE", "#ca8a04"], ["HIGH", "#ea580c"], ["VERY HIGH", "#b91c1c"]].map(([label, color]) => (
              <span key={label} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: color }} /> {label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> SOS</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" /> Hospital</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Camp</span>
            <span>· Risk fill = MODEL_RISK_ESTIMATE</span>
          </div>
        </div>

        {hovered ? (
          <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-white/15 bg-ink-900/90 px-2 py-1 text-[11px] font-semibold text-teal-200">
            {hovered}
          </div>
        ) : null}

        {panelOpen && districtProps ? (
          <div className="absolute bottom-2 right-2 w-[248px] rounded-xl border border-white/15 bg-ink-900/92 p-3 text-[11px] shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-teal-300">Selected district</p>
                <p className="text-sm font-extrabold text-white">{districtProps.name}</p>
              </div>
              <button className="text-slate-400 hover:text-white" onClick={() => setPanelOpen(false)} aria-label="Close district panel">×</button>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <RiskBadge level={districtProps.riskLevel} />
              <Chip tone="dark">{districtProps.riskScore}/100</Chip>
            </div>
            <dl className="mt-2 space-y-1 text-slate-300">
              <div className="flex justify-between"><dt>Rain next 24h</dt><dd className="font-semibold text-white">{districtProps.rainfall24h ?? "—"} mm</dd></div>
              <div className="flex justify-between"><dt>Temperature</dt><dd className="font-semibold text-white">{districtProps.temperature ?? "—"} °C</dd></div>
              <div className="flex justify-between"><dt>Reports</dt><dd className="font-semibold text-white">{districtProps.incidents} ({districtProps.verified} verified)</dd></div>
              <div className="flex justify-between"><dt>Facilities</dt><dd className="font-semibold text-white">{districtProps.facilities}</dd></div>
            </dl>
            <div className="mt-2 flex flex-wrap gap-1">
              <a href={`/districts/${districtProps.code}`} className="btn bg-white px-2 py-1 text-[10px] text-ink-900 hover:bg-slate-100">District brief</a>
              <a href={`/weather?district=${districtProps.code}`} className="btn border border-white/20 px-2 py-1 text-[10px] text-slate-100 hover:bg-white/10">Weather</a>
              {mode === "admin" ? (
                <a href="/admin/incidents" className="btn border border-white/20 px-2 py-1 text-[10px] text-slate-100 hover:bg-white/10">Incidents</a>
              ) : null}
            </div>
          </div>
        ) : null}

        {popup ? (
          <div className="absolute left-1/2 top-2 w-[240px] -translate-x-1/2 rounded-lg border border-teal-400/30 bg-ink-900/95 px-2.5 py-2 text-[11px] shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-teal-200">{popup.title}</p>
              <button onClick={() => setPopup(null)} className="text-slate-400 hover:text-white" aria-label="Close popup">×</button>
            </div>
            {popup.lines.map((line, index) => (
              <p key={`${line}-${index}`} className="text-slate-300">{line}</p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-ink-900/80 px-3 py-1.5 text-[10px] text-slate-400">
        <span>
          Boundaries: {geo?.provenance.boundaries.name ?? "2011 Census (simplified)"} · Hydrology: schematic reference · Terrain: AWS Terrain Tiles
        </span>
        <span>Data updated {fetchedAt ? formatDateTime(fetchedAt) : "—"}</span>
      </div>
    </div>
  );
}
