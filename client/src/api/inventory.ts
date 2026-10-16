import type { FieldSource, Product, Source, Spool, SpoolDetail, Vendor } from "../types";
import { request } from "./client";

export type SourceMap = Record<string, { source: Source; sourceRef?: string | null }>;

export const fetchSpools = (includeArchived = false) =>
  request<{ spools: Spool[] }>(`/api/spools${includeArchived ? "?archived=1" : ""}`).then((b) => b.spools);

export const fetchSpool = (id: number) => request<SpoolDetail>(`/api/spools/${id}`);

export const fetchVendors = () => request<{ vendors: Vendor[] }>("/api/vendors").then((b) => b.vendors);

export const fetchProduct = (id: number) =>
  request<{ product: Product; sources: Record<string, FieldSource>; spools: Spool[] }>(`/api/products/${id}`);

export const fetchProducts = () => request<{ products: Product[] }>("/api/products").then((b) => b.products);

export function findProductMatch(q: { vendor: string; material: string; line?: string; colorName?: string }) {
  const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
  return request<{ product: Product | null }>(`/api/products/match?${params}`).then((b) => b.product);
}

export interface SpoolCreateBody {
  productId?: number;
  product?: Record<string, unknown>;
  quantity?: number;
  purchasedOn?: string | null;
  price?: number | string | null;
  store?: string | null;
  lot?: string | null;
  initialWeightG?: number | string | null;
  notes?: string | null;
  sources?: SourceMap;
}

export const createSpools = (body: SpoolCreateBody) =>
  request<{ spools: Spool[] }>("/api/spools", { method: "POST", body: JSON.stringify(body) }).then((b) => b.spools);

export const updateSpool = (id: number, body: Record<string, unknown>) =>
  request<{ spool: Spool }>(`/api/spools/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then((b) => b.spool);

export const updateProduct = (id: number, body: Record<string, unknown>) =>
  request<{ product: Product }>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then((b) => b.product);
