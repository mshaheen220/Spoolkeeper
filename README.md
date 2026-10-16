# Spoolkeeper (developer guide)

New-filament intake, per-spool calibration, and non-destructive OrcaSlicer profile publishing. Spoolkeeper keeps its own spool inventory in SQLite and is the source of truth for tuned values. It does **not** talk to a Spoolman server; it only reads open filament datasets for enrichment.

How to use the app: see [USER_GUIDE.md](USER_GUIDE.md).

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Intake + enrichment, inventory, OrcaSlicer import, manual profile export | **Done** |
| 2 | Calibration wizard (temp → max volumetric speed → PA → flow P1/P2 or YOLO → retraction → cooling/bed), per-spool history, tuned values in profiles | **Done** |
| 3 | Direct, non-destructive publish into OrcaSlicer (diff, backups, hand-tune guard), spoolman2slicer cleanup, printable labels | Planned |

## Quick start

```bash
# Docker, production build  → http://localhost:8003
docker compose up --build -d

# Docker, hot reload        → http://localhost:5175 (API on :8003)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Or natively (Node 24)     → http://localhost:5175
npm install
npm run dev
```

From a phone on the same Wi-Fi, open `http://<this-mac's-LAN-IP>:8003`.

| Script | What it does |
|---|---|
| `npm run dev` | Express (tsx watch, :3003) + Vite (:5175, proxies `/api`) |
| `npm run build` | Vite client build + `tsc` server build |
| `npm start` | Run the built server (serves `client/dist` too) |
| `npm run typecheck` / `npm run lint` | Both workspaces |
| `npm test` | vitest over `server/src/**/*.test.ts` and `client/src/**/*.test.ts` (no network needed) |

Native dev uses `:3003` for the API because chocolate-mold-factory already holds `:3000` on this host. Inside Docker the server listens on 3000, mapped to host port 8003.

## Architecture

```
client/                 React 19 + TypeScript + Tailwind 4 (Vite), react-router
  src/pages/            SpoolsPage, SpoolDetailPage, IntakePage, EditProductPage, ImportPage, SettingsPage
  src/hooks/            useProductForm (values + provenance + lookup, shared by intake and edit)
  src/components/       Header, TipsPanel, ThemeSwitcher, FormField, SourceBadge, Swatch, ProfileCard, product/ (ColorEditor, sections), intake/
  src/lib/              suggestions (merging), productFields (labels + "why it matters"), barcode
server/                 Express + TypeScript, better-sqlite3, zod
  src/db/               migrations (PRAGMA user_version), repo (all SQL)
  src/lib/enrich/       ofd, spoolmandb, spoolz, productPage, fetch (cache), text (matching)
  src/lib/orca/         userProfiles (import parser), profile (preset builder), bases
  src/lib/calibration/  tests (dialog defaults, block lists, formulas - each cited to OrcaSlicer 2.4.2 source), service (runs, tuned values)
  src/routes/           health, tips, inventory, enrich, orcaImport, profile, settings
data/                   spoolkeeper.db (git-ignored; mounted at /data in Docker)
```

**Where it runs.** Locally on the Mac, in Docker, so it can reach OrcaSlicer's user folder. `~/Library/Application Support/OrcaSlicer` is mounted **read-only** at `/orcaslicer`. Spoolkeeper reads `user/default` (presets) and `OrcaSlicer.conf` (which plate type each printer preset uses) from it. Phase 3 adds a writable mount for publishing. Set `ORCA_DIR_HOST` if your folder lives elsewhere.

### Data model

| Table | Holds |
|---|---|
| `vendors` | Brands, case-insensitively unique |
| `products` | One purchasable filament: brand + material (OrcaSlicer `filament_type`) + line + color, plus physical and maker values. Appearance: `finish`, `color_hexes` (JSON, 2–6 colors) and `multi_color_direction` (`coaxial` or `longitudinal`), with `color_hex` as the **main** color (always one of `color_hexes`, the first by default; it's what OrcaSlicer's single `default_filament_colour` gets), plus `shore_scale` / `shore_hardness` |
| `spools` | Physical rolls; `id` is the **Spool #ID** on labels and profile names |
| `field_sources` | Provenance for every stored value: `manual`, `ofd`, `spoolmandb`, `spoolz`, `product_url`, `orca_import`, `default` or `inferred` (derived by Spoolkeeper, e.g. finish from a "Silk" line), plus a reference |
| `imported_profiles` | OrcaSlicer presets seen at import, with the tunable keys they set (untrusted starting values) |
| `calibration_runs` | Every calibration run per spool: test, dialog params, observation, result (OrcaSlicer keys), formula, accepted, notes. The latest accepted value per key is the tuned value |
| `enrich_cache` | Cached dataset responses (served stale when offline) |
| `settings` | e.g. `printerProfile` |

### Enrichment sources

