import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { openDb, setDb } from "../db";

const app = createApp();
beforeEach(() => setDb(openDb(":memory:")));

async function add(product: object) {
  return (await request(app).post("/api/spools").send({ product }).expect(201)).body.spools[0].id as number;
}

describe("labels", () => {
  it("shows the maker's range until a value is tuned, then the tuned value", async () => {
    const id = await add({ vendor: "Sunlu", material: "PLA", line: "Wood", colorName: "Walnut", finishes: ["Wood Fill"], nozzleMin: 190, nozzleMax: 220, bedMin: 50, bedMax: 60 });
    let res = await request(app).get(`/api/labels?ids=${id}`).expect(200);
    expect(res.body.size).toEqual({ widthMm: 60, heightMm: 20 });
    expect(res.body.labels[0]).toMatchObject({
      spoolId: id,
      url: `http://Michaels-MacBook-Pro.local:8003/spools/${id}`,
      brand: "Sunlu",
      material: "PLA", // "Wood" is a finish, already listed under finishes
      finishes: ["Wood Fill"],
      colorName: "Walnut",
      nozzle: { text: "190–220°C", tuned: false },
      bed: { text: "50–60°C", tuned: false },
    });

    await request(app).post(`/api/spools/${id}/calibration/runs`).send({ test: "temp", params: { start: 230, end: 190 }, observation: { best: 210 } }).expect(201);
    await request(app).post(`/api/spools/${id}/calibration/runs`).send({ test: "cooling", observation: { bedSmooth: 55, bedTextured: 60 } }).expect(201);
    res = await request(app).get(`/api/labels?ids=${id}`).expect(200);
    expect(res.body.labels[0]).toMatchObject({ nozzle: { text: "210°C", tuned: true }, bed: { text: "55/60°C", tuned: true } });
  });

  it("prints several at once in the requested order, reporting unknown ids", async () => {
    const a = await add({ vendor: "Deeplee", material: "PLA", line: "PLA+", colorName: "Orange" });
    const b = await add({ vendor: "Polymaker", material: "PLA", line: "High Speed", colorName: "Teal" });
    const res = await request(app).get(`/api/labels?ids=${b},${a},999`).expect(200);
    expect(res.body.labels.map((l: { spoolId: number; material: string }) => [l.spoolId, l.material])).toEqual([
      [b, "PLA High Speed"],
      [a, "PLA+"],
    ]);
    expect(res.body.missing).toEqual([999]);
    await request(app).get("/api/labels?ids=1;drop").expect(400);
  });

  it("uses the label size and QR address from Settings", async () => {
    const id = await add({ vendor: "Sunlu", material: "PETG", colorName: "Red" });
    await request(app).put("/api/settings").send({ label: { widthMm: 70, heightMm: 25 }, publicBaseUrl: "http://192.168.40.33:8003/" }).expect(200);
    const res = await request(app).get(`/api/labels?ids=${id}`).expect(200);
    expect(res.body.size).toEqual({ widthMm: 70, heightMm: 25 });
    expect(res.body.labels[0].url).toBe(`http://192.168.40.33:8003/spools/${id}`);
    await request(app).put("/api/settings").send({ publicBaseUrl: "not a url" }).expect(400);
  });
});
