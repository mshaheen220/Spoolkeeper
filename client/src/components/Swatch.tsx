/** A spool-shaped color dot: filament color ring around a hub. */
export function Swatch({ hex, size = 36 }: { hex: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center rounded-full border border-ink-700"
      style={{
        width: size,
        height: size,
        background: hex ?? "repeating-linear-gradient(45deg, var(--color-ink-700) 0 4px, var(--color-ink-800) 4px 8px)",
      }}
    >
      <span className="rounded-full border border-ink-700 bg-ink-950" style={{ width: size * 0.34, height: size * 0.34 }} />
    </span>
  );
}
