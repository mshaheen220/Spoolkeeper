import type { Candidate, EnrichQuery, Suggestion } from "./types";
import { cachedJson, cachedJsonOrNull, DAY_MS } from "./fetch";
import type { ColorDirection, Finish } from "../appearance";
import { hexColor, norm, overlap, sameBrand, tokens } from "./text";

// Open Filament Database (Open Filament Collective / SimplyPrint, MIT): a
// static JSON API on GitHub Pages, no key. The tree is
//   brands/index.json -> brands/<b>/index.json -> materials/<M>/index.json
//   -> filaments/<f>/index.json -> variants/<v>.json
// Each hop is fetched on demand and cached for a day.
export const OFD_API = "https://api.openfilamentdatabase.org/api/v1";

interface OfdLink {
  name?: string;
  material?: string;
  slug: string;
  path: string;
}
interface OfdBrandsIndex {
  brands: (OfdLink & { name: string; id: string })[];
}
interface OfdBrand {
  name: string;
  website?: string;
  materials: (OfdLink & { material: string })[];
}
interface OfdMaterial {
  material: string;
  default_max_dry_temperature?: number;
  filaments: (OfdLink & { name: string })[];
}
export interface OfdFilament {
  id: string;
  name: string;
  material?: string;
  density?: number;
  min_print_temperature?: number;
  max_print_temperature?: number;
  min_bed_temperature?: number;
  max_bed_temperature?: number;
  max_dry_temperature?: number;
  data_sheet_url?: string;
  shore_hardness_a?: number;
  shore_hardness_d?: number;
  variants?: (OfdLink & { name: string })[];
}
export interface OfdSize {
  filament_weight?: number;
  diameter?: number;
  empty_spool_weight?: number;
  gtin?: string;
  ean?: string;
  purchase_links?: { url: string }[];
}
export interface OfdVariant {
  id: string;
  name: string;
  /** A string, or several for a multi-color filament. */
  color_hex?: string | string[];
  traits?: Record<string, boolean>;
  sizes?: OfdSize[];
}
interface GtinEntry {
  gtin: string;
  brand_name: string;
  material_slug: string;
  filament_name: string;
  variant_name: string;
  filament_weight?: number;
  diameter?: number;
  href: string;
}

const get = <T>(path: string) => cachedJson<T>("ofd", `${OFD_API}/${path}`, DAY_MS);
const getOrNull = <T>(path: string) => cachedJsonOrNull<T>("ofd", `${OFD_API}/${path}`, DAY_MS);

/** "PLA Matte" on a PLA product -> "Matte"; "PLA" -> null. */
export function lineFromFilamentName(filamentName: string, material: string): string | null {
  const rest = tokens(filamentName).filter((t) => t !== material.toLowerCase());
  if (rest.length === 0) return null;
  // Keep the original casing/spelling of the remaining words.
  const words = filamentName.split(/\s+/).filter((w) => norm(w) !== norm(material));
  return words.join(" ").trim() || null;
}

const TRAIT_FINISH: [string, Finish][] = [
  ["glow", "Glow in the Dark"],
  ["glitter", "Glitter"],
  ["imitates_marble", "Marble"],
  ["silk", "Silk"],
  ["matte", "Matte"],
  ["iridescent", "Iridescent"],
  ["pearlescent", "Iridescent"],
  ["translucent", "Translucent"],
  ["transparent", "Translucent"],
  ["imitates_wood", "Wood Fill"],
  ["contains_wood", "Wood Fill"],
  ["contains_carbon_fiber", "Carbon Fiber"],
  ["contains_glass_fiber", "Glass Fiber"],
  ["imitates_metal", "Metal Fill"],
  ["contains_metal", "Metal Fill"],
];

export function ofdFinish(traits: Record<string, boolean> | undefined): Finish | null {
  if (!traits) return null;
  return TRAIT_FINISH.find(([t]) => traits[t])?.[1] ?? null;
}

