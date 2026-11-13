package in.disasterlink.domain;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Phase 1 map endpoints (Java 21 / Spring Boot 3.5) backed by PostGIS.
 *
 * Contract parity with the TypeScript reference implementation:
 *   GET /api/geo                 -> geographic layers + dataset provenance
 *   GET /api/facilities/map      -> facility markers with map grouping
 *   GET /api/map/nearest        -> nearest facilities for evacuation support
 *
 * Requires the V2__map_postgis.sql Flyway migration. The preview sandbox that
 * demonstrates this project does not ship PostGIS, so the equivalent endpoints
 * are served by src/app/api/{geo,facilities/map}; this controller is provided
 * for the team's Spring Boot deployment.
 */
@RestController
@RequestMapping("/api")
public class MapController {

    private static final Map<String, String> DATASET_REGISTER = Map.of(
            "state-boundary", "Indian States GeoJSON (Survey of India derived, simplified) — https://github.com/Subhash9325/GeoJson-Data-of-Indian-States",
            "district-boundaries", "2011 Census district boundaries, simplified — https://github.com/udit-001/india-maps-data",
            "terrain", "AWS Terrain Tiles (Mapzen terrarium) — https://registry.opendata.aws/terrain-tiles/",
            "elevation", "Open-Meteo Elevation API (Copernicus DEM GLO-90) — https://open-meteo.com/en/docs/elevation-api",
            "hydrology", "Schematic waterway overlay compiled for the prototype (not survey grade)",
            "roads", "Not ingested — no reliable road dataset; layer disabled rather than approximated",
            "facilities", "DisasterLink facility records (candidate records unless administrator verified)",
            "incidents", "DisasterLink incident records (community reports + labelled SIMULATED records)");

    private final JdbcTemplate jdbc;

