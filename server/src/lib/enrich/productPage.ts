import { listVendors } from "../../db/repo";
import { finishesFromText } from "../appearance";
import { materialFrom } from "../materials";
import { HttpError } from "../http";
import { fetchText } from "./fetch";
import { readPdfText } from "./pdf";
import type { Candidate, Suggestion } from "./types";

// Best-effort reading of a manufacturer/store product page. Pages vary
// wildly and many stores (Amazon especially) block bots, so this only ever
// produces suggestions, each carrying the snippet it was read from so the
// user can judge it. Nothing is guessed: no match means no suggestion.

const MAX_PAGE_BYTES = 4 * 1024 * 1024;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", deg: "°", ndash: "–", mdash: "—", ordm: "º" };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

interface JsonLdProduct {
  name?: string;
  description?: string;
  brand?: string | { name?: string };
  color?: string;
  material?: string;
  gtin13?: string;
  gtin12?: string;
  gtin?: string;
  additionalProperty?: { name?: string; value?: unknown }[];
}

/** Every schema.org Product in the page's JSON-LD blocks (including @graph arrays). */
export function jsonLdProducts(html: string): JsonLdProduct[] {
  const out: JsonLdProduct[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) out.push(obj as JsonLdProduct);
    if (obj["@graph"]) visit(obj["@graph"]);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1].trim()));
    } catch {
      // Malformed JSON-LD is common; skip the block.
    }
  }
  return out;
}

// ° (degree), º (ordinal), ˚ (ring above - Polymaker uses it), ℃, and "?C" -
// a degree sign mangled by a bad encoding (Ziro's store prints "190-220?C").
const DEG_SIGN = "(?:°|º|˚|℃|\\?(?=\\s*C))";
const DEG = `\\s*(?:${DEG_SIGN}|deg(?:rees)?)?\\s*C?`;
const TO = "\\s*(?:-|–|—|~|to)\\s*";

function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + length + 50);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

// Spec tables (on pages and in PDF datasheets) put the label and its value
// on different lines once flattened to text: "Bed Temperature\n50-60℃". So
// the label-to-value gap may span lines, but it may not contain digits, and
// every value is range-checked.
const GAP = "[^0-9]{0,40}?";
const RANGE_OF_3 = `(\\d{3})${DEG}${TO}(\\d{3})${DEG}`;

const fmtRange = (a: number, b: number, unit: string) => (a === b ? `${a} ${unit}` : `${a}–${b} ${unit}`);