| Source | Access | License | Used for |
|---|---|---|---|
| [Open Filament Database](https://api.openfilamentdatabase.org/) | Static JSON API, walked brand → material → filament → variant; `gtin-index.json` for barcodes | MIT | Identity, color, density, temp ranges, drying max, datasheet, GTIN, spool weight |
| [SpoolmanDB](https://github.com/Donkie/SpoolmanDB) | `donkie.github.io/SpoolmanDB/filaments.json` (the dataset, not a Spoolman server) | MIT | Density, spool weight, temps, color |
| [spoolz](https://github.com/jtrmal/spoolz) | GitHub tree API + raw Markdown pages | Public domain | Measured empty-spool weight and dimensions |
| Product page | Server-side fetch → JSON-LD, Shopify `/products/<handle>.json`, then text patterns | — | Maker temps, speed, drying, density, with the snippet each came from |
| Material defaults | `server/src/lib/materials.ts` | — | Last-resort typical values, labelled "Default" |

3dfilamentprofiles.com and filamentdb.app have no public API or license, so they aren't scraped.

Everything is a **suggestion**: the client merges them per field (`client/src/lib/suggestions.ts`) and nothing is applied until the user taps it. The bulk fill only touches empty fields where every real source agrees.

## API

All JSON under `/api`. Everything except `/api/tips` is CORS-locked to `CLIENT_ORIGIN`.

| Method & path | Purpose |
|---|---|
| `GET /health` | DB status and whether the OrcaSlicer folder is readable |
| `GET /tips` (also `/tips/`) | `{ tips: [{ category, text }] }`, open CORS for Mashghal |
| `GET /vendors`, `GET /products`, `GET /products/:id`, `PATCH /products/:id` | Inventory |
| `GET /products/match?vendor=&material=&line=&colorName=` | Existing product with the same identity, or `null` |
| `GET /spools[?archived=1]`, `GET /spools/:id`, `POST /spools`, `PATCH /spools/:id` | Spools. `POST` takes `product` or `productId`, `quantity` and `sources: { "product.density": { source, sourceRef } }` |
| `GET /enrich/search?vendor=&material=&line=&colorName=` | Candidates from every source; nothing saved |
| `GET /enrich/gtin/:code` | Barcode → identity + OFD values |
| `POST /enrich/url { url }` | Read a product page |
| `POST /enrich/refresh` | Clear cached datasets |
| `GET /materials` | Material types with typical values |
| `GET /import/orca/preview`, `POST /import/orca { rows }` | Read-only OrcaSlicer import |
| `GET /spools/:id/profile[?scope=spool\|product]` | **Stable endpoint for other tools:** every value Spoolkeeper would write to OrcaSlicer, with source and reason, plus `pending` (not yet calibrated) and the raw preset JSON and `.info` |
| `GET /spools/:id/profile/orca.json[?scope=…]` | The preset as a download |
| `GET /spools/:id/calibration` | Wizard state: tests with OrcaSlicer dialog values suggested for this filament, run history, tuned values, base-profile defaults, sibling spools' values |
| `POST /spools/:id/calibration/preview` `{ test, params, observation }` | Compute a result and its formula without saving |
| `POST /spools/:id/calibration/runs` | Save a run (validated, computed server-side) |
| `PATCH /calibration/runs/:id { accepted }` | Stop or resume using a run; runs are never deleted |
| `GET /settings`, `PUT /settings { printerProfile, linearAdvance }`, `POST /settings/esteps` | Settings, Linear Advance status, E-steps check |
| `GET /orca/printers` | Printer presets in the mounted OrcaSlicer folder (exact `name` fields), for the Settings dropdown |

### OrcaSlicer preset format

Verified against OrcaSlicer 2.4.2's own user presets:

- **File and name.** The file name is the preset name, e.g. `Sunlu PLA Wood Walnut (Spool #13).json` (per spool) or `Sunlu PLA Wood Walnut.json` (per product).
- **Values.** Each one is a single-element string array. Keys are sorted, with 4-space indent.
- **`inherits`.** The material's Creality generic (`Creality Generic PLA`/`PETG`/`TPU`/`ABS`/`ASA`/`PLA-CF`), or OrcaFilamentLibrary's `Generic X @System`; see `server/src/lib/orca/bases.ts`.
- **`compatible_printers`.** `[]` with an empty `compatible_printers_condition`, which means compatible with every printer (`Preset.cpp` `is_compatible_with_printer`, OrcaSlicer 2.4.2). Filament isn't machine-specific. Each calibration run records the printer preset and nozzle it was measured on (`calibration_runs.printer_profile` / `nozzle_diameter`, from Settings' "Printer you calibrate on"), and the profile notes list them as "Tuned on …".
- **`filament_notes`.** Lists all colors (and direction), the finish and the Shore hardness, which have no preset keys. It ends with `spoolkeeper:spool=<id>;product=<id>`, which marks files Spoolkeeper owns. OrcaSlicer 2.4.2's `filament_multi_colour` / `filament_colour_type` are per-project filament-slot settings, not preset keys, so presets carry only the main color.
- **`.info`.** `base_id` is the base's `filament_id` (e.g. `GFL99`).

## Conventions

Shared with the other workshop apps (GripTab, chocolate-mold-factory, svg-stacker):

- **Version.** `vite.config.ts` reads the **root** `package.json` and injects `__APP_VERSION__`, which the header shows. Bump the root version on every change: patch for fixes, minor for features.
- **Tips.** Live in `server/src/data/tips.ts` and are served at `/api/tips` in the shape Mashghal aggregates. `TipsPanel` tours them in shuffled order.
- **Theme.** Day / night / system switcher (`client/src/hooks/useTheme.ts`), persisted under localStorage key `theme`. A pre-paint script in `index.html` prevents a flash. A mirrored `ink-*` ramp in `index.css` means components never need per-theme variants.
- **Provenance.** Every write of a product or spool value records its source. Imported OrcaSlicer values and scraped page values are never treated as verified.
- **Commits.** Small and logical, with a clear message and a version bump.

## Configuration

See `.env.example`: `PORT`, `DATA_DIR`, `ORCA_USER_DIR`, `ORCA_CONF`, `ORCA_DIR_HOST` (Docker), `FETCH_TIMEOUT_MS`, `CLIENT_ORIGIN`.