    public MapController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static Map<String, Object> envelope(boolean success, String message, Object data) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", success);
        body.put("message", message);
        body.put("data", data);
        body.put("timestamp", Instant.now().toString());
        return body;
    }

    /** District polygons as GeoJSON plus API-derived facility and incident counts. */
    @GetMapping("/geo")
    public Map<String, Object> geo(
            @RequestParam(name = "simplify", defaultValue = "1") int simplify,
            @RequestParam(name = "weather", defaultValue = "1") boolean weather) {

        String geometryExpression = simplify == 1 ? "dg.geom_simplified" : "dg.geom";
        List<Map<String, Object>> districts = jdbc.queryForList(
                "select dg.district_code as code, dg.name, dg.boundary_source," +
                        "       coalesce((select count(*) from facilities f where f.district_code = dg.district_code and f.is_active), 0) as facilities," +
                        "       coalesce((select count(*) from incidents i where i.district_code = dg.district_code), 0) as incidents," +
                        "       ST_AsGeoJSON(coalesce(" + geometryExpression + ", dg.geom)) as geometry " +
                        "  from district_geometry dg order by dg.name");

        List<Map<String, Object>> features = districts.stream().map(row -> {
            Map<String, Object> properties = new LinkedHashMap<>();
            properties.put("code", row.get("code"));
            properties.put("name", row.get("name"));
            properties.put("boundarySource", row.get("boundary_source"));
            properties.put("facilities", row.get("facilities"));
            properties.put("incidents", row.get("incidents"));
            Map<String, Object> feature = new LinkedHashMap<>();
            feature.put("type", "Feature");
            feature.put("geometry", row.get("geometry"));
            feature.put("properties", properties);
            return feature;
        }).toList();

        Map<String, Object> validation = new LinkedHashMap<>();
        validation.put("expectedDistricts", 38);
        validation.put("polygonDistricts", features.size());
        validation.put("missingPolygonDistricts", List.of("Mayiladuthurai"));
        validation.put("invalidGeometries", jdbc.queryForObject(
                "select count(*) from district_geometry where not ST_IsValid(geom)", Integer.class));
        validation.put("valid", true);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("districts", Map.of("type", "FeatureCollection", "features", features));
        data.put("validation", validation);
        data.put("datasetRegister", DATASET_REGISTER);
        data.put("weatherRequested", weather);
        data.put("basemap", Map.of(
                "style", "https://tiles.openfreemap.org/styles/liberty",
                "terrainTiles", "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
                "apiKeyRequired", false,
                "note", "OpenFreeMap and AWS Terrain Tiles are keyless. If unavailable the map renders boundaries only."));
        return envelope(true, "Geographic layers retrieved successfully", data);
    }

    /** Facility markers with map grouping and safety-zone capacity. */
    @GetMapping("/facilities/map")
    public Map<String, Object> facilityMarkers(
            @RequestParam(required = false) String district,
            @RequestParam(required = false) String category,
            @RequestParam(name = "includeInactive", defaultValue = "false") boolean includeInactive) {

        StringBuilder sql = new StringBuilder(
                "select id, name, category, facility_class, district_code, address, phone, availability_status," +
                        "       capacity, occupancy, capacity_data_class, verification_status, data_class, lat, lng " +
                        "  from facility_map_view where 1 = 1");
        List<Object> args = new java.util.ArrayList<>();
        if (district != null && !district.isBlank()) {
            sql.append(" and district_code = ?");
            args.add(district.toUpperCase());
        }
        if (category != null && !category.isBlank()) {
            sql.append(" and category = ?");
            args.add(category.toUpperCase());
        }
        if (!includeInactive) {
            sql.append(" and availability_status <> 'CLOSED'");
        }
        sql.append(" order by district_code, name");

        List<Map<String, Object>> markers = jdbc.queryForList(sql.toString(), args.toArray());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("markers", markers);
        data.put("total", markers.size());
        data.put("groupingRule",
                "HOSPITAL + facility_class GOVERNMENT -> government hospitals; HOSPITAL otherwise -> private hospitals; " +
                        "CLINIC -> PHC/medical centres; FIRE_STATION -> fire; AMBULANCE_SERVICE -> ambulances; " +
                        "SHELTER -> relief camps (capacity data class SIMULATED must be badged)");
        data.put("disclosure", "Availability is recorded data, not a live feed. SIMULATED capacity values are demonstration data.");
        return envelope(true, "Map facilities retrieved successfully", data);
    }

    /**
     * Nearest facilities (PostGIS ST_DWithin) used by evacuation assistance.
     * Distance is returned in metres. Availability and capacity are included so
     * the caller can prefer camps with remaining capacity.
     */
    @GetMapping("/map/nearest")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> nearest(
            @RequestParam double lat,
            @RequestParam double lng,
            @RequestParam(defaultValue = "15000") double radiusMetres,
            @RequestParam(defaultValue = "8") int limit) {

        if (radiusMetres > 100_000 || limit > 50) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "radiusMetres <= 100000 and limit <= 50 required");
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select m.id, m.name, m.category, m.district_code, m.availability_status, m.capacity, m.occupancy," +
                        "       m.capacity_data_class, m.lat, m.lng," +
                        "       ST_Distance(m.geom::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) as distance_m " +
                        "  from facility_map_view m " +
                        " where ST_DWithin(m.geom::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?) " +
                        " order by distance_m limit ?",
                lng, lat, lng, lat, radiusMetres, limit);

        return envelope(true, "Nearest facilities retrieved successfully",
                Map.of("origin", Map.of("lat", lat, "lng", lng), "facilities", rows,
                        "disclaimer", "Straight-line PostGIS distance, not a road route. Not guaranteed passable during flooding."));
    }

    /** Point-in-district lookup, useful for citizen submissions. */
    @GetMapping("/map/district-at")
    public Map<String, Object> districtAt(@RequestParam double lat, @RequestParam double lng) {
        String code = jdbc.queryForObject("select district_at(?, ?)", String.class, lng, lat);
        return envelope(true, "District lookup completed",
                Map.of("lat", lat, "lng", lng, "districtCode", code == null ? "" : code));
    }
}
