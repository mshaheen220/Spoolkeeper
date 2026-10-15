import { z } from "zod";

// Request bodies. Optional fields accept null so the client can clear a
// value; empty strings from untouched form inputs are normalized to null.
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = z.preprocess(blankToNull, z.string().trim().max(500).nullish());
const optNum = z.preprocess(blankToNull, z.coerce.number().finite().nullish());
const optInt = z.preprocess(blankToNull, z.coerce.number().int().nullish());
const hex = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .regex(/^#?[0-9a-fA-F]{6}$/, "must be a 6-digit hex color")
    .transform((s) => `#${s.replace("#", "").toUpperCase()}`)
    .nullish(),
);

export const SOURCES = ["manual", "ofd", "spoolmandb", "spoolz", "product_url", "orca_import", "default"] as const;
export type Source = (typeof SOURCES)[number];

export const productFields = {
  material: z.string().trim().min(1).max(40),
  line: optText,
  colorName: optText,
  colorHex: hex,
  diameterMm: optNum,
  density: optNum,
  netWeightG: optNum,
  spoolWeightG: optNum,
  nozzleMin: optInt,
  nozzleMax: optInt,
  bedMin: optInt,
  bedMax: optInt,
  dryTempC: optInt,
  dryHours: optNum,
  speedNote: optText,
  productUrl: optText,
  datasheetUrl: optText,
  gtin: optText,
  ofdId: optText,
  spoolmandbId: optText,
  notes: optText,
};

export const productInput = z.object({ vendor: z.string().trim().min(1).max(100), ...productFields });
export const productPatch = productInput.partial();
export type ProductInput = z.infer<typeof productInput>;

export const spoolFields = {
  purchasedOn: z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD").nullish()),
  price: optNum,
  store: optText,
  lot: optText,
  initialWeightG: optNum,
  notes: optText,
  archived: z.boolean().optional(),
};

/** Provenance for submitted values, keyed "product.<field>" or "spool.<field>". */
const sourcesInput = z
  .record(z.string(), z.object({ source: z.enum(SOURCES), sourceRef: z.string().max(2000).nullish() }))
  .optional();

export const spoolCreate = z
  .object({
    productId: z.number().int().positive().optional(),
    product: productInput.optional(),
    quantity: z.number().int().min(1).max(20).default(1),
    sources: sourcesInput,
    ...spoolFields,
  })
  .refine((v) => v.productId != null || v.product != null, { message: "productId or product is required" });
export type SpoolCreate = z.infer<typeof spoolCreate>;

export const spoolPatch = z.object({ ...spoolFields, sources: sourcesInput });