/** OFD marks co-extruded (side-by-side) and gradual-change (along the length) multi-color filaments with traits. */
export function ofdDirection(traits: Record<string, boolean> | undefined): ColorDirection | null {
  if (traits?.coextruded) return "coaxial";
  if (traits?.gradual_color_change) return "longitudinal";
  return null;
}

/** Pick the size closest to what's on the spool (diameter first, then weight). */
export function pickSize(sizes: OfdSize[] | undefined, diameter = 1.75, weight = 1000): OfdSize | null {
  if (!sizes?.length) return null;
  const rank = (s: OfdSize) => (s.diameter === diameter ? 0 : 10) + Math.abs((s.filament_weight ?? weight) - weight) / 1000;
  return [...sizes].sort((a, b) => rank(a) - rank(b))[0];
}

/** Scores a filament line ("PLA Wood") against the query's material + line. */
export function scoreOfdFilament(name: string, q: EnrichQuery): number {
  const nameTokens = tokens(name);
  const wanted = tokens(`${q.material} ${q.line ?? ""}`);
  const hits = wanted.filter((t) => nameTokens.includes(t)).length;
  const extras = nameTokens.filter((t) => !wanted.includes(t)).length;
  let score = hits * 2 - extras * 0.5;
  if (!q.line && norm(name) === norm(q.material)) score += 2; // plain "PLA" for a plain PLA query
  return score;
}

export function suggestionsFromOfd(
  filament: OfdFilament,
  variant: OfdVariant | null,
  size: OfdSize | null,
  ref: string,
  materialDefaultDry?: number,
): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (field: Suggestion["field"], value: string | number | null | undefined, note?: string) => {
    if (value !== null && value !== undefined && value !== "") out.push({ field, value, source: "ofd", sourceRef: ref, note });
  };
  if (variant) {
    add("colorName", variant.name);
    const hexes = (Array.isArray(variant.color_hex) ? variant.color_hex : [variant.color_hex]).map(hexColor).filter((h): h is string => !!h);
    if (hexes.length >= 2) {
      add("colorHexes", hexes.join(","));
      add("colorHex", hexes[0], "first of its colors");
      add("multiColorDirection", ofdDirection(variant.traits));
    } else {
      add("colorHex", hexes[0]);
    }
    add("finish", ofdFinish(variant.traits));
    add("ofdId", variant.id);
  }
  add("density", filament.density);
  if (filament.shore_hardness_a != null) {
    add("shoreScale", "A");
    add("shoreHardness", filament.shore_hardness_a);
  } else if (filament.shore_hardness_d != null) {
    add("shoreScale", "D");
    add("shoreHardness", filament.shore_hardness_d);
  }
  add("nozzleMin", filament.min_print_temperature);
  add("nozzleMax", filament.max_print_temperature);
  add("bedMin", filament.min_bed_temperature);
  add("bedMax", filament.max_bed_temperature);
  if (filament.max_dry_temperature != null) add("dryTempC", filament.max_dry_temperature, "maximum drying temperature");
  else if (materialDefaultDry != null) add("dryTempC", materialDefaultDry, "material-wide maximum drying temperature");
  add("datasheetUrl", filament.data_sheet_url);
  if (size) {
    add("diameterMm", size.diameter);
    add("netWeightG", size.filament_weight);
    add("spoolWeightG", size.empty_spool_weight);
    add("gtin", size.gtin ?? size.ean);
    add("productUrl", size.purchase_links?.[0]?.url, "store listing from OFD");
  }
  return out;
}

