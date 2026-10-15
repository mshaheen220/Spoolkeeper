import fs from "node:fs";
import { Router } from "express";
import { config } from "../config";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  // The OrcaSlicer folder is optional (intake and export work without it),
  // so it's reported but doesn't degrade the status.
  const orcaUserDir = { path: config.orcaUserDir, readable: fs.existsSync(config.orcaUserDir) };
  res.json({ status: "ok", orcaUserDir, timestamp: new Date().toISOString() });
});
