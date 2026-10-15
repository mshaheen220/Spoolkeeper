import { HttpError } from "../http";
import { fetchText } from "./fetch";
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

// ° (degree), º (ordinal), ˚ (ring above - Polymaker uses it), ℃.
const DEG = "\\s*(?:°|º|˚|℃|deg(?:rees)?)?\\s*C?";
const TO = "\\s*(?:-|–|—|~|to)\\s*";

function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + length + 50);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

/** Pull temperatures, speed, drying and density out of product text. */
export function extractFromText(text: string, ref: string): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (field: Suggestion["field"], value: number | string, m: RegExpMatchArray) =>
    out.push({ field, value, source: "product_url", sourceRef: ref, note: `“${snippet(text, m.index ?? 0, m[0].length)}”` });

  // Nozzle: "Printing Temperature: 190-220°C", "Nozzle temp 200℃~230℃", "Extrusion Temperature 210 °C"
  const nozzleRange = text.match(
    new RegExp(`(?:print(?:ing)?|nozzle|extru(?:der|sion|ding))\\s*temp(?:erature)?s?[^0-9\\n]{0,20}(\\d{3})${DEG}${TO}(\\d{3})${DEG}`, "i"),
  );
  if (nozzleRange && inRange(+nozzleRange[1], 150, 350) && inRange(+nozzleRange[2], 150, 350)) {
    add("nozzleMin", Math.min(+nozzleRange[1], +nozzleRange[2]), nozzleRange);
    add("nozzleMax", Math.max(+nozzleRange[1], +nozzleRange[2]), nozzleRange);
  } else {
    const single = text.match(new RegExp(`(?:print(?:ing)?|nozzle|extru(?:der|sion|ding))\\s*temp(?:erature)?s?[^0-9\\n]{0,20}(\\d{3})${DEG}`, "i"));
    if (single && inRange(+single[1], 150, 350)) {
      add("nozzleMin", +single[1], single);
      add("nozzleMax", +single[1], single);
    }
  }

  // Bed: "Bed Temperature: 50-65°C", "Heated bed 60℃", "Platform temp 0-60"
  // Without the word "temp", require a degree sign so "plate 1 of 2" isn't read as a temperature.
  const bed =
    text.match(new RegExp(`(?:heat(?:ed|ing)?\\s*)?(?:bed|plate|platform)\\s*temp(?:erature)?s?[^0-9\\n]{0,20}(\\d{1,3})${DEG}(?:${TO}(\\d{1,3})${DEG})?`, "i")) ??
    text.match(/(?:heat(?:ed|ing)?\s*)?(?:bed|plate|platform)[\s:]{0,3}(\d{2,3})\s*(?:°|º|˚|℃)\s*C?(?:\s*(?:-|–|—|~|to)\s*(\d{2,3})\s*(?:°|º|˚|℃)\s*C?)?/i);
  const bedLo = bed ? Math.min(+bed[1], bed[2] ? +bed[2] : +bed[1]) : NaN;
  const bedHi = bed ? Math.max(+bed[1], bed[2] ? +bed[2] : +bed[1]) : NaN;
  // A real bed spec tops out at 35 °C or more; "raise bed temp in 5–10 °C steps" doesn't.
  if (bed && inRange(bedLo, 0, 130) && inRange(bedHi, 35, 130)) {
    const lo = bedLo;
    const hi = bedHi;
    add("bedMin", Math.min(lo, hi), bed);
    add("bedMax", Math.max(lo, hi), bed);
  }

  // Speed: kept verbatim - "Printing speed: 30-300mm/s", "recommended speed 50 mm/s"
  const speed = text.match(/(?:print(?:ing)?\s*)?speed[^0-9\n]{0,25}(\d{1,4})\s*(?:(?:-|–|~|to)\s*(\d{1,4})\s*)?mm\s*\/\s*s/i);
  if (speed) add("speedNote", speed[0].replace(/\s+/g, " ").trim(), speed);

  // Drying: "Drying: 50°C for 4-6 hours", "dry at 55℃ 6h"
  const dry = text.match(/dry(?:ing|ed)?\b[^0-9\n]{0,30}(\d{2,3})\s*(?:°|º|˚|℃)\s*C?[^0-9\n]{0,25}(\d{1,2}(?:\.\d)?)(?:\s*(?:-|–|~|to)\s*(\d{1,2}(?:\.\d)?))?\s*(?:h|hr|hrs|hours?)\b/i);
  if (dry && inRange(+dry[1], 30, 120)) {
    add("dryTempC", +dry[1], dry);
    const hours = dry[3] ? +dry[3] : +dry[2];
    if (inRange(hours, 1, 48)) add("dryHours", hours, dry);
  }

  const density = text.match(/density[^0-9\n]{0,25}(\d\.\d{1,3})\s*g\s*\/\s*cm/i);
  if (density && inRange(+density[1], 0.8, 2.5)) add("density", +density[1], density);

  return out;
}

function inRange(n: number, lo: number, hi: number) {
  return Number.isFinite(n) && n >= lo && n <= hi;
}

/** Shopify stores expose clean product data at /products/<handle>.json. */
async function shopifyText(url: URL): Promise<{ title?: string; text: string } | null> {
  const m = url.pathname.match(/\/products\/([^/?#]+)/);
  if (!m) return null;
  try {
    const raw = await fetchText(`${url.origin}/products/${m[1]}.json`, { accept: "application/json", maxBytes: MAX_PAGE_BYTES });
    const body = JSON.parse(raw) as { product?: { title?: string; body_html?: string } };
    if (!body.product) return null;
    return { title: body.product.title, text: htmlToText(body.product.body_html ?? "") };
  } catch {
    return null;
  }
}

export async function readProductPage(rawUrl: string): Promise<Candidate> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(400, "That isn't a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new HttpError(400, "Only http(s) product pages can be read");

  let html = "";
  let pageError: unknown = null;
  try {
    html = await fetchText(url.toString(), { accept: "text/html", maxBytes: MAX_PAGE_BYTES });
  } catch (err) {
    pageError = err;
  }
  const shopify = await shopifyText(url);
  if (!html && !shopify) {
    const reason = pageError instanceof Error ? pageError.message : "no response";
    throw new HttpError(502, `Couldn't read that page (${reason}). Many stores block automated requests; enter the values from the box instead.`);
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
  const suggestions = dedupeByField(extractFromText(corpus, ref));
  const gtin = ld?.gtin13 ?? ld?.gtin12 ?? ld?.gtin;
  if (gtin) suggestions.push({ field: "gtin", value: String(gtin), source: "product_url", sourceRef: ref, note: "from the page's product data" });

  const title = shopify?.title ?? ld?.name ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? url.hostname;
  return { source: "product_url", id: ref, title: htmlToText(title).slice(0, 140), sourceRef: ref, score: 50, suggestions };
}

/** The corpus repeats itself (Shopify JSON + page HTML); keep the first hit per field. */
function dedupeByField(list: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.field) ? false : (seen.add(s.field), true)));
}
