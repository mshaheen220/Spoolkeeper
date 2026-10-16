import { describe, expect, it } from "vitest";
import { extractFromText, findDatasheetLinks, isPdfUrl } from "./productPage";

const ref = "https://example.com/tds.pdf";
const values = (text: string) => Object.fromEntries(extractFromText(text, ref).map((s) => [s.field, s.value]));

// Text as flattened from Sunlu's TPU 95A page and its technical datasheet PDF (2026-10-16).
const SUNLU_PAGE = `Shore hardness 95A, combining flexibility and toughness
Nozzle Temperature & Print Speed
190-210℃/50-80mm/s
210-230℃/80-120mm/s
Bed Temperature
50-60℃
Retraction Speed
30-40mm/s`;

const SUNLU_TDS = `Product Name: TPU 95A
Shore Hardness ISO 868 23℃ HA/HD 95
Thermal
(X-Y) Heat Distortion (HDT) ISO 75 0.45 MPa ℃ /
Melt Mass-flow Rate ISO 1133 190℃/2.16 kg g/10 min 28±3
Density ISO 1183 23℃ g/cm3 1.21
Recommended Printing Parameters
Parameters Range
Nozzle Temp.
Temperature
℃
Speed
mm/s
190-210 50-80
210-230 80-120
Plate Temp. 50-60℃
Plate Material Textured PEI Build Plate
Plate Treatment No processing required
Cooling Fan Open/Close
Raft Distance 0.2-0.4mm
Retraction Distance 0.8-1.2mm
Retraction Speed 30-40mm/s
Room Temp. Room Temperature
Drying Temp. 50-60℃
[1] Test specimens were printed at a printing speed of 45mm/s and a printing temperature of 230 °C.`;

describe("spec tables with labels and values on separate lines", () => {
  it("reads Sunlu's product page table, including the speed tiers", () => {
    expect(values(SUNLU_PAGE)).toEqual({
      nozzleMin: 190,
      nozzleMax: 230,
      bedMin: 50,
      bedMax: 60,
      shoreHardness: 95,
      shoreScale: "A",
      speedNote: "Speed: 190–210 °C at 50–80 mm/s, 210–230 °C at 80–120 mm/s",
    });
  });

  it("reads Sunlu's technical datasheet", () => {
    expect(values(SUNLU_TDS)).toEqual({
      nozzleMin: 190,
      nozzleMax: 230,
      bedMin: 50,
      bedMax: 60,
      dryTempC: 55,
      density: 1.21,
      shoreHardness: 95,
      shoreScale: "A",
      speedNote: "Speed: 190–210 °C at 50–80 mm/s, 210–230 °C at 80–120 mm/s · Plate: Textured PEI Build Plate · Retraction: 0.8–1.2 mm at 30–40 mm/s",
    });
  });

  it("keeps the drying range in the note and doesn't read the melt-flow test temperature as a nozzle temp", () => {
    const dry = extractFromText(SUNLU_TDS, ref).find((s) => s.field === "dryTempC");
    expect(dry?.note).toMatch(/50–60 °C/);
  });
});

describe("finding the datasheet link", () => {
  // Trimmed from Sunlu's page: anchors with aria-labels, the "TDS" heading text sitting beside the SDS link,
  // plus the same files again in embedded JSON, and unrelated certificate PDFs.
  const html = `Downloads<a class="downloads-item" href="https://media.sunlu.com/prod/20260330/e8b9.pdf?filename=TDS" aria-label="Download: TDS"><svg/></a>TDS
<a class="downloads-item" href="https://media.sunlu.com/prod/20260330/cdd3.pdf?filename=SDS" aria-label="Download: SDS"><svg/></a>SDS
<a class="downloads-item" href="https://media.sunlu.com/prod/20260330/92c5.pdf?filename=RoHS" aria-label="Download: RoHS"><svg/></a>
<script>{"file":"https://media.sunlu.com/prod/20251106/95fc.pdf","name":"SUNLU Filament Connector FC01 CE-EMC certificate"}</script>
<a href="/files/manual.pdf">User manual</a><a href="/docs/PLA-technical-data-sheet.pdf">Specs</a>`;

  it("picks the technical datasheets and skips safety sheets, certificates and manuals", () => {
    expect(findDatasheetLinks(html, new URL("https://www.sunlu.com/products/tpu"))).toEqual([
      "https://media.sunlu.com/prod/20260330/e8b9.pdf?filename=TDS",
      "https://www.sunlu.com/docs/PLA-technical-data-sheet.pdf",
    ]);
  });

  it("recognizes a pasted PDF link", () => {
    expect(isPdfUrl(new URL("https://media.sunlu.com/prod/x.pdf?filename=TDS"))).toBe(true);
    expect(isPdfUrl(new URL("https://www.sunlu.com/products/tpu"))).toBe(false);
  });
});

describe("Polymaker Panchroma Matte PLA (text as rendered in a browser and pasted)", () => {
  // From document.body.innerText of shop.polymaker.com/products/matte-pla, 2026-10-16 (trimmed).
  const POLYMAKER = `MATTE PASTEL BEIGE
Type
SPOOL (NEW PACKAGING)
Net Weight
1KG
TECHNICAL SPECIFICATIONS

Everything you need before you hit print
NOZZLE
190-230
°C
BED
25-60
°C
MAX SPEED
300
mm/s
ENCLOSURE
Not needed
DRYING
55°C
for 6h
COMPATIBILITY
☑
Good
Printing Tips
Use standard PLA settings, a 0.4 mm or larger nozzle, and full cooling for the best surface quality.
PROPERTY\tX-Y\tZ\tVALUE\tMETHOD
Density\t—\t—\t
1.37
g/cm³
\tISO 1183
Tensile strength\t
23.2
MPa`;

  it("reads the spec tiles and the properties table", () => {
    expect(values(POLYMAKER)).toEqual({
      nozzleMin: 190,
      nozzleMax: 230,
      bedMin: 25,
      bedMax: 60,
      dryTempC: 55,
      dryHours: 6,
      density: 1.37,
      speedNote: "MAX SPEED 300 mm/s · Enclosure: not needed",
    });
  });
});

describe("pasted page text", () => {
  it("reads like a fetched page and labels where it came from", async () => {
    const { readPastedText } = await import("./productPage");
    const c = readPastedText("Panchroma Matte PLA\nNOZZLE\n190-230\n°C\nBED\n25-60\n°C", "https://shop.polymaker.com/products/matte-pla");
    expect(c.title).toBe("Pasted text from shop.polymaker.com");
    const by = Object.fromEntries(c.suggestions.map((s) => [s.field, s]));
    expect(by.nozzleMin.value).toBe(190);
    expect(by.nozzleMin.note).toMatch(/^pasted:/);
    expect(by.finishes.value).toBe("Matte"); // short paste: looks are read
  });

  it("skips finishes on a whole-page paste, whose menus name other products", async () => {
    const { readPastedText } = await import("./productPage");
    const menus = "Shop: Silk PLA, Glow PLA, Wood PLA, Marble PLA\n".repeat(120);
    const c = readPastedText(`${menus}\nNOZZLE\n190-230\n°C`, undefined);
    expect(c.suggestions.some((s) => s.field === "finishes")).toBe(false);
    expect(c.warnings?.[0]).toMatch(/whole page/);
  });
});
