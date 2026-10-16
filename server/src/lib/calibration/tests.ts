import type { Product } from "../../db/repo";
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

export interface TestContext {
  product: Product;
  /** Current tuned values for this spool (OrcaSlicer key -> value), before this run. */
  tuned: Record<string, string>;
  /** Latest accepted flow Pass 1 result, which Pass 2 starts from. */
  lastPass1Flow: number | null;
  linearAdvance: LinearAdvance;
  /** The printer preset's own retraction settings, for reference and defaults. */
  printerRetraction: PrinterRetraction;
}

export interface PrinterRetraction {
  length: number | null;
  speed: number | null;
  zHop: number | null;
  zHopType: string | null;
  wipe: boolean | null;
  wipeDistance: number | null;
}

export interface TestDef {
  id: TestId;
  title: string;
  /** Wizard grouping: flow1/flow2/flow_yolo are alternatives within one step. */
  step: "temp" | "mvs" | "pa" | "flow" | "retraction" | "cooling";
  optional?: boolean;
  why: string;
  /** Where to find it in OrcaSlicer's menu bar and what to pick. */
  orcaMenu: string[];
  instructions: string[];
  params: InputField[];
  observation: InputField[];
  suggestParams(ctx: TestContext): Record<string, string | number | boolean>;
  suggestObservation?(ctx: TestContext, params: Record<string, number | string | boolean>): Record<string, string | number | boolean>;
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

const isWoodPla = (p: Product) => p.material === "PLA" && (p.finish === "Wood Fill" || /wood/i.test(`${p.line ?? ""} ${p.colorName ?? ""}`));

/** The user's known-good reference: Sunlu Walnut Wood PLA. A sanity check, never a default. */
export const WOOD_PLA_REFERENCE = { temp: 210, retraction: 1.2, zHopType: "Slope Lift", wipeDistance: 0.8 };

/** Flow ratio of the inherited base profile (resolved from OrcaSlicer 2.4.2's system presets). */
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

// ------------------------------------------------------------- tests

const temp: TestDef = {
  id: "temp",
  step: "temp",
  title: "Temperature tower",
  why: "Temperature sets how runny the plastic is, so every later test depends on it. Too cold: weak layers and under-extrusion. Too hot: stringing, sagging overhangs and blobs.",
  orcaMenu: ["Calibration", "Temperature"],
  instructions: [
    "Select this filament's profile (and your normal process) in OrcaSlicer first.",
    "In the dialog choose the filament type and the start/end temperatures below; the step is fixed at 5 °C.",
    "Slice and print. The tower starts hottest at the bottom and gets 5 °C cooler every 10 mm block; each block is labelled with its temperature.",
    "Pick the block with the best balance: clean bridges and overhangs, little stringing, strong layers (try snapping the top off). If several look equally good, take the middle one.",
  ],
  params: [
    { key: "dialogType", label: "Filament type (in the dialog)", type: "text" },
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
  instructions: [
    "Set the nozzle temperature found in the temperature step first.",
    "Enter the start, end and step below in the dialog, then slice and print the vase-mode test.",
    "Find where the walls first turn rough, gappy or change sheen (glossy to matte), and measure that height from the bed with calipers.",
  ],
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
    "Choose the Tower method, Direct Drive extruder, and the start/end/step below.",
    "Slice and print. K rises by one step every millimetre of height.",
    "Find the height where the corners look sharpest (no bulge, no gap) and measure it.",
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

const flowParams: InputField[] = [
  {
    key: "oldFlow",
    label: "Flow ratio the test was printed with",
    type: "number",
    step: 0.001,
    help: "The test builds on the selected filament profile's flow ratio - check it in OrcaSlicer's filament settings before printing.",
  },
];

const FLOW_LOOK =
  "Look at the top surfaces under raking light and run a fingertip over them: pick the smoothest one with no gaps between lines. Too little flow shows gaps; too much shows ridges and a rough edge.";

const flow1: TestDef = {
  id: "flow1",
  step: "flow",
  title: "Flow ratio – Pass 1 (coarse)",
  why: "Flow ratio scales how much plastic is pushed for every line. It fixes the small difference between what the slicer asks for and what this filament actually delivers.",
  orcaMenu: ["Calibration", "Flow ratio", "Pass 1 (Coarse)"],
  instructions: [
    "Make sure this filament's profile is selected, with the flow ratio shown below.",
    "Slice and print the nine blocks; each is labelled with its modifier (−20 … +20).",
    FLOW_LOOK,
  ],
  params: flowParams,
  observation: [{ key: "modifier", label: "Best block's modifier", type: "select", options: opts(FLOW_PASS1) }],
  suggestParams: (ctx) => ({ oldFlow: currentFlow(ctx).value }),
  compute: flowCompute("flow1"),
};

const flow2: TestDef = {
  id: "flow2",
  step: "flow",
  title: "Flow ratio – Pass 2 (fine)",
  why: "Refines Pass 1 in 1% steps.",
  orcaMenu: ["Calibration", "Flow ratio", "Pass 2 (Fine)"],
  instructions: [
    "First put Pass 1's result into the filament profile's flow ratio in OrcaSlicer and save it - Pass 2 builds on it.",
    "Slice and print the ten blocks (−9 … 0).",
    FLOW_LOOK,
  ],
  params: flowParams,
  observation: [{ key: "modifier", label: "Best block's modifier", type: "select", options: opts(FLOW_PASS2) }],
  suggestParams: (ctx) => ({ oldFlow: ctx.lastPass1Flow ?? currentFlow(ctx).value }),
  compute: flowCompute("flow2"),
};

const flowYolo: TestDef = {
  id: "flow_yolo",
  step: "flow",
  title: "Flow ratio – YOLO (single pass)",
  why: "OrcaSlicer's current recommended flow test: one print with eleven blocks, read straight off as ± modifiers.",
  orcaMenu: ["Calibration", "Flow ratio", "YOLO (Recommended) or YOLO (Perfectionist)"],
  instructions: ["Make sure this filament's profile is selected, with the flow ratio shown below.", "Slice and print, then read the best block's modifier.", FLOW_LOOK],
  params: [
    ...flowParams,
    {
      key: "variant",
      label: "Variant",
      type: "select",
      options: [
        { value: "recommended", label: "Recommended (±0.05 by 0.01)" },
        { value: "perfectionist", label: "Perfectionist (−0.04 … +0.035 by 0.005)" },
      ],
    },
  ],
  observation: [
    {
      key: "modifier",
      label: "Best block's modifier",
      type: "select",
      options: [...new Set([...FLOW_YOLO, ...FLOW_YOLO_FINE])].sort((a, b) => a - b).map((v) => ({ value: String(v), label: signed(v) })),
    },
  ],
  suggestParams: (ctx) => ({ oldFlow: currentFlow(ctx).value, variant: "recommended" }),
  compute: flowCompute("flow_yolo"),
};

const retraction: TestDef = {
  id: "retraction",
  step: "retraction",
  title: "Retraction",
  why: "Pulling the filament back before travel moves stops ooze and stringing. Too little: strings. Too much: slow prints, and on a direct drive it can grind or jam the filament.",
  orcaMenu: ["Calibration", "Retraction"],
  instructions: [
    "Enter the start, end and step below (OrcaSlicer's defaults, made for direct drive).",
    "Slice and print. Retraction rises by one step for every millimetre above the 0.4 mm base.",
    "Find the lowest height where the stringing stops and measure it - or find that height's `Calib_Retraction_tower` comment in the G-code preview and enter its length directly.",
    "Also record the speed, z-hop and wipe you want for this filament.",
  ],
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
    "No OrcaSlicer test for these - fill in what worked on real prints.",
    "Smooth PEI usually wants a slightly lower bed temperature than textured PEI for the same grip.",
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
