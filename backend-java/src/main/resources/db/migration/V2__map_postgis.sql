-- DisasterLink Phase 1 — PostGIS map support
-- Flyway migration for the Java/Spring Boot backend.
--
-- The current Sandbox preview database does NOT have the PostGIS extension
-- installed, so this migration is intentionally shipped with the Java module
-- and applied there. The TypeScript API used by the preview stores the same
-- data with numeric lat/lng columns plus the simplified GeoJSON assets in
-- src/data/, and exposes standards-compliant GeoJSON from /api/geo.
--
-- Apply order: V1 (existing schema) -> V2 (this file).

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- District geometry (authoritative polygons, geometry generalised for serving)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS district_geometry (
    district_code    VARCHAR(12) PRIMARY KEY REFERENCES districts (code) ON DELETE CASCADE,
    name             VARCHAR(120) NOT NULL,
    boundary_source  VARCHAR(240) NOT NULL,
    boundary_year    VARCHAR(40),
    geom             geometry(MultiPolygon, 4326) NOT NULL,
    geom_simplified  geometry(MultiPolygon, 4326),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT district_geometry_valid CHECK (ST_IsValid(geom))
);

CREATE INDEX IF NOT EXISTS district_geometry_gix ON district_geometry USING GIST (geom);
CREATE INDEX IF NOT EXISTS district_geometry_simplified_gix ON district_geometry USING GIST (geom_simplified);

COMMENT ON TABLE district_geometry IS
    'Authentic Tamil Nadu district boundaries (2011 Census source, simplified for web delivery). Mayiladuthurai has no polygon in that dataset and remains absent here by design rather than approximated.';

-- ---------------------------------------------------------------------------
-- Facility location points (backfilled from existing lat/lng columns)
-- ---------------------------------------------------------------------------
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

UPDATE facilities
   SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
 WHERE geom IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS facilities_geom_gix ON facilities USING GIST (geom);
CREATE INDEX IF NOT EXISTS facilities_district_category_idx ON facilities (district_code, category) WHERE is_active;

-- Keep the point column in sync with lat/lng updates made by the API layer.
CREATE OR REPLACE FUNCTION facilities_sync_geom() RETURNS trigger AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    ELSE
        NEW.geom := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS facilities_geom_sync ON facilities;
CREATE TRIGGER facilities_geom_sync
    BEFORE INSERT OR UPDATE OF lat, lng ON facilities
    FOR EACH ROW EXECUTE FUNCTION facilities_sync_geom();

-- ---------------------------------------------------------------------------
-- Helpers used by the map module
-- ---------------------------------------------------------------------------

-- District containing a point (used for "which district am I in" checks).
CREATE OR REPLACE FUNCTION district_at(lng DOUBLE PRECISION, lat DOUBLE PRECISION)
RETURNS VARCHAR(12) AS $$
    SELECT dg.district_code
      FROM district_geometry dg
     WHERE ST_Contains(dg.geom, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
     LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Facilities inside a district with distance ordering, for evacuation support.
CREATE OR REPLACE VIEW facility_map_view AS
SELECT f.id,
       f.name,
       f.category,
       f.facility_class,
       f.district_code,
       f.address,
       f.phone,
       f.availability_status,
       f.capacity,
       f.occupancy,
       f.capacity_data_class,
       f.verification_status,
       f.data_class,
       ST_Y(f.geom) AS lat,
       ST_X(f.geom) AS lng,
       f.geom
  FROM facilities f
 WHERE f.is_active AND f.geom IS NOT NULL;

COMMENT ON VIEW facility_map_view IS
    'Map marker source for the GIS layer. capacity/occupancy values whose capacity_data_class is SIMULATED are demonstration values and must be labelled as such in the UI.';
