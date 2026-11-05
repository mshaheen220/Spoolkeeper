import fs from "node:fs";
import path from "node:path";
import { config } from "../../config";
import { getDb } from "../../db";
import { getSetting, listProducts, listSpoolsForProduct, type Product, type Spool } from "../../db/repo";
import { DEFAULT_PRINTER_PROFILE } from "../orca/bases";
import { readPlateType } from "../orca/appConfig";
import { listUserPrinters } from "../orca/printers";
import { orcaValue } from "../orca/userProfiles";
import { getTest, type Computed, type LinearAdvance, type PrinterRetraction, type ResultValue, type StepId, type TestContext, type TestId } from "./tests";

export interface CalibrationRun {
  id: number;
  spoolId: number;
  test: TestId;
  params: Record<string, unknown>;
  observation: Record<string, unknown>;
  result: ResultValue[];
  formula: string[];
  accepted: boolean;
  notes: string | null;
  createdAt: string;
  /** Printer preset and nozzle the run was measured on. */
  printerProfile: string | null;
  nozzleDiameter: number | null;
  /** Set when the run was copied from another filament's calibration. */
  copiedFrom: { runId: number; spoolId: number } | null;
}

export interface TunedValue {
  key: string;
  value: string;
  label: string;
  runId: number;
  test: TestId;
  date: string;
  printerProfile: string | null;
  nozzleDiameter: number | null;
}

type Row = Record<string, unknown>;

function rowToRun(r: Row): CalibrationRun {
  return {
    id: r.id as number,
    spoolId: r.spool_id as number,
    test: r.test as TestId,
    params: JSON.parse(r.params as string),
    observation: JSON.parse(r.observation as string),
    result: JSON.parse(r.result as string),
    formula: JSON.parse(r.formula as string),
    accepted: r.accepted === 1,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    printerProfile: (r.printer_profile as string) ?? null,
    nozzleDiameter: (r.nozzle_diameter as number) ?? null,
    copiedFrom: r.copied_from_run != null ? { runId: r.copied_from_run as number, spoolId: r.copied_from_spool as number } : null,
  };
}

const RUN_SELECT = "SELECT r.*, src.spool_id AS copied_from_spool FROM calibration_runs r LEFT JOIN calibration_runs src ON src.id = r.copied_from_run";

export function listRuns(spoolId: number): CalibrationRun[] {
  return (getDb().prepare(`${RUN_SELECT} WHERE r.spool_id = ? ORDER BY r.created_at, r.id`).all(spoolId) as Row[]).map(rowToRun);
}

export function getRun(id: number): CalibrationRun | null {
  const r = getDb().prepare(`${RUN_SELECT} WHERE r.id = ?`).get(id) as Row | undefined;
  return r ? rowToRun(r) : null;
}

export function saveRun(
  spoolId: number,
  test: TestId,
  params: object,
  observation: object,
  computed: Computed,
  notes: string | null,
  printer: { name: string; nozzleDiameter: number | null },
): CalibrationRun {
  const info = getDb()
    .prepare(
      "INSERT INTO calibration_runs (spool_id, test, params, observation, result, formula, notes, printer_profile, nozzle_diameter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      spoolId,
      test,
      JSON.stringify(params),
      JSON.stringify(observation),
      JSON.stringify(computed.values),
      JSON.stringify(computed.formula),
      notes,
      printer.name,
      printer.nozzleDiameter,
    );
  return getRun(Number(info.lastInsertRowid))!;
}

export function updateRun(id: number, patch: { accepted?: boolean; notes?: string | null }) {
  if (patch.accepted !== undefined) getDb().prepare("UPDATE calibration_runs SET accepted = ? WHERE id = ?").run(patch.accepted ? 1 : 0, id);
  if (patch.notes !== undefined) getDb().prepare("UPDATE calibration_runs SET notes = ? WHERE id = ?").run(patch.notes, id);
  return getRun(id);
}

