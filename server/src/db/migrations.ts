/**
 * Schema migrations, applied in order. The database's PRAGMA user_version
 * records how many have run, so each entry runs exactly once. Never edit a
 * shipped migration - append a new one.
 *
 * Naming: a "product" is one purchasable filament (brand + material + line
 * + color, e.g. Sunlu PLA Wood Walnut); a "spool" is one physical roll of
 * it, and its id is the Spool #ID printed on labels and profile names.
 */
export const MIGRATIONS: string[] = [
  /* 1: inventory, provenance, enrichment cache, settings */ `
  CREATE TABLE vendors (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL COLLATE NOCASE UNIQUE,
    website       TEXT,
    notes         TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE products (
    id              INTEGER PRIMARY KEY,
    vendor_id       INTEGER NOT NULL REFERENCES vendors(id),
    material        TEXT NOT NULL,          -- OrcaSlicer filament_type: PLA, PETG, TPU, ...
    line            TEXT,                   -- product line / finish: Wood, Silk, Matte, ...
    color_name      TEXT,
    color_hex       TEXT,                   -- #RRGGBB
    diameter_mm     REAL NOT NULL DEFAULT 1.75,
    density         REAL,                   -- g/cm3
    net_weight_g    REAL,
    spool_weight_g  REAL,                   -- empty spool (tare)
    nozzle_min      INTEGER,
    nozzle_max      INTEGER,
    bed_min         INTEGER,
    bed_max         INTEGER,
    dry_temp_c      INTEGER,
    dry_hours       REAL,
    speed_note      TEXT,                   -- manufacturer's printing-speed guidance, verbatim
    product_url     TEXT,
    datasheet_url   TEXT,
    gtin            TEXT,
    ofd_id          TEXT,                   -- Open Filament Database variant id
    spoolmandb_id   TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX products_vendor ON products(vendor_id);
  CREATE INDEX products_gtin ON products(gtin);

  CREATE TABLE spools (
    id                INTEGER PRIMARY KEY,
    product_id        INTEGER NOT NULL REFERENCES products(id),
    purchased_on      TEXT,                 -- YYYY-MM-DD
    price             REAL,
    store             TEXT,
    lot               TEXT,
    initial_weight_g  REAL,                 -- net filament on this spool, if it differs from the product's
    archived          INTEGER NOT NULL DEFAULT 0,
    notes             TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX spools_product ON spools(product_id);

  -- Where each stored value came from. One row per (entity, field) and
  -- source decision, newest wins; history is kept for auditing.
  CREATE TABLE field_sources (
    id           INTEGER PRIMARY KEY,
    entity       TEXT NOT NULL CHECK (entity IN ('vendor', 'product', 'spool')),
    entity_id    INTEGER NOT NULL,
    field        TEXT NOT NULL,
    value        TEXT,                      -- JSON
    source       TEXT NOT NULL,             -- manual | ofd | spoolmandb | spoolz | product_url | orca_import | default
    source_ref   TEXT,                      -- URL, file path or dataset id
    captured_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX field_sources_entity ON field_sources(entity, entity_id);

  CREATE TABLE enrich_cache (
    source      TEXT NOT NULL,
    key         TEXT NOT NULL,
    version     TEXT,
    fetched_at  TEXT NOT NULL,
    body        TEXT NOT NULL,
    PRIMARY KEY (source, key)
  );

  CREATE TABLE settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL                    -- JSON
  );
  `,

  /* 2: OrcaSlicer profiles seen at import - untrusted starting values for calibration */ `
  CREATE TABLE imported_profiles (
    id            INTEGER PRIMARY KEY,
    product_id    INTEGER NOT NULL REFERENCES products(id),
    file_name     TEXT NOT NULL UNIQUE,      -- e.g. "Sunlu - Walnut Wood.json"
    profile_name  TEXT NOT NULL,
    inherits      TEXT,
    generated_by  TEXT,                      -- "spoolman2slicer" when its _comment says so
    settings      TEXT NOT NULL,             -- JSON of the slicer keys the file set
    imported_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX imported_profiles_product ON imported_profiles(product_id);
  `,

  /* 3: appearance - finish, multi-color, Shore hardness */ `
  ALTER TABLE products ADD COLUMN finish TEXT;                 -- see lib/appearance.ts FINISHES
  ALTER TABLE products ADD COLUMN color_hexes TEXT;            -- JSON ["#RRGGBB", ...] for multi-color; color_hex is the main one
  ALTER TABLE products ADD COLUMN multi_color_direction TEXT;  -- coaxial | longitudinal
  ALTER TABLE products ADD COLUMN shore_scale TEXT;            -- A | D
  ALTER TABLE products ADD COLUMN shore_hardness INTEGER;

  -- Products saved so far carry their finish in the line ("Silk", "Glow",
  -- "Transparent"); copy it over, recorded as inferred so it's not mistaken
  -- for something the user entered.
  UPDATE products SET finish = CASE
      WHEN lower(line) LIKE '%silk%' THEN 'Silk'
      WHEN lower(line) LIKE '%matte%' THEN 'Matte'
      WHEN lower(line) LIKE '%marble%' THEN 'Marble'
      WHEN lower(line) LIKE '%glitter%' OR lower(line) LIKE '%sparkle%' THEN 'Glitter'
      WHEN lower(line) LIKE '%glow%' THEN 'Glow in the Dark'
      WHEN lower(line) LIKE '%translucent%' OR lower(line) LIKE '%transparent%' THEN 'Translucent'
      WHEN lower(line) LIKE '%wood%' THEN 'Wood Fill'
    END
  WHERE line IS NOT NULL;
  INSERT INTO field_sources (entity, entity_id, field, value, source, source_ref)
    SELECT 'product', id, 'finish', json_quote(finish), 'inferred', 'from line "' || line || '"' FROM products WHERE finish IS NOT NULL;
  `,

  /* 4: calibration history - every run is kept; the latest accepted run per OrcaSlicer key is the tuned value */ `
  CREATE TABLE calibration_runs (
    id           INTEGER PRIMARY KEY,
    spool_id     INTEGER NOT NULL REFERENCES spools(id),
    test         TEXT NOT NULL,              -- see lib/calibration/tests.ts
    params       TEXT NOT NULL,              -- JSON: the values entered in OrcaSlicer's test dialog
    observation  TEXT NOT NULL,              -- JSON: what was seen on the print
    result       TEXT NOT NULL,              -- JSON: [{ key, value }] OrcaSlicer filament keys
    formula      TEXT NOT NULL,              -- the math, as shown to the user
    accepted     INTEGER NOT NULL DEFAULT 1, -- 0 = kept for history but not used
    notes        TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX calibration_runs_spool ON calibration_runs(spool_id, created_at);
  `,
];
