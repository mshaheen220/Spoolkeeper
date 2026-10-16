import type { ProductFields } from "../types";

export type ProductFieldKey = keyof ProductFields;

export interface FieldMeta {
  key: ProductFieldKey;
  label: string;
  unit?: string;
  type: "text" | "number" | "url" | "color" | "colors" | "select" | "finishes";
  step?: number;
  /** Short "why this matters" help - most profiles start as guesses, so explain each value. */
  help?: string;
}

/** Fields enrichment can fill, in the order the review and form show them. */
export const DETAIL_FIELDS: FieldMeta[] = [
  { key: "colorName", label: "Color name", type: "text" },
  { key: "colorHex", label: "Color", type: "color", help: "Shown in OrcaSlicer's filament dropdown and on the 3D preview." },
  { key: "colorHexes", label: "Colors (multi-color)", type: "colors" },
  { key: "multiColorDirection", label: "Color direction", type: "select" },
  { key: "finishes", label: "Finish", type: "finishes" },
  { key: "shoreScale", label: "Shore scale", type: "select" },
  { key: "shoreHardness", label: "Shore hardness", type: "number" },
  {
    key: "density",
    label: "Density",
    unit: "g/cm³",
    type: "number",
    step: 0.01,
    help: "OrcaSlicer converts filament length to grams with this, so a wrong density skews every weight and cost estimate.",
  },
  { key: "diameterMm", label: "Diameter", unit: "mm", type: "number", step: 0.01 },
  { key: "netWeightG", label: "Net weight", unit: "g", type: "number", help: "Filament on a full spool, not counting the spool itself." },
  {
    key: "spoolWeightG",
    label: "Empty spool",
    unit: "g",
    type: "number",
    help: "Weigh the spool and subtract this to know how much filament is left.",
  },
  {
    key: "nozzleMin",
    label: "Nozzle min",
    unit: "°C",
    type: "number",
    help: "The maker's printing range is a starting window; the temperature tower finds your actual value.",
  },
  { key: "nozzleMax", label: "Nozzle max", unit: "°C", type: "number" },
  { key: "bedMin", label: "Bed min", unit: "°C", type: "number", help: "Too cool and the first layer lifts; too hot and PLA's bottom edge bulges (elephant's foot)." },
  { key: "bedMax", label: "Bed max", unit: "°C", type: "number" },
  { key: "dryTempC", label: "Drying temp", unit: "°C", type: "number", help: "Wet filament strings, pops and prints weak. Dry below the softening point or the spool warps." },
  { key: "dryHours", label: "Drying time", unit: "h", type: "number", step: 0.5 },
  { key: "speedNote", label: "Speed guidance", type: "text", help: "The maker's printing-speed advice, kept verbatim for reference." },
  { key: "productUrl", label: "Product page", type: "url" },
  { key: "datasheetUrl", label: "Datasheet", type: "url" },
  { key: "gtin", label: "Barcode (GTIN/EAN)", type: "text" },
];

/** Fields with their own editors (identity, color, appearance); the rest go in the generic details grid. */
const CUSTOM_EDITORS: ProductFieldKey[] = [
  "colorName",
  "colorHex",
  "colorHexes",
  "multiColorDirection",
  "finishes",
  "shoreScale",
  "shoreHardness",
  "diameterMm",
  "netWeightG",
  "productUrl",
];
export const GRID_FIELDS = DETAIL_FIELDS.filter((f) => !CUSTOM_EDITORS.includes(f.key));

/** Same vocabulary as the server (server/src/lib/appearance.ts). */
export const FINISHES = [
  "Basic",
  "Silk",
  "Matte",
  "Glossy",
  "Marble",
  "Glitter",
  "Glow in the Dark",
  "Translucent",
  "Iridescent",
  "Wood Fill",
  "Carbon Fiber",
  "Glass Fiber",
  "Metal Fill",
  "Other",
];

export const FINISH_HELP =
  "How it looks. Silk and glitter usually want slower outer walls; matte hides layer lines; translucent shows infill through thin walls.";

