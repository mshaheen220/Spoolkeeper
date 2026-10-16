import { Router } from "express";
import { z } from "zod";
import { getSetting, getSources, getSpool, listSpoolsForProduct } from "../db/repo";
import { calibratedSpoolForProduct, linearAdvanceStatus, tunedForSpool } from "../lib/calibration/service";
import { idParam, notFound } from "../lib/http";
import { DEFAULT_PRINTER_PROFILE } from "../lib/orca/bases";
import { buildProfile, profileJsonText, type ProfileScope } from "../lib/orca/profile";

export const profileRouter = Router();

const scopeQuery = z.object({ scope: z.enum(["spool", "product"]).default("spool") });

function build(spoolId: number, scope: ProfileScope) {
  const spool = getSpool(spoolId);
  if (!spool) throw notFound("Spool");
  // Per spool: this spool's calibration. Per product: this spool's if it has
  // any, otherwise the most recently calibrated spool of the same filament.
  const own = tunedForSpool(spool.id);
  const tunedFromSpool = Object.keys(own).length || scope === "spool" ? spool.id : calibratedSpoolForProduct(spool.product.id, spool.id);
  const tuned = tunedFromSpool == null ? {} : tunedFromSpool === spool.id ? own : tunedForSpool(tunedFromSpool);
  return buildProfile({
    tuned,
    tunedFromSpool,
    linearAdvance: linearAdvanceStatus(),
    spool,
    product: spool.product,
    productSources: getSources("product", spool.product.id),
    scope,
    printerProfile: getSetting("printerProfile", DEFAULT_PRINTER_PROFILE),
    productSpoolPrices: listSpoolsForProduct(spool.product.id)
      .map((s) => s.price)
      .filter((p): p is number => p != null),
  });
}

/**
 * Stable, tool-friendly view of a spool's settings: every value Spoolkeeper
 * would write to OrcaSlicer with its source, plus what's still waiting on
 * calibration. Other workshop tools can pull tuned values from here.
 */
profileRouter.get("/spools/:id/profile", (req, res) => {
  const { scope } = scopeQuery.parse(req.query);
  const spoolId = idParam(req);
  const p = build(spoolId, scope);
  res.json({
    spoolId,
    productId: getSpool(spoolId)!.product.id,
    scope: p.scope,
    profile: { name: p.name, fileName: p.fileName, inherits: p.inherits, baseFallback: p.baseFallback, compatiblePrinters: p.compatiblePrinters },
    tunedFromSpool: p.tunedFromSpool,
    values: p.values,
    pending: p.pending,
    orca: { json: p.json, info: p.info },
  });
});

/** The preset itself, as a download for OrcaSlicer's File → Import → Import Configs. */
profileRouter.get("/spools/:id/profile/orca.json", (req, res) => {
  const { scope } = scopeQuery.parse(req.query);
  const p = build(idParam(req), scope);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`${p.fileName}.json`)}`);
  res.send(profileJsonText(p));
});
