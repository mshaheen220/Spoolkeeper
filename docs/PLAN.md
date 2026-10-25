# Spoolkeeper — plan

> Approved plan from the initial build session (2026-10-15). Phase 1 is implemented; Phases 2–3 follow this document.

## Context
You lose tuned OrcaSlicer filament settings because `spoolman2slicer` regenerates `Vendor - Name.json` from a template, with no no-overwrite option, and it hardcodes `filament_flow_ratio 0.94`, `inherits "Voron Generic PLA"` and Klipper G-code on a Marlin printer. Spoolkeeper becomes the single source of truth for spools and tuned values. It covers intake, calibration and non-destructive OrcaSlicer publishing.

**Change since the original prompt:** Spoolkeeper does **not** use the local Spoolman (`spoolman-local`, :18000) or any Spoolman API. It owns its own inventory in SQLite. Open external datasets are used for enrichment: Open Filament Database, the SpoolmanDB public dataset, spoolz, and product pages (see §5).

Decisions already made by the user:
- **Hybrid stack.** GripTab/CMF layout plus the svg-stacker generation of frontend tools.
- **Profile scope.** Chosen on each publish (per spool or per product).
- **Seed data.** Optional one-time import from the existing OrcaSlicer user profiles.
- **spoolman2slicer.** Retire it. Phase 3 offers a backup-then-cleanup of its generated files.

---

## 1. Conventions found in the sibling repos
Sources: GripTab, chocolate-mold-factory (CMF), svg-stacker, platesmith, plus Mashghal's `src/config/apps.js`.

| Area | Convention to match |
|---|---|
| Layout | npm workspaces root with `client/` (Vite) and `server/` (Express+TS); scripts `dev`, `dev:server`, `dev:client`, `build`, `start`, `lint`, `typecheck` (GripTab/CMF `package.json`) |
| Server | `server/src/{index.ts,config.ts,routes/*.ts,lib/*.ts,data/tips.ts}`; one Router per file mounted on `/api`; global `cors({origin: config.clientOrigin})`; static `client/dist` plus SPA fallback in production; JSON error handler (`GripTab/server/src/index.ts`) |
| Tips | `server/src/data/tips.ts` exports `TIPS: {category,text}[]`. `GET /api/tips` uses route-level open `cors()` and returns `{ tips: [...] }`, and Mashghal fetches `/api/tips/` (`GripTab/server/src/routes/tips.ts`). The client uses `useTips` (module-level promise cache) and a `TipsPanel` with a Fisher-Yates tour, prev/next, autoplay and collapse, plus `shuffleIndices` in `client/src/tips.ts`. I'll add svg-stacker's localStorage-persisted open state and `aria-live`, and a vitest shape test copied from `svg-stacker/tests/tips.test.ts` |
| Theme | Copy svg-stacker `useTheme.ts` and `ThemeSwitcher.tsx`: day/night/system radiogroup, localStorage key `theme`, `data-theme="day"` on `<html>`, plus a pre-paint script in `index.html`. Use the CSS-variable `ink-*` palette from `GripTab/client/src/index.css` with Tailwind 4 `@theme` |
| Version | `vite.config.ts` reads the **root** `package.json` and injects `define: { __APP_VERSION__ }`, declared in `vite-env.d.ts` and rendered as `v{__APP_VERSION__}` next to the title in the header |
| Docker | Multi-stage `Dockerfile` (deps, deps-prod, client-builder, server-builder, dev, client-dev, runtime); `docker-compose.yml` (runtime with healthcheck on `/api/health`); `docker-compose.dev.yml` override (tsx watch plus Vite HMR with `VITE_PROXY_TARGET`) |
| Docs | `README.md` is the developer guide and `USER_GUIDE.md` is the user guide (svg-stacker is the only sibling that already has two) |
| Hygiene | `.gitignore` (GripTab style, keeping `.vscode/settings.json`), `.dockerignore`, `.editorconfig`, `.env.example` |
| Style | Small commented modules; comments explain *why*; Tailwind utility classes; `aria-*` on icon buttons |

**Disagreements and how they're resolved:**
- Backend: Express (GripTab/CMF), FastAPI (platesmith) or none (svg-stacker). Use **Express+TS**.
- React 18 / Tailwind 3 / Node 20 versus React 19 / Tailwind 4 / Node 24. Use **the newer set**.
- Theme: 2-state toggle versus 3-state. Use **3-state**, because CLAUDE.md requires it.

