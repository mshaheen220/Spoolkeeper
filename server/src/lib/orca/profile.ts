import type { FieldSource, Product, Spool } from "../../db/repo";
import type { Source } from "../schemas";
import { baseFor, ORCA_PRESET_VERSION } from "./bases";

// Builds an OrcaSlicer user filament preset from what Spoolkeeper knows.
// Only values with a known origin are written; everything else is left to
// the inherited base profile. Phase 2's calibration results slot into
// `tuned` and override the base here.

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
  compatiblePrinters: string[];
  values: ProfileValue[];
  pending: PendingValue[];
  json: Record<string, unknown>;
  info: string;
}

/** "Sunlu PLA Wood Walnut (Spool #13)" or "Sunlu PLA Wood Walnut". Characters macOS/Orca dislike in file names are dropped. */
export function profileName(product: Product, scope: ProfileScope, spoolId: number): string {
  const base = product.displayName.replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return scope === "spool" ? `${base} (Spool #${spoolId})` : base;
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** The values OrcaSlicer needs that calibration (Phase 2) will supply; until then the base profile's apply. */
export const PENDING_CALIBRATION: PendingValue[] = [
  { key: "nozzle_temperature", why: "Temperature tower: coolest temperature with good layer bonding and no stringing." },
  { key: "filament_flow_ratio", why: "Flow rate Pass 1 + Pass 2: how much plastic comes out versus what the slicer asks for." },
  { key: "pressure_advance", why: "Linear Advance K (only if your Marlin firmware has it enabled — M503 shows an M900 line)." },
  { key: "filament_retraction_length", why: "Retraction test: shortest pull-back that stops stringing." },
  { key: "filament_max_volumetric_speed", why: "Max flowrate test: the fastest this filament can melt cleanly." },
];

export function buildProfile(opts: {
  spool: Spool;
  product: Product;
  productSources: Record<string, FieldSource>;
  scope: ProfileScope;
  printerProfile: string;
  /** Spool prices to average for a per-product profile. */
  productSpoolPrices?: number[];
  now?: Date;
}): BuiltProfile {
  const { spool, product, productSources: ps, scope, printerProfile } = opts;
  const base = baseFor(product.material);
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

  // Structural keys: which printer it attaches to, and an ownership tag
  // that Phase 3's publish step uses to recognize its own files.
  const tag = `spoolkeeper:${scope === "spool" ? `spool=${spool.id};` : ""}product=${product.id}`;
  const json: Record<string, unknown> = {
    compatible_printers: [printerProfile],
    compatible_printers_condition: "",
    filament_notes: [
      [
        "Managed by Spoolkeeper - edit values there, not here.",
        multi ? `Colors: ${product.colorHexes!.join(", ")}${product.multiColorDirection ? ` (${product.multiColorDirection})` : ""}` : null,
        product.finish && product.finish !== "Standard" ? `Finish: ${product.finish}` : null,
        product.shoreHardness != null ? `Shore ${product.shoreHardness}${product.shoreScale ?? ""}` : null,
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
    compatiblePrinters: [printerProfile],
    values,
    pending: PENDING_CALIBRATION,
    json: sorted,
    info,
  };
}

/** Pretty-printed the way OrcaSlicer saves presets (4-space indent). */
export const profileJsonText = (p: BuiltProfile) => `${JSON.stringify(p.json, null, 4)}\n`;
