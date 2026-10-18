import type { FieldSource, Product, Spool } from "../../db/repo";
import type { TunedValue } from "../calibration/service";
import { KEY_REASON, type LinearAdvance } from "../calibration/tests";
import type { Source } from "../schemas";
import { baseFor, ORCA_PRESET_VERSION } from "./bases";

// Builds an OrcaSlicer user filament preset from what Spoolkeeper knows.
// Only values with a known origin are written; everything else is left to
// the inherited base profile. Calibration results (`tuned`) are written
// on top and take each value out of the "pending" list.

export type ProfileScope = "spool" | "product";

export interface ProfileValue {
  key: string;
  value: string;
  /** Where the number came from: a recorded source, "calibration", or "spoolkeeper" for structural keys. */
  source: Source | "calibration" | "spoolkeeper";
  sourceRef?: string | null;
  why: string;
}

export interface PendingValue {
  key: string;
  why: string;
}

export interface BuiltProfile {
  scope: ProfileScope;
  name: string;
  fileName: string;
  inherits: string;
  baseFallback: boolean;
  /** OrcaSlicer version the profile was built for (null = unknown, 2.4 names used). */
  orcaVersion: string | null;
  /** Printer presets the tuned values were measured on ("TheHammer  0.4 nozzle (0.4 mm)"); empty if untuned. */
  tunedOn: string[];
  values: ProfileValue[];
  pending: PendingValue[];
  /** Spool whose calibration was used (a per-product profile may borrow another spool's). */
  tunedFromSpool: number | null;
  json: Record<string, unknown>;
  info: string;
}

