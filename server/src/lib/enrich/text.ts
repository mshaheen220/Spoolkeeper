// Fuzzy-matching helpers shared by the enrichment sources. Filament names
// are messy ("SUNLU" vs "Sunlu", "Walnut Wood" vs "Walnut", "PLA+ 2.0"),
// so matching works on normalized tokens rather than exact strings.

/** Lowercase alphanumerics only: "3D-Fuel" -> "3dfuel". */
export function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9+]/g, "");
}

const STOP = new Set(["the", "and", "filament", "1kg", "175mm", "175", "spool", "color", "colour"]);

export function tokens(s: string | null | undefined): string[] {
  return (s ?? "")
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((t) => t && !STOP.has(t));
}

/** Share of the query's tokens found in the candidate (0..1). */
export function overlap(query: string | null | undefined, candidate: string | null | undefined): number {
  const q = tokens(query);
  if (q.length === 0) return 0;
  const c = new Set(tokens(candidate));
  return q.filter((t) => c.has(t)).length / q.length;
}

/** Same brand, allowing "Sunlu" vs "SUNLU" and "Polymaker" vs "Polymaker (PolyTerra)". */
export function sameBrand(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = norm(a);
  const nb = norm(b);
  return !!na && !!nb && (na === nb || na.startsWith(nb) || nb.startsWith(na));
}

/** Normalize a hex color to #RRGGBB, or null. */
export function hexColor(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = s.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(m) ? `#${m.toUpperCase()}` : null;
}
