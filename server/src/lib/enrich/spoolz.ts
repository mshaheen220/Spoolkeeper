import type { Candidate, EnrichQuery, Suggestion } from "./types";
import { cachedJson, DAY_MS, fetchText } from "./fetch";
import { getDb } from "../../db";
import { norm, overlap } from "./text";

// spoolz (onlyspoolz.com, public domain): hand-measured empty spool weights
// and dimensions, one Markdown page per spool in the jtrmal/spoolz repo.
// The file list comes from GitHub's tree API (rate-limited, so cached for a
// week); only pages whose filename mentions the brand are fetched.
const TREE_URL = "https://api.github.com/repos/jtrmal/spoolz/git/trees/main?recursive=1";
const RAW = "https://raw.githubusercontent.com/jtrmal/spoolz/main/";
const PAGE = "https://www.onlyspoolz.com/portfolio/";

export interface SpoolzEntry {
  title: string;
  emptySpoolWeightG: number | null;
  advertisedWeightG: number | null;
  outerDiameterMm: number | null;
  heightMm: number | null;
  holeDiameterMm: number | null;
  printTemp: [number, number] | null;
  bedTemp: [number, number] | null;
}

const num = (s: string | undefined) => {
  const m = s?.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};
const tempRange = (s: string | undefined): [number, number] | null => {
  // "200-210C", "195–220 °C", "0/60C" (bed off/on) -> take the outer numbers.
  const nums = (s?.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n > 0);
  if (nums.length === 0) return null;
  return [Math.min(...nums), Math.max(...nums)];
};

/** Parse a spoolz page: TOML front matter title plus "* Key: value" bullets. */
export function parseSpoolzMarkdown(md: string): SpoolzEntry {
  const title = md.match(/^title\s*=\s*"([^"]+)"/m)?.[1] ?? "";
  const bullets = new Map<string, string>();
  for (const m of md.matchAll(/^\s*[-*]\s+([^:\n]+):\s*(.+)$/gm)) bullets.set(m[1].trim().toLowerCase(), m[2].trim());
  const pick = (...keys: string[]) => keys.map((k) => bullets.get(k)).find((v) => v != null);
  return {
    title,
    emptySpoolWeightG: num(pick("empty spool weight")),
    advertisedWeightG: num(pick("advertised filament weight")),
    outerDiameterMm: num(pick("outside diameter", "outer diameter")),
    heightMm: num(pick("height", "width")),
    holeDiameterMm: num(pick("hole diameter")),
    printTemp: tempRange(pick("printing temp", "printing temperature")),
    bedTemp: tempRange(pick("bed temp", "bed temperature")),
  };
}

export function suggestionsFromSpoolz(e: SpoolzEntry, ref: string): Suggestion[] {
  const out: Suggestion[] = [];
  const dims = [
    e.outerDiameterMm && `⌀${e.outerDiameterMm} mm`,
    e.heightMm && `${e.heightMm} mm wide`,
    e.holeDiameterMm && `hole ⌀${e.holeDiameterMm} mm`,
  ]
    .filter(Boolean)
    .join(", ");
  if (e.emptySpoolWeightG != null)
    out.push({ field: "spoolWeightG", value: e.emptySpoolWeightG, source: "spoolz", sourceRef: ref, note: dims ? `measured; spool ${dims}` : "measured" });
  if (e.advertisedWeightG != null) out.push({ field: "netWeightG", value: e.advertisedWeightG, source: "spoolz", sourceRef: ref });
  if (e.printTemp) {
    out.push({ field: "nozzleMin", value: e.printTemp[0], source: "spoolz", sourceRef: ref });
    out.push({ field: "nozzleMax", value: e.printTemp[1], source: "spoolz", sourceRef: ref });
  }
  if (e.bedTemp) {
    out.push({ field: "bedMin", value: e.bedTemp[0], source: "spoolz", sourceRef: ref });
    out.push({ field: "bedMax", value: e.bedTemp[1], source: "spoolz", sourceRef: ref });
  }
  return out;
}

/** Fetch one page through the shared cache (pages are tiny and change rarely). */
async function getPage(path: string): Promise<string> {
  const db = getDb();
  const row = db.prepare("SELECT body FROM enrich_cache WHERE source = 'spoolz' AND key = ?").get(path) as { body: string } | undefined;
  if (row) return JSON.parse(row.body) as string;
  const md = await fetchText(RAW + path);
  db.prepare("INSERT OR REPLACE INTO enrich_cache (source, key, fetched_at, body) VALUES ('spoolz', ?, ?, ?)").run(
    path,
    new Date().toISOString(),
    JSON.stringify(md),
  );
  return md;
}

export async function searchSpoolz(q: EnrichQuery, limit = 3): Promise<Candidate[]> {
  const tree = await cachedJson<{ tree: { path: string }[] }>("spoolz", TREE_URL, 7 * DAY_MS);
  const brand = norm(q.vendor);
  if (!brand) return [];
  const paths = tree.tree
    .map((t) => t.path)
    .filter((p) => p.startsWith("content/portfolio/") && p.endsWith(".md") && norm(p).includes(brand))
    .slice(0, 12);

  const out: Candidate[] = [];
  for (const path of paths) {
    const entry = parseSpoolzMarkdown(await getPage(path));
    const slug = path.replace(/^content\/portfolio\//, "").replace(/\.md$/, "");
    // Spool weight is a brand+material property, so material/line matter more than color.
    let score = 1 + overlap(q.material, entry.title) * 2 + overlap(q.line, entry.title) + overlap(q.colorName, entry.title) * 0.5;
    // A 250 g spool's tare says nothing about the 1 kg spool of the same line.
    if (entry.advertisedWeightG != null) score += entry.advertisedWeightG === (q.netWeightG ?? 1000) ? 1 : -2;
    const ref = `${PAGE}${slug.toLowerCase()}/`;
    const suggestions = suggestionsFromSpoolz(entry, ref);
    if (suggestions.length) out.push({ source: "spoolz", id: slug, title: entry.title || slug, sourceRef: ref, score, suggestions });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
