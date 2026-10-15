import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { openDb, setDb } from "../db";

const app = createApp();
beforeEach(() => setDb(openDb(":memory:")));

async function addWalnut() {
  const res = await request(app)
    .post("/api/spools")
    .send({
      product: {
        vendor: "Sunlu",
        material: "PLA",
        line: "Wood",
        colorName: "Walnut",
        colorHex: "#5A4741",
        density: 1.25,
        spoolWeightG: 130,
        netWeightG: 1000,
        nozzleMin: 190,
        nozzleMax: 220,
      },
      quantity: 2,
      price: 17,
      sources: { "product.density": { source: "spoolmandb", sourceRef: "sunlu_wood_walnutwood_1000_175_p" } },
    })
    .expect(201);
  return res.body.spools[0].id as number;
}

describe("OrcaSlicer profile", () => {
  it("builds a per-spool preset attached to TheHammer with sourced values", async () => {
    const id = await addWalnut();
    const res = await request(app).get(`/api/spools/${id}/profile`).expect(200);
    expect(res.body.profile).toMatchObject({
      name: `Sunlu PLA Wood Walnut (Spool #${id})`,
      inherits: "Creality Generic PLA",
      compatiblePrinters: ["TheHammer  0.4 nozzle"],
    });
    const json = res.body.orca.json;
    expect(json).toMatchObject({
      name: `Sunlu PLA Wood Walnut (Spool #${id})`,
      filament_settings_id: [`Sunlu PLA Wood Walnut (Spool #${id})`],
      inherits: "Creality Generic PLA",
      from: "User",
      compatible_printers: ["TheHammer  0.4 nozzle"],
      filament_type: ["PLA"],
      filament_vendor: ["Sunlu"],
      default_filament_colour: ["#5A4741"],
      filament_density: ["1.25"],
      filament_cost: ["17"],
      filament_spool_weight: ["130"],
      nozzle_temperature_range_low: ["190"],
      nozzle_temperature_range_high: ["220"],
    });
    expect(json.filament_notes[0]).toContain(`spoolkeeper:spool=${id};product=`);
    // Untuned values are left to the base profile, not guessed.
    expect(json.nozzle_temperature).toBeUndefined();
    expect(json.filament_flow_ratio).toBeUndefined();
    expect(res.body.pending.map((p: { key: string }) => p.key)).toContain("filament_flow_ratio");
    expect(Object.keys(json)).toEqual([...Object.keys(json)].sort());
    expect(res.body.values.find((v: { key: string }) => v.key === "filament_density")).toMatchObject({ source: "spoolmandb" });
    expect(res.body.orca.info).toMatch(/^sync_info = create\nuser_id = \nsetting_id = \nbase_id = GFL99\nupdated_time = \d+\n$/);
  });

  it("names a per-product preset without the spool id", async () => {
    const id = await addWalnut();
    const res = await request(app).get(`/api/spools/${id}/profile?scope=product`).expect(200);
    expect(res.body.profile.name).toBe("Sunlu PLA Wood Walnut");
    expect(res.body.orca.json.filament_notes[0]).not.toContain("spool=");
  });

  it("downloads the preset JSON with an attachment name", async () => {
    const id = await addWalnut();
    const res = await request(app).get(`/api/spools/${id}/profile/orca.json`).expect(200);
    expect(res.headers["content-disposition"]).toContain(encodeURIComponent(`Sunlu PLA Wood Walnut (Spool #${id}).json`));
    expect(res.text.startsWith('{\n    "compatible_printers"')).toBe(true);
  });

  it("uses the printer profile from settings, keeping its double space", async () => {
    const id = await addWalnut();
    await request(app).put("/api/settings").send({ printerProfile: "TheHammer  0.2 nozzle" }).expect(200);
    const res = await request(app).get(`/api/spools/${id}/profile`).expect(200);
    expect(res.body.orca.json.compatible_printers).toEqual(["TheHammer  0.2 nozzle"]);
  });
});
