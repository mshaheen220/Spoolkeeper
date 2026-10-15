import { Router } from "express";
import { z } from "zod";
import { enrich, lookupGtin } from "../lib/enrich";
import { clearEnrichCache } from "../lib/enrich/fetch";
import { readProductPage } from "../lib/enrich/productPage";
import { asyncHandler } from "../lib/http";
import { MATERIALS } from "../lib/materials";

export const enrichRouter = Router();

const searchQuery = z.object({
  vendor: z.string().trim().min(1),
  material: z.string().trim().min(1),
  line: z.string().trim().optional(),
  colorName: z.string().trim().optional(),
  diameterMm: z.coerce.number().positive().optional(),
  netWeightG: z.coerce.number().positive().optional(),
});

/** Merged candidates from OFD, SpoolmanDB, spoolz and material defaults. Nothing is saved. */
enrichRouter.get(
  "/enrich/search",
  asyncHandler(async (req, res) => {
    const q = searchQuery.parse(req.query);
    res.json(await enrich({ ...q, line: q.line || null, colorName: q.colorName || null }));
  }),
);

/** Barcode (GTIN/EAN/UPC) -> product identity from the Open Filament Database. */
enrichRouter.get(
  "/enrich/gtin/:code",
  asyncHandler(async (req, res) => {
    res.json({ matches: await lookupGtin(String(req.params.code)) });
  }),
);

/** Read a pasted product page for temps, speed, drying and density. Suggestions only. */
enrichRouter.post(
  "/enrich/url",
  asyncHandler(async (req, res) => {
    const { url } = z.object({ url: z.string().trim().min(1).max(2000) }).parse(req.body);
    res.json({ candidate: await readProductPage(url) });
  }),
);

enrichRouter.post("/enrich/refresh", (_req, res) => {
  clearEnrichCache();
  res.json({ ok: true });
});

/** Material types the intake form offers (OrcaSlicer filament_type values). */
enrichRouter.get("/materials", (_req, res) => {
  res.json({ materials: MATERIALS });
});
