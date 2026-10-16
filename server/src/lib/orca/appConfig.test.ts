import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readPlateType } from "./appConfig";

describe("readPlateType", () => {
  // Shape of the real OrcaSlicer.conf: an app-wide choice plus one entry per printer preset.
  const conf = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "spoolkeeper-conf-")), "OrcaSlicer.conf");
  fs.writeFileSync(
    conf,
    JSON.stringify({
      app: { curr_bed_type: "3" },
      orca_presets: [
        { machine: "TheHammer  0.4 nozzle", curr_bed_type: "3" },
        { machine: "TheHammer 0.2 nozzle", curr_bed_type: "4" },
      ],
    }),
  );

  it("reads the printer's own plate type (BedType 3 = smooth PEI, 4 = textured PEI)", () => {
    expect(readPlateType(conf, "TheHammer  0.4 nozzle")).toEqual({ label: "Smooth High Temp Plate", side: "smooth", perPrinter: true });
    expect(readPlateType(conf, "TheHammer 0.2 nozzle")).toEqual({ label: "Textured PEI Plate", side: "textured", perPrinter: true });
  });

  it("falls back to the app-wide choice, and to null when unreadable", () => {
    expect(readPlateType(conf, "Some Other Printer")).toMatchObject({ side: "smooth", perPrinter: false });
    expect(readPlateType("/nope/OrcaSlicer.conf", "x")).toBeNull();
  });
});
