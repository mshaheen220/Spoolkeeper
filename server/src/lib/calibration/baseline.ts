import { getSetting, getSpool, listProducts, listSpoolsForProduct, setSetting, type Product } from "../../db/repo";
import { tunedForSpool, type TunedValue } from "./service";

// A material's baseline: one calibrated spool whose results stand in for
// every other filament of that material that hasn't been tuned itself.
// Most of what calibration finds (max flow, flow ratio, retraction) is set
// by the printer more than the brand, so one good PLA beats the generic
// base profile for the rest. Its values are read live, so recalibrating the
// baseline spool moves every filament that uses it.

export interface Baselines {
  /** Material ("PLA") -> the spool whose calibration is that material's baseline. */
  sources: Record<string, number>;
  /** Product id -> true (always use) / false (never use); absent = decided by finish. */
  overrides: Record<string, boolean>;
}

const KEY = "calibrationBaselines";

export const getBaselines = (): Baselines => ({ sources: {}, overrides: {}, ...getSetting<Partial<Baselines>>(KEY, {}) });

export function setBaselineSource(material: string, spoolId: number | null) {
  const b = getBaselines();
  if (spoolId == null) delete b.sources[material.toUpperCase()];
  else b.sources[material.toUpperCase()] = spoolId;
  setSetting(KEY, b);
}

export function setBaselineOverride(productId: number, use: boolean | null) {
  const b = getBaselines();
  if (use == null) delete b.overrides[productId];
  else b.overrides[productId] = use;
  setSetting(KEY, b);
}

/** Finishes with particles or additives that change how the filament melts and flows - left out unless you say otherwise. */
export const SPECIALTY_FINISHES = ["Wood Fill", "Marble", "Silk", "Glitter", "Glow in the Dark", "Carbon Fiber", "Glass Fiber", "Metal Fill"];

/** Max volumetric speed was measured at the baseline's temperature, so the two only travel together. */
const TEMP_KEYS = ["nozzle_temperature", "nozzle_temperature_initial_layer", "filament_max_volumetric_speed"];

export interface BaselineValue extends TunedValue {
  baseline: { spoolId: number; name: string; material: string };
}

export interface BaselineStatus {
  material: string;
  /** The baseline spool, or null when this material has none. */
  source: { spoolId: number; name: string } | null;
  /** This filament is the baseline's own. */
  isSource: boolean;
  /** Whether the baseline is used for this filament at all. */
  used: boolean;
  /** Why it's left out (finish, your choice), or what's held back (temperature out of range). */
  notes: string[];
  override: boolean | null;
  /** Values this filament takes from the baseline - only the ones it hasn't tuned itself. */
  values: BaselineValue[];
}

/**
 * What the material's baseline gives this filament, on top of its own
 * results (`own`). Own results always win; temperature and max speed are
 * taken together or not at all.
 */
export function baselineFor(product: Product, own: Record<string, TunedValue>, baselines = getBaselines()): BaselineStatus {
  const material = product.material.toUpperCase();
  const sourceId = baselines.sources[material];
  const sourceSpool = sourceId != null ? getSpool(sourceId) : null;
  const override = baselines.overrides[product.id] ?? null;
  const empty = { material, override, values: [] as BaselineValue[] };
  if (!sourceSpool) return { ...empty, source: null, isSource: false, used: false, notes: [] };

  const source = { spoolId: sourceSpool.id, name: sourceSpool.product.displayName };
  if (sourceSpool.product.id === product.id) return { ...empty, source, isSource: true, used: false, notes: [] };

  const specialty = (product.finishes ?? []).filter((f) => SPECIALTY_FINISHES.includes(f));
  if (override === false) return { ...empty, source, isSource: false, used: false, notes: ["You chose not to use it for this filament."] };
  if (override === null && specialty.length)
    return { ...empty, source, isSource: false, used: false, notes: [`${specialty.join(", ")} can print quite differently, so it's left out.`] };

  const tuned = tunedForSpool(sourceSpool.id);
  const notes: string[] = [];
  let skip = new Set<string>();
  if (TEMP_KEYS.some((k) => own[k])) skip = new Set(TEMP_KEYS);
  else {
    const temp = Number(tuned.nozzle_temperature?.value);
    const { nozzleMin: lo, nozzleMax: hi } = product;
    if (Number.isFinite(temp) && ((lo != null && temp < lo) || (hi != null && temp > hi))) {
      skip = new Set(TEMP_KEYS);
      notes.push(`The baseline's ${temp} °C is outside the maker's ${lo ?? "?"}–${hi ?? "?"} °C range, so temperature and max speed aren't used.`);
    }
  }
  const values = Object.values(tuned)
    .filter((v) => !own[v.key] && !skip.has(v.key))
    .map((v) => ({ ...v, baseline: { spoolId: source.spoolId, name: source.name, material } }));
  return { material, source, isSource: false, used: true, notes, override, values };
}

export interface BaselineCoverage {
  productId: number;
  spoolId: number;
  displayName: string;
  colorHex: string | null;
  finishes: string[] | null;
  used: boolean;
  notes: string[];
  override: boolean | null;
  /** Keys taken from the baseline. */
  keys: string[];
  /** Keys this filament has its own results for. */
  ownKeys: string[];
}

/** Every active filament of the material and what the baseline does for it - for reviewing the whole shelf at once. */
export function baselineCoverage(material: string): BaselineCoverage[] {
  const baselines = getBaselines();
  const out: BaselineCoverage[] = [];
  for (const p of listProducts()) {
    if (p.material.toUpperCase() !== material.toUpperCase()) continue;
    const active = listSpoolsForProduct(p.id).filter((s) => !s.archived);
    if (!active.length) continue;
    const spoolId = active[0].id;
    const own = tunedForSpool(spoolId);
    const status = baselineFor(p, own, baselines);
    if (status.isSource) continue;
    out.push({
      productId: p.id,
      spoolId,
      displayName: p.displayName,
      colorHex: p.colorHex,
      finishes: p.finishes,
      used: status.used,
      notes: status.notes,
      override: status.override,
      keys: status.values.map((v) => v.key),
      ownKeys: Object.keys(own),
    });
  }
  return out.sort((a, b) => Number(b.used) - Number(a.used) || a.displayName.localeCompare(b.displayName));
}
