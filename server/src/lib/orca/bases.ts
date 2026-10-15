// System filament profile each material inherits from. The Creality
// generics are the ones OrcaSlicer 2.4.2 lists as compatible with
// "Creality Ender-3 V2 0.4 nozzle" (what "TheHammer  0.4 nozzle" inherits);
// materials Creality doesn't ship fall back to OrcaFilamentLibrary's
// "Generic X @System". baseId is the base's filament_id, which OrcaSlicer
// writes as base_id in a user preset's .info file. Verified against the
// installed system profiles on 2026-10-15.
export interface OrcaBase {
  inherits: string;
  baseId: string | null;
}

export const ORCA_BASES: Record<string, OrcaBase> = {
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

/** Silk/wood/matte PLA are all PLA to OrcaSlicer; unknown materials fall back to PLA's base. */
export function baseFor(material: string): OrcaBase & { fallback: boolean } {
  const hit = ORCA_BASES[material.toUpperCase()];
  return hit ? { ...hit, fallback: false } : { ...ORCA_BASES.PLA, fallback: true };
}

/** The printer preset name exactly as OrcaSlicer has it - note the double space. */
export const DEFAULT_PRINTER_PROFILE = "TheHammer  0.4 nozzle";

/** The `version` OrcaSlicer 2.4.x writes into user filament presets. */
export const ORCA_PRESET_VERSION = "2.4.0.2";
