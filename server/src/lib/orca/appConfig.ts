import fs from "node:fs";

// OrcaSlicer.conf (JSON) remembers, per printer preset, which plate type
// was last selected on the Prepare tab ("curr_bed_type"). The filament
// profile holds a bed temperature per plate type, so this says which of
// them actually gets used.

/** OrcaSlicer 2.4.2's BedType enum (PrintConfig.hpp) with its UI labels (PrintConfig.cpp). */
const BED_TYPES: Record<string, { label: string; side: "smooth" | "textured" | "other" }> = {
  "1": { label: "Smooth Cool Plate", side: "other" },
  "2": { label: "Engineering Plate", side: "other" },
  "3": { label: "Smooth High Temp Plate", side: "smooth" }, // hot_plate_temp - a smooth PEI sheet
  "4": { label: "Textured PEI Plate", side: "textured" }, // textured_plate_temp
  "5": { label: "Textured Cool Plate", side: "other" },
  "6": { label: "Cool Plate (SuperTack)", side: "other" },
};

export interface PlateType {
  label: string;
  side: "smooth" | "textured" | "other";
  /** True when read from this printer's own entry; false when it's the app-wide last choice. */
  perPrinter: boolean;
}

export function readPlateType(confPath: string, printerName: string): PlateType | null {
  try {
    const conf = JSON.parse(fs.readFileSync(confPath, "utf8")) as {
      app?: { curr_bed_type?: string };
      orca_presets?: { machine?: string; curr_bed_type?: string }[];
    };
    const own = conf.orca_presets?.find((p) => p.machine === printerName)?.curr_bed_type;
    const code = own ?? conf.app?.curr_bed_type;
    const type = code ? BED_TYPES[String(code)] : undefined;
    return type ? { ...type, perPrinter: own != null } : null;
  } catch {
    return null; // not mounted or unreadable - the wizard just won't say which side
  }
}
