import type { ProductInput, Source } from "../lib/schemas";
import { getDb } from ".";

// Thin data-access layer: SQL stays here, routes deal in camelCase objects.

export interface Vendor {
  id: number;
  name: string;
  website: string | null;
  notes: string | null;
}

export interface Product {
  id: number;
  vendor: Vendor;
  material: string;
  line: string | null;
  colorName: string | null;
  colorHex: string | null;
  diameterMm: number;
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

/** camelCase API field -> snake_case column, for the editable product columns. */
const PRODUCT_COLUMNS: Record<Exclude<keyof ProductInput, "vendor">, string> = {
  material: "material",
  line: "line",
  colorName: "color_name",
  colorHex: "color_hex",
  diameterMm: "diameter_mm",
  density: "density",
  netWeightG: "net_weight_g",
  spoolWeightG: "spool_weight_g",
  nozzleMin: "nozzle_min",
  nozzleMax: "nozzle_max",
  bedMin: "bed_min",
  bedMax: "bed_max",
  dryTempC: "dry_temp_c",
  dryHours: "dry_hours",
  speedNote: "speed_note",
  productUrl: "product_url",
  datasheetUrl: "datasheet_url",
  gtin: "gtin",
  ofdId: "ofd_id",
  spoolmandbId: "spoolmandb_id",
  notes: "notes",
};

const SPOOL_COLUMNS = {
  purchasedOn: "purchased_on",
  price: "price",
  store: "store",
  lot: "lot",
  initialWeightG: "initial_weight_g",
  notes: "notes",
  archived: "archived",
} as const;

/** "Sunlu PLA Wood Walnut" - the human name used in lists, labels and profile names. */
export function productDisplayName(p: { vendorName: string; material: string; line?: string | null; colorName?: string | null }) {
  const parts = [p.vendorName, p.material];
  // Skip a line that just repeats the material ("PLA" line on a PLA product).
  if (p.line && p.line.toLowerCase() !== p.material.toLowerCase()) parts.push(p.line);
  if (p.colorName) parts.push(p.colorName);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

type Row = Record<string, unknown>;

function rowToVendor(r: Row): Vendor {
  return { id: r.id as number, name: r.name as string, website: r.website as string | null, notes: r.notes as string | null };
}

const PRODUCT_SELECT = `
  SELECT p.*, v.name AS v_name, v.website AS v_website, v.notes AS v_notes,
         (SELECT COUNT(*) FROM spools s WHERE s.product_id = p.id AND s.archived = 0) AS spool_count
  FROM products p JOIN vendors v ON v.id = p.vendor_id`;

function rowToProduct(r: Row): Product {
  const out: Record<string, unknown> = { id: r.id };
  for (const [key, col] of Object.entries(PRODUCT_COLUMNS)) out[key] = r[col] ?? null;
  const vendor: Vendor = { id: r.vendor_id as number, name: r.v_name as string, website: r.v_website as string | null, notes: r.v_notes as string | null };
  const product = out as unknown as Product;
  product.vendor = vendor;
  product.spoolCount = (r.spool_count as number) ?? 0;
  product.displayName = productDisplayName({ vendorName: vendor.name, material: product.material, line: product.line, colorName: product.colorName });
  return product;
}

// ---------------------------------------------------------------- vendors

export function listVendors(): Vendor[] {
  return getDb().prepare("SELECT * FROM vendors ORDER BY name").all().map((r) => rowToVendor(r as Row));
}

/** Case-insensitive find-or-create, so "SUNLU" and "Sunlu" are one vendor. */
export function upsertVendor(name: string): Vendor {
  const db = getDb();
  const trimmed = name.trim();
  const existing = db.prepare("SELECT * FROM vendors WHERE name = ?").get(trimmed) as Row | undefined;
  if (existing) return rowToVendor(existing);
  const info = db.prepare("INSERT INTO vendors (name) VALUES (?)").run(trimmed);
  return rowToVendor(db.prepare("SELECT * FROM vendors WHERE id = ?").get(info.lastInsertRowid) as Row);
}

// --------------------------------------------------------------- products

export function listProducts(): Product[] {
  return getDb()
    .prepare(`${PRODUCT_SELECT} ORDER BY v.name COLLATE NOCASE, p.material, p.line, p.color_name`)
    .all()
    .map((r) => rowToProduct(r as Row));
}

export function getProduct(id: number): Product | null {
  const r = getDb().prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(id) as Row | undefined;
  return r ? rowToProduct(r) : null;
}

/** An existing product with the same brand/material/line/color, if any - so a second spool reuses it. */
export function findMatchingProduct(input: Pick<ProductInput, "vendor" | "material" | "line" | "colorName">): Product | null {
  const r = getDb()
    .prepare(
      `${PRODUCT_SELECT} WHERE v.name = ? COLLATE NOCASE AND p.material = ? COLLATE NOCASE
         AND IFNULL(p.line, '') = ? COLLATE NOCASE AND IFNULL(p.color_name, '') = ? COLLATE NOCASE`,
    )
    .get(input.vendor.trim(), input.material, input.line ?? "", input.colorName ?? "") as Row | undefined;
  return r ? rowToProduct(r) : null;
}

export function createProduct(input: ProductInput): Product {
  const vendor = upsertVendor(input.vendor);
  const cols = ["vendor_id"];
  const vals: unknown[] = [vendor.id];
  for (const [key, col] of Object.entries(PRODUCT_COLUMNS)) {
    const v = input[key as keyof typeof PRODUCT_COLUMNS];
    if (v !== undefined && v !== null) {
      cols.push(col);
      vals.push(v);
    }
  }
  const info = getDb()
    .prepare(`INSERT INTO products (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .run(...vals);
  return getProduct(Number(info.lastInsertRowid))!;
}

export function updateProduct(id: number, patch: Partial<ProductInput>): Product | null {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.vendor) {
    sets.push("vendor_id = ?");
    vals.push(upsertVendor(patch.vendor).id);
  }
  for (const [key, col] of Object.entries(PRODUCT_COLUMNS)) {
    const v = patch[key as keyof typeof PRODUCT_COLUMNS];
    if (v !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(v);
    }
  }
  if (sets.length) {
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
    getDb().prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  }
  return getProduct(id);
}

// ----------------------------------------------------------------- spools

function hydrateSpool(r: Row, product: Product): Spool {
  return {
    id: r.id as number,
    product,
    purchasedOn: (r.purchased_on as string) ?? null,
    price: (r.price as number) ?? null,
    store: (r.store as string) ?? null,
    lot: (r.lot as string) ?? null,
    initialWeightG: (r.initial_weight_g as number) ?? null,
    archived: r.archived === 1,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export function listSpools(opts: { includeArchived?: boolean } = {}): Spool[] {
  const rows = getDb()
    .prepare(`SELECT * FROM spools ${opts.includeArchived ? "" : "WHERE archived = 0"} ORDER BY id DESC`)
    .all() as Row[];
  const products = new Map(listProducts().map((p) => [p.id, p]));
  return rows.map((r) => hydrateSpool(r, products.get(r.product_id as number)!));
}

export function getSpool(id: number): Spool | null {
  const r = getDb().prepare("SELECT * FROM spools WHERE id = ?").get(id) as Row | undefined;
  if (!r) return null;
  return hydrateSpool(r, getProduct(r.product_id as number)!);
}

export function listSpoolsForProduct(productId: number): Spool[] {
  const product = getProduct(productId);
  if (!product) return [];
  const rows = getDb().prepare("SELECT * FROM spools WHERE product_id = ? ORDER BY id").all(productId) as Row[];
  return rows.map((r) => hydrateSpool(r, product));
}

type SpoolValues = Partial<Record<keyof typeof SPOOL_COLUMNS, unknown>>;

export function createSpool(productId: number, values: SpoolValues): Spool {
  const cols = ["product_id"];
  const vals: unknown[] = [productId];
  for (const [key, col] of Object.entries(SPOOL_COLUMNS)) {
    let v = values[key as keyof SpoolValues];
    if (v === undefined || v === null) continue;
    if (typeof v === "boolean") v = v ? 1 : 0;
    cols.push(col);
    vals.push(v);
  }
  const info = getDb()
    .prepare(`INSERT INTO spools (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .run(...vals);
  return getSpool(Number(info.lastInsertRowid))!;
}

export function updateSpool(id: number, values: SpoolValues): Spool | null {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(SPOOL_COLUMNS)) {
    let v = values[key as keyof SpoolValues];
    if (v === undefined) continue;
    if (typeof v === "boolean") v = v ? 1 : 0;
    sets.push(`${col} = ?`);
    vals.push(v);
  }
  if (sets.length) {
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
    getDb().prepare(`UPDATE spools SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  }
  return getSpool(id);
}

// --------------------------------------------------------------- provenance

export function recordSources(
  entity: "vendor" | "product" | "spool",
  entityId: number,
  entries: { field: string; value: unknown; source: Source; sourceRef?: string | null }[],
) {
  const stmt = getDb().prepare(
    "INSERT INTO field_sources (entity, entity_id, field, value, source, source_ref) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const e of entries) {
    stmt.run(entity, entityId, e.field, JSON.stringify(e.value ?? null), e.source, e.sourceRef ?? null);
  }
}

/** Latest recorded source per field. */
export function getSources(entity: "vendor" | "product" | "spool", entityId: number): Record<string, FieldSource> {
  const rows = getDb()
    .prepare(
      `SELECT * FROM field_sources WHERE entity = ? AND entity_id = ?
       AND id IN (SELECT MAX(id) FROM field_sources WHERE entity = ? AND entity_id = ? GROUP BY field)`,
    )
    .all(entity, entityId, entity, entityId) as Row[];
  const out: Record<string, FieldSource> = {};
  for (const r of rows) {
    out[r.field as string] = {
      field: r.field as string,
      value: JSON.parse((r.value as string) ?? "null"),
      source: r.source as Source,
      sourceRef: (r.source_ref as string) ?? null,
      capturedAt: r.captured_at as string,
    };
  }
  return out;
}

// --------------------------------------------------------------- settings

export function getSetting<T>(key: string, fallback: T): T {
  const r = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return r ? (JSON.parse(r.value) as T) : fallback;
}

export function setSetting(key: string, value: unknown) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}
