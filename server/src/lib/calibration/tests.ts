import type { Product } from "../../db/repo";
import type { PlateType } from "../orca/appConfig";
import { HttpError } from "../http";

// The calibration wizard's steps. Every dialog default, block list and
// formula here was checked against OrcaSlicer 2.4.2 itself (2026-10-16):
// - dialog defaults: src/slic3r/GUI/calib_dlg.cpp at tag v2.4.2
// - per-height values: src/libslic3r/GCode.cpp (Calib_* cases)
// - flow block modifiers: the object names inside the installed
//   Resources/calib/filament_flow/*.3mf (flowrate_m20 ... flowrate_20, etc.)
// - order: the OrcaSlicer wiki Calibration Guide (temperature, max
//   volumetric speed, pressure advance, flow ratio, retraction).

export type TestId = "temp" | "mvs" | "pa" | "flow1" | "flow2" | "flow_yolo" | "retraction" | "cooling";

export type LinearAdvance = "unknown" | "supported" | "unsupported";

export interface InputField {
  key: string;
  label: string;
  type: "number" | "select" | "text" | "boolean";
  unit?: string;
  step?: number;
  options?: { value: string; label: string }[];
  help?: string;
  optional?: boolean;
  /** Shown for reference (what to pick in OrcaSlicer's dialog), not edited. */
  readOnly?: boolean;
  /** Not in the dialog: the test reads it from the selected filament profile. */
  fromProfile?: boolean;
}

export interface ResultValue {
  /** OrcaSlicer filament preset key. */
  key: string;
  value: string;
  label: string;
}

export interface Computed {
  values: ResultValue[];
  /** Lines of the calculation, in plain words and numbers. */
  formula: string[];
  warnings: string[];
}

/** A short action headline, with the explanation kept out of the way until asked for. */
export interface Hint {
  title: string;
  detail?: string;
}

const hint = (title: string, detail?: string): Hint => (detail ? { title, detail } : { title });

export interface TestContext {
  product: Product;
  /** Current tuned values for this spool (OrcaSlicer key -> value), before this run. */
  tuned: Record<string, string>;
  /** Latest accepted flow Pass 1 result, which Pass 2 starts from. */
  lastPass1Flow: number | null;
  linearAdvance: LinearAdvance;
  /** The printer preset's own retraction settings, for reference and defaults. */
  printerRetraction: PrinterRetraction;
  /** Plate type OrcaSlicer last used for the calibration printer, if known. */
  plateType: PlateType | null;
}

export interface PrinterRetraction {
  length: number | null;
  speed: number | null;
  zHop: number | null;
  zHopType: string | null;
  wipe: boolean | null;
  wipeDistance: number | null;
}

export type StepId = "temp" | "mvs" | "pa" | "flow" | "retraction" | "cooling";

export interface TestDef {
  id: TestId;
  title: string;
  /** Wizard grouping: flow1/flow2/flow_yolo are alternatives within one step. */
  step: StepId;
  optional?: boolean;
  why: string;
  /** Where to find it in OrcaSlicer's menu bar and what to pick. */
  orcaMenu: string[];
  /** What OrcaSlicer forces for this test (Plater.cpp calib_*), so the presets' values don't matter there. */
  orcaSets?: string;
  /** Preset settings OrcaSlicer leaves alone that can spoil this particular test. */
  checks?: Hint[];
  instructions: Hint[];
  /** What to look and listen for while it prints, and how to read the finished test. */
  watch?: { during: Hint[]; after: Hint[] };
  params: InputField[];
  observation: InputField[];
  suggestParams(ctx: TestContext): Record<string, string | number | boolean>;
  suggestObservation?(ctx: TestContext, params: Record<string, number | string | boolean>): Record<string, string | number | boolean>;
  /** Where each prefilled observation came from, shown under its field. */
  suggestionNotes?(ctx: TestContext): Record<string, string>;
  /** Prefilled observations are a complete answer to confirm (not just defaults around a measurement). */
  prefillIsAnswer?: boolean;
  compute(params: Record<string, unknown>, obs: Record<string, unknown>, ctx: TestContext): Computed;
}

// ------------------------------------------------------------ helpers

const bad = (msg: string) => new HttpError(400, msg);

