import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { openDb, setDb } from "../../db";
import type { Product } from "../../db/repo";
import { getTest, type TestContext } from "./tests";

const walnut = {
  id: 1,
  material: "PLA",
  line: "Wood",
  finish: "Wood Fill",
  colorName: "Walnut",
  nozzleMin: 190,
  nozzleMax: 220,
} as unknown as Product;

const ctx = (over: Partial<TestContext> = {}): TestContext => ({
  product: walnut,
  tuned: {},
  lastPass1Flow: null,
  linearAdvance: "unsupported",
  printerRetraction: { length: 1.2, speed: null, zHop: null, zHopType: "Slope Lift", wipe: null, wipeDistance: 0.8 },
  ...over,
});
const value = (test: string, params: object, obs: object, c = ctx()) =>
  Object.fromEntries(getTest(test).compute(params as never, obs as never, c).values.map((v) => [v.key, v.value]));

// Worked examples from the OrcaSlicer wiki, plus formulas read from v2.4.2's GCode.cpp / Plater.cpp.
describe("calibration math", () => {
  it("temperature tower: reads the labelled block, validates it's on the tower", () => {
    expect(value("temp", { start: 230, end: 190 }, { best: 210 })).toEqual({ nozzle_temperature: "210", nozzle_temperature_initial_layer: "210" });
    expect(() => value("temp", { start: 230, end: 190 }, { best: 212 })).toThrow(/5 °C steps/);
    expect(() => value("temp", { start: 230, end: 190 }, { best: 240 })).toThrow(/isn't on this tower/);
  });

  it("temperature: suggests OrcaSlicer's preset for the material", () => {
    expect(getTest("temp").suggestParams(ctx())).toEqual({ dialogType: "PLA", start: 230, end: 190 });
    expect(getTest("temp").suggestParams(ctx({ product: { ...walnut, material: "PETG" } }))).toEqual({ dialogType: "PETG", start: 250, end: 230 });
  });

  it("max volumetric speed: start + height × step, then the safety margin (wiki: 5 + 19 × 0.5 = 14.5)", () => {
    const c = getTest("mvs").compute({ start: 5, end: 20, step: 0.5 }, { heightMm: 19, marginPct: 15 }, ctx());
    expect(c.formula[0]).toContain("= 14.5 mm³/s");
    expect(c.values).toEqual([{ key: "filament_max_volumetric_speed", value: "12", label: "Max volumetric speed" }]); // 12.325 rounded down to 0.5
  });

  it("flow Pass 1 and Pass 2 (wiki: 0.98 × 105% = 1.029, then × 94% = 0.96726)", () => {
    expect(value("flow1", { oldFlow: 0.98 }, { modifier: 5 })).toEqual({ filament_flow_ratio: "1.029" });
    expect(value("flow2", { oldFlow: 1.029 }, { modifier: -6 })).toEqual({ filament_flow_ratio: "0.9673" });
    expect(() => value("flow1", { oldFlow: 0.98 }, { modifier: 3 })).toThrow(/Pass 1 blocks/);
    expect(() => value("flow2", { oldFlow: 0.98 }, { modifier: 2 })).toThrow(/Pass 2 blocks/);
  });

  it("flow YOLO adds the modifier (wiki: 0.98 + 0.01 = 0.99)", () => {
    expect(value("flow_yolo", { oldFlow: 0.98, variant: "recommended" }, { modifier: 0.01 })).toEqual({ filament_flow_ratio: "0.99" });
    expect(value("flow_yolo", { oldFlow: 0.98, variant: "perfectionist" }, { modifier: -0.035 })).toEqual({ filament_flow_ratio: "0.945" });
    expect(() => value("flow_yolo", { oldFlow: 0.98, variant: "recommended" }, { modifier: 0.005 })).toThrow(/YOLO/);
  });

  it("Pass 2 starts from Pass 1's result", () => {
    expect(getTest("flow2").suggestParams(ctx({ lastPass1Flow: 1.029 }))).toEqual({ oldFlow: 1.029 });
    expect(getTest("flow1").suggestParams(ctx())).toEqual({ oldFlow: 0.98 }); // Creality Generic PLA's flow
  });

  it("retraction: start + floor(height − 0.4) × step, plus recorded z-hop and wipe", () => {
    expect(value("retraction", { start: 0, end: 2, step: 0.1 }, { heightMm: 12.6, zHopType: "Slope Lift", wipeDistance: 0.8 })).toEqual({
      filament_retraction_length: "1.2",
      filament_z_hop_types: "Slope Lift",
      filament_wipe: "1",
      filament_wipe_distance: "0.8",
    });
    expect(value("retraction", { start: 0, end: 2, step: 0.1 }, { lengthMm: 0.4, wipeDistance: 0 })).toEqual({
      filament_retraction_length: "0.4",
      filament_wipe: "0",
    });
  });

  it("warns when a wood PLA lands far from the known-good Sunlu Walnut Wood", () => {
    const c = getTest("retraction").compute({ start: 0, end: 4, step: 0.1 }, { lengthMm: 3 }, ctx());
    expect(c.warnings.join(" ")).toMatch(/Walnut Wood/);
    expect(getTest("temp").compute({ start: 230, end: 190 }, { best: 230 }, ctx()).warnings.join(" ")).toMatch(/Walnut Wood/);
  });

  it("refuses a pressure advance value when the firmware has no Linear Advance", () => {
    expect(() => value("pa", { start: 0, end: 0.1, step: 0.002 }, { heightMm: 20 })).toThrow(/doesn't support Linear Advance/);
    expect(value("pa", { start: 0, end: 0.1, step: 0.002 }, { heightMm: 20.7 }, ctx({ linearAdvance: "supported" }))).toEqual({
      enable_pressure_advance: "1",
      pressure_advance: "0.04",
    });
  });
});

describe("calibration API and profile", () => {
  const app = createApp();
  beforeEach(() => setDb(openDb(":memory:")));

  async function spool() {
    const res = await request(app)
      .post("/api/spools")
      .send({ product: { vendor: "Sunlu", material: "PLA", line: "Wood", colorName: "Walnut" }, quantity: 2 })
      .expect(201);
    return res.body.spools.map((s: { id: number }) => s.id) as number[];
  }

  it("saves runs, keeps history, and writes tuned values into the OrcaSlicer profile", async () => {
    const [id] = await spool();
    await request(app).put("/api/settings").send({ linearAdvance: "unsupported" }).expect(200);

    const wizard = await request(app).get(`/api/spools/${id}/calibration`).expect(200);
    expect(wizard.body.tests.find((t: { id: string }) => t.id === "pa").skipped).toBe(true);

    const preview = await request(app).post(`/api/spools/${id}/calibration/preview`).send({ test: "temp", params: { start: 230, end: 190 }, observation: { best: 215 } }).expect(200);
    expect(preview.body.values[0]).toMatchObject({ key: "nozzle_temperature", value: "215" });
    expect((await request(app).get(`/api/spools/${id}/calibration`)).body.runs).toHaveLength(0); // preview never saves

    await request(app).post(`/api/spools/${id}/calibration/runs`).send({ test: "temp", params: { start: 230, end: 190 }, observation: { best: 215 } }).expect(201);
    const redo = await request(app).post(`/api/spools/${id}/calibration/runs`).send({ test: "temp", params: { start: 230, end: 190 }, observation: { best: 210 } }).expect(201);
    await request(app).post(`/api/spools/${id}/calibration/runs`).send({ test: "flow1", params: { oldFlow: 0.98 }, observation: { modifier: 5 } }).expect(201);
    expect(redo.body.tuned.nozzle_temperature.value).toBe("210");

    const profile = await request(app).get(`/api/spools/${id}/profile`).expect(200);
    const json = profile.body.orca.json;
    expect(json.nozzle_temperature).toEqual(["210"]);
    expect(json.filament_flow_ratio).toEqual(["1.029"]);
    expect(json.enable_pressure_advance).toEqual(["0"]);
    expect(json.pressure_advance).toBeUndefined();
    const pending = profile.body.pending.map((p: { key: string }) => p.key);
    expect(pending).not.toContain("nozzle_temperature");
    expect(pending).not.toContain("pressure_advance");
    expect(pending).toContain("filament_retraction_length");
    expect(profile.body.values.find((v: { key: string }) => v.key === "nozzle_temperature")).toMatchObject({ source: "calibration" });

    // Un-accepting the redo falls back to the earlier run; nothing is deleted.
    await request(app).patch(`/api/calibration/runs/${redo.body.run.id}`).send({ accepted: false }).expect(200);
    const after = await request(app).get(`/api/spools/${id}/calibration`).expect(200);
    expect(after.body.tuned.nozzle_temperature.value).toBe("215");
    expect(after.body.runs).toHaveLength(3);
  });

  it("rejects bad observations with a readable message", async () => {
    const [id] = await spool();
    const res = await request(app).post(`/api/spools/${id}/calibration/runs`).send({ test: "flow2", params: { oldFlow: 1 }, observation: { modifier: 4 } }).expect(400);
    expect(res.body.error).toMatch(/Pass 2 blocks/);
    await request(app).post(`/api/spools/${id}/calibration/runs`).send({ test: "nope" }).expect(404);
  });

  it("a per-product profile borrows the calibrated sibling spool's values", async () => {
    const [a, b] = await spool();
    await request(app).post(`/api/spools/${a}/calibration/runs`).send({ test: "temp", params: { start: 230, end: 190 }, observation: { best: 205 } }).expect(201);
    const prod = await request(app).get(`/api/spools/${b}/profile?scope=product`).expect(200);
    expect(prod.body.tunedFromSpool).toBe(a);
    expect(prod.body.orca.json.nozzle_temperature).toEqual(["205"]);
    const own = await request(app).get(`/api/spools/${b}/profile?scope=spool`).expect(200);
    expect(own.body.orca.json.nozzle_temperature).toBeUndefined();
    const wizard = await request(app).get(`/api/spools/${b}/calibration`).expect(200);
    expect(wizard.body.siblings[0]).toMatchObject({ spoolId: a });
  });

  it("computes an E-steps correction", async () => {
    const res = await request(app).post("/api/settings/esteps").send({ current: 93, remainingMm: 22 }).expect(200);
    expect(res.body.esteps).toMatchObject({ extrudedMm: 98, suggested: 94.9 });
  });
});