**Ports in use:** 3000, 3050, 4000, 5173, 5174, 5181, 8001, 8002, 8181, 18000. Spoolkeeper uses **8003** in production and **5175** for Vite in dev.

**Peacock colors:** No sibling uses indigo/amber. Use `peacock.color #2b3a8c`, activity bar `#3a4db3`, badge `#e0a526`.

## 2. Architecture
- **Where it runs.** Local Docker on the MacBook. OrcaSlicer's user directory is bind-mounted, read-only in Phase 1 and read-write in Phase 3.
  - Your phone reaches it at `http://<mac-lan-ip>:8003`; `PUBLIC_BASE_URL` sets the address for QR links. With Spoolman out of the picture, TheForge has no reason to host it.
  - Tradeoff: the Mac must be awake when you're at the printer. Moving it to TheForge later only means changing the Phase 3 publish path.
- **Storage.** SQLite through `better-sqlite3` in `./data/spoolkeeper.db` on a volume. Migrations are numbered SQL files run at boot.
- **Backend.** Express + TypeScript, as above.
- **API**, all JSON:
  - `GET /api/health`, `GET /api/tips` (also `/api/tips/`)
  - `GET|POST|PATCH /api/vendors`, `/api/products`, `/api/spools`, plus `GET /api/spools/:id`
  - `GET /api/spools/:id/profile`: tuned values with provenance. This is the stable endpoint for your other tools.
  - `GET /api/spools/:id/profile/orca`: downloads the OrcaSlicer JSON.
  - `GET /api/enrich/search?brand=&material=&color=` (merged OFD, SpoolmanDB and spoolz suggestions), `GET /api/enrich/gtin/:code`, `POST /api/enrich/url {url}`, `POST /api/enrich/refresh`
  - `GET /api/import/orca/preview`, `POST /api/import/orca`
  - `GET|PUT /api/settings`

