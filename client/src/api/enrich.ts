import type { ProductFieldKey } from "../lib/productFields";
import type { Source } from "../types";
import { request } from "./client";

export interface Suggestion {
  field: ProductFieldKey;
  value: string | number;
  source: Source;
  sourceRef: string | null;
  note?: string;
}

export interface Candidate {
  source: Source;
  id: string;
  title: string;
  sourceRef: string | null;
  score: number;
  suggestions: Suggestion[];
}

export interface EnrichResult {
  candidates: Candidate[];
  errors: { source: Source; message: string }[];
}

export interface MaterialDefaults {
  type: string;
  density: number;
  nozzle: [number, number];
  bed: [number, number];
  dry: [number, number];
}

export function searchEnrichment(q: {
  vendor: string;
  material: string;
  line?: string;
  colorName?: string;
  diameterMm?: string;
  netWeightG?: string;
}) {
  const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
  return request<EnrichResult>(`/api/enrich/search?${params}`);
}

export const fetchMaterials = () => request<{ materials: MaterialDefaults[] }>("/api/materials").then((b) => b.materials);

export const refreshEnrichment = () => request<{ ok: boolean }>("/api/enrich/refresh", { method: "POST" });
