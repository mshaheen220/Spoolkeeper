import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { getSetting, getSpool, type Spool } from "../db/repo";
import { finishFromWord } from "../lib/appearance";
import { tunedForSpool } from "../lib/calibration/service";
import { DEFAULT_LABEL, type LabelSettings } from "./settings";

export const labelsRouter = Router();

/** A temperature to print: the tuned value when calibrated (marked), else the maker's range. */
interface LabelTemp {
  text: string;
  tuned: boolean;
}

export interface LabelData {
  spoolId: number;
  url: string;
  brand: string;
  /** "PLA", "PLA+", "PLA · High Speed" - finishes are listed separately. */
  material: string;
  finishes: string[];
  colorName: string | null;
  colorHex: string | null;
  colorHexes: string[] | null;
  multiColorDirection: string | null;
  nozzle: LabelTemp | null;
  bed: LabelTemp | null;
  dry: string | null;
}

const range = (lo: number | null, hi: number | null) => (lo == null && hi == null ? null : lo === hi || hi == null ? `${lo}` : lo == null ? `${hi}` : `${lo}–${hi}`);

/** "PLA", "PLA+" (a line that names the material), "PLA High Speed"; a line that's really a finish isn't repeated. */
function materialText(material: string, line: string | undefined): string {
  if (!line || finishFromWord(line)) return material;
  return line.toUpperCase().includes(material.toUpperCase()) ? line : `${material} ${line}`;
}

export function labelFor(spool: Spool, baseUrl: string): LabelData {
  const p = spool.product;
  const tuned = tunedForSpool(spool.id);
  const nozzleTuned = tuned.nozzle_temperature?.value;
  const nozzleMaker = range(p.nozzleMin, p.nozzleMax);
  // Bed: the side in use is unknown on a label, so show the smooth/textured pair only when they differ.
  const smooth = tuned.hot_plate_temp?.value;
  const textured = tuned.textured_plate_temp?.value;
  const bedTuned = smooth && textured && smooth !== textured ? `${smooth}/${textured}` : (smooth ?? textured);
  const bedMaker = range(p.bedMin, p.bedMax);
  const line = p.line?.trim();
  return {
    spoolId: spool.id,
    url: `${baseUrl}/spools/${spool.id}`,
    brand: p.vendor.name,
    material: materialText(p.material, line),
    finishes: p.finishes ?? [],
    colorName: p.colorName,
    colorHex: p.colorHex,
    colorHexes: p.colorHexes,
    multiColorDirection: p.multiColorDirection,
    nozzle: nozzleTuned ? { text: `${nozzleTuned}°C`, tuned: true } : nozzleMaker ? { text: `${nozzleMaker}°C`, tuned: false } : null,
    bed: bedTuned ? { text: `${bedTuned}°C`, tuned: true } : bedMaker ? { text: `${bedMaker}°C`, tuned: false } : null,
    dry: p.dryTempC ? `${p.dryTempC}°C${p.dryHours ? ` ${p.dryHours}h` : ""}` : null,
  };
}

const idsQuery = z.object({
  ids: z
    .string()
    .regex(/^\d+(,\d+)*$/, "ids must be comma-separated spool numbers")
    .transform((s) => [...new Set(s.split(",").map(Number))])
    .refine((a) => a.length <= 300, "at most 300 labels at once"),
});

/** Label contents for one or more spools, plus the label size and QR address from Settings. */
labelsRouter.get("/labels", (req, res) => {
  const { ids } = idsQuery.parse(req.query);
  const baseUrl = getSetting("publicBaseUrl", config.publicBaseUrl);
  const labels = ids.map((id) => getSpool(id)).filter((s): s is Spool => !!s).map((s) => labelFor(s, baseUrl));
  res.json({ size: getSetting<LabelSettings>("label", DEFAULT_LABEL), baseUrl, labels, missing: ids.filter((id) => !labels.some((l) => l.spoolId === id)) });
});
