import { describe, expect, it } from "vitest";
import { cleanColor, extractFromText, extractIdentity, extractLooks, htmlToText, jsonLdProducts } from "./productPage";

const ref = "https://example.com/products/wood-pla";
const values = (text: string) => Object.fromEntries(extractFromText(text, ref).map((s) => [s.field, s.value]));

describe("product page parsing", () => {
  it("reads typical spec lists", () => {
    expect(
      values(`Specifications
Printing Temperature: 190-220°C
Bed Temperature: 50-65°C
Printing Speed: 40-100mm/s
Density: 1.25 g/cm3
Drying: 50℃ for 4-6 hours`),
    ).toEqual({
      nozzleMin: 190,
      nozzleMax: 220,
      bedMin: 50,
      bedMax: 65,
      speedNote: "Printing Speed: 40-100mm/s",
      dryTempC: 50,
      dryHours: 6,
      density: 1.25,
    });
  });

  it("handles ℃ ranges with tildes and single values", () => {
    expect(values("Nozzle temp 200℃~230℃, Heated bed 60℃")).toMatchObject({ nozzleMin: 200, nozzleMax: 230, bedMin: 60, bedMax: 60 });
    expect(values("Extrusion Temperature 210 °C")).toMatchObject({ nozzleMin: 210, nozzleMax: 210 });
  });

  it("reads Polymaker's ring-above degree sign", () => {
    expect(values("Printing Temperature: 190˚C - 230˚C Bed Temperature: 25˚C - 60˚C")).toMatchObject({ nozzleMin: 190, nozzleMax: 230, bedMin: 25, bedMax: 60 });
  });

  it("rejects implausible numbers instead of guessing", () => {
    expect(values("Increase bed temperature in 5–10 °C steps")).toEqual({});
    expect(values("Printing temperature: 999-1200°C. Bed temp 400°C")).toEqual({});
    expect(values("Ships in 3-5 days. 1kg spool.")).toEqual({});
  });

  it("keeps the source snippet", () => {
    const [s] = extractFromText("Great filament. Printing Temperature: 190-220°C for best results", ref);
    expect(s.note).toContain("Printing Temperature: 190-220°C");
    expect(s.sourceRef).toBe(ref);
  });

  it("extracts JSON-LD products and plain text", () => {
    const html = `<html><script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Wood PLA","gtin13":"6936601204540"}]}</script>
      <style>.x{}</style><p>Bed&nbsp;temp: 55&deg;C</p></html>`;
    expect(jsonLdProducts(html)[0]).toMatchObject({ name: "Wood PLA", gtin13: "6936601204540" });
    expect(htmlToText(html)).toContain("Bed temp: 55°C");
  });
});

describe("Ziro Fast Gradient Twinkling Translucent - Rose (real product text)", () => {
  // From ziro3d.com's Shopify product JSON, 2026-10-16 - note the encoding-mangled "?C".
  const title = "ZIRO Fast Gradient Twinkling Translucent PLA Filament 1.75mm, Flower Series-Rose";
  const body = `[ZIRO Flower Series]- The ZIRO "Rose" combined multiple bright colors with sparkling translucent feature. Higher-cost production technology to achieve the true faster color changing aim. The twinkle & translucent PLA base offers a stuning and dazzling look.
[Hight Quality PLA]- Completely drying for 24hrs before vacuum seal.
[1.75MM Filament Accuracy ]- Suggested printing settings, nozzle: 190-220?C, bed: 50-60?C, speed: 30-90 mm/s
[Fits For Most FDM Printers]- Spool diameter: 7.99inch, spool width: 2.48inch, hub hole diameter: 2.36inch. (empty reel's weight is about 160-165 g)`;

  it("reads temperatures written with a mangled degree sign, speed and the empty reel weight", () => {
    expect(values(`${title}\n${body}`)).toEqual({
      nozzleMin: 190,
      nozzleMax: 220,
      bedMin: 50,
      bedMax: 60,
      speedNote: "speed: 30-90 mm/s",
      spoolWeightG: 163,
    });
  });

  it("doesn't mistake the factory drying note for drying advice", () => {
    expect(values(body)).not.toHaveProperty("dryTempC");
  });

  it("reads both finishes and the gradient", () => {
    const looks = Object.fromEntries(extractLooks(`${title}\n${body}`, ref).map((s) => [s.field, s]));
    expect(looks.finishes.value).toBe("Glitter,Translucent");
    expect(looks.finishes.note).toMatch(/twinkl|sparkl/);
    expect(looks.multiColorDirection.value).toBe("longitudinal");
  });

  it("tells side-by-side multi-color apart", () => {
    const looks = extractLooks("Silk PLA Dual Color Red & Blue, co-extruded", ref);
    expect(looks.map((s) => [s.field, s.value])).toEqual([
      ["finishes", "Silk"],
      ["multiColorDirection", "coaxial"],
    ]);
  });

  it("still ignores 'nozzle: 0.4 mm'", () => {
    expect(values("Compatible nozzle: 0.4 mm and up")).toEqual({});
  });
});

