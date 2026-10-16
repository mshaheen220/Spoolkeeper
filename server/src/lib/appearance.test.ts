import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { openDb, setDb } from "../db";
import { MIGRATIONS } from "../db/migrations";
import { finishesFromText, finishFromWord, mainColor, normalizeFinishes } from "./appearance";
import { ofdDirection, ofdFinishes, suggestionsFromOfd } from "./enrich/ofd";
import { spoolmanDbFinishes, suggestionsFromSpoolmanDb, type SpoolmanDbFilament } from "./enrich/spoolmandb";

describe("appearance helpers", () => {
  it("reads a finish from line or name words", () => {
    expect(finishFromWord("Silk")).toBe("Silk");
    expect(finishFromWord("Glow in The Dark Blue")).toBe("Glow in the Dark");
    expect(finishFromWord("Transparent")).toBe("Translucent");
    expect(finishFromWord("Fast Gradient Twinkling Translucent Rose")).toBe("Glitter");
    expect(finishFromWord("Basic")).toBe("Basic");
    expect(finishFromWord("Standard")).toBe("Basic");
    expect(finishFromWord("High Speed")).toBeNull();
  });

  it("finds every finish a name mentions", () => {
    expect(finishesFromText("Fast Gradient Twinkling Translucent Rose")).toEqual(["Glitter", "Translucent"]);
    expect(finishesFromText("Silk PLA Basic")).toEqual(["Silk"]); // Basic only when nothing more specific
    expect(finishesFromText("PLA Basic")).toEqual(["Basic"]);
    expect(normalizeFinishes(["Translucent", "Glitter", "Standard", "Glitter"])).toEqual(["Basic", "Glitter", "Translucent"]);
  });

  it("keeps the main color one of the filament's colors", () => {
    expect(mainColor("#111111", null)).toBe("#111111");
    expect(mainColor(null, ["#0000FF", "#800080"])).toBe("#0000FF");
    expect(mainColor("#800080", ["#0000FF", "#800080"])).toBe("#800080");
    expect(mainColor("#FFFFFF", ["#0000FF", "#800080"])).toBe("#0000FF");
  });
});

describe("multi-color filaments via the API", () => {
  const app = createApp();
  beforeEach(() => setDb(openDb(":memory:")));
  const dual = {
    vendor: "Epelay",
    material: "PLA",
    colorName: "Dual Color Blue & Purple",
    colorHexes: ["#1e3cff", "#9a58c4"],
    multiColorDirection: "coaxial",
    finishes: ["Silk", "Glitter"],
  };

  it("defaults the main color to the first color and exports it to OrcaSlicer", async () => {
    const res = await request(app).post("/api/spools").send({ product: dual }).expect(201);
    const p = res.body.spools[0].product;
    expect(p).toMatchObject({ colorHexes: ["#1E3CFF", "#9A58C4"], colorHex: "#1E3CFF", multiColorDirection: "coaxial", finishes: ["Silk", "Glitter"] });
    const profile = await request(app).get(`/api/spools/${res.body.spools[0].id}/profile`).expect(200);
    expect(profile.body.orca.json.default_filament_colour).toEqual(["#1E3CFF"]);
    expect(profile.body.orca.json.filament_notes[0]).toContain("Colors: #1E3CFF, #9A58C4 (coaxial)");
  });

  it("lets the user pick another main color, and falls back when it isn't one of the colors", async () => {
    const res = await request(app).post("/api/spools").send({ product: dual }).expect(201);
    const id = res.body.spools[0].product.id;
    expect((await request(app).patch(`/api/products/${id}`).send({ colorHex: "#9A58C4" })).body.product.colorHex).toBe("#9A58C4");
    expect((await request(app).patch(`/api/products/${id}`).send({ colorHex: "#FFFFFF" })).body.product.colorHex).toBe("#1E3CFF");
  });

  it("going back to a single color clears the direction", async () => {
    const res = await request(app).post("/api/spools").send({ product: dual }).expect(201);
    const id = res.body.spools[0].product.id;
    const back = await request(app).patch(`/api/products/${id}`).send({ colorHexes: null, colorHex: "#9A58C4" }).expect(200);
    expect(back.body.product).toMatchObject({ colorHexes: null, colorHex: "#9A58C4", multiColorDirection: null });
  });

  it("validates finish, direction and Shore values", async () => {
    await request(app).post("/api/spools").send({ product: { ...dual, finishes: ["Sparkly"] } }).expect(400);
    await request(app).post("/api/spools").send({ product: { ...dual, multiColorDirection: "diagonal" } }).expect(400);
    await request(app).post("/api/spools").send({ product: { ...dual, colorHexes: ["#123456"] } }).expect(400);
    const tpu = await request(app)
      .post("/api/spools")
      .send({ product: { vendor: "Inslogic", material: "TPU", shoreScale: "A", shoreHardness: 95 } })
      .expect(201);
    expect(tpu.body.spools[0].product).toMatchObject({ shoreScale: "A", shoreHardness: 95 });
  });
});

