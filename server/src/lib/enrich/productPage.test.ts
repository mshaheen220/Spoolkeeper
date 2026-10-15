import { describe, expect, it } from "vitest";
import { extractFromText, htmlToText, jsonLdProducts } from "./productPage";

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
