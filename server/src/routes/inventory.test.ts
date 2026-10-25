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

  it("matches the same filament when line and color are split differently", async () => {
    await request(app).post("/api/spools").send({ product: { vendor: "Sunlu", material: "PETG", colorName: "Transparent Red" } }).expect(201);
    const match = await request(app)
      .get("/api/products/match")
      .query({ vendor: "SUNLU", material: "PETG", line: "Transparent", colorName: "Red" })
      .expect(200);
    expect(match.body.product?.displayName).toBe("Sunlu PETG Transparent Red");
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

describe("empty-spool weight from the shelf", () => {
  const add = (vendor: string, material: string, colorName: string, spoolWeightG?: number) =>
    request(app)
      .post("/api/spools")
      .send({ product: { vendor, material, colorName, spoolWeightG } })
      .expect(201);
  const guess = (q: string) => request(app).get(`/api/products/spool-weight?${q}`).expect(200).then((r) => r.body.guess);

  it("uses the brand's spools of the same material first, then the brand", async () => {
    await add("Sunlu", "PLA", "Black", 130);
    await add("Sunlu", "PLA", "White", 130);
    await add("Sunlu", "PLA", "Wood", 140);
    await add("Sunlu", "PETG", "Black", 163);
    await add("Sunlu", "PLA", "Gray"); // no weight recorded - ignored

    expect(await guess("vendor=sunlu&material=PLA")).toEqual({ value: 130, basis: "2 of your 3 Sunlu PLA filaments", others: [{ value: 140, count: 1 }] });
    expect(await guess("vendor=Sunlu&material=PETG")).toMatchObject({ value: 163, basis: "your other Sunlu PETG filament" });
    // No Sunlu TPU yet: fall back to every Sunlu spool.
    expect(await guess("vendor=Sunlu&material=TPU")).toMatchObject({ value: 130, basis: "2 of your 4 Sunlu filaments" });
    expect(await guess("vendor=Polymaker&material=PLA")).toBeNull();
  });
});