describe("migration 3", () => {
  it("backfills finish from existing lines and records it as inferred", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "spoolkeeper-mig-")), "db.sqlite");
    const old = new Database(file);
    old.exec(MIGRATIONS[0]);
    old.exec(MIGRATIONS[1]);
    old.pragma("user_version = 2");
    old.exec(`INSERT INTO vendors (id, name) VALUES (1, 'Overture');
      INSERT INTO products (id, vendor_id, material, line, color_name) VALUES (1, 1, 'PLA', 'Silk', 'Silver'), (2, 1, 'PLA', NULL, 'White');`);
    old.close();

    const db = openDb(file);
    // Migration 7 then turns the single finish into a list, provenance included.
    expect(db.prepare("SELECT id, finishes FROM products ORDER BY id").all()).toEqual([
      { id: 1, finishes: '["Silk"]' },
      { id: 2, finishes: null },
    ]);
    expect(db.prepare("SELECT field, value, source FROM field_sources").all()).toEqual([{ field: "finishes", value: '["Silk"]', source: "inferred" }]);
  });
});

describe("enrichment of appearance", () => {
  const row: SpoolmanDbFilament = {
    id: "anycubic_pla_mattegreen-brown_1000_175_c",
    manufacturer: "ANYCUBIC",
    name: "Matte Green-Brown",
    material: "PLA",
    density: 1.24,
    weight: 1000,
    spool_weight: 125,
    spool_type: "cardboard",
    diameter: 1.75,
    color_hex: null,
    color_hexes: ["744E10", "009639"],
    extruder_temp: 210,
    extruder_temp_range: null,
    bed_temp: 60,
    bed_temp_range: null,
    finish: "matte",
    multi_color_direction: "coaxial",
    pattern: null,
    translucent: false,
    glow: false,
  };

  it("maps SpoolmanDB multi-color rows, picking the first color as main", () => {
    const by = Object.fromEntries(suggestionsFromSpoolmanDb(row).map((s) => [s.field, s.value]));
    expect(by).toMatchObject({ colorHexes: "#744E10,#009639", colorHex: "#744E10", multiColorDirection: "coaxial", finishes: "Matte" });
    expect(spoolmanDbFinishes({ ...row, glow: true })).toEqual(["Matte", "Glow in the Dark"]);
    expect(spoolmanDbFinishes({ ...row, pattern: "sparkle", finish: null, translucent: true })).toEqual(["Glitter", "Translucent"]);
  });

  it("maps OFD traits, multi-color hexes and Shore hardness", () => {
    expect(ofdFinishes({ silk: true, coextruded: true })).toEqual(["Silk"]);
    expect(ofdFinishes({ translucent: true, glitter: true })).toEqual(["Glitter", "Translucent"]);
    expect(ofdDirection({ gradual_color_change: true })).toBe("longitudinal");
    const s = suggestionsFromOfd(
      { id: "f", name: "TPU 95A", shore_hardness_a: 95 },
      { id: "v", name: "Rainbow", color_hex: ["#ff0000", "#00ff00", "#0000ff"], traits: { gradual_color_change: true } },
      null,
      "ref",
    );
    const by = Object.fromEntries(s.map((x) => [x.field, x.value]));
    expect(by).toMatchObject({ colorHexes: "#FF0000,#00FF00,#0000FF", colorHex: "#FF0000", multiColorDirection: "longitudinal", shoreScale: "A", shoreHardness: 95 });
  });
});

describe("migration 6", () => {
  it("renames the Standard finish to Basic, including its provenance", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "spoolkeeper-mig6-")), "db.sqlite");
    const old = new Database(file);
    for (const m of MIGRATIONS.slice(0, 5)) old.exec(m);
    old.pragma("user_version = 5");
    old.exec(`INSERT INTO vendors (id, name) VALUES (1, 'Deeplee');
      INSERT INTO products (id, vendor_id, material, color_name, finish) VALUES (6, 1, 'PLA', 'Yellow', 'Standard');
      INSERT INTO field_sources (entity, entity_id, field, value, source) VALUES ('product', 6, 'finish', '"Standard"', 'manual');`);
    old.close();
    const db = openDb(file);
    expect(db.prepare("SELECT finishes FROM products WHERE id = 6").get()).toEqual({ finishes: '["Basic"]' });
    expect(db.prepare("SELECT field, value FROM field_sources WHERE entity_id = 6").get()).toEqual({ field: "finishes", value: '["Basic"]' });
  });

  it("still accepts 'Standard' from older clients, stored as Basic", async () => {
    setDb(openDb(":memory:"));
    const res = await request(createApp()).post("/api/spools").send({ product: { vendor: "Deeplee", material: "PLA", finishes: "Standard,Glitter" } }).expect(201);
    expect(res.body.spools[0].product.finishes).toEqual(["Basic", "Glitter"]);
  });
});
