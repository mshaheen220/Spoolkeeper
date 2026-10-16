import type { Candidate, EnrichQuery, Suggestion } from "./types";
import { cachedJson, DAY_MS } from "./fetch";
import type { Finish } from "../appearance";
import { hexColor, norm, overlap, sameBrand } from "./text";

// SpoolmanDB: the community filament dataset Spoolman ships with, compiled
// to one static JSON file on GitHub Pages (MIT). This reads the public
// dataset only - never a Spoolman server.
export const SPOOLMANDB_URL = "https://donkie.github.io/SpoolmanDB/filaments.json";

export interface SpoolmanDbFilament {
  id: string;
  manufacturer: string;
  name: string;
  material: string;
  density: number | null;
  weight: number | null;
  spool_weight: number | null;
  spool_type: string | null;
  diameter: number | null;
  color_hex: string | null;
  extruder_temp: number | null;
  extruder_temp_range: [number, number] | null;
  bed_temp: number | null;
  bed_temp_range: [number, number] | null;
  finish: string | null;
  color_hexes?: string[] | null;
  multi_color_direction?: "coaxial" | "longitudinal" | null;
  pattern?: string | null;
  translucent?: boolean;
  glow?: boolean;
}

/** SpoolmanDB spreads appearance over finish/pattern/glow/translucent flags; each one that's set is a finish. */
export function spoolmanDbFinishes(row: SpoolmanDbFilament): Finish[] {
  const out: Finish[] = [];
  if (row.finish === "matte") out.push("Matte");
  if (row.finish === "glossy") out.push("Glossy");
  if (row.pattern === "marble") out.push("Marble");
  if (row.pattern === "sparkle") out.push("Glitter");
  if (row.glow) out.push("Glow in the Dark");
  if (row.translucent) out.push("Translucent");
  return out;
}

/** How well a SpoolmanDB row matches the query; 0 = not a candidate. */
export function scoreSpoolmanDb(row: SpoolmanDbFilament, q: EnrichQuery): number {
  if (!sameBrand(row.manufacturer, q.vendor)) return 0;
  let score = 1;
  const mat = norm(row.material);
  // SpoolmanDB folds the product line into material for some rows
  // ("WOOD", "SILK"), so the query's line can match material as well.
  if (mat === norm(q.material)) score += 3;
  else if (q.line && mat === norm(q.line)) score += 3;
  else if (mat.includes(norm(q.material))) score += 1;
  else return 0; // different material entirely (a PETG row for a PLA query)

  if (q.colorName) {
    const c = overlap(q.colorName, row.name);
    if (c === 0) score -= 2; // product-level values (density, temps) are still useful, ranked lower
    score += c * 5;
    if (norm(row.name) === norm(q.colorName)) score += 1;
  }
  if (q.line) score += overlap(q.line, `${row.name} ${row.material} ${row.finish ?? ""}`) * 2;
  if (row.diameter != null && row.diameter === (q.diameterMm ?? 1.75)) score += 1;
  if (row.weight != null && row.weight === (q.netWeightG ?? 1000)) score += 0.5;
  return score;
}

export function suggestionsFromSpoolmanDb(row: SpoolmanDbFilament): Suggestion[] {
  const ref = row.id;
  const out: Suggestion[] = [];
  const add = (field: Suggestion["field"], value: string | number | null | undefined, note?: string) => {
    if (value !== null && value !== undefined && value !== "") out.push({ field, value, source: "spoolmandb", sourceRef: ref, note });
  };
  const hexes = (row.color_hexes ?? []).map(hexColor).filter((h): h is string => !!h);
  if (hexes.length >= 2) {
    add("colorHexes", hexes.join(","), row.multi_color_direction ?? undefined);
    add("colorHex", hexColor(row.color_hex) ?? hexes[0], row.color_hex ? undefined : "first of its colors");
    add("multiColorDirection", row.multi_color_direction);
  } else {
    add("colorHex", hexColor(row.color_hex));
  }
  add("finishes", spoolmanDbFinishes(row).join(",") || null);
  add("density", row.density);
  add("diameterMm", row.diameter);
  add("netWeightG", row.weight);
  add("spoolWeightG", row.spool_weight, row.spool_type ? `${row.spool_type} spool` : undefined);
  if (row.extruder_temp_range) {
    add("nozzleMin", row.extruder_temp_range[0]);
    add("nozzleMax", row.extruder_temp_range[1]);
  } else if (row.extruder_temp != null) {
    add("nozzleMin", row.extruder_temp, "single recommended temp");
    add("nozzleMax", row.extruder_temp, "single recommended temp");
  }
  if (row.bed_temp_range) {
    add("bedMin", row.bed_temp_range[0]);
    add("bedMax", row.bed_temp_range[1]);
  } else if (row.bed_temp != null) {
    add("bedMin", row.bed_temp, "single recommended temp");
    add("bedMax", row.bed_temp, "single recommended temp");
  }
  add("spoolmandbId", row.id);
  return out;
}

export async function searchSpoolmanDb(q: EnrichQuery, limit = 5): Promise<Candidate[]> {
  const rows = await cachedJson<SpoolmanDbFilament[]>("spoolmandb", SPOOLMANDB_URL, DAY_MS);
  const scored = rows
    .map((row) => ({ row, score: scoreSpoolmanDb(row, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // The compiled file has one row per weight/diameter/spool-type combination;
  // keep the best-scoring row per filament so alternatives are actually different.
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const { row, score } of scored) {
    const key = `${norm(row.material)}|${norm(row.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      source: "spoolmandb",
      id: row.id,
      title: `${row.manufacturer} ${row.material} ${row.name}${row.weight ? ` · ${row.weight} g` : ""}${row.diameter ? ` · ${row.diameter} mm` : ""}`,
      sourceRef: row.id,
      score,
      suggestions: suggestionsFromSpoolmanDb(row),
    });
    if (out.length >= limit) break;
  }
  return out;
}
