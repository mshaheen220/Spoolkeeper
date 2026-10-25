import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { openDb, setDb } from "../../db";
import { getSpool, updateProduct } from "../../db/repo";
import { applyPublish, listLegacy, planPublish, readUserFilaments, removeLegacy } from "./publish";
import { buildForSpool } from "./spoolProfile";

const app = createApp();
let dir: string;
let backups: string;

beforeEach(() => {
  setDb(openDb(":memory:"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spoolkeeper-publish-"));
  dir = path.join(tmp, "filament");
  backups = path.join(tmp, "backups");
  fs.mkdirSync(dir);
});

async function addWalnut() {
  const res = await request(app)
    .post("/api/spools")
    .send({ product: { vendor: "Sunlu", material: "PLA", line: "Wood", colorName: "Walnut", colorHex: "#5A4741", density: 1.25, nozzleMin: 190, nozzleMax: 220 } })
    .expect(201);
  return res.body.spools[0].id as number;
}

const ids = (spoolId: number) => ({ spoolId, productId: getSpool(spoolId)!.product.id });
const publish = (spoolId: number, overwrite?: string[]) => applyPublish(buildForSpool(spoolId, "spool"), ids(spoolId), { dir, backupDir: backups, overwrite });
const plan = (spoolId: number) => planPublish(buildForSpool(spoolId, "spool"), ids(spoolId), readUserFilaments(dir));
const fileOf = (spoolId: number) => path.join(dir, `Sunlu PLA Wood Walnut (Spool #${spoolId}).json`);
const readJson = (f: string) => JSON.parse(fs.readFileSync(f, "utf8")) as Record<string, unknown>;
/** Simulate editing and saving the preset in OrcaSlicer. */
const editInOrca = (f: string, patch: Record<string, unknown>) => fs.writeFileSync(f, `${JSON.stringify({ ...readJson(f), ...patch }, null, 4)}\n`);

describe("publishing presets into OrcaSlicer", () => {
  it("creates the preset and its .info, then reports it current and doesn't rewrite it", async () => {
    const id = await addWalnut();
    expect(plan(id).state).toBe("new");
    expect(publish(id)).toMatchObject({ action: "created", backupDir: null });
    expect(readJson(fileOf(id))).toMatchObject({ name: `Sunlu PLA Wood Walnut (Spool #${id})`, filament_density: ["1.25"] });
    expect(fs.readFileSync(fileOf(id).replace(/json$/, "info"), "utf8")).toMatch(/^base_id = /m);

    expect(plan(id)).toMatchObject({ state: "current", changes: [] });
    const before = fs.statSync(fileOf(id)).mtimeMs;
    expect(publish(id).action).toBe("unchanged");
    expect(fs.statSync(fileOf(id)).mtimeMs).toBe(before);
    expect(fs.existsSync(backups)).toBe(false);
  });

  it("keeps values edited in OrcaSlicer unless told to overwrite them, and keys it added", async () => {
    const id = await addWalnut();
    publish(id);
    editInOrca(fileOf(id), { filament_density: ["1.3"], filament_retract_when_changing_layer: ["1"] });
    updateProduct(getSpool(id)!.product.id, { nozzleMax: 225 });

    const p = plan(id);
    expect(p.state).toBe("changes");
    expect(p.changes.find((c) => c.key === "filament_density")).toMatchObject({ current: "1.3", proposed: "1.25", handTuned: true, lastWritten: "1.25" });
    expect(p.changes.find((c) => c.key === "nozzle_temperature_range_high")).toMatchObject({ current: "220", proposed: "225", handTuned: false });

    const r = publish(id);
    expect(r).toMatchObject({ action: "updated", kept: ["filament_density"] });
    expect(fs.existsSync(path.join(r.backupDir!, path.basename(fileOf(id))))).toBe(true);
    const after = readJson(fileOf(id));
    expect(after).toMatchObject({ filament_density: ["1.3"], nozzle_temperature_range_high: ["225"], filament_retract_when_changing_layer: ["1"] });
    // Still flagged next time - keeping it isn't the same as accepting it.
    expect(plan(id).changes.find((c) => c.key === "filament_density")?.handTuned).toBe(true);

    expect(publish(id, ["filament_density"]).kept).toEqual([]);
    expect(readJson(fileOf(id)).filament_density).toEqual(["1.25"]);
    expect(plan(id).state).toBe("current");
  });

  it("never overwrites a same-named preset it didn't make", async () => {
    const id = await addWalnut();
    fs.writeFileSync(fileOf(id), JSON.stringify({ name: "mine", filament_notes: ["hand made"] }));
    expect(plan(id).state).toBe("blocked");
    expect(publish(id).action).toBe("blocked");
    expect(readJson(fileOf(id)).name).toBe("mine");
  });

  it("follows a rename instead of leaving a duplicate behind", async () => {
    const id = await addWalnut();
    publish(id);
    updateProduct(getSpool(id)!.product.id, { colorName: "Dark Walnut" });
    expect(plan(id)).toMatchObject({ state: "changes", existingFile: path.basename(fileOf(id)) });
    expect(publish(id).action).toBe("renamed");
    expect(fs.readdirSync(dir).sort()).toEqual([`Sunlu PLA Wood Dark Walnut (Spool #${id}).info`, `Sunlu PLA Wood Dark Walnut (Spool #${id}).json`]);
  });

  it("removes a value Spoolkeeper stopped setting, so the base profile's applies again", async () => {
    const id = await addWalnut();
    publish(id);
    updateProduct(getSpool(id)!.product.id, { density: null });
    expect(plan(id).changes).toContainEqual(expect.objectContaining({ key: "filament_density", proposed: null, handTuned: false }));
    publish(id);
    expect("filament_density" in readJson(fileOf(id))).toBe(false);
  });
});

describe("spoolman2slicer cleanup", () => {
  it("lists only its generated presets, and backs them up before removing", () => {
    fs.writeFileSync(path.join(dir, "Sunlu - Black.json"), JSON.stringify({ _comment: "Generated by spoolman2slicer v0.10.0", name: "Sunlu - Black" }));
    fs.writeFileSync(path.join(dir, "Sunlu - Black.info"), "sync_info = update\n");
    fs.writeFileSync(path.join(dir, "Hand made.json"), JSON.stringify({ name: "Hand made" }));
    expect(listLegacy(readUserFilaments(dir)).map((f) => f.fileName)).toEqual(["Sunlu - Black.json"]);

    expect(() => removeLegacy(["Hand made.json"], backups, dir)).toThrow(/Not a spoolman2slicer preset/);
    removeLegacy(["Sunlu - Black.json"], backups, dir);
    expect(fs.readdirSync(dir)).toEqual(["Hand made.json"]);
    expect(fs.readdirSync(backups).sort()).toEqual(["Sunlu - Black.info", "Sunlu - Black.json"]);
  });
});