export async function searchOfd(q: EnrichQuery, limit = 4): Promise<Candidate[]> {
  const brands = await get<OfdBrandsIndex>("brands/index.json");
  const brandLink = brands.brands.find((b) => norm(b.name) === norm(q.vendor)) ?? brands.brands.find((b) => sameBrand(b.name, q.vendor));
  if (!brandLink) return [];
  const brandDir = `brands/${brandLink.path.replace(/\/index\.json$/, "")}`;
  const brand = await get<OfdBrand>(`${brandDir}/index.json`);

  const materialLink =
    brand.materials.find((m) => norm(m.material) === norm(q.material)) ??
    brand.materials.find((m) => norm(m.material).includes(norm(q.material)));
  if (!materialLink) return [];
  const materialDir = `${brandDir}/${materialLink.path.replace(/\/index\.json$/, "")}`;
  const material = await get<OfdMaterial>(`${materialDir}/index.json`);

  const filaments = material.filaments
    .map((f) => ({ link: f, score: scoreOfdFilament(f.name, q) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const found: { score: number; filament: OfdFilament; variantPath: string | null; variantName: string | null; filamentDir: string }[] = [];
  for (const { link, score } of filaments) {
    const filamentDir = `${materialDir}/${link.path.replace(/\/index\.json$/, "")}`;
    const filament = await getOrNull<OfdFilament>(`${filamentDir}/index.json`);
    if (!filament) continue;
    const variants = (filament.variants ?? [])
      .map((v) => ({ v, s: q.colorName ? overlap(q.colorName, v.name) * 5 + (norm(v.name) === norm(q.colorName) ? 1 : 0) : 0 }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 2);
    if (variants.length === 0) found.push({ score, filament, variantPath: null, variantName: null, filamentDir });
    for (const { v, s } of variants) found.push({ score: score + s, filament, variantPath: `${filamentDir}/${v.path}`, variantName: v.name, filamentDir });
  }

  const out: Candidate[] = [];
  for (const f of found.sort((a, b) => b.score - a.score).slice(0, limit)) {
    const variant = f.variantPath ? await getOrNull<OfdVariant>(f.variantPath) : null;
    const ref = `${OFD_API}/${f.variantPath ?? `${f.filamentDir}/index.json`}`;
    const size = pickSize(variant?.sizes, q.diameterMm ?? 1.75, q.netWeightG ?? 1000);
    out.push({
      source: "ofd",
      id: variant?.id ?? f.filament.id,
      title: `${brand.name} ${f.filament.name}${f.variantName ? ` · ${f.variantName}` : " (no color match)"}`,
      sourceRef: ref,
      score: f.score,
      suggestions: suggestionsFromOfd(f.filament, variant, size, ref, material.default_max_dry_temperature),
    });
  }
  return out;
}

export interface GtinMatch {
  gtin: string;
  vendor: string;
  material: string;
  line: string | null;
  colorName: string;
  diameterMm: number | null;
  netWeightG: number | null;
  candidate: Candidate;
}

/** Barcode -> product identity plus the OFD values for it. */
export async function lookupGtin(code: string): Promise<GtinMatch[]> {
  const digits = code.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return [];
  const index = await get<{ codes: Record<string, GtinEntry[]> }>("gtin-index.json");
  const entries = index.codes[digits.padStart(14, "0")] ?? [];
  const out: GtinMatch[] = [];
  for (const e of entries) {
    const filamentPath = e.href.replace(/\/variants\/[^/]+$/, "/index.json");
    const [variant, filament] = await Promise.all([getOrNull<OfdVariant>(e.href), getOrNull<OfdFilament>(filamentPath)]);
    if (!filament) continue;
    const size = variant?.sizes?.find((s) => (s.gtin ?? s.ean)?.replace(/\D/g, "").padStart(14, "0") === digits.padStart(14, "0")) ??
      pickSize(variant?.sizes, e.diameter, e.filament_weight);
    const ref = `${OFD_API}/${e.href}`;
    out.push({
      gtin: e.gtin,
      vendor: e.brand_name,
      material: e.material_slug,
      line: lineFromFilamentName(e.filament_name, e.material_slug),
      colorName: e.variant_name,
      diameterMm: e.diameter ?? null,
      netWeightG: e.filament_weight ?? null,
      candidate: {
        source: "ofd",
        id: variant?.id ?? filament.id,
        title: `${e.brand_name} ${e.filament_name} · ${e.variant_name}`,
        sourceRef: ref,
        score: 100,
        suggestions: suggestionsFromOfd(filament, variant, size, ref),
      },
    });
  }
  return out;
}