function num(v: unknown, label: string): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (v === "" || v === null || v === undefined || !Number.isFinite(n)) throw bad(`${label} is required and must be a number`);
  return n;
}
function optNum(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** Round to a fixed number of decimals and drop trailing zeros. */
const r = (n: number, d = 3) => String(Math.round(n * 10 ** d) / 10 ** d);
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const isWoodPla = (p: Product) => p.material === "PLA" && (!!p.finishes?.includes("Wood Fill") || /wood/i.test(`${p.line ?? ""} ${p.colorName ?? ""}`));

/** The user's known-good reference: Sunlu Walnut Wood PLA. A sanity check, never a default. */
export const WOOD_PLA_REFERENCE = { temp: 210, retraction: 1.2, zHopType: "Slope Lift", wipeDistance: 0.8 };

/**
 * What the inherited base profile uses when a value isn't tuned - resolved
 * through the inherits chain of OrcaSlicer 2.4.2's Creality Generic presets.
 * Shown next to tuned values so the difference is visible.
 */
export const BASE_DEFAULTS: Record<string, Record<string, string>> = {
  PLA: { filament_flow_ratio: "0.98", filament_max_volumetric_speed: "12", nozzle_temperature: "220", fan_min_speed: "100", fan_max_speed: "100", hot_plate_temp: "60", textured_plate_temp: "60" },
  PETG: { filament_flow_ratio: "0.95", filament_max_volumetric_speed: "10", nozzle_temperature: "255", fan_min_speed: "40", fan_max_speed: "90", hot_plate_temp: "80", textured_plate_temp: "80" },
  TPU: { filament_flow_ratio: "1", filament_max_volumetric_speed: "3.2", nozzle_temperature: "240", filament_retraction_length: "0.4", fan_min_speed: "100", fan_max_speed: "100", hot_plate_temp: "35", textured_plate_temp: "60" },
  ABS: { filament_flow_ratio: "0.926", filament_max_volumetric_speed: "12", nozzle_temperature: "260", fan_min_speed: "10", fan_max_speed: "80", hot_plate_temp: "105", textured_plate_temp: "105" },
};

/** Flow ratio of the inherited base profile. */
export const BASE_FLOW: Record<string, number> = { PLA: 0.98, PETG: 0.95, TPU: 1, ABS: 0.926, ASA: 0.926 };

/** OrcaSlicer's temperature-tower presets (Temp_Calibration_Dlg::on_filament_type_changed). */
const TEMP_PRESETS: { type: string; label: string; start: number; end: number }[] = [
  { type: "PLA", label: "PLA", start: 230, end: 190 },
  { type: "ABS", label: "ABS/ASA", start: 270, end: 230 },
  { type: "ASA", label: "ABS/ASA", start: 270, end: 230 },
  { type: "PETG", label: "PETG", start: 250, end: 230 },
  { type: "PCTG", label: "PCTG", start: 280, end: 240 },
  { type: "TPU", label: "TPU", start: 240, end: 210 },
  { type: "PA-CF", label: "PA-CF", start: 320, end: 280 },
  { type: "PET-CF", label: "PET-CF", start: 320, end: 280 },
];

const FLOW_PASS1 = [-20, -15, -10, -5, 0, 5, 10, 15, 20];
const FLOW_PASS2 = [-9, -8, -7, -6, -5, -4, -3, -2, -1, 0];
const FLOW_YOLO = [-0.05, -0.04, -0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04, 0.05];
const FLOW_YOLO_FINE = [-0.04, -0.035, -0.03, -0.025, -0.02, -0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.035];

const opts = (values: number[], fmt: (n: number) => string = signed) => values.map((v) => ({ value: String(v), label: fmt(v) }));

export const Z_HOP_TYPES = ["Normal Lift", "Slope Lift", "Spiral Lift", "Auto Lift"];

function currentFlow(ctx: TestContext): { value: number; from: string } {
  const tuned = optNum(ctx.tuned.filament_flow_ratio);
  if (tuned != null) return { value: tuned, from: "this spool's last flow result" };
  const base = BASE_FLOW[ctx.product.material.toUpperCase()] ?? 0.98;
  return { value: base, from: `the base profile's default` };
}

function flowWarnings(newFlow: number): string[] {
  return newFlow < 0.85 || newFlow > 1.1
    ? [`A flow ratio of ${r(newFlow, 4)} is far from 1.0. Check the extruder's E-steps before trusting it - a big flow correction usually means the extruder itself is off.`]
    : [];
}

/**
 * Preset settings to check before any test print. OrcaSlicer 2.5's calib_*
 * functions force walls, infill, shells and layer height per test, but none
 * of them touch supports, raft, fuzzy skin or the process flow ratio, and
 * they leave their own edits in the presets as unsaved changes.
 */
export const SETUP_CHECKS: Hint[] = [
  hint("Supports and raft off", "Process › Support: Enable support off, Raft layers 0. No test turns them off, and supports fill in the bridges, overhangs and gaps you're judging."),
  hint("Fuzzy skin off", "Process › Others. It roughens the walls and top surfaces the tests are read from."),
  hint("Process flow ratio at 1", "Process › Quality. It multiplies on top of the filament's flow ratio; only the flow test overrides it."),
  hint("Brim: leave as is", "The temperature and speed tests add their own 5 mm brim, and a brim doesn't change the flow or retraction results."),
  hint("Discard modified presets when a test opens", "OrcaSlicer asks as it opens a test. Discarding stops edits left over from the last test carrying into this one."),
  hint(
    "Don't save presets after a test",
    "OrcaSlicer edits them to run the test (starting temperature, max volumetric speed 200, layer heights) and saving would keep those. Spoolkeeper publishes the results itself. The one exception: the flow ratio before Pass 2.",
  ),
];

// ------------------------------------------------------------- tests

const temp: TestDef = {
  id: "temp",
  step: "temp",
  title: "Temperature tower",
  why: "Temperature sets how runny the plastic is, so every later test depends on it. Too cold: weak layers and under-extrusion. Too hot: stringing, sagging overhangs and blobs.",
  orcaMenu: ["Calibration", "Temperature"],
  orcaSets: "a 5 mm brim, the layer height, and the filament profile's nozzle temperature (set to the start temperature; don't save it).",
  checks: [hint("Supports off", "The bridges and overhangs on every block are what you're comparing.")],
  instructions: [
    hint("Select this filament and your normal process"),
    hint("Dialog: filament type and start/end temps below", "The step is fixed at 5 °C."),
    hint("Slice and print", "The tower starts hottest at the bottom and gets 5 °C cooler every 10 mm block; each block is labelled with its temperature."),
    hint("Enter the best block's temperature", "Use the checks under Reading the result. If several look equally good, take the middle one."),
  ],
  watch: {
    during: [
      hint("Bridges should go down tight and straight", "Strands that droop or curl up mean that block is too hot."),
      hint("Clicking on the cool blocks = too cold", "The extruder can't push filament that cold at this speed. Note which block."),
    ],
    after: [
      hint("Let it cool fully"),
      hint("Stringing: hotter blocks string more", "Some is fine; the retraction step deals with it later."),
      hint("Bridges: sagging = too hot", "Look underneath each block."),
      hint("Overhangs: curled or rough = too hot"),
      hint("Surface: dull and rough = too cold", "Too hot looks blobby or glossy, with soft detail."),
      hint("Snap the cooler blocks", "If one breaks cleanly along a layer with little effort, it's too cold for strong parts."),
      hint("Torn between two? Pick the stronger", "Stringing and bridging can be tuned with retraction and cooling; weak layers can't."),
    ],
  },
  params: [
    { key: "dialogType", label: "Filament type (in the dialog)", type: "text", readOnly: true },
    { key: "start", label: "Start temp", type: "number", unit: "°C", step: 5 },
    { key: "end", label: "End temp", type: "number", unit: "°C", step: 5 },
  ],
  observation: [
    {
      key: "best",
      label: "Best block's temperature",
      type: "number",
      unit: "°C",
      step: 5,
      help: "Read it off the label on the block.",
    },
  ],
  suggestParams(ctx) {
    const p = ctx.product;
    const preset = TEMP_PRESETS.find((t) => t.type === p.material.toUpperCase());
    if (preset) return { dialogType: preset.label, start: preset.start, end: preset.end };
    // Custom: the maker's range, widened to whole 5 °C blocks.
    const lo = p.nozzleMin ?? 190;
    const hi = p.nozzleMax ?? 230;
    return { dialogType: "Custom", start: Math.ceil(hi / 5) * 5, end: Math.floor(lo / 5) * 5 };
  },
  compute(params, obs, ctx) {
    const start = num(params.start, "Start temp");
    const end = num(params.end, "End temp");
    const best = num(obs.best, "Best block's temperature");
    if (start < end + 5) throw bad("Start temp must be at least 5 °C above end temp (OrcaSlicer prints hottest at the bottom)");
    if (best > start || best < end) throw bad(`${best} °C isn't on this tower; its blocks run from ${start} °C down to ${end} °C`);
    if ((start - best) % 5 !== 0) throw bad(`Blocks change in 5 °C steps from ${start} °C, so the best block is ${start} - 5×n (e.g. ${start - 5})`);
    const warnings: string[] = [];
    const p = ctx.product;
    if (p.nozzleMin != null && p.nozzleMax != null && (best < p.nozzleMin || best > p.nozzleMax))
      warnings.push(`${best} °C is outside the maker's range of ${p.nozzleMin}–${p.nozzleMax} °C. That can be right, but double-check the tower.`);
    if (isWoodPla(p) && Math.abs(best - WOOD_PLA_REFERENCE.temp) > 15)
      warnings.push(`Your known-good wood PLA (Sunlu Walnut Wood) prints at ${WOOD_PLA_REFERENCE.temp} °C; ${best} °C is quite far from that.`);
    const block = (start - best) / 5 + 1;
    return {
      values: [
        { key: "nozzle_temperature", value: String(best), label: "Nozzle temperature" },
        { key: "nozzle_temperature_initial_layer", value: String(best), label: "First-layer nozzle temperature" },
      ],
      formula: [`Tower: ${start} °C at the bottom, −5 °C per block, ${(start - end) / 5 + 1} blocks.`, `Best block: #${block} from the bottom = ${best} °C.`],
      warnings,
    };
  },
};

const mvs: TestDef = {
  id: "mvs",
  step: "mvs",
  title: "Max volumetric speed",
  why: "How much plastic per second the hotend can melt for this filament. OrcaSlicer slows any move that would go faster, so this caps speed before the nozzle under-extrudes or clogs.",
  orcaMenu: ["Calibration", "Max flowrate"],
  orcaSets:
    "vase mode, one wall, no infill or top/bottom layers, a brim, layer height and line width. In the filament profile it raises max volumetric speed to 200 and turns off slowing down for layer time; don't save those.",
  instructions: [
    hint("Set the nozzle temperature from step 1", "In the filament profile, before opening the test."),
    hint("Dialog: start, end and step below"),
    hint("Slice and print"),
    hint("Measure the height of the first change", "With calipers, from the very bottom of the print. See Reading the result."),
  ],
  watch: {
    during: [
      hint("Speed rises with height", "Every millimetre adds one step (0.5 mm³/s with the defaults); the top is the hardest."),
      hint("Thin or broken lines = past the limit", "The hotend can't melt the filament fast enough."),
      hint("Clicking = past the limit", "The extruder gear is slipping. Note the Z height on the printer's screen."),
      hint("Stop once it's clearly failing", "After a few millimetres of obvious defects or clicking, everything above is faster still. Let it cool on the bed before removing it."),
    ],
    after: [
      hint("Side-light it and work up from the bottom"),
      hint(
        "Look for the first change",
        "Usually in this order: the sheen changes (glossy to matte or satin; PETG often goes dull or slightly frosty), then a rougher texture or fine horizontal lines, then thin or see-through spots, then gaps.",
      ),
      hint("Squeeze the wall", "If it splits along the layers above some height, the layers stopped bonding there; that counts as the limit too."),
      hint("Unsure between two heights? Use the lower"),
      hint("Clean to the top? Rerun with a higher range", "The limit is above this test's end value."),
    ],
  },
  params: [
    { key: "start", label: "Start volumetric speed", type: "number", unit: "mm³/s", step: 0.5 },
    { key: "end", label: "End volumetric speed", type: "number", unit: "mm³/s", step: 0.5 },
    { key: "step", label: "Step", type: "number", unit: "mm³/s", step: 0.05 },
  ],
  observation: [
    { key: "heightMm", label: "Height where quality drops", type: "number", unit: "mm", step: 0.5, help: "Measured from the bed, just below the first defects." },
    { key: "marginPct", label: "Safety margin", type: "number", unit: "%", step: 5, help: "OrcaSlicer suggests running 10–20% below the measured limit." },
  ],
  suggestParams(ctx) {
    // OrcaSlicer's defaults are 5 → 20 by 0.5. Flexibles fail well below 5 mm³/s.
    return ctx.product.material.toUpperCase() === "TPU" ? { start: 1, end: 8, step: 0.25 } : { start: 5, end: 20, step: 0.5 };
  },
  suggestObservation: () => ({ marginPct: 15 }),
  compute(params, obs) {
    const start = num(params.start, "Start volumetric speed");
    const end = num(params.end, "End volumetric speed");
    const step = num(params.step, "Step");
    const h = num(obs.heightMm, "Height");
    const margin = optNum(obs.marginPct) ?? 15;
    if (step <= 0 || end <= start) throw bad("End must be above start, with a positive step");
    if (margin < 0 || margin > 50) throw bad("Safety margin should be between 0 and 50%");
    const towerHeight = (end - start + 1) / step; // the tower is cut at this height (Plater::calib_max_vol_speed)
    if (h < 0 || h > towerHeight + 0.5) throw bad(`This tower is only about ${r(towerHeight, 1)} mm tall`);
    const raw = start + h * step; // GCode.cpp: start + print_z * step
    const safe = Math.floor(raw * (1 - margin / 100) * 2) / 2; // round down to 0.5 mm³/s
    const warnings: string[] = [];
    if (h >= towerHeight - 1) warnings.push("The tower printed clean almost to the top, so the real limit may be higher. Rerun with a higher end value to find it.");
    return {
      values: [{ key: "filament_max_volumetric_speed", value: r(safe, 1), label: "Max volumetric speed" }],
      formula: [
        `Limit = start + height × step = ${start} + ${h} × ${step} = ${r(raw, 2)} mm³/s`,
        `With a ${margin}% margin: ${r(raw, 2)} × ${r(1 - margin / 100, 2)} = ${r(raw * (1 - margin / 100), 2)} → ${r(safe, 1)} mm³/s (rounded down to 0.5)`,
      ],
      warnings,
    };
  },
};

const pa: TestDef = {
  id: "pa",
  step: "pa",
  title: "Pressure advance (Linear Advance K)",
  why: "Compensates for the pressure that builds in the nozzle, so corners stay sharp and line ends don't bulge. On Marlin this is Linear Advance, set with M900 K - but only if the firmware was built with it.",
  orcaMenu: ["Calibration", "Pressure advance"],
  instructions: [
    hint("Dialog: Tower, Direct Drive, and start/end/step below"),
    hint("Slice and print", "K rises by one step every millimetre of height."),
    hint("Measure the height with the sharpest corners", "No bulge and no gap at the corners."),
  ],
  params: [
    { key: "start", label: "Start PA", type: "number", step: 0.001 },
    { key: "end", label: "End PA", type: "number", step: 0.001 },
    { key: "step", label: "PA step", type: "number", step: 0.001 },
  ],
  observation: [{ key: "heightMm", label: "Height of the best corners", type: "number", unit: "mm", step: 1 }],
  suggestParams: () => ({ start: 0, end: 0.1, step: 0.002 }),
  compute(params, obs, ctx) {
    if (ctx.linearAdvance === "unsupported")
      throw bad("Your firmware doesn't support Linear Advance (M900 is an unknown command), so a K value would do nothing. Skip this step.");
    const start = num(params.start, "Start PA");
    const end = num(params.end, "End PA");
    const step = num(params.step, "PA step");
    const h = num(obs.heightMm, "Height");
    if (step <= 0 || end <= start) throw bad("End must be above start, with a positive step");
    const k = start + Math.floor(h) * step; // GCode.cpp: start + int(print_z) * step
    if (k > end + 1e-9) throw bad(`At ${h} mm the tower would be past its end value of ${end}`);
    return {
      values: [
        { key: "enable_pressure_advance", value: "1", label: "Pressure advance on" },
        { key: "pressure_advance", value: r(k, 4), label: "Linear Advance K" },
      ],
      formula: [`K = start + whole mm of height × step = ${start} + ${Math.floor(h)} × ${step} = ${r(k, 4)}`],
      warnings: k > 0.2 ? ["That's high for a direct-drive extruder (typical K is 0.02–0.1)."] : [],
    };
  },
};

function flowCompute(kind: "flow1" | "flow2" | "flow_yolo") {
  return (params: Record<string, unknown>, obs: Record<string, unknown>): Computed => {
    const old = num(params.oldFlow, "Flow ratio the test was printed with");
    if (old <= 0.5 || old > 1.5) throw bad("That starting flow ratio looks wrong; it's usually between 0.9 and 1.05");
    const m = num(obs.modifier, "Best block's modifier");
    if (kind === "flow_yolo") {
      const fine = params.variant === "perfectionist";
      const allowed = fine ? FLOW_YOLO_FINE : FLOW_YOLO;
      if (!allowed.some((a) => Math.abs(a - m) < 1e-9)) throw bad(`That block isn't on the ${fine ? "Perfectionist" : "Recommended"} YOLO test`);
      const flow = old + m; // Plater.cpp: print_flow_ratio = (cur + modifier) / cur
      return {
        values: [{ key: "filament_flow_ratio", value: r(flow, 4), label: "Flow ratio" }],
        formula: [`New flow = old + modifier = ${old} ${m < 0 ? "−" : "+"} ${Math.abs(m)} = ${r(flow, 4)}`],
        warnings: flowWarnings(flow),
      };
    }
    const allowed = kind === "flow1" ? FLOW_PASS1 : FLOW_PASS2;
    if (!allowed.includes(m)) throw bad(`Pass ${kind === "flow1" ? 1 : 2} blocks are ${allowed.map(signed).join(", ")}`);
    const flow = (old * (100 + m)) / 100; // Plater.cpp: print_flow_ratio = 1 + modifier / 100
    return {
      values: [{ key: "filament_flow_ratio", value: r(flow, 4), label: "Flow ratio" }],
      formula: [`New flow = old × (100 + modifier) / 100 = ${old} × (100 ${m < 0 ? "−" : "+"} ${Math.abs(m)}) / 100 = ${r(flow, 4)}`],
      warnings: flowWarnings(flow),
    };
  };
}

const oldFlowParam: InputField = {
  key: "oldFlow",
  label: "Flow ratio",
  type: "number",
  step: 0.001,
  fromProfile: true,
  help: "Not in the dialog: the test uses the filament profile's Flow ratio. Make sure it matches.",
};

// OrcaSlicer's flow wiki pairs Monotonic with the 2-pass test and Archimedean Chords with YOLO.
const topPatternParam: InputField = { key: "topPattern", label: "Top Surface Pattern", type: "text", readOnly: true };
const flowPassParams: InputField[] = [{ key: "testType", label: "Calibration Test Type", type: "text", readOnly: true }, topPatternParam, oldFlowParam];
const FLOW_ORCA_SETS =
  "walls, 35% infill, top and bottom layers, layer height, top-surface speed, line width and flow, and ironing off - the blocks' flow modifiers override the process flow ratio too.";

const SELECT_FLOW_PROFILE = hint("Select this filament's profile", "Its flow ratio should match the one shown above.");
const FLOW_LOOK = hint("Enter the smoothest block's modifier", "Use the checks under Reading the result.");

const FLOW_WATCH_DURING = [
    hint("Every block's first layer should stick flat", "A lifted block can't be judged."),
    hint("Don't touch the tops until cool", "Warm tops scuff easily."),
];
const FLOW_READ = [
  hint("Raking light and a fingertip", "Hold a light low and to one side, and run a fingertip over each top."),
  hint("Gaps between lines = too little flow", "Also grooves, lines that don't touch, or infill showing through."),
  hint("Ridges or a rough lip = too much flow", "Also plastic piled at the edges, and nozzle drag marks."),
];
const FLOW_PICK = hint("Several good? Pick the middle one", "A low-angle photo with one light can make the difference clearer.");

/** Monotonic tops (Pass 1/2): judged on overall smoothness. */
const FLOW_WATCH_MONOTONIC = {
  during: FLOW_WATCH_DURING,
  after: [...FLOW_READ, hint("Best: one even surface, crisp edges", "The lines fuse so you can barely feel them."), FLOW_PICK],
};

/** Archimedean Chords tops (YOLO): the centre spiral prints last, so extra flow piles up where it meets the outer arcs. */
const FLOW_WATCH_CHORDS = {
  during: FLOW_WATCH_DURING,
  after: [
    ...FLOW_READ,
    hint("No gaps between the arcs"),
    hint("Little or no ridge round the centre spiral", "The spiral prints last, inside-out, so too much flow builds up where it meets the outer arcs. A faint line is fine if going lower opens gaps."),
    FLOW_PICK,
  ],
};

const flow1: TestDef = {
  id: "flow1",
  step: "flow",
  title: "Flow ratio – Pass 1 (coarse)",
  why: "Flow ratio scales how much plastic is pushed for every line. It fixes the small difference between what the slicer asks for and what this filament actually delivers.",
  orcaMenu: ["Calibration", "Flow ratio"],
  orcaSets: FLOW_ORCA_SETS,
  instructions: [
    SELECT_FLOW_PROFILE,
    hint("Dialog: Pass 1 (Coarse), Monotonic", "OrcaSlicer's guide pairs the Monotonic top pattern with Pass 1 and Pass 2."),
    hint("Slice and print the nine blocks", "Each is labelled with its modifier (−20 … +20)."),
    FLOW_LOOK,
  ],
  params: flowPassParams,
  observation: [{ key: "modifier", label: "Best block's modifier", type: "select", options: opts(FLOW_PASS1) }],
  suggestParams: (ctx) => ({ testType: "Pass 1 (Coarse)", topPattern: "Monotonic", oldFlow: currentFlow(ctx).value }),
  watch: FLOW_WATCH_MONOTONIC,
  compute: flowCompute("flow1"),
};

const flow2: TestDef = {
  id: "flow2",
  step: "flow",
  title: "Flow ratio – Pass 2 (fine)",
  why: "Refines Pass 1 in 1% steps.",
  orcaMenu: ["Calibration", "Flow ratio"],
  orcaSets: FLOW_ORCA_SETS,
  instructions: [
    hint("Put Pass 1's result in the filament profile and save it", "Pass 2 builds on it. The Pass 1 test only edits the process preset, so the save holds just your flow change."),
    hint("Dialog: Pass 2 (Fine), Monotonic", "The same pattern as Pass 1, so the two passes compare."),
    hint("Slice and print the ten blocks", "Labelled −9 … 0."),
    FLOW_LOOK,
  ],
  params: flowPassParams,
  observation: [{ key: "modifier", label: "Best block's modifier", type: "select", options: opts(FLOW_PASS2) }],
  suggestParams: (ctx) => ({ testType: "Pass 2 (Fine)", topPattern: "Monotonic", oldFlow: ctx.lastPass1Flow ?? currentFlow(ctx).value }),
  watch: FLOW_WATCH_MONOTONIC,
  compute: flowCompute("flow2"),
};

const flowYolo: TestDef = {
  id: "flow_yolo",
  step: "flow",
  title: "Flow ratio – YOLO (single pass)",
  why: "OrcaSlicer's current recommended flow test: one print with eleven blocks, read straight off as ± modifiers.",
  orcaMenu: ["Calibration", "Flow ratio"],
  orcaSets: FLOW_ORCA_SETS,
  instructions: [SELECT_FLOW_PROFILE, hint("Dialog: the YOLO type above, Archimedean Chords", "OrcaSlicer's guide pairs Archimedean Chords with YOLO."), hint("Slice and print"), FLOW_LOOK],
  params: [
    {
      key: "variant",
      label: "Calibration Test Type",
      type: "select",
      options: [
        { value: "recommended", label: "YOLO (Recommended)" },
        { value: "perfectionist", label: "YOLO (Perfectionist)" },
      ],
      help: "Recommended: ±0.05 in 0.01 steps. Perfectionist: −0.04 … +0.035 in 0.005 steps.",
    },
    topPatternParam,
    oldFlowParam,
  ],
  observation: [
    {
      key: "modifier",
      label: "Best block's modifier",
      type: "select",
      options: [...new Set([...FLOW_YOLO, ...FLOW_YOLO_FINE])].sort((a, b) => a - b).map((v) => ({ value: String(v), label: signed(v) })),
    },
  ],
  suggestParams: (ctx) => ({ oldFlow: currentFlow(ctx).value, variant: "recommended", topPattern: "Archimedean Chords" }),
  watch: FLOW_WATCH_CHORDS,
  compute: flowCompute("flow_yolo"),
};

const retraction: TestDef = {
  id: "retraction",
  step: "retraction",
  title: "Retraction",
  why: "Pulling the filament back before travel moves stops ooze and stringing. Too little: strings. Too much: slow prints, and on a direct drive it can grind or jam the filament.",
  orcaMenu: ["Calibration", "Retraction"],
  orcaSets: "the retraction length on every layer (so the profile's length doesn't matter), firmware retraction off, two walls, no infill and the layer height.",
  checks: [
    hint("Supports off", "Support between the two pillars would hide the strings."),
    hint(
      "Check where speed, z-hop and wipe come from",
      "The test doesn't set them: they come from the printer profile, or the filament profile's Setting Overrides where ticked. Record the values the test actually printed with.",
    ),
  ],
  instructions: [
    hint("Dialog: start, end and step below", "OrcaSlicer's defaults, made for direct drive."),
    hint("Slice and print", "Retraction rises one step per millimetre above the 0.4 mm base."),
    hint("Enter the height where stringing stops", "Or the length from that height's Calib_Retraction_tower comment in the G-code preview."),
    hint("Record the speed, z-hop and wipe you want"),
  ],
  watch: {
    during: [
      hint("Strings should thin out as it climbs"),
      hint("Clicking or grinding = too much", "Long retractions on a direct drive chew the filament. Note the height; it's an upper limit."),
      hint("Stop once the gap is clearly clean", "A few millimetres past that point is enough."),
    ],
    after: [
      hint("Dark background, light from the side", "Fine hairs between the pillars are strings."),
      hint("Find the lowest clean height", "Wisps that brush off with a fingertip are minor; strings you have to pull off aren't."),
      hint("Blobs or gaps on the pillars = too long"),
      hint("Strings all the way up? Not a retraction problem", "Try a lower temperature or drying the filament; PETG especially strings when damp."),
    ],
  },
  params: [
    { key: "start", label: "Start retraction length", type: "number", unit: "mm", step: 0.1 },
    { key: "end", label: "End retraction length", type: "number", unit: "mm", step: 0.1 },
    { key: "step", label: "Step", type: "number", unit: "mm", step: 0.05 },
  ],
  observation: [
    { key: "heightMm", label: "Height where stringing stops", type: "number", unit: "mm", step: 0.5, optional: true },
    { key: "lengthMm", label: "…or length read from the G-code", type: "number", unit: "mm", step: 0.1, optional: true },
    { key: "speed", label: "Retraction speed", type: "number", unit: "mm/s", step: 5, optional: true },
    {
      key: "zHopType",
      label: "Z-hop type",
      type: "select",
      optional: true,
      options: Z_HOP_TYPES.map((t) => ({ value: t, label: t })),
      help: "Slope Lift rises while it travels, so it drags less across the top surface than a straight Normal Lift.",
    },
    { key: "zHop", label: "Z-hop height", type: "number", unit: "mm", step: 0.05, optional: true },
    { key: "wipeDistance", label: "Wipe distance", type: "number", unit: "mm", step: 0.1, optional: true, help: "0 turns wipe off. Wiping drags the nozzle along the last wall while retracting so ooze stays inside the part." },
  ],
  suggestParams: () => ({ start: 0, end: 2, step: 0.1 }),
  suggestObservation: (ctx) => {
    const pr = ctx.printerRetraction;
    const out: Record<string, string | number> = {};
    if (pr.speed != null) out.speed = pr.speed;
    if (pr.zHopType) out.zHopType = pr.zHopType;
    if (pr.zHop != null) out.zHop = pr.zHop;
    if (pr.wipeDistance != null) out.wipeDistance = pr.wipe === false ? 0 : pr.wipeDistance;
    return out;
  },
  compute(params, obs, ctx) {
    const start = num(params.start, "Start retraction length");
    const end = num(params.end, "End retraction length");
    const step = num(params.step, "Step");
    if (step <= 0 || end <= start) throw bad("End must be above start, with a positive step");
    const h = optNum(obs.heightMm);
    const direct = optNum(obs.lengthMm);
    let length: number;
    const formula: string[] = [];
    if (direct != null) {
      length = direct;
      formula.push(`Length read from the G-code: ${direct} mm`);
    } else if (h != null) {
      const steps = Math.floor(Math.max(0, h - 0.4)); // GCode.cpp: start + floor(max(0, z - 0.4)) * step
      length = start + steps * step;
      formula.push(`Length = start + whole mm above the 0.4 mm base × step = ${start} + ${steps} × ${step} = ${r(length, 2)} mm`);
    } else throw bad("Enter the height where stringing stops, or the length from the G-code");
    if (length < 0 || length > end + 1e-9) throw bad(`That's outside this tower's ${start}–${end} mm range`);

    const values: ResultValue[] = [{ key: "filament_retraction_length", value: r(length, 2), label: "Retraction length" }];
    const speed = optNum(obs.speed);
    if (speed != null) values.push({ key: "filament_retraction_speed", value: r(speed, 1), label: "Retraction speed" });
    if (typeof obs.zHopType === "string" && obs.zHopType) {
      if (!Z_HOP_TYPES.includes(obs.zHopType)) throw bad("Unknown z-hop type");
      values.push({ key: "filament_z_hop_types", value: obs.zHopType, label: "Z-hop type" });
    }
    const zHop = optNum(obs.zHop);
    if (zHop != null) values.push({ key: "filament_z_hop", value: r(zHop, 2), label: "Z-hop height" });
    const wipe = optNum(obs.wipeDistance);
    if (wipe != null) {
      values.push({ key: "filament_wipe", value: wipe > 0 ? "1" : "0", label: "Wipe while retracting" });
      if (wipe > 0) values.push({ key: "filament_wipe_distance", value: r(wipe, 2), label: "Wipe distance" });
    }

    const warnings: string[] = [];
    if (length > 2) warnings.push("More than 2 mm is a lot for a direct-drive extruder and can grind or jam the filament.");
    if (isWoodPla(ctx.product) && Math.abs(length - WOOD_PLA_REFERENCE.retraction) > 1)
      warnings.push(`Your known-good wood PLA (Sunlu Walnut Wood) stopped stringing at ${WOOD_PLA_REFERENCE.retraction} mm; ${r(length, 2)} mm is quite far from that.`);
    if (length === start && h != null && h < 1.4) warnings.push("Clean from the very bottom: a small retraction (0.2–0.4 mm) is usually enough for this filament.");
    return { values, formula, warnings };
  },
};

const cooling: TestDef = {
  id: "cooling",
  step: "cooling",
  optional: true,
  title: "Cooling, bed and first layer",
  why: "Notes from real prints rather than a test: fan speeds that kept overhangs clean without weakening layers, and bed temperatures that stuck on each side of your PEI plate.",
  orcaMenu: [],
  instructions: [
    hint("Fill in what worked on real prints", "There's no OrcaSlicer test for these."),
    hint("Smooth PEI usually runs a little cooler", "Than textured PEI, for the same grip."),
  ],
  params: [],
  observation: [
    { key: "fanMin", label: "Fan min", type: "number", unit: "%", step: 5, optional: true },
    { key: "fanMax", label: "Fan max", type: "number", unit: "%", step: 5, optional: true },
    { key: "bedSmooth", label: "Bed – smooth PEI", type: "number", unit: "°C", step: 1, optional: true },
    { key: "bedTextured", label: "Bed – textured PEI", type: "number", unit: "°C", step: 1, optional: true },
    { key: "firstLayerBedBoost", label: "First-layer bed boost", type: "number", unit: "°C", step: 1, optional: true, help: "Added to the bed temperature for the first layer only." },
    { key: "firstLayerNozzle", label: "First-layer nozzle", type: "number", unit: "°C", step: 5, optional: true },
  ],
  suggestParams: () => ({}),
  prefillIsAnswer: true,
  // Bed temperatures are judgment, not a test - prefill them so it's a quick confirm rather than easy to skip.
  suggestObservation: (ctx) => bedSuggestions(ctx).values,
  suggestionNotes: (ctx) => bedSuggestions(ctx).notes,
  compute(_params, obs) {
    const values: ResultValue[] = [];
    const formula: string[] = [];
    const pct = (k: string, label: string, key: string) => {
      const v = optNum(obs[k]);
      if (v == null) return;
      if (v < 0 || v > 100) throw bad(`${label} must be 0–100%`);
      values.push({ key, value: r(v, 0), label });
    };
    pct("fanMin", "Fan min", "fan_min_speed");
    pct("fanMax", "Fan max", "fan_max_speed");
    const boost = optNum(obs.firstLayerBedBoost) ?? 0;
    for (const [k, label, key] of [
      ["bedSmooth", "Bed (smooth PEI)", "hot_plate_temp"],
      ["bedTextured", "Bed (textured PEI)", "textured_plate_temp"],
    ] as const) {
      const v = optNum(obs[k]);
      if (v == null) continue;
      if (v < 0 || v > 130) throw bad(`${label} must be 0–130 °C`);
      values.push({ key, value: r(v, 0), label });
      values.push({ key: `${key}_initial_layer`, value: r(v + boost, 0), label: `${label}, first layer` });
      if (boost) formula.push(`${label}, first layer = ${v} + ${boost} = ${v + boost} °C`);
    }
    const fl = optNum(obs.firstLayerNozzle);
    if (fl != null) values.push({ key: "nozzle_temperature_initial_layer", value: r(fl, 0), label: "First-layer nozzle temperature" });
    if (values.length === 0) throw bad("Fill in at least one value");
    return { values, formula: formula.length ? formula : ["Recorded as entered."], warnings: [] };
  },
};

/**
 * Bed temperatures to prefill: what this spool already has, else the maker's
 * range (smooth PEI at the middle, textured 5 °C warmer - textured PEI grips
 * less, so it usually wants a little more), else the base profile's default.
 */
function bedSuggestions(ctx: TestContext): { values: Record<string, number>; notes: Record<string, string> } {
  const p = ctx.product;
  const base = BASE_DEFAULTS[p.material.toUpperCase()] ?? {};
  const values: Record<string, number> = {};
  const notes: Record<string, string> = {};
  const round5 = (n: number) => Math.round(n / 5) * 5;
  const plate = ctx.plateType;
  const usedSide = plate?.side;
  const usedNote = (side: "smooth" | "textured") =>
    usedSide === side ? ` Your OrcaSlicer projects on this printer use ${plate!.label}, so this is the one that's printing.` : "";

  const pick = (field: "bedSmooth" | "bedTextured", key: string, side: "smooth" | "textured") => {
    const tuned = optNum(ctx.tuned[key]);
    if (tuned != null) {
      values[field] = tuned;
      notes[field] = `Your saved value.${usedNote(side)}`;
    } else if (p.bedMin != null && p.bedMax != null) {
      const mid = round5((p.bedMin + p.bedMax) / 2);
      values[field] = side === "smooth" ? mid : Math.min(p.bedMax, mid + 5);
      notes[field] = `Suggested from the maker's ${p.bedMin}–${p.bedMax} °C range${side === "textured" ? " (textured grips less, so a little warmer)" : ""} - change it to what actually stuck.${usedNote(side)}`;
    } else if (base[key]) {
      values[field] = Number(base[key]);
      notes[field] = `The base profile's default - change it to what actually stuck.${usedNote(side)}`;
    }
  };
  pick("bedSmooth", "hot_plate_temp", "smooth");
  pick("bedTextured", "textured_plate_temp", "textured");
  if (p.material.toUpperCase() === "PETG")
    notes.bedSmooth = `${notes.bedSmooth ?? ""} PETG can bond so hard to smooth PEI that it tears the sheet - use glue stick as a release layer, or the textured side.`.trim();
  return { values, notes };
}

export const TESTS: TestDef[] = [temp, mvs, pa, flow1, flow2, flowYolo, retraction, cooling];

export function getTest(id: string): TestDef {
  const t = TESTS.find((x) => x.id === id);
  if (!t) throw new HttpError(404, `Unknown calibration test "${id}"`);
  return t;
}

/** Which test produced a key (for the profile's "why" text). */
export const KEY_REASON: Record<string, string> = {
  nozzle_temperature: "From your temperature tower.",
  nozzle_temperature_initial_layer: "First-layer nozzle temperature from calibration.",
  filament_max_volumetric_speed: "From your max flowrate test, with a safety margin.",
  enable_pressure_advance: "Linear Advance on, from your pressure advance test.",
  pressure_advance: "Linear Advance K from your pressure advance test.",
  filament_flow_ratio: "From your flow ratio test.",
  filament_retraction_length: "From your retraction tower.",
  filament_retraction_speed: "Retraction speed you recorded.",
  filament_z_hop: "Z-hop height you recorded.",
  filament_z_hop_types: "Z-hop type you recorded.",
  filament_wipe: "Wipe setting you recorded.",
  filament_wipe_distance: "Wipe distance you recorded.",
  fan_min_speed: "Fan minimum you recorded.",
  fan_max_speed: "Fan maximum you recorded.",
  hot_plate_temp: "Smooth PEI bed temperature you recorded.",
  hot_plate_temp_initial_layer: "Smooth PEI first-layer bed temperature you recorded.",
  textured_plate_temp: "Textured PEI bed temperature you recorded.",
  textured_plate_temp_initial_layer: "Textured PEI first-layer bed temperature you recorded.",
};
