/**
 * Phase 2 weather QA.
 * Run with: node --test scripts/validate-weather.mjs
 *
 * Covers district coverage, provider field mapping, alert classification rules,
 * secret handling and the weather→map integration. The live provider test is
 * skipped gracefully if the network is unavailable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const districtsSource = read("src/lib/districts.ts");
const codes = [...districtsSource.matchAll(/code: "(TN-[A-Z]{3})",\s*name: "([^"]+)"/g)].map((match) => ({ code: match[1], name: match[2] }));

test("district registry exposes all 38 Tamil Nadu districts", () => {
  assert.equal(codes.length, 38, `expected 38 districts, found ${codes.length}`);
  assert.equal(new Set(codes.map((entry) => entry.code)).size, 38, "district codes must be unique");
  assert.equal(new Set(codes.map((entry) => entry.name)).size, 38, "district names must be unique");
  for (const name of ["Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli"]) {
    assert.ok(codes.some((entry) => entry.name === name), `${name} must be selectable`);
  }
  assert.ok(codes.every((entry) => entry.code.startsWith("TN-")), "all districts use TN- codes");
});

test("weather mapping requests and stores every documented provider field", () => {
  const weather = read("src/lib/weather.ts");
  const currentFields = ["temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day", "precipitation", "weather_code", "cloud_cover", "pressure_msl", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "uv_index", "visibility"];
  for (const field of currentFields) {
    assert.ok(weather.includes(field), `current weather must request ${field}`);
  }
  const hourlyFields = ["precipitation_probability", "wind_speed_10m", "wind_direction_10m", "visibility", "pressure_msl"];
  for (const field of hourlyFields) {
    assert.ok(weather.includes(field), `hourly forecast must request ${field}`);
  }
  const dailyFields = ["sunrise", "sunset", "precipitation_hours", "wind_direction_10m_dominant", "temperature_2m_max", "temperature_2m_min", "uv_index_max"];
  for (const field of dailyFields) {
    assert.ok(weather.includes(field), `daily forecast must request ${field}`);
  }
});

test("hourly window is aligned to the current hour, not midnight", () => {
  const weather = read("src/lib/weather.ts");
  assert.match(weather, /findIndex\(\(time\) => time >= current\.time\)/, "hourly window must start at the current hour");
  assert.match(weather, /allHours\.slice\(nowIndex, nowIndex \+ 24\)/, "exactly 24 hours must be returned from now");
});

test("provider configuration reads secrets server-side only", () => {
  const weather = read("src/lib/weather.ts");
  assert.ok(weather.includes("process.env.OPEN_METEO_API_KEY"), "API key must come from the server environment");
  assert.ok(weather.includes("process.env.OPEN_METEO_BASE_URL"), "provider base URL must be configurable");
  assert.ok(!/NEXT_PUBLIC_.*OPEN_METEO/.test(weather), "provider keys must never use a NEXT_PUBLIC variable");

  const clientComponents = [
    "src/components/weather/WeatherPremium.tsx",
    "src/components/map/DisasterMap.tsx",
    "src/app/(citizen)/weather/page.tsx",
  ].map(read).join("\n");
  assert.ok(!clientComponents.includes("OPEN_METEO_API_KEY"), "client code must not reference the provider key");
  assert.ok(!clientComponents.includes("apikey="), "client code must not build provider URLs with keys");
  assert.match(weather, /apiKeyConfigured: Boolean/, "provider metadata must report key configuration without exposing it");
});

test("alert classification separates forecast signals from official warnings", () => {
  const alerts = read("src/lib/weather-alerts.ts");
  assert.match(alerts, /isOfficialWarning: false/, "forecast signsals must never claim to be official warnings");
  assert.match(alerts, /sourceClass: "FORECAST"/, "forecast signals must carry the FORECAST class");
  for (const category of ["HEAVY_RAINFALL", "THUNDERSTORM", "STRONG_WINDS", "HEATWAVE", "LOW_VISIBILITY", "EXTREME_UV"]) {
    assert.ok(alerts.includes(category), `alert category ${category} must be derivable`);
  }
  assert.match(alerts, /veryHeavy: 115\.6/, "IMD very heavy threshold must be documented");
  assert.match(alerts, /extremelyHeavy: 204\.4/, "IMD extremely heavy threshold must be documented");
  assert.match(alerts, /not official government warnings/i, "guidance must state the limitation");
});

test("alert endpoint distinguishes officer notices and always supplies timestamps", () => {
  const route = read("src/app/api/weather/alerts/route.ts");
  assert.match(route, /origin: "DISASTERLINK_OFFICER"/);
  assert.match(route, /origin: "PROVIDER_FORECAST_DERIVED"|deriveForecastSignals/);
  assert.ok(route.includes("issuedAt"), "alerts must include an issue timestamp");
  assert.ok(route.includes("expiresAt"), "alerts must include expiry information");
  assert.ok(route.includes("isSimulated"), "simulated records must be flagged");
  assert.ok(route.includes("providerIssueTime"), "provider observation time must be reported");
});

test("weather map layers are registered for the Phase 1 map", () => {
  const mapData = read("src/lib/map-data.ts");
  for (const id of ["temperature", "rainfall", "precipProbability", "wind", "warnings"]) {
    assert.ok(mapData.includes(`id: "${id}"`), `map layer ${id} must be registered`);
  }
  const mapComponent = read("src/components/map/DisasterMap.tsx");
  for (const fill of ["floodRisk", "rainfall", "temperature", "precipProbability"]) {
    assert.ok(mapComponent.includes(fill), `map fill mode ${fill} must be wired`);
  }
  assert.ok(mapComponent.includes("wind-arrow"), "wind arrows must be rendered from a canvas icon");
  assert.ok(mapComponent.includes("windDirection"), "wind direction must come from district weather properties");
});

test("weather UI renders current, hourly, daily and alert sections", () => {
  const ui = read("src/components/weather/WeatherPremium.tsx");
  for (const label of ["Hourly forecast", "Seven-day forecast", "Weather alerts", "Weather map layers", "Pressure", "Visibility", "Sunrise"]) {
    assert.ok(ui.includes(label), `weather UI must render ${label}`);
  }
  assert.ok(ui.includes("useSelectedDistrict"), "weather must follow the shared district selection");
  assert.ok(ui.includes("dl.weather.recent"), "recent districts must persist locally");
  assert.ok(ui.includes("QUICK_PICKS"), "quick district selection must be present");
  assert.ok(ui.includes('href={`/map?district=${district}`}'), "weather must link into the Phase 1 map");
});

test("live provider returns the required fields for Tamil Nadu districts", async (t) => {
  const sample = codes.filter((entry) => ["TN-CHN", "TN-CBE", "TN-KKL"].includes(entry.code));
  let reachable = false;
  for (const district of sample) {
    const match = districtsSource.match(new RegExp(`code: "${district.code}",\\s*name: "[^"]+",\\s*region: "[^"]+",\\s*lat: ([\\d.]+),\\s*lng: ([\\d.]+)`));
    if (!match) continue;
    const [, lat, lng] = match;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility" +
      "&hourly=temperature_2m,precipitation,precipitation_probability,weather_code,uv_index,wind_speed_10m,wind_direction_10m,visibility,pressure_msl" +
      "&daily=weather_code,precipitation_sum,precipitation_probability_max,precipitation_hours,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,wind_speed_10m_max,wind_direction_10m_dominant" +
      "&timezone=Asia%2FKolkata&forecast_days=7";
    let payload;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) continue;
      payload = await response.json();
      reachable = true;
    } catch {
      continue;
    }
    assert.equal(typeof payload.current.temperature_2m, "number", `${district.name}: temperature missing`);
    assert.equal(typeof payload.current.pressure_msl, "number", `${district.name}: pressure missing`);
    assert.equal(typeof payload.current.wind_direction_10m, "number", `${district.name}: wind direction missing`);
    assert.ok(payload.hourly.time.length >= 24, `${district.name}: fewer than 24 hourly points`);
    assert.ok(payload.hourly.precipitation_probability.length >= 24, `${district.name}: probability series missing`);
    assert.equal(payload.daily.time.length, 7, `${district.name}: seven-day forecast missing`);
    assert.ok(payload.daily.sunrise[0] && payload.daily.sunset[0], `${district.name}: sun times missing`);
  }
  if (!reachable) t.skip("Weather provider unreachable from this environment; live field assertions skipped.");
});