export const DIRECTION_LABELS: Record<string, { label: string; help: string }> = {
  coaxial: { label: "Side by side (coaxial)", help: "The colors run together down the strand, like dual- and tri-color silk; every layer shows all of them." },
  longitudinal: { label: "Along the length", help: "The color changes as the spool unwinds, like gradient or rainbow filament; it shifts as the print grows." },
};

export const SHORE_HELP =
  "How soft a flexible filament is: Shore A for TPU/TPE (lower is softer - 85A is squishy, 95A is firm), Shore D for harder plastics. Softer filament needs slower printing and gentle retraction.";

/** Materials where Shore hardness is worth showing up front. */
export const FLEXIBLE_MATERIALS = ["TPU", "TPE", "TPC", "TPA"];

/** Reference ids: recorded along with any accepted value from that record, never edited by hand. */
export const ID_FIELDS: ProductFieldKey[] = ["ofdId", "spoolmandbId"];

export const FIELD_LABEL: Record<string, string> = Object.fromEntries(DETAIL_FIELDS.map((f) => [f.key, f.label]));

/** Material + line shortcuts for the common cases (the fields stay editable). */
export const MATERIAL_PRESETS: { label: string; material: string; line: string; finish?: string }[] = [
  { label: "PLA", material: "PLA", line: "" },
  { label: "PLA+", material: "PLA", line: "PLA+" },
  { label: "Silk PLA", material: "PLA", line: "Silk", finish: "Silk" },
  { label: "Matte PLA", material: "PLA", line: "Matte", finish: "Matte" },
  { label: "Wood PLA", material: "PLA", line: "Wood", finish: "Wood Fill" },
  { label: "PETG", material: "PETG", line: "" },
  { label: "TPU", material: "TPU", line: "" },
  { label: "ABS", material: "ABS", line: "" },
  { label: "ASA", material: "ASA", line: "" },
];

/** Product lines - how the maker names the range. Looks (Silk, Translucent, ...) belong in Finish, not here. */
export const LINE_SUGGESTIONS = ["PLA+", "PLA Pro", "High Speed", "Hyper", "Tough", "Dual Color", "Tri Color", "Rainbow", "Gradient"];

const LINE_WORD_FINISH: [RegExp, string][] = [
  [/^silk$/i, "Silk"],
  [/^matte?$/i, "Matte"],
  [/^marble$/i, "Marble"],
  [/^(glitter|sparkle|galaxy)$/i, "Glitter"],
  [/^glow( in the dark)?$/i, "Glow in the Dark"],
  [/^(translucent|transparent|clear)$/i, "Translucent"],
  [/^(wood|wood fill)$/i, "Wood Fill"],
  [/^(carbon fiber|cf)$/i, "Carbon Fiber"],
  [/^(glass fiber|gf)$/i, "Glass Fiber"],
  [/^iridescent$/i, "Iridescent"],
  [/^glossy$/i, "Glossy"],
  [/^(basic|standard)$/i, "Basic"],
];

/** Form state keeps finishes as "Glitter,Translucent", like colorHexes. */
export const splitFinishes = (s: string | null | undefined) =>
  (s ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

/**
 * Toggle one finish in a list. Basic means plain, so it can't sit next to
 * Silk or Glitter: picking Basic clears the others, picking another clears
 * Basic. Kept in FINISHES order.
 */
export function toggleFinish(list: string[], f: string): string[] {
  const has = list.includes(f);
  let next = has ? list.filter((x) => x !== f) : f === "Basic" ? ["Basic"] : [...list.filter((x) => x !== "Basic"), f];
  next = FINISHES.filter((x) => next.includes(x));
  return next;
}

/** The Finish a line value really describes ("Translucent" -> "Translucent", "Wood" -> "Wood Fill"), or null for a real product line. */
export function finishForLine(line: string | null | undefined): string | null {
  const v = (line ?? "").trim();
  return LINE_WORD_FINISH.find(([re]) => re.test(v))?.[1] ?? null;
}
