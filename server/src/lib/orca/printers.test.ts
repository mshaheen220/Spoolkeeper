import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listUserPrinters } from "./printers";

describe("listUserPrinters", () => {
  it("reads preset names exactly (double spaces kept) and works out the nozzle", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spoolkeeper-printers-"));
    fs.mkdirSync(path.join(dir, "machine"));
    // Shapes copied from the real TheHammer presets.
    fs.writeFileSync(path.join(dir, "machine", "TheHammer  0.4 nozzle.json"), JSON.stringify({ name: "TheHammer  0.4 nozzle", inherits: "Creality Ender-3 V2 0.4 nozzle" }));
    fs.writeFileSync(path.join(dir, "machine", "TheHammer 0.2 nozzle.json"), JSON.stringify({ name: "TheHammer 0.2 nozzle", inherits: "Creality Ender-3 V2 0.4 nozzle", nozzle_diameter: ["0.2"] }));
    fs.writeFileSync(path.join(dir, "machine", "TheHammer  0.4 nozzle.info"), "sync_info = update");
    expect(await listUserPrinters(dir)).toEqual([
      { name: "TheHammer  0.4 nozzle", inherits: "Creality Ender-3 V2 0.4 nozzle", nozzleDiameter: 0.4 },
      { name: "TheHammer 0.2 nozzle", inherits: "Creality Ender-3 V2 0.4 nozzle", nozzleDiameter: 0.2 },
    ]);
  });
});

describe("base profiles by OrcaSlicer version", async () => {
  const { baseFor, parseOrcaVersion } = await import("./bases");
  it("uses the renamed Creality generics from 2.5 on", () => {
    expect(baseFor("PLA", "2.5.0-alpha")).toMatchObject({ inherits: "Generic PLA @Creality", baseId: "OFDSrzZ8" });
    expect(baseFor("PETG", "2.6.1")).toMatchObject({ inherits: "Generic PETG @Creality" });
    expect(baseFor("PLA", "2.4.2")).toMatchObject({ inherits: "Creality Generic PLA", baseId: "GFL99" });
    expect(baseFor("PLA", null)).toMatchObject({ inherits: "Creality Generic PLA" }); // unknown: last verified stable
    expect(baseFor("NYLON-X", "2.5.0")).toMatchObject({ inherits: "Generic PLA @Creality", fallback: true });
    expect(parseOrcaVersion("2.5.0-alpha")).toEqual([2, 5]);
  });
});
