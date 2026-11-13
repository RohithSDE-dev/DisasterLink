"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, MapGeoJSONFeature, MapMouseEvent, Map as MapLibreMap } from "maplibre-gl";
import { DISTRICTS } from "@/lib/districts";
import { useApi } from "@/components/interactive";
import { Chip, DataClassBadge, Notice, SourceBadge, formatDateTime } from "@/components/ui";
import {
  FACILITY_GROUPS,
  FACILITY_GROUP_MAP,
  INCIDENT_CATEGORY_COLORS,
  LAYER_GROUPS,
  MAP_BASEMAP,
  MAP_DATASETS,
  MAP_LAYERS,
  RISK_COLORS,
  bboxOf,
  type FacilityGroupId,
  type MapLayerDefinition,
} from "@/lib/map-data";

/* --------------------------------- types --------------------------------- */

type DistrictProps = {
  code: string;
  name: string;
  region: string;
  centroid: [number, number];
  elevationM: number | null;
  hasPolygon: boolean;
  riskLevel: string;
  riskScore: number | null;
  riskExplanation: string | null;
  rainfall24h: number | null;
  rainNow: number | null;
  temperature: number | null;
  apparentTemperature: number | null;
  condition: string | null;
  precipProbability: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGusts: number | null;
  humidity: number | null;
  pressure: number | null;
  weatherAvailable: boolean;
  incidents: number;
  verified: number;
  pending: number;
  facilities: number;
  facilityCounts: Record<FacilityGroupId, number>;
};

type DistrictFeature = { type: "Feature"; geometry: { type: string; coordinates: unknown }; properties: DistrictProps };

type DatasetMeta = {
  id: string;
  name: string;
  source: string;
  url: string;
  coverage: string;
  format: string;
  updated: string;
  sourceClass: string;
  limitations: string;
};

type GeoPayload = {
  state: { type: "FeatureCollection"; features: { geometry: { type: string; coordinates: unknown } }[]; source?: { name: string; url: string; limitations?: string } };
  districts: { type: "FeatureCollection"; features: DistrictFeature[] };
  districtsWithoutPolygon: { code: string; name: string; lat: number; lng: number; reason: string }[];
  hydrology: unknown;
  landmarks: { name: string; kind: string; lat: number; lng: number }[];
  elevation: {
    available: boolean;
    sourceName: string;
    sourceUrl: string;
    resolution: string;
    fetchedAt: string;
    error?: string;
    peaks: { name: string; elevationM: number | null }[];
    minM: number | null;
    maxM: number | null;
  };
  basemap: { style: string; attribution: string; terrainTiles: string[]; terrainAttribution: string; apiKeyRequired: boolean; note: string };
  datasets: DatasetMeta[];
  layers: MapLayerDefinition[];
  provenance: { boundaries: { name: string; url: string; note?: string }; hydrology: { name: string; url: string; note?: string }; state?: { name: string; url: string; limitations?: string }; districts: number };
  validation: {
    expectedDistricts: number;
    polygonDistricts: number;
    missingPolygonDistricts: string[];
    invalidRings: number;
    outOfBoundsVertices: number;
    totalVertices: number;
    valid: boolean;
    checkedAt: string;
  };
  generatedAt: string;
};

type FacilityMarker = {
  id: number;
  name: string;
  category: string;
  facilityClass: string;
  group: FacilityGroupId;
  districtCode: string;
  districtName: string;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
  availabilityStatus: string;
  availabilityNote: string | null;
  capacity: number | null;
  occupancy: number | null;
  capacityDataClass: string;
  remaining: number | null;
  verificationStatus: string;
  isOfficialShelter: boolean;
  isActive: boolean;
  dataClass: string;
  sourceName: string | null;
  sourceUrl: string | null;
  updatedAt: string;
};

type FacilityPayload = { markers: FacilityMarker[]; groupCounts: Record<string, number>; total: number; skippedWithoutCoordinates: number };

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

type AlertRow = { id: number; title: string; severity: string; districtCode: string | null; sourceClass: string; isActive: boolean; category: string };

type Corridor = { id: string; name: string; polyline: [number, number][]; risk: string; distanceKm: number; estimatedMinutes: number; hazardFlags: unknown[] };

type FeatureEvent = MapMouseEvent & { features?: MapGeoJSONFeature[] };

const STATE_VIEW = { center: [78.6, 10.9] as [number, number], zoom: 6.2, pitch: 45, bearing: -8 };

/* -------------------------------- helpers -------------------------------- */

function bearingLabel(degrees: number): string {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round(degrees / 22.5) % 16];
}

function collection(features: object[]) {
  return { type: "FeatureCollection", features } as unknown as Parameters<GeoJSONSource["setData"]>[0];
}

function initialLayerState(): Record<string, boolean> {
  return Object.fromEntries(MAP_LAYERS.map((layer) => [layer.id, layer.available && layer.on]));
}

const WEATHER_FILL_LAYERS = ["floodRisk", "rainfall", "temperature", "precipProbability"] as const;
type WeatherFillKey = (typeof WEATHER_FILL_LAYERS)[number];

const FILL_EXPRESSIONS: Record<WeatherFillKey, unknown> = {
  floodRisk: ["match", ["get", "riskLevel"], "VERY_HIGH", RISK_COLORS.VERY_HIGH, "HIGH", RISK_COLORS.HIGH, "MODERATE", RISK_COLORS.MODERATE, "LOW", RISK_COLORS.LOW, RISK_COLORS.UNKNOWN],
  rainfall: ["interpolate", ["linear"], ["coalesce", ["get", "rainfall24h"], 0], 0, "#082f49", 5, "#0e7490", 15, "#0ea5e9", 30, "#f59e0b", 60, "#dc2626"],
  temperature: ["interpolate", ["linear"], ["coalesce", ["get", "temperature"], 20], 12, "#38bdf8", 22, "#22d3ee", 28, "#fbbf24", 34, "#f97316", 40, "#dc2626"],
  precipProbability: ["interpolate", ["linear"], ["coalesce", ["get", "precipProbability"], 0], 0, "#0f172a", 25, "#164e63", 50, "#0e7490", 75, "#0284c7", 100, "#1d4ed8"],
};

function activeWeatherFill(layers: Record<string, boolean>): WeatherFillKey | null {
  return WEATHER_FILL_LAYERS.find((key) => layers[key]) ?? null;
}

function initialGroupState(): Record<FacilityGroupId, boolean> {
  return Object.fromEntries(FACILITY_GROUPS.map((group) => [group.id, true])) as Record<FacilityGroupId, boolean>;
}

/* -------------------------------- component ------------------------------- */

