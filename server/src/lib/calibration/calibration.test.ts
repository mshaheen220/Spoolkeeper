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
  plateType: { label: "Smooth High Temp Plate", side: "smooth", perPrinter: true },
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
    expect(getTest("flow2").suggestParams(ctx({ lastPass1Flow: 1.029 }))).toEqual({ testType: "Pass 2 (Fine)", topPattern: "Monotonic", oldFlow: 1.029 });
    expect(getTest("flow1").suggestParams(ctx())).toEqual({ testType: "Pass 1 (Coarse)", topPattern: "Monotonic", oldFlow: 0.98 }); // Creality Generic PLA's flow
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

describe("bed temperature prefill", () => {
  const cooling = getTest("cooling");

  it("uses the maker's range: smooth at the middle, textured 5 °C warmer (capped at the max)", () => {
    const c = ctx({ product: { ...walnut, bedMin: 50, bedMax: 60 } as Product });
    expect(cooling.suggestObservation!(c, {})).toEqual({ bedSmooth: 55, bedTextured: 60 });
    const notes = cooling.suggestionNotes!(c);
    expect(notes.bedSmooth).toMatch(/maker's 50–60 °C range/);
    expect(notes.bedSmooth).toMatch(/Smooth High Temp Plate/); // the side this printer's projects use
    expect(notes.bedTextured).not.toMatch(/Smooth High Temp Plate/);
  });

  it("falls back to the base profile, and prefers values already saved", () => {
    expect(cooling.suggestObservation!(ctx(), {})).toEqual({ bedSmooth: 60, bedTextured: 60 }); // Creality Generic PLA
    expect(cooling.suggestObservation!(ctx({ tuned: { hot_plate_temp: "58" } }), {})).toMatchObject({ bedSmooth: 58 });
  });

  it("warns about PETG on smooth PEI", () => {
    const notes = cooling.suggestionNotes!(ctx({ product: { ...walnut, material: "PETG" } as Product }));
    expect(notes.bedSmooth).toMatch(/glue stick/);
  });

  it("confirming the prefilled values saves both plates", () => {
    const c = ctx({ product: { ...walnut, bedMin: 50, bedMax: 60 } as Product });
    expect(value("cooling", {}, cooling.suggestObservation!(c, {}), c)).toMatchObject({
      hot_plate_temp: "55",
      hot_plate_temp_initial_layer: "55",
      textured_plate_temp: "60",
      textured_plate_temp_initial_layer: "60",
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

  it("copies results to other filaments of the same brand and material", async () => {
    const make = async (product: Record<string, unknown>) =>
      (await request(app).post("/api/spools").send({ product: { vendor: "Sunlu", material: "PETG", ...product }, quantity: 1 }).expect(201)).body.spools[0].id as number;
    const white = await make({ colorName: "White" });
    const orange = await make({ colorName: "Orange" });
    await make({ colorName: "Clear", finishes: ["Translucent"] });
    await make({ material: "PLA", colorName: "Black" });

    await request(app).post(`/api/spools/${white}/calibration/runs`).send({ test: "temp", params: { start: 260, end: 230 }, observation: { best: 240 } }).expect(201);
    await request(app).post(`/api/spools/${white}/calibration/runs`).send({ test: "flow1", params: { oldFlow: 0.95 }, observation: { modifier: 5 } }).expect(201);
    await request(app).post(`/api/spools/${white}/calibration/runs`).send({ test: "flow2", params: { oldFlow: 0.9975 }, observation: { modifier: -2 } }).expect(201);

    const targets = (await request(app).get(`/api/spools/${white}/calibration`).expect(200)).body.copyTargets;
    expect(targets.map((t: { displayName: string; differences: string[] }) => [t.displayName.includes("Orange"), t.differences])).toEqual([
      [true, []],
      [false, ["Translucent"]],
    ]);
    const orangeProduct = targets[0].productId;

    const res = await request(app).post(`/api/spools/${white}/calibration/copy`).send({ productIds: [orangeProduct], steps: ["temp", "flow"] }).expect(200);
    expect(res.body.copied).toEqual([{ productId: orangeProduct, spoolId: orange, runs: 3 }]);
    const copied = (await request(app).get(`/api/spools/${orange}/calibration`).expect(200)).body;
    expect(copied.tuned.nozzle_temperature.value).toBe("240");
    expect(copied.tuned.filament_flow_ratio.value).toBe("0.9776"); // Pass 2 still wins over Pass 1
    expect(copied.runs[0].copiedFrom).toMatchObject({ spoolId: white, name: expect.stringContaining("White") });

    // Copying again adds nothing; another material is refused.
    const again = await request(app).post(`/api/spools/${white}/calibration/copy`).send({ productIds: [orangeProduct], steps: ["temp", "flow"] }).expect(200);
    expect(again.body.copied[0].runs).toBe(0);
    await request(app).post(`/api/spools/${white}/calibration/copy`).send({ productIds: [9999], steps: ["temp"] }).expect(400);
  });

  it("fills untuned values of a material from its baseline spool, leaving specialty finishes and out-of-range temperatures alone", async () => {
    const make = async (product: Record<string, unknown>) =>
      (await request(app).post("/api/spools").send({ product: { material: "PLA", ...product }, quantity: 1 }).expect(201)).body.spools[0].id as number;
    const blue = await make({ vendor: "Deeplee", colorName: "Blue" });
    const black = await make({ vendor: "Sunlu", colorName: "Black", nozzleMin: 200, nozzleMax: 240 });
    const yellow = await make({ vendor: "Other", colorName: "Yellow", nozzleMin: 220, nozzleMax: 230 });
    const wood = await make({ vendor: "Sunlu", line: "Wood", colorName: "Walnut", finishes: ["Wood Fill"] });
    const petg = await make({ vendor: "Sunlu", material: "PETG", colorName: "White" });
    const json = async (id: number) => (await request(app).get(`/api/spools/${id}/profile`).expect(200)).body.orca.json;

    await request(app).post(`/api/spools/${blue}/calibration/runs`).send({ test: "temp", params: { start: 230, end: 190 }, observation: { best: 210 } }).expect(201);
    await request(app).post(`/api/spools/${blue}/calibration/runs`).send({ test: "flow1", params: { oldFlow: 0.98 }, observation: { modifier: 0 } }).expect(201);
    await request(app).put(`/api/spools/${black}/calibration/baseline`).send({ use: true }).expect(400); // nothing to share yet
    await request(app).put(`/api/spools/${blue}/calibration/baseline`).send({ use: true }).expect(200);

    const profile = (await request(app).get(`/api/spools/${black}/profile`).expect(200)).body;
    expect(profile.orca.json).toMatchObject({ nozzle_temperature: ["210"], filament_flow_ratio: ["0.98"] });
    expect(profile.values.find((v: { key: string }) => v.key === "nozzle_temperature").why).toMatch(/^PLA baseline \(Deeplee/);
    expect(profile.tunedFromSpool).toBeNull();

    // 210 °C is below Yellow's 220–230 range: flow carries over, temperature doesn't.
    expect(await json(yellow)).toMatchObject({ filament_flow_ratio: ["0.98"] });
    expect((await json(yellow)).nozzle_temperature).toBeUndefined();
    expect((await json(wood)).filament_flow_ratio).toBeUndefined();
    expect((await json(petg)).filament_flow_ratio).toBeUndefined();

    // Its own result wins; overriding brings the wood filament in.
    await request(app).post(`/api/spools/${black}/calibration/runs`).send({ test: "temp", params: { start: 230, end: 190 }, observation: { best: 220 } }).expect(201);
    expect(await json(black)).toMatchObject({ nozzle_temperature: ["220"], filament_flow_ratio: ["0.98"] });
    const woodProduct = (await request(app).get(`/api/spools/${wood}/calibration`).expect(200)).body.product.id;
    await request(app).put(`/api/products/${woodProduct}/calibration/baseline`).send({ use: true }).expect(200);
    expect(await json(wood)).toMatchObject({ filament_flow_ratio: ["0.98"] });

    const { baselines } = (await request(app).get("/api/calibration/baselines").expect(200)).body;
    expect(baselines).toHaveLength(1);
    expect(baselines[0].filaments.map((f: { displayName: string; used: boolean }) => f.used)).toEqual([true, true, true]);

    await request(app).put(`/api/spools/${blue}/calibration/baseline`).send({ use: false }).expect(200);
    expect((await json(yellow)).filament_flow_ratio).toBeUndefined();
  });

  it("computes an E-steps correction", async () => {
    const res = await request(app).post("/api/settings/esteps").send({ current: 93, remainingMm: 22 }).expect(200);
    expect(res.body.esteps).toMatchObject({ extrudedMm: 98, suggested: 94.9 });
  });
});
