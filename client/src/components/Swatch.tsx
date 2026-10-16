import { colorBackground } from "../lib/colors";
import type { ColorDirection } from "../types";

/** A spool-shaped color dot: filament color ring around a hub. */
export function Swatch({
  hex,
  hexes,
  direction,
  size = 36,
}: {
  hex: string | null;
  hexes?: string[] | null;
  direction?: ColorDirection | null;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center rounded-full border border-ink-700"
      style={{ width: size, height: size, background: colorBackground(hex, hexes, direction) }}
    >
      {/* The hub shows the main color - the one OrcaSlicer will display. */}
      <span
        className="rounded-full border-2 border-ink-950"
        style={{ width: size * 0.38, height: size * 0.38, background: hexes && hexes.length >= 2 && hex ? hex : "var(--color-ink-950)" }}
      />
    </span>
  );
}
