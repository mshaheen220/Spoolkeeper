import type { Product } from "../types";
import { request } from "./client";

export interface OrcaImportRow {
  fileName: string;
  profileName: string;
  inherits: string | null;
  generatedBy: string | null;
  vendor: string;
  material: string;
  line: string | null;
  colorName: string | null;
  colorHex: string | null;
  settings: Record<string, string>;
  warnings: string[];
  alreadyImported: boolean;
  existingProduct: Product | null;
}

export const previewOrcaImport = () => request<{ dir: string; rows: OrcaImportRow[] }>("/api/import/orca/preview");

export interface ImportChoice {
  fileName: string;
  vendor: string;
  material: string;
  line: string | null;
  colorName: string | null;
  createSpool: boolean;
}

export const runOrcaImport = (rows: ImportChoice[]) =>
  request<{ files: number; productsCreated: number; productsMatched: number; spools: number }>("/api/import/orca", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
