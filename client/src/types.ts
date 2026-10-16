// Mirrors the server's API shapes (server/src/db/repo.ts).

export type Source = "manual" | "ofd" | "spoolmandb" | "spoolz" | "product_url" | "orca_import" | "default" | "inferred";

export interface Vendor {
  id: number;
  name: string;
  website: string | null;
  notes: string | null;
}

export type ColorDirection = "coaxial" | "longitudinal";

export interface ProductFields {
  material: string;
  line: string | null;
  colorName: string | null;
  /** Main color - the one OrcaSlicer shows; one of colorHexes for a multi-color filament. */
  colorHex: string | null;
  colorHexes: string[] | null;
  multiColorDirection: ColorDirection | null;
  /** Every look it has, e.g. ["Glitter", "Translucent"]. */
  finishes: string[] | null;
  shoreScale: "A" | "D" | null;
  shoreHardness: number | null;
  diameterMm: number | null;
  density: number | null;
  netWeightG: number | null;
  spoolWeightG: number | null;
  nozzleMin: number | null;
  nozzleMax: number | null;
  bedMin: number | null;
  bedMax: number | null;
  dryTempC: number | null;
  dryHours: number | null;
  speedNote: string | null;
  productUrl: string | null;
  datasheetUrl: string | null;
  gtin: string | null;
  ofdId: string | null;
  spoolmandbId: string | null;
  notes: string | null;
}

export interface Product extends ProductFields {
  id: number;
  vendor: Vendor;
  displayName: string;
  spoolCount: number;
}

export interface Spool {
  id: number;
  product: Product;
  purchasedOn: string | null;
  price: number | null;
  store: string | null;
  lot: string | null;
  initialWeightG: number | null;
  archived: boolean;
  notes: string | null;
  createdAt: string;
}

export interface FieldSource {
  field: string;
  value: unknown;
  source: Source;
  sourceRef: string | null;
  capturedAt: string;
}

export interface ImportedProfile {
  fileName: string;
  profileName: string;
  inherits: string | null;
  generatedBy: string | null;
  settings: Record<string, string>;
  importedAt: string;
}

export interface SpoolDetail {
  spool: Spool;
  sources: { product: Record<string, FieldSource>; spool: Record<string, FieldSource> };
  siblings: Spool[];
  imported: ImportedProfile[];
}

export const SOURCE_LABELS: Record<Source, string> = {
  manual: "You",
  ofd: "Open Filament DB",
  spoolmandb: "SpoolmanDB",
  spoolz: "spoolz",
  product_url: "Product page",
  orca_import: "OrcaSlicer import",
  default: "Default",
  inferred: "Inferred",
};

/** Compact labels for tight spots (form field headers). */
export const SOURCE_SHORT_LABELS: Record<Source, string> = {
  manual: "You",
  ofd: "OFD",
  spoolmandb: "SpoolmanDB",
  spoolz: "spoolz",
  product_url: "Page",
  orca_import: "Orca",
  default: "Default",
  inferred: "Inferred",
};