/** "Sunlu PLA Wood Walnut (Spool #13)" or "Sunlu PLA Wood Walnut". Characters macOS/Orca dislike in file names are dropped. */
export function profileName(product: Product, scope: ProfileScope, spoolId: number): string {
  const base = product.displayName.replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return scope === "spool" ? `${base} (Spool #${spoolId})` : base;
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** The values calibration supplies; until each is tuned, the base profile's value applies. */
export const PENDING_CALIBRATION: PendingValue[] = [
  { key: "nozzle_temperature", why: "Temperature tower: best balance of layer bonding, bridging and stringing." },
  { key: "filament_max_volumetric_speed", why: "Max flowrate test: the fastest this filament can melt cleanly." },
  { key: "pressure_advance", why: "Linear Advance K (only if your Marlin firmware has it enabled — M503 shows an M900 line)." },
  { key: "filament_flow_ratio", why: "Flow ratio test: how much plastic comes out versus what the slicer asks for." },
  { key: "filament_retraction_length", why: "Retraction test: shortest pull-back that stops stringing." },
];

export function buildProfile(opts: {
  spool: Spool;
  product: Product;
  productSources: Record<string, FieldSource>;
  scope: ProfileScope;
  /** Spool prices to average for a per-product profile. */
  productSpoolPrices?: number[];
  /** Calibration results to write (latest accepted value per key). */
  tuned?: Record<string, TunedValue>;
  tunedFromSpool?: number | null;
  linearAdvance?: LinearAdvance;
  /** Installed OrcaSlicer version - picks base profile names (2.5 renamed Creality's generics). */
  orcaVersion?: string | null;
  now?: Date;
}): BuiltProfile {
  const { spool, product, productSources: ps, scope } = opts;
  const base = baseFor(product.material, opts.orcaVersion);
  const name = profileName(product, scope, spool.id);
  const values: ProfileValue[] = [];
  const src = (field: string) => ({ source: (ps[field]?.source ?? "manual") as Source, sourceRef: ps[field]?.sourceRef ?? null });
  const put = (key: string, value: string | number | null | undefined, from: Omit<ProfileValue, "key" | "value">) => {
    if (value === null || value === undefined || value === "") return;
    values.push({ key, value: typeof value === "number" ? fmt(value) : value, ...from });
  };

  put("filament_vendor", product.vendor.name, { source: "manual", why: "Groups the preset under its brand in OrcaSlicer." });
  put("filament_type", product.material, { ...src("material"), why: "Tells OrcaSlicer which material rules apply (e.g. PLA vs PETG cooling)." });
  const multi = product.colorHexes && product.colorHexes.length >= 2;
  put("default_filament_colour", product.colorHex, {
    ...src("colorHex"),
    why: multi
      ? `Main color of ${product.colorHexes!.length}: OrcaSlicer presets hold one color, so this one stands in for the whole spool.`
      : "The swatch color in the filament dropdown and 3D preview.",
  });
  put("filament_diameter", product.diameterMm, { ...src("diameterMm"), why: "Used to convert extruded volume into filament length." });
  put("filament_density", product.density, { ...src("density"), why: "Converts length to grams for weight and cost estimates." });
  put("filament_spool_weight", product.spoolWeightG, { ...src("spoolWeightG"), why: "Empty spool weight, for weighing what's left." });

  // Cost per kilogram: this spool's price, or the average across the product's spools.
  const net = (spool.initialWeightG ?? product.netWeightG ?? 1000) / 1000;
  const prices = scope === "product" ? (opts.productSpoolPrices ?? []).filter((p) => p > 0) : spool.price ? [spool.price] : [];
  if (prices.length && net > 0) {
    const perKg = prices.reduce((a, b) => a + b, 0) / prices.length / net;
    put("filament_cost", Math.round(perKg * 100) / 100, {
      source: "manual",
      why: scope === "product" && prices.length > 1 ? `Average price of ${prices.length} spools, per kg.` : "What you paid, per kg - drives OrcaSlicer's cost estimate.",
    });
  }

  if (product.nozzleMin != null && product.nozzleMax != null) {
    put("nozzle_temperature_range_low", product.nozzleMin, { ...src("nozzleMin"), why: "Maker's minimum; OrcaSlicer warns below it." });
    put("nozzle_temperature_range_high", product.nozzleMax, { ...src("nozzleMax"), why: "Maker's maximum; OrcaSlicer warns above it." });
  }

  // Calibration results override the base profile.
  const tuned = opts.tuned ?? {};
  for (const t of Object.values(tuned).sort((a, b) => (a.key < b.key ? -1 : 1))) {
    if (opts.linearAdvance === "unsupported" && (t.key === "pressure_advance" || t.key === "enable_pressure_advance")) continue;
    values.push({ key: t.key, value: t.value, source: "calibration", sourceRef: `run #${t.runId} (${t.date.slice(0, 10)})`, why: KEY_REASON[t.key] ?? `From calibration (${t.test}).` });
  }
  // A K value does nothing without Linear Advance in the firmware - say so explicitly instead of leaving it to the base.
  if (opts.linearAdvance === "unsupported")
    values.push({ key: "enable_pressure_advance", value: "0", source: "spoolkeeper", why: "Off: your Marlin firmware has no Linear Advance (M900 is an unknown command)." });

  // Filament is shelf stock, not printer-specific: the profile shows for every
  // printer. Some tuned values (max volumetric speed above all) depend on the
  // hotend and nozzle, so the notes say where they were measured.
  const tunedOn = [
    ...new Set(
      Object.values(tuned)
        .filter((t) => t.printerProfile)
        .map((t) => `${t.printerProfile}${t.nozzleDiameter ? ` (${t.nozzleDiameter} mm nozzle)` : ""}`),
    ),
  ];

  const pending = PENDING_CALIBRATION.filter((p) => !tuned[p.key]).filter((p) => !(p.key === "pressure_advance" && opts.linearAdvance === "unsupported"));

  // Structural keys: which printer it attaches to, and an ownership tag
  // that Phase 3's publish step uses to recognize its own files.
  const tag = `spoolkeeper:${scope === "spool" ? `spool=${spool.id};` : ""}product=${product.id}`;
  const json: Record<string, unknown> = {
    // Empty list + empty condition = compatible with every printer (Preset.cpp is_compatible_with_printer, OrcaSlicer 2.4.2).
    compatible_printers: [],
    compatible_printers_condition: "",
    filament_notes: [
      [
        "Managed by Spoolkeeper - edit values there, not here.",
        multi ? `Colors: ${product.colorHexes!.join(", ")}${product.multiColorDirection ? ` (${product.multiColorDirection})` : ""}` : null,
        product.finishes?.length ? `Finish: ${product.finishes.join(", ")}` : null,
        product.shoreHardness != null ? `Shore ${product.shoreHardness}${product.shoreScale ?? ""}` : null,
        tunedOn.length ? `Tuned on ${tunedOn.join(", ")}` : null,
        tag,
      ]
        .filter(Boolean)
        .join("\n"),
    ],
    filament_settings_id: [name],
    from: "User",
    inherits: base.inherits,
    is_custom_defined: "0",
    name,
    version: ORCA_PRESET_VERSION,
  };
  for (const v of values) json[v.key] = [v.value];

  // OrcaSlicer writes keys sorted; matching that keeps diffs against its own saves clean.
  const sorted = Object.fromEntries(Object.entries(json).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const now = opts.now ?? new Date();
  const info = [
    "sync_info = create",
    "user_id = ",
    "setting_id = ",
    `base_id = ${base.baseId ?? ""}`,
    `updated_time = ${Math.floor(now.getTime() / 1000)}`,
    "",
  ].join("\n");

  return {
    scope,
    name,
    fileName: name,
    inherits: base.inherits,
    baseFallback: base.fallback,
    tunedOn,
    orcaVersion: opts.orcaVersion ?? null,
    values,
    pending,
    tunedFromSpool: Object.keys(tuned).length ? (opts.tunedFromSpool ?? spool.id) : null,
    json: sorted,
    info,
  };
}

/** Pretty-printed the way OrcaSlicer saves presets (4-space indent). */
export const profileJsonText = (p: BuiltProfile) => `${JSON.stringify(p.json, null, 4)}\n`;