export default function DisasterMap({
  mode = "citizen",
  initialDistrict = null,
  className = "",
}: {
  mode?: "citizen" | "admin";
  initialDistrict?: string | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const installedRef = useRef(false);

  const geoApi = useApi<GeoPayload>("/api/geo");
  const facilityApi = useApi<FacilityPayload>("/api/facilities/map");
  const incidentApi = useApi<{ incidents: IncidentRow[] }>(mode === "admin" ? "/api/incidents?scope=admin&limit=400" : "/api/incidents?limit=400");
  const alertApi = useApi<{ alerts: AlertRow[] }>("/api/alerts");
  const evacApi = useApi<{ corridors: Corridor[] }>("/api/evacuation");

  const [layers, setLayers] = useState<Record<string, boolean>>(initialLayerState);
  const [groups, setGroups] = useState<Record<FacilityGroupId, boolean>>(initialGroupState);
  const [exaggeration, setExaggeration] = useState(MAP_BASEMAP.defaultExaggeration);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(initialDistrict);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [hoveredDistrict, setHoveredDistrict] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);
  const [basemap, setBasemap] = useState<"LOADING" | "VECTOR" | "FALLBACK">("LOADING");
  const [mapError, setMapError] = useState<string | null>(null);
  const [dataNotice, setDataNotice] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [showDatasets, setShowDatasets] = useState(false);
  const [is3D, setIs3D] = useState(true);
  const [incidentFilter, setIncidentFilter] = useState<{ category: string; severity: string; district: string; status: string }>({
    category: "ALL",
    severity: "ALL",
    district: "ALL",
    status: "ALL",
  });

  const districts = geoApi.data?.districts.features ?? [];
  const markers = facilityApi.data?.markers ?? [];
  const incidents = incidentApi.data?.incidents ?? [];
  const alerts = (alertApi.data?.alerts ?? []).filter((alert) => alert.isActive);
  const corridors = evacApi.data?.corridors ?? [];

  const selectedDistrictData = useMemo(
    () => districts.find((feature) => feature.properties.code === selectedDistrict)?.properties ?? null,
    [districts, selectedDistrict],
  );
  const selectedFacility = useMemo(() => markers.find((marker) => marker.id === selectedFacilityId) ?? null, [markers, selectedFacilityId]);

  useEffect(() => {
    if (geoApi.error) setDataNotice(`Geographic layer API unavailable: ${geoApi.error}. The map is shown without invented geometry.`);
  }, [geoApi.error]);

  /* ---------------------------- map initialisation -------------------------- */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    let disposed = false;

    (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (disposed) return;
        let style: string | object = MAP_BASEMAP.styleUrl;
        let vector = true;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const probe = await fetch(MAP_BASEMAP.styleUrl, { signal: controller.signal });
          clearTimeout(timer);
          if (!probe.ok) throw new Error(`basemap ${probe.status}`);
        } catch {
          vector = false;
          style = {
            version: 8,
            name: "DisasterLink boundary-only fallback",
            sources: {},
            layers: [{ id: "bg", type: "background", paint: { "background-color": "#060b16" } }],
          };
        }
        if (disposed) return;
        setBasemap(vector ? "VECTOR" : "FALLBACK");

        const map = new maplibregl.Map({
          container,
          style: style as never,
          center: STATE_VIEW.center,
          zoom: STATE_VIEW.zoom,
          pitch: STATE_VIEW.pitch,
          bearing: STATE_VIEW.bearing,
          minZoom: 5.4,
          maxZoom: 16,
          maxPitch: 75,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
        map.touchZoomRotate.enableRotation();

        map.on("load", () => {
          if (disposed) return;
          try {
            map.addSource("tn-terrain", {
              type: "raster-dem",
              tiles: MAP_BASEMAP.terrainTiles,
              encoding: "terrarium",
              tileSize: 256,
              maxzoom: 13,
              attribution: MAP_BASEMAP.terrainAttribution,
            });
            map.addLayer({
              id: "tn-hillshade",
              type: "hillshade",
              source: "tn-terrain",
              paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#020617", "hillshade-highlight-color": "#1e293b" },
            });
            map.setTerrain({ source: "tn-terrain", exaggeration: MAP_BASEMAP.defaultExaggeration });
          } catch {
            // Terrain remains unavailable; the UI keeps reporting the fallback state.
          }
          setReady(true);
        });

        map.on("error", (event) => {
          if (map.loaded()) return;
          const message = (event as unknown as { error?: { message?: string } }).error?.message;
          if (message && /webgl/i.test(message)) setMapError("WebGL is unavailable in this browser, so the 3D map cannot render.");
        });
      } catch (error) {
        setMapError(error instanceof Error ? error.message : "The map library could not be initialised.");
      }
    })();

    return () => {
      disposed = true;
      installedRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  /* ------------------------------ layer install ----------------------------- */
  const installLayers = useCallback(() => {
    const map = mapRef.current;
    const payload = geoApi.data;
    if (!map || !payload || !map.isStyleLoaded()) return;
    const safeLayer = (layer: Parameters<MapLibreMap["addLayer"]>[0]) => {
      try {
        if (!map.getLayer((layer as { id: string }).id)) map.addLayer(layer);
      } catch {
        // Symbol layers need glyphs; the fallback style has none, so labels are skipped.
      }
    };
    const ensureSource = (id: string, data: Parameters<GeoJSONSource["setData"]>[0], options?: Record<string, unknown>) => {
      const source = map.getSource(id) as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else map.addSource(id, { type: "geojson", data, ...options } as never);
    };

    ensureSource("state-src", payload.state as never);
    ensureSource("district-src", payload.districts as never);
    ensureSource("hydro-src", payload.hydrology as never);
    ensureSource("evac-src", collection(corridors.map((corridor) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: corridor.polyline },
      properties: { name: corridor.name, risk: corridor.risk, distanceKm: corridor.distanceKm },
    }))));
    ensureSource("alert-src", collection([]));
    ensureSource("incident-src", collection([]));
    ensureSource("fac-src", collection([]), { cluster: true, clusterRadius: 46, clusterMaxZoom: 9 });
    ensureSource("elev-src", collection([]));
    ensureSource("noPoly-src", collection([]));

    safeLayer({ id: "state-glow", type: "line", source: "state-src", paint: { "line-color": "#2dd4bf", "line-width": 10, "line-opacity": 0.14, "line-blur": 2 } });
    safeLayer({ id: "district-fill", type: "fill", source: "district-src", paint: { "fill-color": ["match", ["get", "riskLevel"], "VERY_HIGH", RISK_COLORS.VERY_HIGH, "HIGH", RISK_COLORS.HIGH, "MODERATE", RISK_COLORS.MODERATE, "LOW", RISK_COLORS.LOW, RISK_COLORS.UNKNOWN] as never, "fill-opacity": 0.55 } });
    safeLayer({ id: "hydro-lines", type: "line", source: "hydro-src", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": ["match", ["get", "kind"], "COASTLINE", "#0ea5e9", "#22d3ee"], "line-width": ["match", ["get", "kind"], "COASTLINE", 2.6, 1.6], "line-opacity": 0.85 } });
    safeLayer({ id: "hydro-reservoirs", type: "circle", source: "hydro-src", filter: ["==", ["get", "kind"], "RESERVOIR"], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3.2, 12, 6.5], "circle-color": "#0891b2", "circle-stroke-color": "#e0f2fe", "circle-stroke-width": 1.2 } });
    ensureSource("wind-src", collection([]));
    safeLayer({ id: "wind-arrows", type: "symbol", source: "wind-src", layout: { "icon-image": "wind-arrow", "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.55, 10, 0.95], "icon-rotate": ["get", "degrees"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-opacity": ["get", "opacity"] } });
    safeLayer({ id: "evac-lines", type: "line", source: "evac-src", paint: { "line-color": ["match", ["get", "risk"], "HIGHLY_UNCERTAIN", "#f97316", "CAUTION", "#eab308", "#14b8a6"], "line-width": 2.6, "line-dasharray": [2, 1.4], "line-opacity": 0.9 } });
    safeLayer({ id: "alert-areas", type: "circle", source: "alert-src", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 9, 12, 18], "circle-color": ["match", ["get", "severity"], "CRITICAL", "#dc2626", "HIGH", "#ea580c", "MODERATE", "#eab308", "#0ea5e9"], "circle-opacity": 0.18, "circle-stroke-width": 1.4, "circle-stroke-color": "#f59e0b" } });
    safeLayer({ id: "incident-points", type: "circle", source: "incident-src", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 4.5, 12, 8.5], "circle-color": ["get", "color"], "circle-stroke-width": 1.8, "circle-stroke-color": ["match", ["get", "status"], "VERIFIED", "#22c55e", "RESOLVED", "#0d9488", "UNDER_REVIEW", "#f59e0b", "#94a3b8"], "circle-opacity": 0.95 } });
    safeLayer({ id: "fac-clusters", type: "circle", source: "fac-src", filter: ["has", "point_count"], paint: { "circle-color": "#0e7490", "circle-radius": ["step", ["get", "point_count"], 13, 6, 17, 14, 21], "circle-stroke-color": "#99f6e4", "circle-stroke-width": 1.4, "circle-opacity": 0.92 } });
    safeLayer({ id: "fac-cluster-count", type: "symbol", source: "fac-src", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"] as never, "text-size": 10 }, paint: { "text-color": "#ecfeff" } });
    safeLayer({ id: "fac-points", type: "circle", source: "fac-src", filter: ["!", ["has", "point_count"]], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3.4, 11, 7], "circle-color": ["get", "color"], "circle-stroke-color": "#f8fafc", "circle-stroke-width": 1.3 } });
    safeLayer({ id: "fac-labels", type: "symbol", source: "fac-src", filter: ["!", ["has", "point_count"]], minzoom: 9.5, layout: { "text-field": ["get", "glyph"] as never, "text-size": 8, "text-font": ["Noto Sans Regular"] as never }, paint: { "text-color": "#04121f" } });
    safeLayer({ id: "district-hover", type: "line", source: "district-src", paint: { "line-color": "#5eead4", "line-width": 2.4 }, filter: ["==", ["get", "code"], "__none__"] });
    safeLayer({ id: "district-selected", type: "line", source: "district-src", paint: { "line-color": "#f8fafc", "line-width": 3.2 }, filter: ["==", ["get", "code"], "__none__"] });
    safeLayer({ id: "district-borders", type: "line", source: "district-src", paint: { "line-color": "#94a3b8", "line-width": 0.8, "line-opacity": 0.75 } });
    safeLayer({ id: "district-labels", type: "symbol", source: "district-src", minzoom: 6.2, layout: { "text-field": ["get", "name"] as never, "text-size": ["interpolate", ["linear"], ["zoom"], 6, 9, 10, 13] as never, "text-allow-overlap": false }, paint: { "text-color": "#f8fafc", "text-halo-color": "#0f172a", "text-halo-width": 1.5 } });
    safeLayer({ id: "elevation-labels", type: "symbol", source: "elev-src", minzoom: 6.5, layout: { "text-field": ["get", "label"] as never, "text-size": 9, "text-offset": [0, 0.9] as never }, paint: { "text-color": "#a7f3d0", "text-halo-color": "#04121f", "text-halo-width": 1.2 } });
    safeLayer({ id: "no-poly-points", type: "circle", source: "noPoly-src", paint: { "circle-radius": 5, "circle-color": "#f59e0b", "circle-stroke-color": "#0f172a", "circle-stroke-width": 1.4 } });

    installedRef.current = true;
    setReady(true);
  }, [geoApi.data, corridors]);

  useEffect(() => {
    if (ready) installLayers();
  }, [ready, installLayers]);

  /* ----------------------------- data → sources ---------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    const payload = geoApi.data;
    if (!map || !payload || !installedRef.current) return;
    const districtSource = map.getSource("district-src") as GeoJSONSource | undefined;
    if (districtSource) districtSource.setData(payload.districts as never);

    const noPoly = map.getSource("noPoly-src") as GeoJSONSource | undefined;
    if (noPoly) {
      noPoly.setData(
        collection(
          payload.districtsWithoutPolygon.map((entry) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [entry.lng, entry.lat] },
            properties: { name: entry.name, reason: entry.reason },
          })),
        ),
      );
    }

    const elevation = map.getSource("elev-src") as GeoJSONSource | undefined;
    if (elevation) {
      const districtPoints = payload.districts.features
        .filter((feature) => feature.properties.elevationM !== null)
        .map((feature) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: feature.properties.centroid },
          properties: { label: `${feature.properties.name} · ${feature.properties.elevationM} m`, name: feature.properties.name },
        }));
      const peakPoints = payload.elevation.peaks
        .filter((peak) => peak.elevationM !== null)
        .map((peak) => {
          const landmark = payload.landmarks.find((entry) => entry.name === peak.name);
          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: landmark ? [landmark.lng, landmark.lat] : [0, 0] },
            properties: { label: `${peak.name} · ${peak.elevationM} m`, name: peak.name },
          };
        });
      elevation.setData(collection([...districtPoints, ...peakPoints]));
    }
  }, [geoApi.data]);

  useEffect(() => {
    const map = mapRef.current;
    const payload = geoApi.data;
    if (!map || !installedRef.current || !payload) return;

    // Wind arrows are drawn from a canvas-generated image so they render even in
    // the fallback basemap style, which has no glyph endpoints.
    if (!map.hasImage("wind-arrow")) {
      const size = 48;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (context) {
        context.clearRect(0, 0, size, size);
        context.strokeStyle = "#e0f2fe";
        context.lineWidth = 3.4;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(size / 2, size - 8);
        context.lineTo(size / 2, 12);
        context.moveTo(size / 2 - 7, 19);
        context.lineTo(size / 2, 10);
        context.lineTo(size / 2 + 7, 19);
        context.stroke();
        const image = context.getImageData(0, 0, size, size);
        map.addImage("wind-arrow", { width: size, height: size, data: new Uint8Array(image.data) });
      }
    }

    const source = map.getSource("wind-src") as GeoJSONSource | undefined;
    if (!source) return;
    const features = payload.districts.features
      .filter((feature) => feature.properties.windSpeed !== null && feature.properties.windDirection !== null)
      .map((feature) => {
        const speed = feature.properties.windSpeed ?? 0;
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: feature.properties.centroid },
          properties: {
            name: feature.properties.name,
            speed,
            gust: feature.properties.windGusts,
            direction: feature.properties.windDirection,
            // Meteorological direction is where the wind comes FROM; the arrow
            // is rotated to point where the wind is going.
            degrees: ((feature.properties.windDirection ?? 0) + 180) % 360,
            opacity: Math.min(1, Math.max(0.45, speed / 35)),
          },
        };
      });
    source.setData(collection(features));
  }, [geoApi.data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !installedRef.current) return;
    const source = map.getSource("incident-src") as GeoJSONSource | undefined;
    if (!source) return;
    const filtered = incidents
      .filter((incident) => incident.lat !== null && incident.lng !== null)
      .filter((incident) => incidentFilter.category === "ALL" || incident.category === incidentFilter.category)
      .filter((incident) => incidentFilter.severity === "ALL" || (incident.assessedSeverity ?? incident.reportedSeverity) === incidentFilter.severity)
      .filter((incident) => incidentFilter.district === "ALL" || incident.districtCode === incidentFilter.district)
      .filter((incident) => incidentFilter.status === "ALL" || incident.status === incidentFilter.status);
    source.setData(
      collection(
        filtered
          .map((incident) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [incident.lng, incident.lat] },
            properties: {
              title: incident.publicId,
              subtitle: `${incident.category.replaceAll("_", " ")} · ${incident.status.replaceAll("_", " ")} · ${incident.locationName}`,
              status: incident.status,
              color: INCIDENT_CATEGORY_COLORS[incident.category] ?? "#64748b",
            },
          })),
      ),
    );
  }, [incidents]);

  useEffect(() => {
    const map = mapRef.current;
    const payload = geoApi.data;
    if (!map || !installedRef.current || !payload) return;
    const source = map.getSource("alert-src") as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
      collection(
        alerts
          .map((alert) => {
            const district = alert.districtCode ? payload.districts.features.find((feature) => feature.properties.code === alert.districtCode) : null;
            const centroid = district?.properties.centroid;
            if (!centroid) return null;
            return {
              type: "Feature",
              geometry: { type: "Point", coordinates: centroid },
              properties: { title: alert.title, severity: alert.severity, subtitle: alert.category },
            };
          })
          .filter(Boolean) as object[],
      ),
    );
  }, [alerts, geoApi.data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !installedRef.current) return;
    const source = map.getSource("fac-src") as GeoJSONSource | undefined;
    if (!source) return;
    const visibleGroups = new Set(FACILITY_GROUPS.filter((group) => groups[group.id] && layers[group.layer]).map((group) => group.id));
    source.setData(
      collection(
        markers
          .filter((marker) => visibleGroups.has(marker.group))
          .map((marker) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [marker.lng, marker.lat] },
            properties: {
              id: marker.id,
              name: marker.name,
              group: marker.group,
              glyph: FACILITY_GROUP_MAP[marker.group]?.glyph ?? "•",
              color: FACILITY_GROUP_MAP[marker.group]?.color ?? "#94a3b8",
              subtitle: `${FACILITY_GROUP_MAP[marker.group]?.label ?? marker.category} · ${marker.districtName}`,
            },
          })),
      ),
    );
  }, [markers, groups, layers]);

  /* ------------------------------ layer styling ---------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !installedRef.current) return;
    const setVisibility = (id: string, visible: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    };
    setVisibility("state-glow", layers.stateBoundary);
    setVisibility("district-borders", layers.districtBoundaries);
    setVisibility("district-hover", layers.districtBoundaries);
    setVisibility("district-selected", layers.districtBoundaries);
    setVisibility("district-labels", layers.districtLabels);
    setVisibility("hydro-lines", layers.hydrology);
    setVisibility("hydro-reservoirs", layers.hydrology);
    setVisibility("evac-lines", layers.evacuation);
    setVisibility("incident-points", layers.incidents);
    setVisibility("alert-areas", layers.warnings);
    setVisibility("elevation-labels", layers.elevation);
    setVisibility("no-poly-points", layers.districtBoundaries);
    setVisibility("tn-hillshade", layers.terrain);
    const activeFill = activeWeatherFill(layers);
    setVisibility("district-fill", Boolean(activeFill));
    setVisibility("wind-arrows", layers.wind);

    if (map.getLayer("district-fill")) {
      const paint = activeFill ? FILL_EXPRESSIONS[activeFill] : RISK_COLORS.UNKNOWN;
      map.setPaintProperty("district-fill", "fill-color", paint as never);
      map.setPaintProperty("district-fill", "fill-opacity", activeFill ? 0.6 : 0.1);
    }

    try {
      setVisibility("fac-clusters", layers.hospitals || layers.fire || layers.ambulances || layers.shelters);
      setVisibility("fac-cluster-count", layers.hospitals || layers.fire || layers.ambulances || layers.shelters);
      setVisibility("fac-points", layers.hospitals || layers.fire || layers.ambulances || layers.shelters);
      setVisibility("fac-labels", layers.hospitals || layers.fire || layers.ambulances || layers.shelters);
    } catch {
      /* symbol layers may not exist in the fallback style */
    }

    const selected = selectedDistrict ?? "__none__";
    if (map.getLayer("district-selected")) map.setFilter("district-selected", ["==", ["get", "code"], selected]);
    if (map.getLayer("district-hover")) map.setFilter("district-hover", ["==", ["get", "code"], hoveredDistrict ?? "__none__"]);
  }, [layers, selectedDistrict, hoveredDistrict]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !installedRef.current) return;
    try {
      if (layers.terrain) map.setTerrain({ source: "tn-terrain", exaggeration });
      else map.setTerrain(null);
    } catch {
      /* terrain tiles unavailable */
    }
  }, [exaggeration, layers.terrain]);

  /* ------------------------------ interactions ----------------------------- */
  const fitDistrict = useCallback((code: string) => {
    const map = mapRef.current;
    const payload = geoApi.data;
    if (!map || !payload) return;
    const feature = payload.districts.features.find((entry) => entry.properties.code === code);
    if (!feature) return;
    const bbox = bboxOf(feature.geometry.coordinates);
    if (!bbox) {
      map.flyTo({ center: feature.properties.centroid, zoom: 9.5, pitch: is3D ? 55 : 0, duration: 900 });
      return;
    }
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: { top: 70, bottom: 90, left: 40, right: 40 }, pitch: is3D ? 52 : 0, duration: 900, maxZoom: 10.5 });
  }, [geoApi.data, is3D]);

  const selectDistrict = useCallback((code: string, zoom = true) => {
    setSelectedDistrict(code);
    setSelectedFacilityId(null);
    setRightOpen(true);
    if (zoom) fitDistrict(code);
  }, [fitDistrict]);

  const resetView = useCallback(() => {
    setSelectedDistrict(null);
    setSelectedFacilityId(null);
    setSearch("");
    mapRef.current?.flyTo({ ...STATE_VIEW, pitch: is3D ? STATE_VIEW.pitch : 0, duration: 1000 });
  }, [is3D]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const onDistrictMove = (event: FeatureEvent) => {
      const props = event.features?.[0]?.properties as DistrictProps | undefined;
      setHoveredDistrict(props?.name ?? null);
    };
    const onDistrictLeave = () => setHoveredDistrict(null);
    const onDistrictClick = (event: FeatureEvent) => {
      const props = event.features?.[0]?.properties as DistrictProps | undefined;
      if (props?.code) selectDistrict(props.code, false);
    };
    const onPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onPointerOff = () => {
      map.getCanvas().style.cursor = "";
    };
    const onFacilityClick = (event: FeatureEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const props = feature.properties as { id?: number; cluster_id?: number; point_count?: number; districtCode?: string } | undefined;
      if (props?.point_count) {
        const clusterId = props.cluster_id;
        const source = map.getSource("fac-src") as GeoJSONSource;
        source
          .getClusterExpansionZoom(clusterId as number)
          .then((zoom) => {
            const coords = (feature.geometry as unknown as { coordinates?: [number, number] }).coordinates;
            if (!coords) return;
            map.easeTo({ center: coords, zoom, duration: 600 });
          })
          .catch(() => undefined);
        return;
      }
      if (typeof props?.id === "number") {
        setSelectedFacilityId(props.id);
        setRightOpen(true);
        const marker = markers.find((entry) => entry.id === props.id);
        if (marker) setSelectedDistrict(marker.districtCode);
      }
    };
    const onIncidentClick = (event: FeatureEvent) => {
      const props = event.features?.[0]?.properties as { title?: string; subtitle?: string } | undefined;
      if (props?.title) setHoveredDistrict(`${props.title} — ${props.subtitle ?? ""}`);
    };

    map.on("mousemove", "district-fill", onDistrictMove);
    map.on("mouseleave", "district-fill", onDistrictLeave);
    map.on("click", "district-fill", onDistrictClick);
    map.on("mouseenter", "district-fill", onPointer);
    map.on("mouseleave", "district-fill", onPointerOff);
    map.on("click", "fac-points", onFacilityClick);
    map.on("click", "fac-clusters", onFacilityClick);
    map.on("click", "incident-points", onIncidentClick);
    for (const layer of ["fac-points", "fac-clusters", "incident-points", "alert-areas"]) {
      map.on("mouseenter", layer, onPointer);
      map.on("mouseleave", layer, onPointerOff);
    }

    return () => {
      map.off("mousemove", "district-fill", onDistrictMove);
      map.off("mouseleave", "district-fill", onDistrictLeave);
      map.off("click", "district-fill", onDistrictClick);
      map.off("mouseenter", "district-fill", onPointer);
      map.off("mouseleave", "district-fill", onPointerOff);
      map.off("click", "fac-points", onFacilityClick);
      map.off("click", "fac-clusters", onFacilityClick);
      map.off("click", "incident-points", onIncidentClick);
      for (const layer of ["fac-points", "fac-clusters", "incident-points", "alert-areas"]) {
        map.off("mouseenter", layer, onPointer);
        map.off("mouseleave", layer, onPointerOff);
      }
    };
  }, [ready, selectDistrict, markers]);

  /* -------------------------------- controls ------------------------------- */
  function toggleLayer(layer: MapLayerDefinition) {
    if (!layer.available) return;
    setLayers((current) => {
      const next = { ...current, [layer.id]: !current[layer.id] };
      const asFill = WEATHER_FILL_LAYERS.find((key) => key === layer.id);
      if (asFill && next[asFill]) {
        for (const other of WEATHER_FILL_LAYERS) {
          if (other !== asFill) next[other] = false;
        }
      }
      return next;
    });
  }

  function toggleAll() {
    setLayers((current) => {
      const anyOff = MAP_LAYERS.some((layer) => layer.available && !current[layer.id]);
      return Object.fromEntries(MAP_LAYERS.map((layer) => [layer.id, layer.available ? anyOff : false]));
    });
  }

  function resetLayers() {
    setLayers(initialLayerState());
    setGroups(initialGroupState());
    setExaggeration(MAP_BASEMAP.defaultExaggeration);
  }

  function toggle3D() {
    const next = !is3D;
    setIs3D(next);
    mapRef.current?.easeTo({ pitch: next ? 52 : 0, duration: 700 });
  }

  async function toggleFullscreen() {
    const node = containerRef.current?.closest("[data-map-shell]") as HTMLElement | null;
    if (!node) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await node.requestFullscreen();
    } catch {
      /* fullscreen may be blocked */
    }
  }

  const searchResults = search.trim()
    ? DISTRICTS.filter((district) => district.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6)
    : [];

  const validation = geoApi.data?.validation;
  const datasets = geoApi.data?.datasets ?? [];
  const baseLayers = MAP_LAYERS.filter((layer) => layer.group === "base");
  const facilityLayers = MAP_LAYERS.filter((layer) => layer.group === "facilities");
  const hazardLayers = MAP_LAYERS.filter((layer) => layer.group === "hazards");
  const operationLayers = MAP_LAYERS.filter((layer) => layer.group === "operations");
  const groupCounts = facilityApi.data?.groupCounts ?? {};

  const panelDistricts = selectedDistrictData;

  return (
    <div data-map-shell className={`overflow-hidden rounded-xl border border-white/10 bg-ink-950 text-slate-100 shadow-2xl ${className}`}>
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-ink-900/90 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-300">DisasterLink GIS · Tamil Nadu</p>
          <h2 className="truncate text-sm font-extrabold text-white">Interactive 3D Disaster Map</h2>
        </div>
        <div className="relative">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search district…"
            aria-label="Search district"
            className="h-8 w-32 rounded-md border border-white/15 bg-ink-800 px-2 text-[11px] text-slate-100 placeholder:text-slate-500 sm:w-44"
          />
          {searchResults.length > 0 ? (
            <div className="absolute left-0 top-9 z-30 w-48 overflow-hidden rounded-md border border-white/15 bg-ink-900 shadow-xl">
              {searchResults.map((district) => (
                <button
                  key={district.code}
                  onClick={() => {
                    selectDistrict(district.code);
                    setSearch("");
                  }}
                  className="block w-full px-2 py-1.5 text-left text-[11px] text-slate-200 hover:bg-white/10"
                >
                  {district.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button className="btn border border-white/15 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/10 xl:hidden" onClick={() => setLeftOpen((v) => !v)}>
            Layers
          </button>
          <button className="btn border border-white/15 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/10 xl:hidden" onClick={() => setRightOpen((v) => !v)}>
            Panel
          </button>
          <button className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in">＋</button>
          <button className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out">−</button>
          <button className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10" onClick={toggle3D} aria-label="Toggle 3D pitch">{is3D ? "2D" : "3D"}</button>
          <button className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10" onClick={() => mapRef.current?.easeTo({ bearing: (mapRef.current?.getBearing() ?? 0) - 25, duration: 450 })} aria-label="Rotate left">⟲</button>
          <button className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10" onClick={() => mapRef.current?.easeTo({ bearing: (mapRef.current?.getBearing() ?? 0) + 25, duration: 450 })} aria-label="Rotate right">⟳</button>
          <button className="btn bg-teal-500/20 px-2 py-1 text-[11px] font-semibold text-teal-100 ring-1 ring-inset ring-teal-400/40 hover:bg-teal-500/30" onClick={resetView}>
            Reset view
          </button>
          <button className="btn border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10" onClick={toggleFullscreen} aria-label="Toggle fullscreen">⛶</button>
        </div>
      </div>

      {/* status strip */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 bg-ink-950/80 px-3 py-1 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-teal-400 live-dot" : "bg-amber-400"}`} />
          {ready ? "Map ready" : "Initialising"}
        </span>
        <span>Basemap: {basemap === "VECTOR" ? "OpenFreeMap (vector)" : basemap === "FALLBACK" ? "boundary-only fallback" : "loading"}</span>
        <span>Terrain: {layers.terrain ? (basemap === "VECTOR" ? "AWS DEM, 3D on" : "DEM tiles, fallback style") : "off"}</span>
        <span>Districts: {validation ? `${validation.polygonDistricts}/${validation.expectedDistricts}` : "—"}</span>
        {validation ? (
          <span className={validation.valid ? "text-teal-300" : "text-amber-300"}>
            {validation.valid ? "GeoJSON validated" : `Validation: ${validation.missingPolygonDistricts.length} polygon(s) missing`}
          </span>
        ) : null}
        <span>Facilities: {facilityApi.data?.total ?? "—"}</span>
        <span>
          Incidents: {incidents.filter((incident) => incident.lat !== null).filter((incident) => incidentFilter.category === "ALL" || incident.category === incidentFilter.category).filter((incident) => incidentFilter.severity === "ALL" || (incident.assessedSeverity ?? incident.reportedSeverity) === incidentFilter.severity).filter((incident) => incidentFilter.district === "ALL" || incident.districtCode === incidentFilter.district).length}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <DataClassBadge dataClass="SIMULATED" />
          <button className="underline decoration-dotted hover:text-slate-200" onClick={() => setShowDatasets((v) => !v)}>
            Data sources
          </button>
        </span>
      </div>

      {showDatasets ? (
        <div className="max-h-[45vh] overflow-y-auto border-b border-white/10 bg-ink-900 px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wide text-teal-300">Geographic dataset register</p>
            <button className="text-slate-400 hover:text-white" onClick={() => setShowDatasets(false)} aria-label="Close dataset register">×</button>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {datasets.map((dataset) => (
              <li key={dataset.id} className="rounded-lg border border-white/10 bg-ink-800/60 p-2 text-[10px] leading-relaxed text-slate-300">
                <div className="mb-0.5 flex flex-wrap items-center gap-1">
                  <span className="font-bold text-white">{dataset.name}</span>
                  <span className="chip bg-white/10 text-slate-200 ring-white/15">{dataset.sourceClass.replaceAll("_", " ")}</span>
                </div>
                <p><span className="text-slate-500">Source:</span> {dataset.source}</p>
                <p><span className="text-slate-500">Coverage:</span> {dataset.coverage}</p>
                <p><span className="text-slate-500">Format:</span> {dataset.format}</p>
                <p><span className="text-slate-500">Updated:</span> {dataset.updated}</p>
                <p className="text-amber-200/80"><span className="text-slate-500">Limitations:</span> {dataset.limitations}</p>
                <a className="text-teal-300 underline" href={dataset.url} target="_blank" rel="noreferrer">{dataset.url}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* body */}
      <div className="relative flex min-h-[520px] flex-col xl:flex-row">
        {/* left panel */}
        <aside
          className={`${leftOpen ? "block" : "hidden"} xl:block xl:w-[252px] xl:shrink-0 border-b border-white/10 bg-ink-900/70 xl:border-b-0 xl:border-r`}
        >
          <div className="max-h-[300px] overflow-y-auto px-2.5 py-2 xl:max-h-[calc(100vh-330px)]">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-300">Map layers</p>
              <div className="flex gap-1">
                <button className="text-[9px] font-semibold text-slate-400 underline hover:text-white" onClick={toggleAll}>all/none</button>
                <button className="text-[9px] font-semibold text-slate-400 underline hover:text-white" onClick={resetLayers}>reset</button>
              </div>
            </div>

            {LAYER_GROUPS.map((group) => {
              const list = group.id === "base" ? baseLayers : group.id === "facilities" ? facilityLayers : group.id === "hazards" ? hazardLayers : operationLayers;
              return (
                <div key={group.id} className="mb-2">
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">{group.label}</p>
                  <ul className="space-y-0.5">
                    {list.map((layer) => (
                      <li key={layer.id}>
                        <label
                          className={`flex items-start gap-1.5 rounded px-1 py-0.5 text-[11px] ${layer.available ? "cursor-pointer text-slate-300 hover:bg-white/5" : "cursor-not-allowed text-slate-500"}`}
                          title={layer.available ? layer.description : layer.unavailableReason}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(layers[layer.id])}
                            disabled={!layer.available}
                            onChange={() => toggleLayer(layer)}
                            className="mt-0.5 h-3 w-3 rounded border-white/20 bg-ink-800 disabled:opacity-40"
                          />
                          <span className="flex-1">
                            {layer.label}
                            {!layer.available ? <span className="ml-1 rounded bg-amber-400/15 px-1 text-[8px] font-bold uppercase text-amber-300">no dataset</span> : null}
                          </span>
                        </label>
                        {!layer.available && layer.unavailableReason ? (
                          <p className="ml-5 text-[9px] leading-snug text-amber-300/70">{layer.unavailableReason}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            <div className="mt-1 rounded-lg border border-white/10 bg-ink-800/60 p-2">
              <label className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">
                Terrain exaggeration · {exaggeration.toFixed(2)}×
                <input
                  type="range"
                  min={MAP_BASEMAP.minExaggeration}
                  max={MAP_BASEMAP.maxExaggeration}
                  step={0.25}
                  value={exaggeration}
                  disabled={!layers.terrain}
                  onChange={(event) => setExaggeration(Number(event.target.value))}
                  className="mt-1 w-full accent-teal-400 disabled:opacity-40"
                />
              </label>
              <p className="mt-1 text-[9px] leading-snug text-slate-500">Elevation mesh: AWS Terrain Tiles. Values are unavailable rather than estimated if the provider fails.</p>
            </div>

            <div className="mt-2 rounded-lg border border-white/10 bg-ink-800/60 p-2">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">Incident filters</p>
              {([
                ["category", "Category", ["ALL", "FLOODING", "WATERLOGGING", "FALLEN_TREE", "ROAD_BLOCKAGE", "BUILDING_DAMAGE", "FIRE", "LANDSLIDE", "OTHER"]],
                ["severity", "Severity", ["ALL", "LOW", "MODERATE", "HIGH", "CRITICAL"]],
                ["status", "Status", ["ALL", "PENDING", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED"]],
              ] as [keyof typeof incidentFilter, string, string[]][]).map(([key, label, options]) => (
                <label key={key} className="mb-1 block">
                  <span className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                  <select
                    value={incidentFilter[key]}
                    onChange={(event) => setIncidentFilter((current) => ({ ...current, [key]: event.target.value }))}
                    className="w-full rounded border border-white/15 bg-ink-900 px-1 py-0.5 text-[10px] text-slate-100"
                  >
                    {options.map((option) => (
                      <option key={option} value={option}>{option === "ALL" ? `All ${label.toLowerCase()}` : option.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="block">
                <span className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">District</span>
                <select
                  value={incidentFilter.district}
                  onChange={(event) => setIncidentFilter((current) => ({ ...current, district: event.target.value }))}
                  className="w-full rounded border border-white/15 bg-ink-900 px-1 py-0.5 text-[10px] text-slate-100"
                >
                  <option value="ALL">All districts</option>
                  {DISTRICTS.map((district) => <option key={district.code} value={district.code}>{district.name}</option>)}
                </select>
              </label>
              <button
                className="mt-1 w-full rounded border border-white/15 px-1 py-0.5 text-[9px] font-semibold text-slate-300 hover:bg-white/10"
                onClick={() => setIncidentFilter({ category: "ALL", severity: "ALL", district: "ALL", status: "ALL" })}
              >
                Clear incident filters
              </button>
            </div>

            <div className="mt-2">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Facility categories</p>
              <ul className="space-y-0.5">
                {FACILITY_GROUPS.map((group) => (
                  <li key={group.id}>
                    <label className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-[11px] text-slate-300 hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={groups[group.id]}
                        onChange={() => setGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}
                        className="h-3 w-3 rounded border-white/20 bg-ink-800"
                      />
                      <span className="h-2 w-2 rounded-full" style={{ background: group.color }} />
                      <span className="flex-1">{group.short}</span>
                      <span className="text-[9px] tabular-nums text-slate-500">{groupCounts[group.id] ?? 0}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        {/* map canvas */}
        <div className="relative min-h-[420px] flex-1">
          <div ref={containerRef} className="h-[420px] w-full sm:h-[560px] xl:h-[calc(100vh-330px)]" style={{ background: "#060b16" }} />

          {!ready && !mapError ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-ink-950/80">
              <div className="text-center">
                <div className="mx-auto mb-2 h-7 w-7 animate-spin rounded-full border-2 border-teal-400/40 border-t-teal-300" />
                <p className="text-[11px] font-semibold text-slate-300">Loading Tamil Nadu terrain and district geometry…</p>
              </div>
            </div>
          ) : null}

          {mapError ? (
            <div className="absolute inset-0 grid place-items-center bg-ink-950/95 p-4">
              <div className="max-w-sm rounded-xl border border-amber-400/40 bg-amber-950/50 p-3 text-[11px] text-amber-100">
                <p className="font-bold uppercase tracking-wide">3D map unavailable</p>
                <p className="mt-1">{mapError}</p>
                <p className="mt-1">The district data remains available in the right-hand panel and the 2D district explorer at /districts.</p>
              </div>
            </div>
          ) : null}

          {hoveredDistrict ? (
            <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-white/15 bg-ink-900/90 px-2 py-1 text-[10px] font-semibold text-teal-200">
              {hoveredDistrict}
            </div>
          ) : null}

          <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-white/10 bg-ink-900/85 px-2 py-1.5 text-[9px] text-slate-300">
            <p className="mb-0.5 font-bold uppercase tracking-wide text-teal-300">Legend</p>
            {Object.entries(RISK_COLORS)
              .filter(([level]) => level !== "UNKNOWN")
              .map(([level, color]) => (
                <p key={level} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm" style={{ background: color }} /> {level.replace("_", " ")} risk
                </p>
              ))}
            <p className="mt-1 flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Incident</p>
            <p className="flex items-center gap-1"><span className="text-[9px]">↟</span> Wind arrow (to direction)</p>
            <p className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-cyan-400 text-center text-[7px] font-bold text-slate-900">H</span> Hospital</p>
            <p className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400 text-center text-[7px] font-bold text-slate-900">S</span> Camp / shelter</p>
          </div>
        </div>

        {/* right panel */}
        <aside className={`${rightOpen ? "block" : "hidden"} xl:block xl:w-[312px] xl:shrink-0 border-t border-white/10 bg-ink-900/70 xl:border-l xl:border-t-0`}>
          <div className="max-h-[420px] overflow-y-auto px-3 py-2.5 xl:max-h-[calc(100vh-330px)]">
            {selectedFacility ? (
              <div>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-teal-300">Facility</p>
                    <h3 className="text-sm font-extrabold text-white">{selectedFacility.name}</h3>
                    <p className="text-[10px] text-slate-400">{selectedFacility.districtName}</p>
                  </div>
                  <button className="text-slate-400 hover:text-white" onClick={() => setSelectedFacilityId(null)} aria-label="Close facility panel">×</button>
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                  <span className="chip ring-inset" style={{ background: `${FACILITY_GROUP_MAP[selectedFacility.group]?.color}22`, color: FACILITY_GROUP_MAP[selectedFacility.group]?.color, boxShadow: `inset 0 0 0 1px ${FACILITY_GROUP_MAP[selectedFacility.group]?.color}55` }}>
                    {FACILITY_GROUP_MAP[selectedFacility.group]?.label ?? selectedFacility.category}
                  </span>
                  {selectedFacility.facilityClass !== "UNKNOWN" ? <Chip tone="dark">{selectedFacility.facilityClass}</Chip> : null}
                  <SourceBadge source={selectedFacility.verificationStatus} />
                  <DataClassBadge dataClass={selectedFacility.dataClass} />
                </div>
                <dl className="space-y-1 text-[11px] text-slate-300">
                  <div><dt className="text-slate-500">Availability</dt><dd className="font-semibold text-white">{selectedFacility.availabilityStatus}</dd></div>
                  <div><dt className="text-slate-500">Address</dt><dd>{selectedFacility.address ?? "Data unavailable"}</dd></div>
                  <div>
                    <dt className="text-slate-500">Contact</dt>
                    <dd>{selectedFacility.phone ? <a className="text-teal-300 underline" href={`tel:${selectedFacility.phone}`}>{selectedFacility.phone}</a> : "Not recorded — data unavailable"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Capacity / occupancy</dt>
                    <dd>
                      {selectedFacility.capacity !== null
                        ? `${selectedFacility.occupancy ?? 0} / ${selectedFacility.capacity}${selectedFacility.remaining !== null ? ` · ${selectedFacility.remaining} remaining` : ""} (${selectedFacility.capacityDataClass})`
                        : "Data unavailable"}
                    </dd>
                  </div>
                  <div><dt className="text-slate-500">Coordinates</dt><dd className="font-mono text-[10px]">{selectedFacility.lat.toFixed(4)}, {selectedFacility.lng.toFixed(4)}</dd></div>
                  <div><dt className="text-slate-500">Last updated</dt><dd>{formatDateTime(selectedFacility.updatedAt)}</dd></div>
                </dl>
                {selectedFacility.availabilityNote ? <p className="mt-1.5 rounded bg-white/5 p-1.5 text-[10px] leading-snug text-slate-300">{selectedFacility.availabilityNote}</p> : null}
                <div className="mt-2 flex flex-wrap gap-1">
                  <a className="btn bg-white px-2 py-1 text-[10px] text-ink-900 hover:bg-slate-100" href={`https://www.openstreetmap.org/directions?to=${selectedFacility.lat}%2C${selectedFacility.lng}`} target="_blank" rel="noreferrer">Directions</a>
                  <button className="btn border border-white/15 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/10" onClick={() => setSelectedDistrict(selectedFacility.districtCode)}>District</button>
                  <a className="btn border border-white/15 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/10" href={`/facilities?district=${selectedFacility.districtCode}`}>Directory</a>
                  {selectedFacility.sourceUrl ? <a className="btn border border-white/15 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/10" href={selectedFacility.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}
                </div>
                <p className="mt-2 text-[9px] leading-snug text-slate-500">{selectedFacility.sourceName ?? "Facility database record"} · availability is recorded data, not a live feed.</p>
              </div>
            ) : panelDistricts ? (
              <div>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-teal-300">District · {panelDistricts.region}</p>
                    <h3 className="text-sm font-extrabold text-white">{panelDistricts.name}</h3>
                  </div>
                  <button className="text-slate-400 hover:text-white" onClick={resetView} aria-label="Back to Tamil Nadu">×</button>
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                  <span className="chip" style={{ background: `${RISK_COLORS[panelDistricts.riskLevel]}22`, color: RISK_COLORS[panelDistricts.riskLevel], boxShadow: `inset 0 0 0 1px ${RISK_COLORS[panelDistricts.riskLevel]}66` }}>
                    {panelDistricts.riskLevel.replace("_", " ")} risk estimate
                  </span>
                  {panelDistricts.riskScore !== null ? <Chip tone="dark">{panelDistricts.riskScore}/100</Chip> : null}
                </div>
                <dl className="space-y-1 text-[11px] text-slate-300">
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">Geographic overview</dt><dd className="text-right">{panelDistricts.centroid[1].toFixed(3)}° N, {panelDistricts.centroid[0].toFixed(3)}° E</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">Reference elevation</dt><dd>{panelDistricts.elevationM !== null ? `${panelDistricts.elevationM} m (DEM)` : "Data unavailable"}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">Forecast rain (24h)</dt><dd>{panelDistricts.rainfall24h !== null ? `${panelDistricts.rainfall24h} mm` : "Data unavailable"}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">Peak rain probability</dt><dd>{panelDistricts.precipProbability !== null ? `${panelDistricts.precipProbability}%` : "Data unavailable"}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">Wind (from)</dt><dd>{panelDistricts.windSpeed !== null ? `${Math.round(panelDistricts.windSpeed)} km/h · ${panelDistricts.windDirection !== null ? `${bearingLabel(panelDistricts.windDirection)} (${Math.round(panelDistricts.windDirection)}°)` : "direction n/a"}` : "Data unavailable"}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">Condition</dt><dd>{panelDistricts.condition ?? "Data unavailable"}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">Incidents</dt><dd>{panelDistricts.incidents} ({panelDistricts.verified} verified)</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">Mapped facilities</dt><dd>{panelDistricts.facilities}</dd></div>
                </dl>
                <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-2">
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">Emergency facilities in district</p>
                  <ul className="space-y-0.5 text-[11px] text-slate-300">
                    {FACILITY_GROUPS.map((group) => (
                      <li key={group.id} className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: group.color }} />{group.label}</span>
                        <span className="font-semibold tabular-nums text-white">{groupCounts[group.id] !== undefined ? panelDistricts.facilityCounts[group.id] ?? 0 : "Data unavailable"}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[9px] text-slate-500">Counts are aggregated from active facility records returned by the facilities API.</p>
                </div>
                {panelDistricts.riskExplanation ? <p className="mt-1.5 text-[10px] leading-snug text-slate-400">{panelDistricts.riskExplanation}</p> : null}
                <p className="mt-1 text-[9px] leading-snug text-amber-200/70">Risk shading is a heuristic MODEL_RISK_ESTIMATE, not an official flood-prone-zone map or warning.</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <a className="btn bg-white px-2 py-1 text-[10px] text-ink-900 hover:bg-slate-100" href={`/districts/${panelDistricts.code}`}>District brief</a>
                  <a className="btn border border-white/15 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/10" href={`/facilities?district=${panelDistricts.code}`}>Facilities</a>
                  <a className="btn border border-white/15 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/10" href={`/weather?district=${panelDistricts.code}`}>Weather</a>
                  <button className="btn border border-white/15 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/10" onClick={resetView}>Full Tamil Nadu</button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-teal-300">State overview</p>
                <h3 className="text-sm font-extrabold text-white">Tamil Nadu</h3>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                  Select a district on the map to see its geographic overview and emergency facility counts. Click a marker for facility details.
                </p>
                <dl className="mt-2 space-y-1 text-[11px]">
                  <div className="flex justify-between"><dt className="text-slate-500">Districts mapped</dt><dd className="font-semibold text-white">{validation ? `${validation.polygonDistricts} of ${validation.expectedDistricts}` : "—"}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Mapped facilities</dt><dd className="font-semibold text-white">{facilityApi.data?.total ?? "—"}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Facilities without coordinates</dt><dd className="font-semibold text-white">{facilityApi.data?.skippedWithoutCoordinates ?? "—"}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Incident markers</dt><dd className="font-semibold text-white">{incidents.length}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Active alerts</dt><dd className="font-semibold text-white">{alerts.length}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">District reference elevation</dt><dd className="font-semibold text-white">{geoApi.data?.elevation.available ? `${geoApi.data.elevation.minM ?? "—"}–${geoApi.data.elevation.maxM ?? "—"} m` : "Data unavailable"}</dd></div>
                </dl>
                {geoApi.data?.districtsWithoutPolygon.length ? (
                  <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-950/40 p-2 text-[10px] text-amber-100">
                    <p className="font-bold uppercase tracking-wide">Coverage limitation</p>
                    {geoApi.data.districtsWithoutPolygon.map((entry) => (
                      <p key={entry.code}>{entry.name}: {entry.reason}. Shown as a labelled point — no approximate polygon was drawn.</p>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2">
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">Facility markers loaded</p>
                  <ul className="space-y-0.5 text-[11px] text-slate-300">
                    {FACILITY_GROUPS.map((group) => (
                      <li key={group.id} className="flex justify-between"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: group.color }} />{group.short}</span><span className="tabular-nums">{groupCounts[group.id] ?? 0}</span></li>
                    ))}
                  </ul>
                </div>
                {geoApi.data?.elevation.error ? <p className="mt-2 text-[9px] text-amber-300/80">{geoApi.data.elevation.error}</p> : null}
                {dataNotice ? <div className="mt-2"><Notice tone="warn">{dataNotice}</Notice></div> : null}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* footer / attribution */}
      {(() => {
        const visibleLayers = MAP_LAYERS.filter((layer) => layer.available && layers[layer.id]).length;
        const unavailableLayers = MAP_LAYERS.filter((layer) => !layer.available);
        return (
          <div className="flex flex-col gap-1 border-t border-white/10 bg-ink-900/90 px-3 py-1.5 text-[9px] text-slate-400">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-slate-300">{visibleLayers} of {MAP_LAYERS.length} layers active</span>
              <span>Boundaries: {geoApi.data?.provenance.state?.name ?? "Tamil Nadu state + 2011 Census districts"}</span>
              <span>Attribution: OpenFreeMap / © OpenStreetMap contributors · AWS Terrain Tiles</span>
              <span>{geoApi.data?.basemap.apiKeyRequired ? "API key required" : "No API key required"}</span>
              <span className="ml-auto">Geometry generated {geoApi.data ? formatDateTime(geoApi.data.generatedAt) : "—"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="text-amber-300/80">
                Unavailable layer{unavailableLayers.length === 1 ? "" : "s"}: {unavailableLayers.map((layer) => layer.label).join(", ") || "none"}
              </span>
              <span>· Hydrology is a schematic reference overlay. Flood risk is a model estimate. Simulated records are badged.</span>
              <span>· Not an official government warning system.</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
