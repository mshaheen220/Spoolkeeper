import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { openDb, setDb } from "../db";

const app = createApp();

beforeEach(() => {
  setDb(openDb(":memory:"));
});

const walnut = {
  vendor: "Sunlu",
  material: "PLA",
  line: "Wood",
  colorName: "Walnut",
  colorHex: "5a4741",
  density: 1.25,
  spoolWeightG: 130,
  nozzleMin: 190,
  nozzleMax: 220,
};

describe("inventory API", () => {
  it("creates a product and spools with provenance, and reuses vendors case-insensitively", async () => {
    const res = await request(app)
      .post("/api/spools")
      .send({
        product: walnut,
        quantity: 2,
        price: 17,
        purchasedOn: "2026-08-14",
        sources: {
          "product.density": { source: "spoolmandb", sourceRef: "sunlu_wood_walnutwood_1000_175_p" },
          "spool.price": { source: "manual" },
        },
      })
      .expect(201);
    expect(res.body.spools).toHaveLength(2);
    const spool = res.body.spools[0];
    expect(spool.product.displayName).toBe("Sunlu PLA Wood Walnut");
    expect(spool.product.colorHex).toBe("#5A4741");

    const detail = await request(app).get(`/api/spools/${spool.id}`).expect(200);
    expect(detail.body.sources.product.density).toMatchObject({ source: "spoolmandb", value: 1.25 });
    expect(detail.body.sources.spool.price).toMatchObject({ source: "manual", value: 17 });
    expect(detail.body.siblings).toHaveLength(1);

    await request(app).post("/api/spools").send({ product: { ...walnut, vendor: "SUNLU", colorName: "Cherry" } }).expect(201);
    const vendors = await request(app).get("/api/vendors").expect(200);
    expect(vendors.body.vendors).toHaveLength(1);
  });

  it("finds an existing product match for intake", async () => {
    await request(app).post("/api/spools").send({ product: walnut }).expect(201);
    const match = await request(app)
      .get("/api/products/match")
      .query({ vendor: "sunlu", material: "PLA", line: "wood", colorName: "walnut" })
      .expect(200);
    expect(match.body.product?.displayName).toBe("Sunlu PLA Wood Walnut");
  });

  it("validates input", async () => {
    const res = await request(app).post("/api/spools").send({ price: 3 }).expect(400);
    expect(res.body.error).toBe("Invalid request");
    await request(app).post("/api/spools").send({ product: { ...walnut, colorHex: "nope" } }).expect(400);
    await request(app).get("/api/spools/999").expect(404);
  });

  it("archives a spool and hides it from the default list", async () => {
    const created = await request(app).post("/api/spools").send({ product: walnut }).expect(201);
    const id = created.body.spools[0].id;
    await request(app).patch(`/api/spools/${id}`).send({ archived: true }).expect(200);
    expect((await request(app).get("/api/spools")).body.spools).toHaveLength(0);
    expect((await request(app).get("/api/spools?archived=1")).body.spools).toHaveLength(1);
  });
});
