import type { Source } from "../schemas";

/** Product fields an enrichment source can suggest a value for. */
export type EnrichField =
  | "colorName"
  | "colorHex"
  /** Comma-separated "#RRGGBB,#RRGGBB" so it compares and displays like other values. */
  | "colorHexes"
  | "multiColorDirection"
  /** Comma-separated finish names ("Translucent,Glitter"), like colorHexes. */
  | "finishes"
  | "shoreScale"
  | "shoreHardness"
  | "density"
  | "diameterMm"
  | "netWeightG"
  | "spoolWeightG"
  | "nozzleMin"
  | "nozzleMax"
  | "bedMin"
  | "bedMax"
  | "dryTempC"
  | "dryHours"
  | "speedNote"
  | "productUrl"
  | "datasheetUrl"
  | "gtin"
  | "ofdId"
  | "spoolmandbId";

export interface Suggestion {
  field: EnrichField;
  value: string | number;
  source: Source;
  /** Where to verify it: a URL or dataset id. */
  sourceRef: string | null;
  /** Context worth showing next to the value (e.g. "max drying temp", the page snippet it came from). */
  note?: string;
}

/** One record a source matched, with the values it would contribute. */
export interface Candidate {
  source: Source;
  id: string;
  title: string;
  sourceRef: string | null;
  /** Relative match quality within a source; only used for ranking. */
  score: number;
  suggestions: Suggestion[];
}

export interface EnrichQuery {
  vendor: string;
  material: string;
  line?: string | null;
  colorName?: string | null;
  diameterMm?: number | null;
  netWeightG?: number | null;
}

export interface EnrichResult {
  candidates: Candidate[];
  /** Sources that failed (offline, rate-limited, ...) - the others still return. */
  errors: { source: Source; message: string }[];
}
