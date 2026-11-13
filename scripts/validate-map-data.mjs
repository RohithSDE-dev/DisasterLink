/**
 * Phase 1 map dataset QA.
 * Run with: node --test scripts/validate-map-data.mjs
 *
 * Validates the geographic datasets shipped with the app and the map layer
 * registry, so that no approximate geometry or fake coverage silently ships.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

const TN_BBOX = { minLng: 75.5, maxLng: 81.0, minLat: 7.5, maxLat: 14.5 };

const EXPECTED_38 = [
  "Chennai", "Chengalpattu", "Kancheepuram", "Tiruvallur", "Ranipet", "Vellore", "Tirupattur", "Krishnagiri",
  "Dharmapuri", "Tiruvannamalai", "Villupuram", "Kallakurichi", "Cuddalore", "Ariyalur", "Perambalur", "Salem",
  "Namakkal", "Erode", "Nilgiris", "Coimbatore", "Tiruppur", "Karur", "Tiruchirappalli", "Thanjavur", "Thiruvarur",
  "Nagapattinam", "Mayiladuthurai", "Pudukkottai", "Dindigul", "Madurai", "Theni", "Virudhunagar", "Sivaganga",
  "Ramanathapuram", "Thoothukudi", "Tenkasi", "Tirunelveli", "Kanyakumari",
];

/** Census dataset name -> official district name */
const ALIAS = {
  Thiruvallur: "Tiruvallur",
  Thoothukkudi: "Thoothukudi",
  Viluppuram: "Villupuram",
  Tirupathur: "Tirupattur",
};

function* rings(coords) {
  if (!Array.isArray(coords) || coords.length === 0) return;
  if (Array.isArray(coords[0]) && typeof coords[0][0] === "number") {
    yield coords;
    return;
  }
  for (const child of coords) yield* rings(child);
}

function* positions(coords) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    yield coords;
    return;
  }
  for (const child of coords) yield* positions(child);
}

test("Tamil Nadu state boundary dataset is authentic-shaped and in-bounds", () => {
  const state = readJson("src/data/tn-state.geo.json");
  assert.equal(state.type, "FeatureCollection");
  assert.ok(state.source && state.source.name && state.source.url, "dataset source metadata is required");
  assert.equal(state.features.length, 1);
  const geometry = state.features[0].geometry;
  assert.equal(geometry.type, "MultiPolygon");
  let vertices = 0;
  let invalidRings = 0;
  let outOfBounds = 0;
  for (const ring of rings(geometry.coordinates)) {
    vertices += ring.length;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) invalidRings += 1;
  }
  for (const [lng, lat] of positions(geometry.coordinates)) {
    if (!(lng > TN_BBOX.minLng && lng < TN_BBOX.maxLng && lat > TN_BBOX.minLat && lat < TN_BBOX.maxLat)) outOfBounds += 1;
  }
  assert.equal(invalidRings, 0, "all state rings must be closed");
  assert.equal(outOfBounds, 0, "state geometry must stay inside the Tamil Nadu bounding box");
  assert.ok(vertices >= 300, `state outline is too coarse (${vertices} vertices)`);
});

test("district dataset contains real polygons with closed rings inside Tamil Nadu", () => {
  const districts = readJson("src/data/tn-districts.geo.json");
  // Compact render format ({ name, centroid, rings }) that the API converts to
  // standards-compliant GeoJSON. Validated structurally rather than by `type`.
  assert.ok(Array.isArray(districts.features), "district dataset must contain a features array");
  assert.ok(districts.source, "district dataset must carry source metadata");
  assert.equal(districts.features.length, 37, "Census 2011 dataset contains 37 undivided districts");
  const names = districts.features.map((feature) => feature.properties?.district ?? feature.name);
  assert.equal(new Set(names).size, names.length, "district names must be unique");
  let invalidRings = 0;
  let outOfBounds = 0;
  let vertices = 0;
  for (const feature of districts.features) {
    const featureRings = feature.rings ?? (feature.geometry ? [...rings(feature.geometry.coordinates)] : []);
    assert.ok(featureRings.length >= 1, "each district must have at least one ring");
    for (const ring of featureRings) {
      vertices += ring.length;
      assert.ok(ring.length >= 5, "a polygon ring needs at least 4 positions plus closure");
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) invalidRings += 1;
      for (const [lng, lat] of ring) {
        if (!(lng > TN_BBOX.minLng && lng < TN_BBOX.maxLng && lat > TN_BBOX.minLat && lat < TN_BBOX.maxLat)) outOfBounds += 1;
      }
    }
  }
  assert.equal(invalidRings, 0);
  assert.equal(outOfBounds, 0);
  assert.ok(vertices > 1000, `district geometry looks truncated (${vertices} vertices)`);
});

test("coverage matches the official 38 districts with a documented gap", () => {
  const districts = readJson("src/data/tn-districts.geo.json");
  const present = new Set(
    districts.features.map((feature) => ALIAS[feature.name ?? feature.properties?.district] ?? (feature.name ?? feature.properties?.district)),
  );
  const missing = EXPECTED_38.filter((name) => !present.has(name));
  assert.deepEqual(missing, ["Mayiladuthurai"], "only the 2020-created district may lack a polygon");
  assert.equal(present.size, 37);
  // The app must list the missing district explicitly instead of drawing an approximation.
  const geoLib = readFileSync(join(root, "src/lib/districts.ts"), "utf8");
  assert.ok(geoLib.includes("Mayiladuthurai"), "Mayiladuthurai must still be selectable in the district registry");
});

test("map layer registry exposes all 16 required layers and flags unavailable ones", () => {
  const source = readFileSync(join(root, "src/lib/map-data.ts"), "utf8");
  const required = [
    "stateBoundary", "districtBoundaries", "districtLabels", "terrain", "elevation", "hydrology", "roads",
    "hospitals", "fire", "ambulances", "shelters", "incidents", "floodRisk", "rainfall", "warnings", "evacuation",
  ];
  for (const id of required) {
    assert.ok(source.includes(`id: "${id}"`), `layer ${id} must be declared`);
  }
  assert.match(source, /id: "roads"[\s\S]*?available: false/, "roads must be marked unavailable, not faked");
  assert.match(source, /unavailableReason:/, "unavailable layers must explain why");
  const datasets = readFileSync(join(root, "src/lib/map-data.ts"), "utf8");
  for (const key of ["source:", "url:", "coverage:", "format:", "updated:", "limitations:"]) {
    assert.ok(datasets.includes(key), `dataset register must document ${key}`);
  }
});

test("facility seeds never invent contact numbers or verified availability", () => {
  const seed = readFileSync(join(root, "src/db/seed.ts"), "utf8");
  assert.ok(seed.includes("phone: null"), "seed facilities must not carry invented phone numbers");
  assert.ok(!/verificationStatus:\s*"VERIFIED"/.test(seed), "seed facilities must not be pre-verified");
  assert.ok(seed.includes('dataClass: "SIMULATED"'), "sample operational records must be labelled SIMULATED");
});