/** Latest accepted value per OrcaSlicer key: later runs override earlier ones, so a redo wins. */
export function tunedFromRuns(runs: CalibrationRun[]): Record<string, TunedValue> {
  const out: Record<string, TunedValue> = {};
  for (const run of runs) {
    if (!run.accepted) continue;
    for (const v of run.result)
      out[v.key] = { ...v, runId: run.id, test: run.test, date: run.createdAt, printerProfile: run.printerProfile, nozzleDiameter: run.nozzleDiameter };
  }
  return out;
}

export const tunedForSpool = (spoolId: number) => tunedFromRuns(listRuns(spoolId));

export interface CopyTarget {
  productId: number;
  displayName: string;
  colorHex: string | null;
  colorHexes: string[] | null;
  multiColorDirection: Product["multiColorDirection"];
  /** The spool the copied runs go on: its calibrated spool, else its first active one. */
  spoolId: number;
  /** Why this filament may print differently from the source - each one unticks it by default. */
  differences: string[];
  /** Steps it already has its own (not copied) results for. */
  calibratedSteps: StepId[];
}

const finishSet = (p: Product) => new Set((p.finishes ?? []).filter((f) => f !== "Basic"));

/** Other filaments of the same brand and material that this spool's calibration could be copied to. */
export function copyTargets(source: Spool): CopyTarget[] {
  const src = source.product;
  const srcFinishes = finishSet(src);
  const out: CopyTarget[] = [];
  for (const p of listProducts()) {
    if (p.id === src.id || p.vendor.id !== src.vendor.id || p.material.toUpperCase() !== src.material.toUpperCase()) continue;
    const active = listSpoolsForProduct(p.id).filter((s) => !s.archived);
    if (!active.length) continue;
    const calibrated = calibratedSpoolForProduct(p.id, active[0].id);
    const spoolId = active.some((s) => s.id === calibrated) ? calibrated! : active[0].id;

    const differences: string[] = [];
    const finishes = finishSet(p);
    for (const f of finishes) if (!srcFinishes.has(f)) differences.push(f);
    for (const f of srcFinishes) if (!finishes.has(f)) differences.push(`Not ${f}`);
    if ((p.line ?? "") !== (src.line ?? "")) differences.push(p.line ? `${p.line} line` : "No line name");
    if (p.nozzleMin !== src.nozzleMin || p.nozzleMax !== src.nozzleMax) {
      if (p.nozzleMin != null && p.nozzleMax != null) differences.push(`Maker's range ${p.nozzleMin}–${p.nozzleMax} °C`);
    }

    const own = listRuns(spoolId).filter((r) => r.accepted && !r.copiedFrom);
    const calibratedSteps = [...new Set(own.map((r) => getTest(r.test).step))];
    out.push({ productId: p.id, displayName: p.displayName, colorHex: p.colorHex, colorHexes: p.colorHexes, multiColorDirection: p.multiColorDirection, spoolId, differences, calibratedSteps });
  }
  return out.sort((a, b) => a.differences.length - b.differences.length || a.displayName.localeCompare(b.displayName));
}

/**
 * Copies the source spool's latest accepted run of each test in `steps` onto
 * each target spool, oldest first so the same run wins there as here. A run
 * already copied to a target isn't copied again.
 */
export function copyCalibration(sourceSpoolId: number, targetSpoolIds: number[], steps: StepId[]): { spoolId: number; copied: number }[] {
  const latest = new Map<TestId, CalibrationRun>();
  for (const run of listRuns(sourceSpoolId)) if (run.accepted && steps.includes(getTest(run.test).step)) latest.set(run.test, run);
  const runs = [...latest.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);

  const insert = getDb().prepare(
    `INSERT INTO calibration_runs (spool_id, test, params, observation, result, formula, notes, printer_profile, nozzle_diameter, copied_from_run)
     SELECT ?, test, params, observation, result, formula, notes, printer_profile, nozzle_diameter, id FROM calibration_runs WHERE id = ?`,
  );
  const already = getDb().prepare("SELECT 1 FROM calibration_runs WHERE spool_id = ? AND copied_from_run = ? AND accepted = 1");
  return getDb().transaction(() =>
    targetSpoolIds.map((spoolId) => {
      let copied = 0;
      for (const run of runs) {
        if (already.get(spoolId, run.id)) continue;
        insert.run(spoolId, run.id);
        copied++;
      }
      return { spoolId, copied };
    }),
  )();
}

