import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { getSetting, setSetting } from "../db/repo";
import { HttpError } from "../lib/http";
import { DEFAULT_PRINTER_PROFILE } from "../lib/orca/bases";

export const settingsRouter = Router();

export interface EstepsCheck {
  current: number;
  markMm: number;
  extrudeMm: number;
  remainingMm: number;
  extrudedMm: number;
  suggested: number;
  checkedAt: string;
}

function currentSettings() {
  return {
    printerProfile: getSetting("printerProfile", DEFAULT_PRINTER_PROFILE),
    orcaUserDir: config.orcaUserDir,
    // From M503/M900: "supported" only if M503 lists an M900 K line.
    linearAdvance: getSetting<"unknown" | "supported" | "unsupported">("linearAdvance", "unknown"),
    esteps: getSetting<EstepsCheck | null>("esteps", null),
  };
}

settingsRouter.get("/settings", (_req, res) => {
  res.json(currentSettings());
});

const settingsPatch = z.object({
  // Not trimmed: OrcaSlicer preset names can contain meaningful double spaces.
  printerProfile: z.string().min(1).max(200).optional(),
  linearAdvance: z.enum(["unknown", "supported", "unsupported"]).optional(),
});

settingsRouter.put("/settings", (req, res) => {
  const patch = settingsPatch.parse(req.body);
  if (patch.printerProfile !== undefined) setSetting("printerProfile", patch.printerProfile);
  if (patch.linearAdvance !== undefined) setSetting("linearAdvance", patch.linearAdvance);
  res.json(currentSettings());
});

const estepsBody = z.object({
  current: z.coerce.number().positive(),
  markMm: z.coerce.number().positive().default(120),
  extrudeMm: z.coerce.number().positive().default(100),
  remainingMm: z.coerce.number().min(0),
});

/**
 * E-steps check: mark the filament 120 mm above the extruder, extrude 100 mm
 * (M83, G1 E100 F100 with the hotend hot), measure what's left to the mark.
 * new = current × requested / actually extruded. Printer-level, so it lives
 * in settings rather than on a spool.
 */
settingsRouter.post("/settings/esteps", (req, res) => {
  const b = estepsBody.parse(req.body);
  const extruded = b.markMm - b.remainingMm;
  if (extruded <= 0) throw new HttpError(400, "The remaining length must be less than where you marked the filament");
  const suggested = Math.round(((b.current * b.extrudeMm) / extruded) * 100) / 100;
  const check: EstepsCheck = { ...b, extrudedMm: extruded, suggested, checkedAt: new Date().toISOString() };
  setSetting("esteps", check);
  res.json(currentSettings());
});
