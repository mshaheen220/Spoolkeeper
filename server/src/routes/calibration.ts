import { Router } from "express";
import { z } from "zod";
import { getSpool, listSpoolsForProduct } from "../db/repo";
import {
  calibrationPrinter,
  contextFor,
  getRun,
  listRuns,
  saveRun,
  tunedForSpool,
  updateRun,
} from "../lib/calibration/service";
import { BASE_DEFAULTS, getTest, TESTS } from "../lib/calibration/tests";
import { asyncHandler, HttpError, idParam, notFound } from "../lib/http";

export const calibrationRouter = Router();

function spoolOr404(id: number) {
  const spool = getSpool(id);
  if (!spool) throw notFound("Spool");
  return spool;
}

/**
 * Everything the wizard needs for one spool: the tests with dialog values
 * suggested for this filament, run history, current tuned values, and the
 * same values on other spools of this filament for comparison.
 */
calibrationRouter.get(
  "/spools/:id/calibration",
  asyncHandler(async (req, res) => {
    const spool = spoolOr404(idParam(req));
    const ctx = contextFor(spool);
    const tests = TESTS.map((t) => {
      const params = t.suggestParams(ctx);
      return {
        id: t.id,
        step: t.step,
        title: t.title,
        optional: !!t.optional,
        why: t.why,
        orcaMenu: t.orcaMenu,
        instructions: t.instructions,
        params: t.params,
        observation: t.observation,
        suggestedParams: params,
        suggestedObservation: t.suggestObservation?.(ctx, params) ?? {},
        skipped: t.id === "pa" && ctx.linearAdvance === "unsupported",
      };
    });
    const siblings = listSpoolsForProduct(spool.product.id)
      .filter((s) => s.id !== spool.id)
      .map((s) => ({ spoolId: s.id, archived: s.archived, tuned: tunedForSpool(s.id) }))
      .filter((s) => Object.keys(s.tuned).length > 0);
    res.json({
      spoolId: spool.id,
      product: spool.product,
      linearAdvance: ctx.linearAdvance,
      calibratingOn: await calibrationPrinter(),
      printerRetraction: ctx.printerRetraction,
      tests,
      runs: listRuns(spool.id),
      tuned: tunedForSpool(spool.id),
      // Base profile values a tuned value replaces; the printer preset's retraction applies when the base has none.
      baseDefaults: {
        ...(ctx.printerRetraction.length != null ? { filament_retraction_length: String(ctx.printerRetraction.length) } : {}),
        ...(BASE_DEFAULTS[spool.product.material.toUpperCase()] ?? {}),
      },
      siblings,
    });
  }),
);

const runBody = z.object({
  test: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  observation: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().max(2000).nullish(),
});

/** Compute without saving - the wizard shows the math live as values are entered. */
calibrationRouter.post("/spools/:id/calibration/preview", (req, res) => {
  const spool = spoolOr404(idParam(req));
  const body = runBody.parse(req.body);
  res.json(getTest(body.test).compute(body.params, body.observation, contextFor(spool)));
});

calibrationRouter.post(
  "/spools/:id/calibration/runs",
  asyncHandler(async (req, res) => {
    const spool = spoolOr404(idParam(req));
    const body = runBody.parse(req.body);
    const test = getTest(body.test);
    const computed = test.compute(body.params, body.observation, contextFor(spool));
    const run = saveRun(spool.id, test.id, body.params, body.observation, computed, body.notes ?? null, await calibrationPrinter());
    res.status(201).json({ run, warnings: computed.warnings, tuned: tunedForSpool(spool.id) });
  }),
);

/** Runs are never deleted: un-accepting keeps the history but stops using the values. */
calibrationRouter.patch("/calibration/runs/:id", (req, res) => {
  const id = idParam(req);
  if (!getRun(id)) throw notFound("Calibration run");
  const patch = z.object({ accepted: z.boolean().optional(), notes: z.string().max(2000).nullish() }).parse(req.body);
  if (patch.accepted === undefined && patch.notes === undefined) throw new HttpError(400, "Nothing to update");
  res.json({ run: updateRun(id, patch) });
});
