// System filament profile each material inherits from, per OrcaSlicer
// version. Creality's generics are the ones compatible with "Creality
// Ender-3 V2 0.4 nozzle" (what "TheHammer  0.4 nozzle" inherits); materials
// Creality doesn't ship fall back to OrcaFilamentLibrary's "Generic X
// @System". baseId is the base's filament_id, which OrcaSlicer writes as
// base_id in a user preset's .info file.
//
// OrcaSlicer 2.5 renamed Creality's generics ("Creality Generic PLA" ->
// "Generic PLA @Creality", each new preset declaring renamed_from the old
// name) and gave every base a new filament_id. 2.4 values were verified
// against the installed 2.4.2 presets (2026-10-15); 2.5 values against the
// v2.5.0-alpha source (resources/profiles, 2026-10-18).
export interface OrcaBase {
  inherits: string;
  baseId: string | null;
}

const BASES_2_4: Record<string, OrcaBase> = {
  PLA: { inherits: "Creality Generic PLA", baseId: "GFL99" },
  PETG: { inherits: "Creality Generic PETG", baseId: "GFG99" },
  TPU: { inherits: "Creality Generic TPU", baseId: "GFU99" },
  ABS: { inherits: "Creality Generic ABS", baseId: "GFB99" },
  ASA: { inherits: "Creality Generic ASA", baseId: "GFB98" },
  "PLA-CF": { inherits: "Creality Generic PLA-CF", baseId: "GFL98" },
  PA: { inherits: "Generic PA @System", baseId: "OGFN99" },
  PC: { inherits: "Generic PC @System", baseId: "OGFC99" },
  "PETG-CF": { inherits: "Generic PETG-CF @System", baseId: null },
  PVA: { inherits: "Generic PVA @System", baseId: "OGFS99" },
  HIPS: { inherits: "Generic HIPS @System", baseId: null },
};

const BASES_2_5: Record<string, OrcaBase> = {
  PLA: { inherits: "Generic PLA @Creality", baseId: "OFDSrzZ8" },
  PETG: { inherits: "Generic PETG @Creality", baseId: "OFYPdQJh" },
  TPU: { inherits: "Generic TPU @Creality", baseId: "OFgbpcy9" },
  ABS: { inherits: "Generic ABS @Creality", baseId: "OFY9muEs" },
  ASA: { inherits: "Generic ASA @Creality", baseId: "OFLPAxz3" },
  "PLA-CF": { inherits: "Generic PLA-CF @Creality", baseId: "OFWbdGsC" },
  PA: { inherits: "Generic PA @System", baseId: "OFg8ndtj" },
  PC: { inherits: "Generic PC @System", baseId: "OFLakOUI" },
  "PETG-CF": { inherits: "Generic PETG-CF @System", baseId: null },
  PVA: { inherits: "Generic PVA @System", baseId: "OFDvXujf" },
  HIPS: { inherits: "Generic HIPS @System", baseId: null },
};

/** "2.5.0-alpha" -> [2, 5]; null when unknown. */
export function parseOrcaVersion(v: string | null | undefined): [number, number] | null {
  const m = /^(\d+)\.(\d+)/.exec(v ?? "");
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** 2.5 and later use the renamed bases; 2.4 (and unknown, the last verified stable) the old ones. */
export function basesFor(orcaVersion: string | null | undefined): Record<string, OrcaBase> {
  const v = parseOrcaVersion(orcaVersion);
  return v && (v[0] > 2 || (v[0] === 2 && v[1] >= 5)) ? BASES_2_5 : BASES_2_4;
}

/** Silk/wood/matte PLA are all PLA to OrcaSlicer; unknown materials fall back to PLA's base. */
export function baseFor(material: string, orcaVersion?: string | null): OrcaBase & { fallback: boolean } {
  const bases = basesFor(orcaVersion);
  const hit = bases[material.toUpperCase()];
  return hit ? { ...hit, fallback: false } : { ...bases.PLA, fallback: true };
}

/** The printer preset name exactly as OrcaSlicer has it - note the double space. */
export const DEFAULT_PRINTER_PROFILE = "TheHammer  0.4 nozzle";

/** The `version` OrcaSlicer 2.4.x writes into user filament presets. */
export const ORCA_PRESET_VERSION = "2.4.0.2";
