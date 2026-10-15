import { describe, expect, it } from "vitest";
import { lineFromFilamentName, pickSize, scoreOfdFilament, suggestionsFromOfd } from "./ofd";
import { scoreSpoolmanDb, suggestionsFromSpoolmanDb, type SpoolmanDbFilament } from "./spoolmandb";
import { parseSpoolzMarkdown } from "./spoolz";
import { norm, overlap, sameBrand } from "./text";

// Real rows captured from the live datasets on 2026-10-15.
const walnutRow: SpoolmanDbFilament = {
  id: "sunlu_wood_walnutwood_1000_175_p",
  manufacturer: "Sunlu",
  name: "Walnut Wood",
  material: "WOOD",
  density: 1.25,
  weight: 1000,
  spool_weight: 130,
  spool_type: "plastic",
  diameter: 1.75,
  color_hex: "564e44",
  extruder_temp: 210,
  extruder_temp_range: null,
  bed_temp: 60,
  bed_temp_range: null,
  finish: null,
};
const query = { vendor: "SUNLU", material: "PLA", line: "Wood", colorName: "Walnut" };

describe("text matching", () => {
  it("normalizes brands and tokens", () => {
    expect(norm("3D-Fuel")).toBe("3dfuel");
    expect(sameBrand("SUNLU", "Sunlu")).toBe(true);
    expect(sameBrand("Sunlu", "Overture")).toBe(false);
    expect(overlap("Walnut", "Walnut Wood")).toBe(1);
  });
});

describe("SpoolmanDB", () => {
  it("matches a wood PLA whose line is folded into material", () => {
    expect(scoreSpoolmanDb(walnutRow, query)).toBeGreaterThan(10);
  });

  it("ranks the right color above other colors of the same line", () => {
    const cherry = { ...walnutRow, id: "x", name: "Cherry Wood" };
    expect(scoreSpoolmanDb(walnutRow, query)).toBeGreaterThan(scoreSpoolmanDb(cherry, query));
  });

  it("rejects other brands and other materials", () => {
    expect(scoreSpoolmanDb({ ...walnutRow, manufacturer: "Overture" }, query)).toBe(0);
    expect(scoreSpoolmanDb({ ...walnutRow, material: "PETG" }, query)).toBe(0);
  });

  it("maps fields and flags a single recommended temp", () => {
    const s = suggestionsFromSpoolmanDb(walnutRow);
    const byField = Object.fromEntries(s.map((x) => [x.field, x]));
    expect(byField.colorHex.value).toBe("#564E44");
    expect(byField.spoolWeightG.value).toBe(130);
    expect(byField.nozzleMin.value).toBe(210);
    expect(byField.nozzleMin.note).toMatch(/single/);
    expect(s.every((x) => x.source === "spoolmandb" && x.sourceRef === walnutRow.id)).toBe(true);
  });
});

describe("Open Filament Database", () => {
  it("prefers the filament line named by the query", () => {
    expect(scoreOfdFilament("PLA Wood", query)).toBeGreaterThan(scoreOfdFilament("PLA Matte", query));
    expect(scoreOfdFilament("PLA", { ...query, line: null })).toBeGreaterThan(scoreOfdFilament("PLA+ 2.0", { ...query, line: null }));
  });

  it("derives the line from a filament name", () => {
    expect(lineFromFilamentName("PLA Matte", "PLA")).toBe("Matte");
    expect(lineFromFilamentName("PLA", "PLA")).toBeNull();
  });

  it("picks the 1.75 mm / 1 kg size", () => {
    const sizes = [
      { filament_weight: 250, diameter: 1.75 },
      { filament_weight: 1000, diameter: 2.85 },
      { filament_weight: 1000, diameter: 1.75, gtin: "123" },
    ];
    expect(pickSize(sizes)?.gtin).toBe("123");
  });

  it("labels drying temperature as a maximum", () => {
    const s = suggestionsFromOfd({ id: "f", name: "PLA", max_dry_temperature: 55 }, null, null, "ref");
    expect(s).toEqual([{ field: "dryTempC", value: 55, source: "ofd", sourceRef: "ref", note: "maximum drying temperature" }]);
  });
});

describe("spoolz", () => {
  it("parses a spool page", () => {
    const md = `+++
title = "SUNLU PLA"
+++

* Empty spool weight: 124g
* Advertised filament weight: 1000g
* Outside Diameter: 195mm
* Hole Diameter: 75mm
* Height: 60mm
* Printing temp: 200-210C
* Bed temp: 0/60C
`;
    expect(parseSpoolzMarkdown(md)).toEqual({
      title: "SUNLU PLA",
      emptySpoolWeightG: 124,
      advertisedWeightG: 1000,
      outerDiameterMm: 195,
      heightMm: 60,
      holeDiameterMm: 75,
      printTemp: [200, 210],
      bedTemp: [60, 60],
    });
  });
});
