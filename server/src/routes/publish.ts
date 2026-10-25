import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { getSpool, listSpools } from "../db/repo";
import { idParam, notFound } from "../lib/http";
import {
  applyPublish,
  filamentDir,
  folderWritable,
  listLegacy,
  listPublished,
  newBackupDir,
  planPublish,
  readUserFilaments,
  removeLegacy,
  type PublishResult,
} from "../lib/orca/publish";
import { buildForSpool } from "../lib/orca/spoolProfile";

export const publishRouter = Router();

const scopeSchema = z.enum(["spool", "product"]);
const RESTART_NOTE = "OrcaSlicer reads presets when it starts: quit and reopen it to see these changes.";

function planFor(spoolId: number, scope: "spool" | "product", files = readUserFilaments()) {
  const spool = getSpool(spoolId);
  if (!spool) throw notFound("Spool");
  return planPublish(buildForSpool(spoolId, scope), { spoolId, productId: spool.product.id }, files);
}

/**
 * Every spool's preset and how it compares with OrcaSlicer's folder. Per
 * product, a filament with several spools is one preset (listed under its
 * lowest spool id, with the rest in spoolIds).
 */
publishRouter.get("/publish", (req, res) => {
  const scope = scopeSchema.default("spool").parse(req.query.scope);
  const files = readUserFilaments();
  const spools = listSpools().sort((a, b) => a.id - b.id);
  const groups = new Map<string, number[]>();
  for (const s of spools) {
    const k = scope === "spool" ? `s${s.id}` : `p${s.product.id}`;
    groups.set(k, [...(groups.get(k) ?? []), s.id]);
  }
  const items = [...groups.values()].map((spoolIds) => {
    const plan = planFor(spoolIds[0], scope, files);
    const spool = spools.find((s) => s.id === spoolIds[0])!;
    return { ...plan, spoolIds, colorHex: spool.product.colorHex, material: spool.product.material };
  });
  res.json({ dir: filamentDir(), writable: folderWritable(), restartNote: RESTART_NOTE, scope, items });
});

/** One spool's publish plan: the key-by-key diff against OrcaSlicer's file. */
publishRouter.get("/publish/spools/:id", (req, res) => {
  const scope = scopeSchema.default("spool").parse(req.query.scope);
  res.json({ writable: folderWritable(), restartNote: RESTART_NOTE, plan: planFor(idParam(req), scope) });
});

const publishBody = z.object({
  items: z
    .array(
      z.object({
        spoolId: z.number().int().positive(),
        scope: scopeSchema,
        /** Hand-tuned keys to overwrite anyway; all others are kept as OrcaSlicer has them. */
        overwrite: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(500),
});

publishRouter.post("/publish", (req, res) => {
  const { items } = publishBody.parse(req.body);
  const writable = folderWritable();
  if (!writable.ok) {
    res.status(409).json({ error: writable.reason });
    return;
  }
  // One backup folder per publish, whatever it touches.
  const backupDir = newBackupDir("publish");
  const results: PublishResult[] = [];
  for (const item of items) {
    const spool = getSpool(item.spoolId);
    if (!spool) {
      results.push({ owner: "", name: `Spool #${item.spoolId}`, fileName: "", action: "blocked", kept: [], backupDir: null, error: "Spool not found" });
      continue;
    }
    results.push(applyPublish(buildForSpool(spool.id, item.scope), { spoolId: spool.id, productId: spool.product.id }, { overwrite: item.overwrite, backupDir }));
  }
  res.json({ results, restartNote: RESTART_NOTE });
});

/**
 * spoolman2slicer's generated presets, each with the Spoolkeeper filament it
 * was imported as and whether that filament has a published preset yet - so
 * nothing is removed before its replacement exists.
 */
publishRouter.get("/publish/legacy", (_req, res) => {
  const imported = new Map(
    (getDb().prepare("SELECT file_name, product_id FROM imported_profiles").all() as { file_name: string; product_id: number }[]).map((r) => [
      r.file_name,
      r.product_id,
    ]),
  );
  const spools = listSpools();
  const files = readUserFilaments();
  const live = new Set(files.map((f) => f.owner).filter(Boolean));
  const publishedProducts = new Set(listPublished().filter((p) => live.has(p.owner)).map((p) => p.productId));
  const legacy = listLegacy(files).map((f) => {
    const productId = imported.get(f.fileName) ?? null;
    const spoolIds = productId == null ? [] : spools.filter((s) => s.product.id === productId).map((s) => s.id);
    return { ...f, productId, spoolIds, replaced: productId != null && publishedProducts.has(productId) };
  });
  res.json({ writable: folderWritable(), legacy });
});

const removeBody = z.object({ files: z.array(z.string().min(1)).min(1).max(500) });

publishRouter.post("/publish/legacy/remove", (req, res) => {
  const { files } = removeBody.parse(req.body);
  const writable = folderWritable();
  if (!writable.ok) {
    res.status(409).json({ error: writable.reason });
    return;
  }
  res.json({ ...removeLegacy(files, newBackupDir("spoolman2slicer")), restartNote: RESTART_NOTE });
});
