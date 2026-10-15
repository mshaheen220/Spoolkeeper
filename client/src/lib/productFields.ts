import type { ProductFields } from "../types";

export type ProductFieldKey = keyof ProductFields;

export interface FieldMeta {
  key: ProductFieldKey;
  label: string;
  unit?: string;
  type: "text" | "number" | "url" | "color";
  step?: number;
  /** Short "why this matters" help - most profiles start as guesses, so explain each value. */
  help?: string;
}

/** Fields enrichment can fill, in the order the review and form show them. */
export const DETAIL_FIELDS: FieldMeta[] = [
  { key: "colorName", label: "Color name", type: "text" },
  { key: "colorHex", label: "Color", type: "color", help: "Shown in OrcaSlicer's filament dropdown and on the 3D preview." },
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

/** Reference ids: recorded along with any accepted value from that record, never edited by hand. */
export const ID_FIELDS: ProductFieldKey[] = ["ofdId", "spoolmandbId"];

export const FIELD_LABEL: Record<string, string> = Object.fromEntries(DETAIL_FIELDS.map((f) => [f.key, f.label]));

/** Material + line shortcuts for the common cases (the fields stay editable). */
export const MATERIAL_PRESETS: { label: string; material: string; line: string }[] = [
  { label: "PLA", material: "PLA", line: "" },
  { label: "PLA+", material: "PLA", line: "PLA+" },
  { label: "Silk PLA", material: "PLA", line: "Silk" },
  { label: "Matte PLA", material: "PLA", line: "Matte" },
  { label: "Wood PLA", material: "PLA", line: "Wood" },
  { label: "PETG", material: "PETG", line: "" },
  { label: "TPU", material: "TPU", line: "" },
  { label: "ABS", material: "ABS", line: "" },
  { label: "ASA", material: "ASA", line: "" },
];

export const LINE_SUGGESTIONS = ["Basic", "PLA+", "Silk", "Matte", "Wood", "Marble", "Sparkle", "High Speed", "Glow", "Translucent", "Dual Color", "Carbon Fiber"];
