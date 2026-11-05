import { Router } from "express";
import { z } from "zod";
import { getSpool, listSpools } from "../db/repo";
import { idParam, notFound } from "../lib/http";
import {
  applyPublish,
  filamentDir,
  folderWritable,
  listStrays,
  listPublished,
  newBackupDir,
  planPublish,
  readUserFilaments,
  removeStrays,
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
        /** Replace a same-named preset you made yourself (backed up first). */
        replace: z.boolean().optional(),
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
    results.push(applyPublish(buildForSpool(spool.id, item.scope), { spoolId: spool.id, productId: spool.product.id }, { overwrite: item.overwrite, replace: item.replace, backupDir }));
  }
  res.json({ results, restartNote: RESTART_NOTE });
});

/**
 * Every preset in OrcaSlicer that isn't a current Spoolkeeper one, each with
 * whether its filament has a published Spoolkeeper preset yet - so nothing
 * is removed before its replacement exists.
 */
publishRouter.get("/publish/strays", (_req, res) => {
  const spools = listSpools();
  const files = readUserFilaments();
  const found = listStrays(files);
  // Current Spoolkeeper presets only - a stale one doesn't count as its own replacement.
  const stale = new Set(found.map((f) => f.owner));
  const live = new Set(files.map((f) => f.owner).filter((o) => o && !stale.has(o)));
  const publishedProducts = new Set(listPublished().filter((p) => live.has(p.owner)).map((p) => p.productId));
  const strays = found.map((f) => ({
    ...f,
    spoolIds: f.productId == null ? [] : spools.filter((s) => s.product.id === f.productId).map((s) => s.id),
    replaced: f.productId != null && publishedProducts.has(f.productId),
  }));
  res.json({ writable: folderWritable(), strays });
});

const removeBody = z.object({ files: z.array(z.string().min(1)).min(1).max(500) });

publishRouter.post("/publish/strays/remove", (req, res) => {
  const { files } = removeBody.parse(req.body);
  const writable = folderWritable();
  if (!writable.ok) {
    res.status(409).json({ error: writable.reason });
    return;
  }
  res.json({ ...removeStrays(files, newBackupDir("cleanup")), restartNote: RESTART_NOTE });
});
