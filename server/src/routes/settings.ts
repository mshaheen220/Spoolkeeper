import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { getSetting, setSetting } from "../db/repo";
import { DEFAULT_PRINTER_PROFILE } from "../lib/orca/bases";

export const settingsRouter = Router();

function currentSettings() {
  return {
    printerProfile: getSetting("printerProfile", DEFAULT_PRINTER_PROFILE),
    orcaUserDir: config.orcaUserDir,
  };
}

settingsRouter.get("/settings", (_req, res) => {
  res.json(currentSettings());
});

const settingsPatch = z.object({
  // Not trimmed: OrcaSlicer preset names can contain meaningful double spaces.
  printerProfile: z.string().min(1).max(200).optional(),
});

settingsRouter.put("/settings", (req, res) => {
  const patch = settingsPatch.parse(req.body);
  if (patch.printerProfile !== undefined) setSetting("printerProfile", patch.printerProfile);
  res.json(currentSettings());
});
