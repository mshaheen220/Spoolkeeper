import fs from "node:fs";
import { Router } from "express";
import { config } from "../config";
import { getDb } from "../db";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  let database: { ok: boolean; error?: string };
  try {
    getDb().prepare("SELECT 1").get();
    database = { ok: true };
  } catch (err) {
    database = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  // The OrcaSlicer folder is optional (intake and export work without it),
  // so it's reported but doesn't degrade the status.
  const orcaUserDir = { path: config.orcaUserDir, readable: fs.existsSync(config.orcaUserDir) };
  res.status(database.ok ? 200 : 503).json({
    status: database.ok ? "ok" : "degraded",
    database,
    orcaUserDir,
    timestamp: new Date().toISOString(),
  });
});
