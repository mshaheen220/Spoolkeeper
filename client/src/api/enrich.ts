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
  warnings?: string[];
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

export interface GtinMatch {
  gtin: string;
  vendor: string;
  material: string;
  line: string | null;
  colorName: string;
  diameterMm: number | null;
  netWeightG: number | null;
  candidate: Candidate;
}

export const lookupGtin = (code: string) =>
  request<{ matches: GtinMatch[] }>(`/api/enrich/gtin/${encodeURIComponent(code)}`).then((b) => b.matches);

export const readPastedText = (text: string, url?: string) =>
  request<{ candidate: Candidate }>("/api/enrich/text", { method: "POST", body: JSON.stringify({ text, url }) }).then((b) => b.candidate);

export const readProductPage = (url: string) =>
  request<{ candidate: Candidate }>("/api/enrich/url", { method: "POST", body: JSON.stringify({ url }) }).then((b) => b.candidate);
