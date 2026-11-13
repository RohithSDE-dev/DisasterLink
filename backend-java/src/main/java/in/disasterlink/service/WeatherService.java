package in.disasterlink.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Server-side Open-Meteo client with a 15-minute in-memory cache.
 * Failures are surfaced as an unavailable-weather result — values are never
 * fabricated and no official warning is derived from this data.
 */
@Service
public class WeatherService {

    public record WeatherSnapshot(
            boolean available,
            String source,
            String sourceClass,
            Instant fetchedAt,
            Double temperature,
            Double humidity,
            Double precipitation,
            Double windSpeed,
            Integer weatherCode,
            String condition,
            Double next24hRainfall,
            String error) {
    }

    public record DistrictWeather(WeatherSnapshot snapshot, boolean stale) {
    }

    private record CacheEntry(WeatherSnapshot snapshot, Instant storedAt) {
    }

    private final RestClient client = RestClient.create();
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    @Value("${disasterlink.weather.base-url}")
    private String baseUrl;
    @Value("${disasterlink.weather.cache-ttl-minutes:15}")
    private long ttlMinutes;
    @Value("${disasterlink.weather.timeout-seconds:8}")
    private long timeoutSeconds;

    @SuppressWarnings("unchecked")
    public DistrictWeather fetch(String districtCode, double lat, double lng) {
        CacheEntry cached = cache.get(districtCode);
        if (cached != null && Duration.between(cached.storedAt(), Instant.now()).toMinutes() < ttlMinutes) {
            return new DistrictWeather(cached.snapshot(), false);
        }
        String url = baseUrl
                + "?latitude=" + lat + "&longitude=" + lng
                + "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m"
                + "&hourly=precipitation&daily=precipitation_sum,temperature_2m_max,temperature_2m_min"
                + "&timezone=Asia%2FKolkata&forecast_days=5";
        try {
            Map<String, Object> payload = client.get().uri(url).retrieve().body(Map.class);
            if (payload == null || !(payload.get("current") instanceof Map<?, ?> current)) {
                throw new IllegalStateException("Open-Meteo response missing current block");
            }
            Map<String, Object> currentMap = (Map<String, Object>) current;
            double next24h = 0.0;
            if (payload.get("hourly") instanceof Map<?, ?> hourly
                    && hourly.get("precipitation") instanceof java.util.List<?> precipitation) {
                next24h = precipitation.stream()
                        .limit(24)
                        .mapToDouble(value -> value instanceof Number number ? number.doubleValue() : 0.0)
                        .sum();
            }
            WeatherSnapshot snapshot = new WeatherSnapshot(
                    true,
                    "Open-Meteo",
                    "OBSERVED",
                    Instant.now(),
                    number(currentMap.get("temperature_2m")),
                    number(currentMap.get("relative_humidity_2m")),
                    number(currentMap.get("precipitation")),
                    number(currentMap.get("wind_speed_10m")),
                    number(currentMap.get("weather_code")) == null ? null : number(currentMap.get("weather_code")).intValue(),
                    conditionLabel(number(currentMap.get("weather_code"))),
                    Math.round(next24h * 10) / 10.0,
                    null);
            cache.put(districtCode, new CacheEntry(snapshot, Instant.now()));
            return new DistrictWeather(snapshot, false);
        } catch (Exception error) {
            if (cached != null) {
                return new DistrictWeather(new WeatherSnapshot(
                        cached.snapshot().available(), cached.snapshot().source(), cached.snapshot().sourceClass(),
                        cached.snapshot().fetchedAt(), cached.snapshot().temperature(), cached.snapshot().humidity(),
                        cached.snapshot().precipitation(), cached.snapshot().windSpeed(), cached.snapshot().weatherCode(),
                        cached.snapshot().condition(), cached.snapshot().next24hRainfall(),
                        "Live refresh failed; showing last successful update: " + error.getMessage()), true);
            }
            return new DistrictWeather(new WeatherSnapshot(false, "Open-Meteo", "OBSERVED", Instant.now(),
                    null, null, null, null, null, "Unknown", null,
                    "Weather provider unavailable. No values are fabricated."), false);
        }
      }

    private Double number(Object value) {
        return value instanceof Number number ? number.doubleValue() : null;
    }

    private String conditionLabel(Double code) {
        if (code == null) return "Unknown";
        int value = code.intValue();
        if (value == 0) return "Clear sky";
        if (value <= 3) return "Cloudy";
        if (value <= 48) return "Fog";
        if (value <= 55) return "Drizzle";
        if (value <= 67) return "Rain";
        if (value <= 82) return "Rain showers";
        return "Thunderstorm";
    }

    public Optional<WeatherSnapshot> cached(String districtCode) {
        CacheEntry entry = cache.get(districtCode);
        return entry == null ? Optional.empty() : Optional.of(entry.snapshot());
    }
}
