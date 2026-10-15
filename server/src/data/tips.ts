// Mirrors the tip sources across the workshop's apps (GripTab's and
// chocolate-mold-factory's server/src/data/tips.ts, platesmith's TIPS,
// svg-stacker's src/tips.ts) so Mashghal's dashboard can aggregate every
// app's tips through the same { tips: [{ category, text }] } shape.
// Category is an opaque per-app string; the client's TipsPanel maps the
// ones below to labels and icons.
export interface Tip {
  category: TipCategory;
  text: string;
}

export type TipCategory = "filament" | "drying" | "calibration" | "slicing";

export const TIPS: Tip[] = [
  // --- Filament & intake ---
  { category: "filament", text: "Log a spool the day it arrives, before the first print — the label weight, price and lot are easy to find now and gone once the box is recycled." },
  { category: "filament", text: "Weigh a brand's empty spool once and record it. Spool weight is what turns a scale reading into “grams left”, and it varies from 130 g to over 250 g." },
  { category: "filament", text: "Two spools of the same product usually tune almost the same, but not always — different lots can shift the best temperature by 5 °C or more." },
  { category: "filament", text: "Manufacturer temperature ranges are a starting window, not an answer. A temperature tower finds where your printer and your nozzle actually land." },
  { category: "filament", text: "Wood, marble, glitter and carbon-fiber blends carry particles that wear brass nozzles and can clog small ones; stay at 0.4 mm or larger." },
  { category: "filament", text: "Silk PLA usually wants slower outer walls and a few degrees more heat to bring out the shine, at the cost of weaker layer bonding." },
  { category: "filament", text: "Density matters more than it looks: OrcaSlicer uses it to turn length into grams, so a wrong density makes every cost and weight estimate wrong too." },

  // --- Drying & storage ---
  { category: "drying", text: "PETG and TPU soak up moisture fast. If PETG starts popping, stringing more than usual, or looks rough, dry it before you blame your settings." },
  { category: "drying", text: "Typical drying: PLA 45–50 °C for 4–6 h, PETG 60–65 °C for 4–6 h, TPU 50–55 °C for 6–8 h. Stay below the material's glass transition or the spool deforms." },
  { category: "drying", text: "Calibrate dry filament. Tuning retraction on a wet spool bakes the moisture into your profile and leaves you chasing strings forever." },
  { category: "drying", text: "Store opened spools in a sealed box with fresh desiccant; a cheap hygrometer card tells you when the desiccant is spent." },
  { category: "drying", text: "Wet filament hisses or crackles at the nozzle and leaves tiny bubbles on the surface — the easiest moisture test there is." },

  // --- Calibration ---
  { category: "calibration", text: "Calibrate in order: temperature, then flow ratio, then pressure advance, then retraction, then max volumetric speed. Each step relies on the ones before it." },
  { category: "calibration", text: "On the temperature tower, pick the coolest block with clean bridges and good layer bonding — hotter only adds stringing." },
  { category: "calibration", text: "Flow ratio Pass 1: pick the smoothest top surface, then multiply your current flow by (100 + block number) / 100. Pass 2 refines from that new value." },
  { category: "calibration", text: "Judge flow-rate blocks under raking light with a fingertip: too little flow shows gaps between lines, too much shows ridges and a rough edge." },
  { category: "calibration", text: "Marlin calls pressure advance “Linear Advance” (M900 K). Send M503 first — if no M900 line comes back, your firmware doesn't support it and the setting does nothing." },
  { category: "calibration", text: "Direct-drive extruders need far less pressure advance than Bowden setups — typical Marlin K values are 0.02–0.1, not 0.5–1.0." },
  { category: "calibration", text: "Measure retraction towers from the base: retraction = start + (height where stringing stops × step). Go no further than needed — too much retraction can jam." },
  { category: "calibration", text: "Max volumetric speed: watch where the test's surface turns rough or gaps appear, measure that height, and back off 10–20 % for everyday printing." },
  { category: "calibration", text: "Dial in one variable at a time. If you change temperature after tuning retraction, rerun the retraction test — hotter plastic strings more." },
  { category: "calibration", text: "Keep the losing test prints labelled for a week. Comparing them side by side is often how you notice the second-best result was actually better." },

  // --- Slicer settings ---
  { category: "slicing", text: "A filament profile should inherit from the matching system base (e.g. Creality Generic PLA) so you only override what you've actually tuned." },
  { category: "slicing", text: "Filament-level retraction, z-hop and wipe override the printer profile only when set; leave them unset to fall back to the printer's values." },
  { category: "slicing", text: "Slope Lift z-hop rises while it travels, so it drags less across the top surface than a straight Normal lift — good for stringy materials." },
  { category: "slicing", text: "Wipe distance moves the nozzle along the last perimeter while retracting, so the leftover ooze lands inside the part instead of as a blob." },
  { category: "slicing", text: "Set a filament's “compatible printers” to your own printer profile so it only appears in the dropdown when that printer is selected." },
  { category: "slicing", text: "OrcaSlicer only reads user profiles at startup; after a profile file changes on disk, restart OrcaSlicer to see it." },
  { category: "slicing", text: "On smooth PEI, PLA usually likes 55–60 °C; on textured PEI a few degrees more helps first-layer grip. Use the plate-specific bed temperatures." },
  { category: "slicing", text: "Enter the spool's real price per kilogram as filament cost and OrcaSlicer's cost estimate becomes something you can actually quote from." },
];
