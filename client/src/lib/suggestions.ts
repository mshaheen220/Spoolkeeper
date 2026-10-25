import type { Candidate, Suggestion } from "../api/enrich";
import type { Source } from "../types";
import type { ProductFieldKey } from "./productFields";

/** Order alternatives are listed in (and the bulk fill prefers). Your own spools ("inferred") come first. */
export const SOURCE_PRIORITY: Source[] = ["inferred", "ofd", "spoolmandb", "spoolz", "product_url", "default"];

/** One distinct value for a field, and every source that suggested it. */
export interface FieldOption {
  value: string;
  suggestions: Suggestion[];
}

/** Numbers compare by value ("1.250" == 1.25), text case-insensitively. */
export function valueKey(v: string | number): string {
  const s = String(v).trim();
  return s !== "" && Number.isFinite(Number(s)) ? String(Number(s)) : s.toLowerCase();
}

/** The candidate the user picked per source (null = don't use that source). */
export type Selection = Partial<Record<Source, string | null>>;

/** Default pick: the best-scoring candidate of each source. */
export function defaultSelection(candidates: Candidate[]): Selection {
  const sel: Selection = {};
  for (const c of candidates) {
    const cur = candidates.find((o) => o.source === c.source && o.id === sel[c.source]);
    if (!cur || c.score > cur.score) sel[c.source] = c.id;
  }
  return sel;
}

/** Merge the selected candidates' suggestions into distinct options per field. */
export function optionsByField(candidates: Candidate[], selection: Selection): Map<ProductFieldKey, FieldOption[]> {
  const out = new Map<ProductFieldKey, FieldOption[]>();
  const chosen = candidates
    .filter((c) => selection[c.source] === c.id)
    .sort((a, b) => SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source));
  for (const c of chosen) {
    for (const s of c.suggestions) {
      const list = out.get(s.field) ?? [];
      const existing = list.find((o) => valueKey(o.value) === valueKey(s.value));
      if (existing) existing.suggestions.push(s);
      else list.push({ value: String(s.value), suggestions: [s] });
      out.set(s.field, list);
    }
  }
  return out;
}

/**
 * Fields safe to fill in bulk: currently empty, and every real source agrees
 * on one value. Material defaults never count - they're a last resort the
 * user has to pick on purpose - and neither do disagreements.
 */
export function agreedFills(
  options: Map<ProductFieldKey, FieldOption[]>,
  current: Partial<Record<ProductFieldKey, string>>,
): { field: ProductFieldKey; option: FieldOption }[] {
  const fills: { field: ProductFieldKey; option: FieldOption }[] = [];
  for (const [field, opts] of options) {
    if ((current[field] ?? "").trim() !== "") continue;
    const real = opts.filter((o) => o.suggestions.some((s) => s.source !== "default"));
    if (real.length === 1) fills.push({ field, option: real[0] });
  }
  return fills;
}