/**
 * For a per-product profile: the spool of this product with the most recent
 * accepted calibration (the given spool wins ties), or null if none.
 */
export function calibratedSpoolForProduct(productId: number, preferSpoolId: number): number | null {
  let best: { spoolId: number; at: string } | null = null;
  for (const s of listSpoolsForProduct(productId)) {
    const runs = listRuns(s.id).filter((r) => r.accepted);
    if (!runs.length) continue;
    const at = runs[runs.length - 1].createdAt;
    if (!best || at > best.at || (at === best.at && s.id === preferSpoolId)) best = { spoolId: s.id, at };
  }
  return best?.spoolId ?? null;
}

/**
 * The printer calibration happens on (Settings), with its nozzle size read
 * from OrcaSlicer's preset when available, else from the preset name.
 */
export async function calibrationPrinter(): Promise<{ name: string; nozzleDiameter: number | null }> {
  const name = getSetting("printerProfile", DEFAULT_PRINTER_PROFILE);
  let nozzle: number | null = null;
  try {
    nozzle = (await listUserPrinters(config.orcaUserDir)).find((p) => p.name === name)?.nozzleDiameter ?? null;
  } catch {
    // Folder not readable - fall back to the name.
  }
  const fromName = name.match(/(\d+(?:\.\d+)?)\s*(?:mm\s*)?nozzle/i);
  return { name, nozzleDiameter: nozzle ?? (fromName ? Number(fromName[1]) : null) };
}

export function linearAdvanceStatus(): LinearAdvance {
  return getSetting<LinearAdvance>("linearAdvance", "unknown");
}

/**
 * The printer preset's own retraction settings (TheHammer sets 1.2 mm,
 * Slope Lift, 0.8 mm wipe). Only what the user preset sets is visible -
 * inherited system values aren't mounted - so missing ones are null.
 */
export function readPrinterRetraction(): PrinterRetraction {
  const empty: PrinterRetraction = { length: null, speed: null, zHop: null, zHopType: null, wipe: null, wipeDistance: null };
  const name = getSetting("printerProfile", DEFAULT_PRINTER_PROFILE);
  const file = path.join(config.orcaUserDir, "machine", `${name}.json`);
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    const n = (k: string) => {
      const v = Number(orcaValue(json[k]));
      return orcaValue(json[k]) != null && Number.isFinite(v) ? v : null;
    };
    const wipe = orcaValue(json.wipe);
    return {
      length: n("retraction_length"),
      speed: n("retraction_speed"),
      zHop: n("z_hop"),
      zHopType: orcaValue(json.z_hop_types),
      wipe: wipe == null ? null : wipe === "1",
      wipeDistance: n("wipe_distance"),
    };
  } catch {
    return empty;
  }
}

export function contextFor(spool: Spool): TestContext {
  const runs = listRuns(spool.id);
  const tuned = Object.fromEntries(Object.entries(tunedFromRuns(runs)).map(([k, v]) => [k, v.value]));
  const pass1 = [...runs].reverse().find((r) => r.accepted && r.test === "flow1");
  const pass1Flow = pass1?.result.find((v) => v.key === "filament_flow_ratio")?.value;
  return {
    product: spool.product,
    tuned,
    lastPass1Flow: pass1Flow != null ? Number(pass1Flow) : null,
    linearAdvance: linearAdvanceStatus(),
    printerRetraction: readPrinterRetraction(),
    plateType: readPlateType(config.orcaConfPath, getSetting("printerProfile", DEFAULT_PRINTER_PROFILE)),
  };
}
