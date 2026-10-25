import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";
import {
  spoolWeightFromShelf,
  createProduct,
  createSpool,
  findMatchingProduct,
  getProduct,
  getSources,
  getSpool,
  listImportedProfiles,
  listProducts,
  listSpools,
  listSpoolsForProduct,
  listVendors,
  recordSources,
  updateProduct,
  updateSpool,
} from "../db/repo";
import { HttpError, idParam, notFound } from "../lib/http";
import { productPatch, spoolCreate, spoolPatch, type Source } from "../lib/schemas";

export const inventoryRouter = Router();

type SourceMap = Record<string, { source: Source; sourceRef?: string | null }> | undefined;

/** Split "product.density" / "spool.price" provenance keys and record the ones whose value was submitted. */
function recordSubmittedSources(
  sources: SourceMap,
  prefix: "product" | "spool",
  entityId: number,
  values: Record<string, unknown>,
) {
  if (!sources) return;
  const entries = Object.entries(sources)
    .filter(([key]) => key.startsWith(`${prefix}.`))
    .map(([key, s]) => ({ field: key.slice(prefix.length + 1), ...s }))
    .filter((e) => values[e.field] !== undefined)
    .map((e) => ({ ...e, value: values[e.field] }));
  recordSources(prefix, entityId, entries);
}

// ---------------------------------------------------------------- vendors

inventoryRouter.get("/vendors", (_req, res) => {
  res.json({ vendors: listVendors() });
});

// --------------------------------------------------------------- products

inventoryRouter.get("/products", (_req, res) => {
  res.json({ products: listProducts() });
});

const matchQuery = z.object({
  vendor: z.string().min(1),
  material: z.string().min(1),
  line: z.string().optional(),
  colorName: z.string().optional(),
});

/** An existing product with the same identity, so intake can offer "add another spool of this". */
inventoryRouter.get("/products/match", (req, res) => {
  const q = matchQuery.parse(req.query);
  res.json({ product: findMatchingProduct({ ...q, line: q.line || null, colorName: q.colorName || null }) });
});

/** Empty-spool weight guessed from the same brand's filaments already on the shelf (null if none). */
inventoryRouter.get("/products/spool-weight", (req, res) => {
  const q = z.object({ vendor: z.string().min(1), material: z.string().optional(), excludeProductId: z.coerce.number().int().optional() }).parse(req.query);
  res.json({ guess: spoolWeightFromShelf(q.vendor, q.material ?? null, q.excludeProductId) });
});

inventoryRouter.get("/products/:id", (req, res) => {
  const id = idParam(req);
  const product = getProduct(id);
  if (!product) throw notFound("Product");
  res.json({ product, sources: getSources("product", id), spools: listSpoolsForProduct(id) });
});

inventoryRouter.patch("/products/:id", (req, res) => {
  const id = idParam(req);
  if (!getProduct(id)) throw notFound("Product");
  const body = productPatch.extend({ sources: spoolPatch.shape.sources }).parse(req.body);
  const { sources, ...patch } = body;
  const product = getDb().transaction(() => {
    const updated = updateProduct(id, patch);
    recordSubmittedSources(sources, "product", id, patch);
    return updated;
  })();
  res.json({ product, sources: getSources("product", id) });
});

// ----------------------------------------------------------------- spools

inventoryRouter.get("/spools", (req, res) => {
  res.json({ spools: listSpools({ includeArchived: req.query.archived === "1" }) });
});

inventoryRouter.get("/spools/:id", (req, res) => {
  const id = idParam(req);
  const spool = getSpool(id);
  if (!spool) throw notFound("Spool");
  res.json({
    spool,
    sources: { product: getSources("product", spool.product.id), spool: getSources("spool", id) },
    siblings: listSpoolsForProduct(spool.product.id).filter((s) => s.id !== id),
    imported: listImportedProfiles(spool.product.id),
  });
});

/** Intake: create the product (or reuse productId) and `quantity` spools of it, with provenance. */
inventoryRouter.post("/spools", (req, res) => {
  const body = spoolCreate.parse(req.body);
  const { productId, product: productInput, quantity, sources, ...spoolValues } = body;
  const created = getDb().transaction(() => {
    let pid = productId;
    if (pid != null) {
      if (!getProduct(pid)) throw notFound("Product");
    } else {
      const product = createProduct(productInput!);
      pid = product.id;
      recordSubmittedSources(sources, "product", pid, productInput!);
    }
    const spools = [];
    for (let i = 0; i < quantity; i++) {
      const spool = createSpool(pid, spoolValues);
      recordSubmittedSources(sources, "spool", spool.id, spoolValues);
      spools.push(spool);
    }
    return spools;
  })();
  res.status(201).json({ spools: created });
});

inventoryRouter.patch("/spools/:id", (req, res) => {
  const id = idParam(req);
  if (!getSpool(id)) throw notFound("Spool");
  const { sources, ...values } = spoolPatch.parse(req.body);
  if (Object.keys(values).length === 0 && !sources) throw new HttpError(400, "Nothing to update");
  const spool = getDb().transaction(() => {
    const updated = updateSpool(id, values);
    recordSubmittedSources(sources, "spool", id, values);
    return updated;
  })();
  res.json({ spool });
});