## 3. Data model (SQLite)
- `vendors`: id, name (unique, case-insensitive), website, notes
- `products`: the filament product. id, vendor_id, name, material, finish, color_name, color_hex, diameter_mm, density, net_weight_g, spool_weight_g, nozzle_min/max, bed_min/max, dry_temp_c, dry_hours, max_speed_note, product_url, gtin, ofd_variant_id, spoolmandb_id, datasheet_url, notes
- `enrich_cache`: source, key, version, fetched_at, body JSON
- `spools`: id (the displayed **Spool #ID**), product_id, purchased_on, price, store, lot, initial_weight_g, archived, notes
- `field_values`: provenance for every enriched or overridden field. entity, entity_id, field, value, source (`manual|spoolmandb|product_url|orca_import|calibration`), source_ref (URL or file), status (`suggested|accepted|rejected`), captured_at
- `calibration_runs` (Phase 2): id, spool_id, test (`temp|mvs|flow1|flow2|pa|retraction|cooling|bed`), orca_params JSON, observation JSON, computed JSON, formula_text, accepted, notes, created_at. History is kept, and the latest accepted run per test is the tuned value.
- `published_profiles` (Phase 3): id, scope (`spool|product`), spool_id/product_id, profile_name, file_path, inherits, written_values JSON (exactly what we wrote last time), content_hash, backup_path, published_at
- `settings`: orca_user_dir, printer_profile_name (`TheHammer  0.4 nozzle`, which has **two spaces**), label size, public_base_url, linear_advance_status (`unknown|supported|unsupported`)

## 4. Screens (mobile-first, single column on phones)
1. **Spools list.** Search and filter by material, with a color swatch, `#ID`, brand/material/color and a calibration-progress chip. A FAB opens intake.
2. **Intake.**
   - Brand (autocomplete), material, color name, hex picker, diameter, net weight, spool weight, price, store and URL.
   - An **Enrich** button runs SpoolmanDB and URL enrichment.
   - A **Review suggestions** card lists each field as `value · source badge · Accept / Edit / Reject`. Nothing is applied until you accept it.
   - Save offers to reuse an existing product match, so a second spool of the same product doesn't create a duplicate product.
3. **Spool detail.** Product info with sources, tuned values (Phase 2) and **Download OrcaSlicer profile**.
4. **Import from OrcaSlicer.** Parse `user/default/filament/*.json` and show a preview table with checkboxes. All imported values are marked `orca_import` (untrusted) and grouped into vendors and products by `filament_vendor`/name.
5. **Settings.** Paths, printer name, label dimensions, Linear Advance status.
6. Phase 2 **Calibrate wizard** and Phase 3 **Publish** (diff) and **Label**.

The header follows the siblings: logo, `vX.Y.Z`, TipsPanel (shown as a collapsed button on mobile) and ThemeSwitcher.

## 5. Enrichment sources and fallbacks
I checked every candidate on 2026-10-15. Each source sits behind its own adapter in `server/src/lib/enrich/` that returns `Suggestion { field, value, source, sourceRef, confidence }`. Suggestions from all sources are merged per field. When sources disagree you see every value side by side; nothing is auto-picked.

| # | Source | Access | License | What it gives us | Notes |
|---|---|---|---|---|---|
| 1 | **Open Filament Database** (Open Filament Collective / SimplyPrint, aligned with Prusa OpenPrintTag) | Static JSON API, no key. `https://api.openfilamentdatabase.org/api/v1/` → `brands/<slug>/materials/<MAT>/filaments/<slug>/variants/<slug>.json`, plus `search-index.json` and `gtin-index.json` (5,647 barcodes) | MIT | brand, material, product line, color name and hex, sizes, **GTIN**, density, diameter tolerance, print/bed temp ranges, max drying temp, datasheet URL, purchase links, per-slicer settings, and OrcaSlicer bundles (`/orcaslicer/`) | 176 brands, 2,114 filaments, 14,605 variants. Detail is uneven (e.g. Sunlu PLA Wood → Walnut has density, color and a purchase link, but no temps). Primary source for identity and barcode lookup. |
| 2 | **SpoolmanDB** | Static `https://donkie.github.io/SpoolmanDB/filaments.json` (8,120 rows) and `materials.json` | MIT | manufacturer, name, material, density, net weight, **spool weight**, extruder and bed temp, color hex, finish flags | Better temp coverage. Sunlu Walnut Wood: 210 °C / 60 °C / 1.25 / 130 g spool. This is the public dataset, not a Spoolman instance. |
| 3 | **spoolz** (onlyspoolz.com) | GitHub repo `jtrmal/spoolz` `content/portfolio/*.md` front matter, via the raw URL | Public domain | **empty spool weight** (measured), outer diameter, width, hole diameter | Useful for remaining-weight math and for sizing the Phase 3 label holder. |
| 4 | **Product URL** | Server-side fetch (timeout, 2 MB cap) → JSON-LD `Product`, Shopify `/products/<handle>.json`, then text regex for temps, speed and drying | n/a | manufacturer temps, speed and drying guidance | Every hit shows the source snippet. Amazon and other bot-walled pages will usually fail; you then see "nothing found", never a guess. |
| 5 | Built-in material table | Code | n/a | density and typical temps by material | Lowest priority, labelled `default`. |

**Not used:**
- **3dfilamentprofiles.com:** no public API or license; it returned HTTP 429 to a single request. Its pages are linked out instead.
- **filamentdb.app:** no API, and its robots.txt allows crawling, but its TDS-sourced data isn't licensed for reuse. Linked out only.

**Caching.** Use OFD `index.json`'s `version` as the cache key. Fetch the brand trees on demand, then cache them, `gtin-index.json`, `search-index.json` and SpoolmanDB in SQLite (`enrich_cache`), refreshing at most daily. A **Refresh data** button in Settings forces a refresh. When offline, the app runs on cached data.

**Barcode intake (phone).**
- *Scan barcode* opens the camera with `<input type="file" accept="image/*" capture>` and decodes the photo with `@zxing/browser`. A photo is used instead of a live video stream because the camera stream (`getUserMedia`) needs HTTPS and the app is served over plain LAN `http://`.
- The GTIN is looked up in the OFD `gtin-index`, which pre-fills brand, material, color and size; the other sources then fill the remaining fields.
- Typing the number in by hand is the fallback.

## 6. OrcaSlicer profile mapping
Every value is written as a single-element string array, matching the observed files.

| Ours | OrcaSlicer key |
|---|---|
| profile name | `name`, `filament_settings_id` |
| base | `inherits`: `Creality Generic PLA` / `PETG` / `TPU`. Their `compatible_printers` includes `Creality Ender-3 V2 0.4 nozzle`, which `TheHammer  0.4 nozzle` inherits. Silk and wood map to Creality Generic PLA. The map is editable in settings. |
| printer | `compatible_printers: []`, `compatible_printers_condition: ""`, i.e. every printer. *(Changed after Phase 2: filament is shelf stock, not machine-specific. Calibration runs record the printer and nozzle they were measured on, and profile notes say "Tuned on …".)* |
| from/version | `from: "User"`, `version: "2.4.0.0"`, `is_custom_defined: "0"` |
| vendor / material | `filament_vendor`, `filament_type` |
| color | `default_filament_colour` |
| diameter / density | `filament_diameter`, `filament_density` |
| cost / spool weight | `filament_cost` (price ÷ kg), `filament_spool_weight` |
| nozzle temp | `nozzle_temperature`, `nozzle_temperature_initial_layer`, `nozzle_temperature_range_low/high` |
| bed temp | `hot_plate_temp` (smooth PEI), `textured_plate_temp` (textured PEI), plus the `_initial_layer` variants |
| flow ratio | `filament_flow_ratio` |
| pressure advance | `enable_pressure_advance` and `pressure_advance`, written only if Linear Advance is `supported` |
| max volumetric speed | `filament_max_volumetric_speed` |
| retraction | `filament_retraction_length`, `filament_retraction_speed` |
| z-hop | `filament_z_hop`, `filament_z_hop_types` (e.g. `Slope Lift`) |
| wipe | `filament_wipe` (`1`), `filament_wipe_distance` |
| cooling | `fan_min_speed`, `fan_max_speed`, `close_fan_the_first_x_layers`, `slow_down_layer_time`, `overhang_fan_speed` |
| tag | `filament_notes: "spoolkeeper:spool=13;product=7;hash=…"` marks Spoolkeeper's own files. It's an Orca field, so it survives saves. |

Note: your known-good retraction 1.2 / Slope Lift / wipe 0.8 is currently set on the **printer** profile. Filament-level `filament_*` overrides only take effect where they're set, so the wizard records them per spool, and Phase 3 writes them only when they differ from the printer.

Each profile is a `<name>.json` plus a `<name>.info` (`sync_info = create`, `user_id =`, `setting_id =`, `base_id = <base's setting_id>`, `updated_time = <epoch>`), matching the existing files.

**Names:**
- Per spool: `Sunlu PLA Wood Walnut (Spool #13)`
- Per product: `Sunlu PLA Wood Walnut`

Files are named exactly after the preset (OrcaSlicer keys user presets by name). These names can't collide with spoolman2slicer's `Vendor - Name.json` files, and `filament_notes` carries the ownership tag. *(Changed during Phase 1 from an earlier `SK - ` file prefix idea.)*

## 7. Calibration (Phase 2), verified against OrcaSlicer 2.4.2
The binary contains the Temperature, Flow rate (Pass 1 Coarse, Pass 2 Fine, YOLO), Pressure advance (PA Tower/Line/Pattern), Retraction test and Max flowrate dialogs, with fields such as Start/End temp, PA step and Start/End retraction length.

**Recommended order:** Temp → Max volumetric speed → PA → Flow (Pass 1 + Pass 2, or YOLO) → Retraction → optional cooling and bed. *(Corrected in Phase 2: an earlier draft moved MVS last and claimed OrcaSlicer's guide did so; the guide actually puts MVS second, so that later tests don't exceed the hotend's limit. PA is skipped on TheHammer: M900 is an unknown command.)*

**Formulas:**
- Flow: `new = old × (100 + block)/100`, applied per pass.
- MVS: `start + height_mm × step`.
- PA tower: `start + height_mm × step`.
- Retraction: `start + height_mm × step`.

The exact Orca formula for each test (including YOLO) gets re-checked when Phase 2 starts.

**PA preflight:** send `M503` and look for an `M900 K` line. If it's missing, or `M900` returns "Unknown command", the PA step is flagged and skipped.

**Reference check:** Sunlu Walnut Wood at 210 °C stopped stringing with retraction 1.2 / Slope Lift / wipe 0.8. The wizard warns when a spool's results are far from this.

## 8. Safety for publishing (Phase 3)
- **Backups.** Before any write, copy to `data/backups/<timestamp>/`.
- **Diff.** Show the current file against the proposed one.
- **Hand-tuned fields.** A field counts as hand-tuned when its current value differs from `written_values`, i.e. it was changed outside Spoolkeeper. Hand-tuned fields come unchecked by default and need explicit approval.
- **Idempotent writes.** Output is deterministic and sorted, and identical content means no write.
- **Is OrcaSlicer running?** A container can't see host processes. A tiny host script (`scripts/orca-status.sh`, using `pgrep`) writes a status file into the mount, run from a LaunchAgent you opt into. Without it, the UI always says "restart OrcaSlicer if it's open".
  - *As built (v0.20.0):* no host script. OrcaSlicer reads user presets only at startup and writes one only when you save it. A running OrcaSlicer therefore can't clobber a publish unless that same preset is saved afterwards, and the hand-tune guard flags that case next time. The UI always says to quit and reopen OrcaSlicer. (2.5's `user.lock` exists whether or not it's running, so it can't serve as a signal.)
- **spoolman2slicer cleanup.** Find its files by `"_comment": "Generated by spoolman2slicer"`, then back them up and delete them, only after you confirm.

## 9. Risks and open questions
- Product pages are inconsistent, and many sellers (e.g. Amazon) block scraping. Expect partial results; the review step keeps that safe.
- The SpoolmanDB URL or schema may change. It's cached, and failures degrade gracefully.
- Phone access needs the Mac awake and on the LAN.
- OrcaSlicer may rewrite user profiles on save (version or keys). Phase 3 diffs on keys we own only.
- Open: label holder dimensions (Phase 3).
- Open: whether to track remaining weight now that Spoolman is gone. It isn't in scope yet; a single field could be added.

## 10. Phased build
- **Phase 1 (build now)**
  - Scaffold, tips, theme, version, Docker, READMEs
  - SQLite schema
  - Vendor, product and spool CRUD
  - Intake with SpoolmanDB and URL enrichment plus per-field review
  - OrcaSlicer import (read-only)
  - Manual profile export (`.json` download, plus `.json`+`.info` zip)
  - `GET /api/spools/:id/profile`
- **Phase 2:** calibration wizard, runs history, summary card comparing against manufacturer values and sibling spools, LA preflight.
- **Phase 3:** direct publish (scope picker, diff, backups, hand-tune guard, Orca running check), spoolman2slicer cleanup, printable labels with QR codes.

### Phase 1 commits (version bumps)
| Version | Commit |
|---|---|
| 0.1.0 | Scaffold: workspaces, Docker, .vscode, .gitignore, READMEs, health |
| 0.2.0 | Tips (~30 filament/drying/calibration/slicer tips), TipsPanel, theme switcher, header with version |
| 0.3.0 | SQLite and migrations; vendors, products and spools API; spools list and detail UI |
| 0.4.0 | Intake form plus enrichment adapters (OFD, SpoolmanDB, spoolz) with caching and per-field suggestion review |
| 0.5.0 | Barcode scan → OFD GTIN lookup, and product-URL enrichment |
| 0.6.0 | OrcaSlicer import |
| 0.7.0 | Profile export and `/api/spools/:id/profile` |

Patch bumps for fixes. Push to `origin main` once verified.

## Verification
- `npm run typecheck`, `npm run lint`, `npm test` (vitest: tips shape, flow/profile mapping, URL parser fixtures, name builder)
- `docker compose up --build`, then:
  - `curl localhost:8003/api/health`
  - `curl localhost:8003/api/tips/` returns `{tips:[…]}` with `Access-Control-Allow-Origin: *`
- Browser at a phone-size viewport:
  - Add a spool with enrichment (Sunlu PLA Wood Walnut). Expect OFD density 1.24 and hex #5A4741, and SpoolmanDB 210/60 °C with a 130 g spool, shown side by side. Accept or override fields.
  - Scan a spool barcode photo and check the GTIN lookup.
  - Import the Orca profiles
  - Download the profile and check its keys and names against the existing `Sunlu - Walnut Wood.json`
  - Theme switching persists across reloads; the version shows in the header
- Confirm nothing touches `localhost:18000` (grep the codebase for `18000`/`spoolman` API calls).
