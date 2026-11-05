import { Router } from "express";
import { z } from "zod";
import { getProduct, getSpool, listSpoolsForProduct } from "../db/repo";
import { baselineCoverage, baselineFor, getBaselines, setBaselineOverride, setBaselineSource } from "../lib/calibration/baseline";
import {
  calibrationPrinter,
  contextFor,
  copyCalibration,
  copyTargets,
  type CalibrationRun,
  getRun,
  listRuns,
  saveRun,
  tunedForSpool,
  updateRun,
} from "../lib/calibration/service";
import type { StepId } from "../lib/calibration/tests";
import { BASE_DEFAULTS, getTest, SETUP_CHECKS, TESTS } from "../lib/calibration/tests";
import { asyncHandler, HttpError, idParam, notFound } from "../lib/http";

export const calibrationRouter = Router();

/** Runs with the name of the filament a copied run came from, for the history. */
function withCopySource(runs: CalibrationRun[]) {
  const names = new Map<number, string>();
  return runs.map((r) => {
    if (!r.copiedFrom) return { ...r, copiedFrom: null };
    const { spoolId } = r.copiedFrom;
    if (!names.has(spoolId)) names.set(spoolId, getSpool(spoolId)?.product.displayName ?? "another filament");
    return { ...r, copiedFrom: { ...r.copiedFrom, name: names.get(spoolId)! } };
  });
}

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
        orcaSets: t.orcaSets ?? null,
        checks: t.checks ?? [],
        instructions: t.instructions,
        watch: t.watch ?? null,
        params: t.params,
        observation: t.observation,
        suggestedParams: params,
        suggestedObservation: t.suggestObservation?.(ctx, params) ?? {},
        suggestionNotes: t.suggestionNotes?.(ctx) ?? {},
        prefillIsAnswer: !!t.prefillIsAnswer,
        skipped: t.id === "pa" && ctx.linearAdvance === "unsupported",
      };
    });
    const tuned = tunedForSpool(spool.id);
    const siblings = listSpoolsForProduct(spool.product.id)
      .filter((s) => s.id !== spool.id)
      .map((s) => ({ spoolId: s.id, archived: s.archived, tuned: tunedForSpool(s.id) }))
      .filter((s) => Object.keys(s.tuned).length > 0);
    res.json({
      spoolId: spool.id,
      product: spool.product,
      linearAdvance: ctx.linearAdvance,
      calibratingOn: await calibrationPrinter(),
      plateType: ctx.plateType,
      setupChecks: SETUP_CHECKS,
      printerRetraction: ctx.printerRetraction,
      tests,
      runs: withCopySource(listRuns(spool.id)),
      copyTargets: copyTargets(spool),
      tuned,
      baseline: baselineFor(spool.product, tuned),
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

const STEP_IDS = ["temp", "mvs", "pa", "flow", "retraction", "cooling"] as const satisfies readonly StepId[];

/** Copies this spool's calibration to other filaments of the same brand and material. */
calibrationRouter.post("/spools/:id/calibration/copy", (req, res) => {
  const spool = spoolOr404(idParam(req));
  const body = z.object({ productIds: z.array(z.number().int()).min(1), steps: z.array(z.enum(STEP_IDS)).min(1) }).parse(req.body);
  const targets = new Map(copyTargets(spool).map((t) => [t.productId, t]));
  const chosen = body.productIds.map((id) => {
    const t = targets.get(id);
    if (!t) throw new HttpError(400, "Calibration can only be copied to an active filament of the same brand and material");
    return t;
  });
  const results = copyCalibration(
    spool.id,
    chosen.map((t) => t.spoolId),
    body.steps,
  );
  res.json({ copied: results.map((r, i) => ({ productId: chosen[i].productId, spoolId: r.spoolId, runs: r.copied })) });
});

/** Each material's baseline spool, and what it does for every active filament of that material. */
calibrationRouter.get("/calibration/baselines", (_req, res) => {
  const { sources } = getBaselines();
  res.json({
    baselines: Object.entries(sources).map(([material, spoolId]) => {
      const spool = getSpool(spoolId);
      return {
        material,
        source: spool ? { spoolId, name: spool.product.displayName, tuned: tunedForSpool(spoolId) } : null,
        filaments: spool ? baselineCoverage(material) : [],
      };
    }),
  });
});

/** Make this spool's results its material's baseline (or stop, with `{ use: false }`). */
calibrationRouter.put("/spools/:id/calibration/baseline", (req, res) => {
  const spool = spoolOr404(idParam(req));
  const { use } = z.object({ use: z.boolean() }).parse(req.body);
  const material = spool.product.material;
  if (use) {
    if (!Object.keys(tunedForSpool(spool.id)).length) throw new HttpError(400, "This spool has no accepted calibration results to use as a baseline");
    setBaselineSource(material, spool.id);
  } else if (getBaselines().sources[material.toUpperCase()] === spool.id) setBaselineSource(material, null);
  res.json({ baseline: baselineFor(spool.product, tunedForSpool(spool.id)) });
});

/** Always (true), never (false) or automatically (null - by finish) use the baseline for a filament. */
calibrationRouter.put("/products/:id/calibration/baseline", (req, res) => {
  const { use } = z.object({ use: z.boolean().nullable() }).parse(req.body);
  if (!getProduct(idParam(req))) throw notFound("Filament");
  setBaselineOverride(idParam(req), use);
  res.json({ ok: true });
});

/** Runs are never deleted: un-accepting keeps the history but stops using the values. */
calibrationRouter.patch("/calibration/runs/:id", (req, res) => {
  const id = idParam(req);
  if (!getRun(id)) throw notFound("Calibration run");
  const patch = z.object({ accepted: z.boolean().optional(), notes: z.string().max(2000).nullish() }).parse(req.body);
  if (patch.accepted === undefined && patch.notes === undefined) throw new HttpError(400, "Nothing to update");
  res.json({ run: updateRun(id, patch) });
});
