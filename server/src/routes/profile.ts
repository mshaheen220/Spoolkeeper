import { Router } from "express";
import { z } from "zod";
import { getSpool } from "../db/repo";
import { idParam } from "../lib/http";
import { profileJsonText } from "../lib/orca/profile";
import { buildForSpool } from "../lib/orca/spoolProfile";

export const profileRouter = Router();

const scopeQuery = z.object({ scope: z.enum(["spool", "product"]).default("spool") });

const build = buildForSpool;

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
    profile: { name: p.name, fileName: p.fileName, inherits: p.inherits, baseFallback: p.baseFallback, tunedOn: p.tunedOn, orcaVersion: p.orcaVersion },
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