describe("brand, type and color from store data", () => {
  // Shapes from the real Shopify product JSON of these stores (trimmed).
  const polymaker = {
    title: "Polymaker Matte PLA",
    vendor: "Polymaker",
    options: [{ name: "Color", values: ["Matte Army Dark Green", "Matte Black"] }, { name: "Size" }],
    variants: [
      { id: 43631458549817, option1: "Matte Army Dark Green", option2: "1.75mm 1kg" },
      { id: 2, option1: "Matte Black", option2: "1.75mm 1kg" },
    ],
  };
  const read = (shopify: object | null, url: string, known: string[] = [], ld: object | null = null) =>
    extractIdentity({ shopify, ld, url: new URL(url) }, known);
  const fields = (r: ReturnType<typeof read>) => Object.fromEntries(r.suggestions.map((s) => [s.field, s.value]));

  it("reads the linked variant's color, the brand and the type", () => {
    expect(fields(read(polymaker, "https://shop.polymaker.com/products/matte-pla?variant=43631458549817"))).toEqual({
      vendor: "Polymaker",
      material: "PLA",
      colorName: "Army Dark Green",
    });
  });

  it("won't guess the color when the link doesn't pick one", () => {
    const r = read(polymaker, "https://shop.polymaker.com/products/matte-pla");
    expect(fields(r).colorName).toBeUndefined();
    expect(r.warnings[0]).toMatch(/sells 2 colors/);
  });

  it("keeps your spelling of a brand you already have, and recognizes it in the site's address", () => {
    expect(fields(read({ title: "OVERTURE PLA", vendor: "Overture 3D" }, "https://overture3d.com/products/overture-pla", ["Overture"])).vendor).toBe("Overture");
    expect(fields(read(null, "https://www.sunlu.com/products/tpu-95a-flexible-filament", ["Sunlu"], { name: "SUNLU TPU 95A" }))).toMatchObject({
      vendor: "Sunlu",
      material: "TPU",
    });
    // Not a brand you have: the address alone isn't trusted.
    expect(fields(read(null, "https://www.sunlu.com/products/x", [], { name: "TPU" })).vendor).toBeUndefined();
  });

  it("takes JSON-LD brand and color on other stores", () => {
    expect(fields(read(null, "https://example.com/p", [], { name: "Eryone Silk PETG", brand: { name: "Eryone" }, color: "Gold" }))).toEqual({
      vendor: "Eryone",
      material: "PETG",
      colorName: "Gold",
    });
  });

  it("strips weights, sizes, materials and finishes from color names", () => {
    expect(cleanColor("1kg Silk Dual-Color Blue Purple")).toBe("Dual-Color Blue Purple");
    expect(cleanColor("Matte Army Dark Green")).toBe("Army Dark Green");
    expect(cleanColor("Rose / 1.75mm")).toBe("Rose");
    expect(cleanColor("Fast Gradient Twinkling Translucent Rose")).toBe("Fast Gradient Twinkling Translucent Rose");
  });
});