/** Pull temperatures, speed, drying, density, Shore hardness and print advice out of product or datasheet text. */
export function extractFromText(text: string, ref: string): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (field: Suggestion["field"], value: number | string, m: RegExpMatchArray, note?: string) =>
    out.push({ field, value, source: "product_url", sourceRef: ref, note: note ?? `“${snippet(text, m.index ?? 0, m[0].length)}”` });
  const notes: string[] = []; // the maker's printing advice, gathered into one note

  // Nozzle: "Printing Temperature: 190-220°C", "Nozzle temp 200℃~230℃", "Extrusion Temperature 210 °C",
  // "nozzle: 190-220?C", and tiered tables ("Nozzle Temperature & Print Speed\n190-210℃/50-80mm/s\n
  // 210-230℃/80-120mm/s"). Three-digit values in a plausible range only, so "nozzle: 0.4 mm" can't match.
  const NOZZLE = "(?:(?:print(?:ing)?|extru(?:der|sion|ding))\\s*temp(?:erature)?s?|nozzle(?:\\s*temp(?:erature)?s?)?)";
  const nozzleRange = text.match(new RegExp(`${NOZZLE}${GAP}${RANGE_OF_3}`, "i"));
  if (nozzleRange && inRange(+nozzleRange[1], 150, 350) && inRange(+nozzleRange[2], 150, 350)) {
    // Further rows right below are tiers of the same table (hotter for faster printing).
    const start = (nozzleRange.index ?? 0) + nozzleRange[0].length;
    const window = text.slice(nozzleRange.index ?? 0, start + 120);
    const temps = [...window.matchAll(new RegExp(RANGE_OF_3, "gi"))]
      .flatMap((m) => [+m[1], +m[2]])
      .filter((n) => inRange(n, 150, 350));
    add("nozzleMin", Math.min(...temps), nozzleRange);
    add("nozzleMax", Math.max(...temps), nozzleRange);
    const tiers = [...window.matchAll(new RegExp(`${RANGE_OF_3}\\s*[/|,]?\\s*(\\d{2,3})${TO}(\\d{2,3})\\s*(?:mm\\s*\\/\\s*s)?`, "gi"))]
      .filter((m) => inRange(+m[1], 150, 350) && inRange(+m[3], 5, 1000))
      .map((m) => `${m[1]}–${m[2]} °C at ${m[3]}–${m[4]} mm/s`);
    if (tiers.length) notes.push(`Speed: ${tiers.join(", ")}`);
  } else {
    const single = text.match(new RegExp(`${NOZZLE}${GAP}(\\d{3})${DEG}`, "i"));
    if (single && inRange(+single[1], 150, 350)) {
      add("nozzleMin", +single[1], single);
      add("nozzleMax", +single[1], single);
    }
  }

  // Bed: "Bed Temperature: 50-65°C", "Bed Temperature\n50-60℃", "Plate Temp. 50-60℃", "Heated bed 60℃"
  // Without the word "temp", require a degree sign so "plate 1 of 2" isn't read as a temperature.
  const bed =
    text.match(new RegExp(`(?:heat(?:ed|ing)?\\s*)?(?:bed|plate|platform)\\s*temp(?:erature)?s?\\.?${GAP}(\\d{1,3})${DEG}(?:${TO}(\\d{1,3})${DEG})?`, "i")) ??
    // "bed: 50-60?C": a range needs the degree sign only after its second number.
    text.match(new RegExp(`(?:heat(?:ed|ing)?\\s*)?(?:bed|plate|platform)[\\s:]{0,3}(\\d{2,3})(?:\\s*${DEG_SIGN}\\s*C?)?${TO}(\\d{2,3})\\s*${DEG_SIGN}\\s*C?`, "i")) ??
    text.match(new RegExp(`(?:heat(?:ed|ing)?\\s*)?(?:bed|plate|platform)[\\s:]{0,3}(\\d{2,3})\\s*${DEG_SIGN}\\s*C?`, "i"));
  const bedLo = bed ? Math.min(+bed[1], bed[2] ? +bed[2] : +bed[1]) : NaN;
  const bedHi = bed ? Math.max(+bed[1], bed[2] ? +bed[2] : +bed[1]) : NaN;
  // A real bed spec tops out at 35 °C or more; "raise bed temp in 5–10 °C steps" doesn't.
  if (bed && inRange(bedLo, 0, 130) && inRange(bedHi, 35, 130)) {
    add("bedMin", bedLo, bed);
    add("bedMax", bedHi, bed);
  }
  const plate = text.match(/(?:plate|bed)\s*(?:material|surface|type)\s*:?\s*([A-Za-z][A-Za-z ]{2,40}?(?:PEI|plate|glass|PEO|PET)[A-Za-z ]{0,20})/i);
  if (plate) notes.push(`Plate: ${plate[1].trim()}`);

  // Speed: "Printing speed: 30-300mm/s", or a spec tile "MAX SPEED\n300\nmm/s" (a tiered table above takes precedence).
  // The unit must follow the number, so "Speed\nmm/s\n190-210 50-80" can't be misread.
  const speed = text.match(/(?:(?:print(?:ing)?|max(?:imum)?)\s*)?speed[^0-9]{0,25}?(\d{1,4})\s*(?:(?:-|–|~|to)\s*(\d{1,4})\s*)?mm\s*\/\s*s/i);
  if (speed && !notes.some((n) => n.startsWith("Speed"))) notes.push(speed[0].replace(/\s+/g, " ").trim());

  // Retraction advice - there's no product field for it, but it's worth keeping for calibration.
  const retLen = text.match(new RegExp(`retraction\\s*(?:distance|length)${GAP}(\\d(?:\\.\\d+)?)(?:${TO}(\\d(?:\\.\\d+)?))?\\s*mm(?!\\s*\\/)`, "i"));
  const retSpeed = text.match(new RegExp(`retraction\\s*speed${GAP}(\\d{1,3})(?:${TO}(\\d{1,3}))?\\s*mm\\s*\\/\\s*s`, "i"));
  // Enclosure advice ("ENCLOSURE\nNot needed") matters for warping-prone materials.
  const enclosure = text.match(/enclosure\s*:?\s*(not needed|not required|required|recommended|optional)\b/i);
  if (enclosure) notes.push(`Enclosure: ${enclosure[1].toLowerCase()}`);

  if (retLen && inRange(+retLen[1], 0, 10))
    notes.push(`Retraction: ${fmtRange(+retLen[1], retLen[2] ? +retLen[2] : +retLen[1], "mm")}${retSpeed ? ` at ${fmtRange(+retSpeed[1], retSpeed[2] ? +retSpeed[2] : +retSpeed[1], "mm/s")}` : ""}`);

  // Drying: "Drying: 50°C for 4-6 hours", "dry at 55℃ 6h", a tile "DRYING\n55°C\nfor 6h" - or just
  // "Drying Temp. 50-60℃" with no time. A degree sign is required, so "dried for 24hrs" can't match.
  const dry = text.match(/dry(?:ing|ed)?\b[^0-9]{0,30}(\d{2,3})\s*(?:°|º|˚|℃)\s*C?[^0-9]{0,25}(\d{1,2}(?:\.\d)?)(?:\s*(?:-|–|~|to)\s*(\d{1,2}(?:\.\d)?))?\s*(?:h|hr|hrs|hours?)\b/i);
  if (dry && inRange(+dry[1], 30, 120)) {
    add("dryTempC", +dry[1], dry);
    const hours = dry[3] ? +dry[3] : +dry[2];
    if (inRange(hours, 1, 48)) add("dryHours", hours, dry);
  } else {
    // Requires the label "drying temp", so a factory note like "dried for 24hrs before sealing" can't match.
    const dryTemp = text.match(new RegExp(`dry(?:ing)?\\s*temp(?:erature)?\\.?${GAP}(\\d{2,3})${DEG}(?:${TO}(\\d{2,3})${DEG})?`, "i"));
    if (dryTemp && inRange(+dryTemp[1], 30, 120)) {
      const lo = +dryTemp[1];
      const hi = dryTemp[2] ? +dryTemp[2] : lo;
      if (inRange(hi, 30, 120)) add("dryTempC", Math.round((lo + hi) / 2 / 5) * 5, dryTemp, `maker says ${fmtRange(lo, hi, "°C")} - “${snippet(text, dryTemp.index ?? 0, dryTemp[0].length)}”`);
    }
  }

  // "empty reel's weight is about 160-165 g", "spool weight: 130g"
  const spool = text.match(/(?:empty\s+(?:reel|spool)(?:'s|’s)?\s+weight|(?:reel|spool)\s+weight)[^0-9\n]{0,25}(\d{2,3})(?:\s*(?:-|–|~|to)\s*(\d{2,3}))?\s*g\b/i);
  if (spool) {
    const lo = +spool[1];
    const hi = spool[2] ? +spool[2] : lo;
    if (inRange(lo, 40, 400) && inRange(hi, 40, 400)) add("spoolWeightG", Math.round((lo + hi) / 2), spool);
  }

  // Density: "Density: 1.24 g/cm3", or datasheet rows with the unit first - "Density ISO 1183 23℃ g/cm3 1.21".
  const density =
    text.match(/density[^0-9]{0,25}(\d\.\d{1,3})\s*g\s*\/\s*cm/i) ??
    text.match(/density\b[^\n]{0,60}?g\s*\/\s*cm(?:3|³)\)?[^0-9]{0,20}(\d\.\d{1,3})/i);
  if (density && inRange(+density[1], 0.8, 2.5)) add("density", +density[1], density);

  // Shore hardness: "Shore hardness 95A", or a datasheet row "Shore Hardness ISO 868 23℃ HA/HD 95".
  const shoreExplicit = text.match(/shore\s*(?:hardness)?[^0-9\n]{0,15}(\d{2,3})\s*([AD])\b/i);
  const shoreTable = text.match(/shore\s*hardness[^\n]{0,40}?\bH([AD])(?:\s*\/\s*H[AD])?\b[^0-9\n]{0,15}(\d{2,3})\b/i);
  if (shoreExplicit && inRange(+shoreExplicit[1], 10, 100)) {
    add("shoreHardness", +shoreExplicit[1], shoreExplicit);
    add("shoreScale", shoreExplicit[2].toUpperCase(), shoreExplicit);
  } else if (shoreTable && inRange(+shoreTable[2], 10, 100)) {
    add("shoreHardness", +shoreTable[2], shoreTable);
    add("shoreScale", shoreTable[1].toUpperCase(), shoreTable, `unit column lists H${shoreTable[1]} first - “${snippet(text, shoreTable.index ?? 0, shoreTable[0].length)}”`);
  }

  if (notes.length) out.push({ field: "speedNote", value: notes.join(" · "), source: "product_url", sourceRef: ref, note: "the maker's printing advice" });
  return out;
}

function inRange(n: number, lo: number, hi: number) {
  return Number.isFinite(n) && n >= lo && n <= hi;
}

/**
 * Finishes and multi-color layout from the product's own title and
 * description (not the whole page - store menus list other products'
 * "Silk PLA", "Matte PLA"...). Each comes with the words it was read from.
 */
export function extractLooks(productText: string, ref: string): Suggestion[] {
  const out: Suggestion[] = [];
  const finishes = finishesFromText(productText);
  if (finishes.length) {
    const words = [...new Set(productText.match(/\b(silk\w*|matte?|glossy|marble\w*|glitter\w*|sparkl\w*|twinkl\w*|shimmer\w*|galaxy|glow\w*|translucent|transparent|iridescent|pearl\w*|wood\w*|carbon fib\w+)\b/gi)?.map((w) => w.toLowerCase()) ?? [])];
    out.push({ field: "finishes", value: finishes.join(","), source: "product_url", sourceRef: ref, note: `from “${words.slice(0, 5).join("”, “")}” in the description` });
  }
  // Side by side (dual/tri-color, co-extruded) vs. changing along the length (gradient, rainbow, color-changing).
  const coax = productText.match(/\b(dual[- ]colou?r|tri[- ]colou?r|two[- ]tone|three[- ]colou?r|co-?extru\w*)/i);
  const along = productText.match(/\b(gradient|rainbow|colou?r[- ]?(?:changing|change|shift\w*)|multi[- ]?colou?r(?:ed)?)/i);
  const dir = coax ? { value: "coaxial", m: coax } : along ? { value: "longitudinal", m: along } : null;
  if (dir)
    out.push({
      field: "multiColorDirection",
      value: dir.value,
      source: "product_url",
      sourceRef: ref,
      note: `“${snippet(productText, dir.m.index ?? 0, dir.m[0].length)}” - set its colors in the color editor`,
    });
  return out;
}

const DATASHEET = /\b(tds|technical[\s_-]*data(?:[\s_-]*sheets?)?|data[\s_-]*sheets?|datasheets?|spec(?:ification)?s?[\s_-]*sheet)\b/i;
// Safety sheets, compliance certificates and manuals are PDFs too, but say nothing about printing.
const NOT_DATASHEET = /\b(m?sds|safety|rohs|reach|certificates?|cert|ce|emc|lvd|fcc|manual|warranty|invoice)\b/i;

export const isPdfUrl = (u: URL) => /\.pdf$/i.test(u.pathname);

/**
 * Technical datasheet PDFs linked from a product page, best first. Each
 * link is judged only by its own URL, title/aria-label and text - store
 * pages often put the next link's heading right beside it.
 */
export function findDatasheetLinks(html: string, base: URL): string[] {
  const found: { url: string; score: number }[] = [];
  const consider = (href: string, label: string) => {
    let u: URL;
    try {
      u = new URL(href.replace(/&amp;/g, "&"), base);
    } catch {
      return;
    }
    if (!/^https?:$/.test(u.protocol) || !isPdfUrl(u)) return;
    const own = `${decodeURIComponent(u.search)} ${decodeURIComponent(u.pathname.split("/").pop() ?? "")} ${label}`;
    if (NOT_DATASHEET.test(own)) return;
    const score = DATASHEET.test(own) ? 2 : 0;
    if (score) found.push({ url: u.toString(), score });
  };
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]{0,400}?)<\/a>/gi)) {
    const href = m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const attrs = [...m[1].matchAll(/\b(?:aria-label|title|download)\s*=\s*["']([^"']*)["']/gi)].map((a) => a[1]).join(" ");
    consider(href, `${attrs} ${htmlToText(m[2])}`);
  }
  // Links that only exist in embedded JSON (common on JS-rendered stores): judge by the URL alone.
  for (const m of html.matchAll(/https?:\/\/[^"'\s<>\\]+\.pdf(?:\?[^"'\s<>\\]*)?/gi)) consider(m[0], "");
  return [...new Map(found.sort((a, b) => b.score - a.score).map((f) => [f.url, f])).keys()];
}

/** Read a datasheet PDF: the same spec extraction as pages, labelled as coming from the datasheet. */
async function datasheetSuggestions(pdfUrl: string): Promise<Suggestion[]> {
  const text = await readPdfText(pdfUrl);
  const found = extractFromText(text, pdfUrl).map((s) => ({ ...s, note: s.note ? `datasheet: ${s.note}` : "from the datasheet" }));
  found.push({ field: "datasheetUrl", value: pdfUrl, source: "product_url", sourceRef: pdfUrl, note: "technical datasheet" });
  return found;
}

/** Page and datasheet both describe printing advice; keep every distinct part instead of only the first. */
function mergeNotes(list: Suggestion[]): Suggestion[] {
  const notes = list.filter((s) => s.field === "speedNote");
  if (notes.length < 2) return list;
  const parts = [...new Set(notes.flatMap((n) => String(n.value).split(" · ")))];
  const merged = { ...notes[0], value: parts.join(" · "), note: "the maker's printing advice (page and datasheet)" };
  return [merged, ...list.filter((s) => s.field !== "speedNote")];
}

const PASTE_LOOKS_LIMIT = 4000;

/**
 * Text the user copied from a page in their own browser - the fallback for
 * stores that block automated requests or build their spec tables with
 * scripts. Same extraction as a fetched page. Finishes and color layout are
 * only read from a short paste (the spec section): a whole copied page
 * includes the store's menus ("Silk PLA", "Matte PLA"...), which would
 * suggest finishes this filament doesn't have.
 */
export function readPastedText(text: string, pageUrl?: string): Candidate {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  const ref = pageUrl?.trim() || "pasted page text";
  const note = (s: Suggestion) => ({ ...s, note: s.note ? `pasted: ${s.note}` : "pasted page text" });
  const found = extractFromText(clean, ref).map(note);
  const warnings: string[] = [];
  if (clean.length <= PASTE_LOOKS_LIMIT) found.push(...extractLooks(clean, ref).map(note));
  else warnings.push("That was a whole page, so finishes and color layout weren't read from it - store menus mention other products. Set those yourself, or paste just the product description.");
  return {
    source: "product_url",
    id: `pasted:${ref}`,
    title: pageUrl ? `Pasted text from ${(() => { try { return new URL(pageUrl).hostname; } catch { return "the page"; } })()}` : "Pasted page text",
    sourceRef: pageUrl ?? null,
    score: 50,
    suggestions: dedupeByField(mergeNotes(found)),
    warnings,
  };
}

/** The parts of Shopify's /products/<handle>.json that matter here. */
export interface ShopifyProduct {
  title?: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  options?: { name?: string; values?: string[] }[];
  variants?: { id?: number; title?: string; option1?: string | null; option2?: string | null; option3?: string | null }[];
}

/** Shopify stores expose clean product data at /products/<handle>.json. */
async function shopifyProduct(url: URL): Promise<ShopifyProduct | null> {
  const m = url.pathname.match(/\/products\/([^/?#]+)/);
  if (!m) return null;
  try {
    const raw = await fetchText(`${url.origin}/products/${m[1]}.json`, { accept: "application/json", maxBytes: MAX_PAGE_BYTES });
    return (JSON.parse(raw) as { product?: ShopifyProduct }).product ?? null;
  } catch {
    return null;
  }
}

/** Brand names compared loosely: "Overture 3D" is your "Overture", "SUNLU Official" is "Sunlu". */
function brandKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(3d|official|store|shop|filaments?|technology|tech|inc|ltd|co)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * A variant's color without what other fields hold: "1kg Silk Dual-Color
 * Blue Purple" -> "Dual-Color Blue Purple", "Matte Army Dark Green" ->
 * "Army Dark Green". Finish words go (Finish has its own field); words that
 * are part of a color's look, like Translucent, stay.
 */
export function cleanColor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\b\d+(\.\d+)?\s*(kg|g|mm)\b/gi, " ")
    .replace(/\b(PLA\+?|PLA-CF|PETG|TPU|ABS|ASA|PA|PC|HIPS|PVA|silk|matte?|glossy|marble|glitter|sparkle|filament|spool|roll|refill)\b/gi, " ")
    .replace(/^[\s/|,-]+|[\s/|,-]+$/g, "")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

/**
 * Brand, material and color from the store's structured data (Shopify's
 * product JSON, schema.org JSON-LD), not from prose. Color only comes from
 * the variant the link points at (?variant=...) or a product with a single
 * color - a page listing twelve colors doesn't say which spool you bought.
 * A brand you already have keeps your spelling ("SUNLU" -> "Sunlu").
 */
export function extractIdentity(
  opts: { shopify?: ShopifyProduct | null; ld?: JsonLdProduct | null; pageTitle?: string; url: URL },
  knownVendors: string[] = [],
): { suggestions: Suggestion[]; warnings: string[] } {
  const { shopify, ld, pageTitle, url } = opts;
  const ref = url.toString();
  const out: Suggestion[] = [];
  const warnings: string[] = [];
  const add = (field: Suggestion["field"], value: string | null | undefined, note: string) => {
    const v = value?.replace(/\s+/g, " ").trim();
    if (v) out.push({ field, value: v, source: "product_url", sourceRef: ref, note });
  };

  // Brand. Shopify's vendor is the brand on a maker's own store; JSON-LD names it outright.
  // Failing both, a brand you already have that the site's address names (sunlu.com -> Sunlu).
  const ldBrand = typeof ld?.brand === "string" ? ld.brand : ld?.brand?.name;
  const brand = (shopify?.vendor || ldBrand)?.trim();
  if (brand) {
    const known = knownVendors.find((v) => brandKey(v) === brandKey(brand));
    add("vendor", known ?? brand, known && known !== brand ? `the store says “${brand}”` : "from the store's product data");
  } else {
    const host = url.hostname.toLowerCase().replace(/[^a-z0-9.]/g, "");
    const known = knownVendors.find((v) => brandKey(v).length >= 4 && host.split(".").some((part) => part === brandKey(v) || part === `${brandKey(v)}3d`));
    if (known) add("vendor", known, `from the site's address (${url.hostname})`);
  }

  // Material: a type named in the product's own fields, title first.
  const title = shopify?.title ?? ld?.name ?? pageTitle;
  add("material", materialFrom(ld?.material, title, shopify?.product_type), "named in the product title");

  // Color: the linked variant's color option, or the only color there is.
  if (shopify?.variants?.length) {
    const colorIdx = (shopify.options ?? []).findIndex((o) => /colou?r|shade/i.test(o.name ?? ""));
    const variantId = url.searchParams.get("variant");
    const variant = shopify.variants.find((v) => String(v.id) === variantId) ?? (shopify.variants.length === 1 ? shopify.variants[0] : undefined);
    const optionOf = (v: NonNullable<typeof variant>, i: number) => [v.option1, v.option2, v.option3][i];
    if (variant && colorIdx >= 0) add("colorName", cleanColor(optionOf(variant, colorIdx)), "the color of the variant in the link");
    else if (variant && (shopify.options?.length ?? 0) <= 1 && variant.title && variant.title !== "Default Title")
      add("colorName", cleanColor(variant.title), "the variant in the link");
    else if (!variant && colorIdx >= 0 && (shopify.options![colorIdx].values?.length ?? 0) > 1)
      warnings.push(
        `This page sells ${shopify.options![colorIdx].values!.length} colors and the link doesn't say which, so no color was read. Pick your color on the page and copy the link again (it then ends in ?variant=…), or type the color.`,
      );
  } else if (ld?.color) add("colorName", cleanColor(ld.color), "from the page's product data");

  return { suggestions: out, warnings };
}

export async function readProductPage(rawUrl: string): Promise<Candidate> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(400, "That isn't a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new HttpError(400, "Only http(s) product pages can be read");

  // A datasheet PDF pasted directly.
  if (isPdfUrl(url)) {
    const suggestions = dedupeByField(mergeNotes(await datasheetSuggestions(url.toString())));
    return { source: "product_url", id: url.toString(), title: `Datasheet (${url.hostname})`, sourceRef: url.toString(), score: 50, suggestions };
  }

  let html = "";
  let pageError: unknown = null;
  try {
    html = await fetchText(url.toString(), { accept: "text/html", maxBytes: MAX_PAGE_BYTES });
  } catch (err) {
    pageError = err;
  }
  const shopifyRaw = await shopifyProduct(url);
  const shopify = shopifyRaw ? { title: shopifyRaw.title, text: htmlToText(shopifyRaw.body_html ?? "") } : null;
  if (!html && !shopify) {
    const reason = pageError instanceof Error ? pageError.message : "no response";
    throw new HttpError(502, `Couldn't read that page (${reason}). Many stores block automated requests; enter the values from the box instead.`);
  }

  const warnings: string[] = [];
  if (!html) {
    const reason = pageError instanceof Error ? pageError.message.replace(/^.*returned /, "") : "no response";
    warnings.push(
      `The page itself was blocked (${reason}), so only the store's short product data was read. For the full specs, copy the page's text in your browser and use “Paste page text”.`,
    );
  }

  const products = jsonLdProducts(html);
  const ld = products[0];
  const corpus = [
    shopify?.text,
    ld?.description,
    ...(ld?.additionalProperty ?? []).map((p) => `${p.name}: ${String(p.value)}`),
    htmlToText(html),
  ]
    .filter(Boolean)
    .join("\n");

  const ref = url.toString();
  const pageTitle = shopify?.title ?? ld?.name ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
  const productText = [pageTitle, shopify?.text, ld?.description].filter(Boolean).join("\n");
  const identity = extractIdentity(
    { shopify: shopifyRaw, ld, pageTitle: htmlToText(pageTitle), url },
    listVendors().map((v) => v.name),
  );
  warnings.push(...identity.warnings);
  const pageFound = [...identity.suggestions, ...extractFromText(corpus, ref), ...extractLooks(productText, ref)];
  // Many makers keep the real numbers in a linked technical datasheet (TDS) PDF; read the first one
  // too. The page's own values come first; the datasheet fills in what the page didn't say.
  const sheet = findDatasheetLinks(html, url)[0];
  let sheetFound: Suggestion[] = [];
  if (sheet) {
    try {
      sheetFound = await datasheetSuggestions(sheet);
    } catch (err) {
      // An unreadable or blocked PDF shouldn't lose what the page itself gave.
      warnings.push(`Found a datasheet but couldn't read it (${err instanceof Error ? err.message : "error"}): ${sheet}`);
    }
  }
  const suggestions = dedupeByField(mergeNotes([...pageFound, ...sheetFound]));
  const gtin = ld?.gtin13 ?? ld?.gtin12 ?? ld?.gtin;
  if (gtin) suggestions.push({ field: "gtin", value: String(gtin), source: "product_url", sourceRef: ref, note: "from the page's product data" });

  const title = shopify?.title ?? ld?.name ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? url.hostname;
  const shown = htmlToText(title).slice(0, 120) + (sheetFound.length ? " + datasheet" : "");
  return { source: "product_url", id: ref, title: shown, sourceRef: ref, score: 50, suggestions, warnings };
}

/** The corpus repeats itself (Shopify JSON + page HTML); keep the first hit per field. */
function dedupeByField(list: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.field) ? false : (seen.add(s.field), true)));
}
