import type { ColorDirection } from "../types";

/**
 * Background for a filament color. Multi-color filaments render as pie
 * slices when the colors run side by side (coaxial) and as a blended sweep
 * when they change along the length (longitudinal).
 */
export function colorBackground(hex: string | null, hexes?: string[] | null, direction?: ColorDirection | null): string {
  if (hexes && hexes.length >= 2) {
    if (direction === "longitudinal") return `conic-gradient(${[...hexes, hexes[0]].join(", ")})`;
    const step = 100 / hexes.length;
    return `conic-gradient(${hexes.map((h, i) => `${h} ${i * step}% ${(i + 1) * step}%`).join(", ")})`;
  }
  return hex ?? "repeating-linear-gradient(45deg, var(--color-ink-700) 0 4px, var(--color-ink-800) 4px 8px)";
}

export const splitHexes = (s: string) =>
  s
    .split(",")
    .map((h) => h.trim().toUpperCase())
    .filter(Boolean);

/** The main color is always one of the colors; the first one unless picked. */
export function effectiveMain(colorHex: string, hexes: string[]): string {
  if (hexes.length < 2) return colorHex;
  return hexes.includes(colorHex.toUpperCase()) ? colorHex.toUpperCase() : hexes[0];
}
