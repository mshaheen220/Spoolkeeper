import type { Source } from "../../types";
import { effectiveMain, splitHexes } from "../../lib/colors";
import { DIRECTION_LABELS } from "../../lib/productFields";
import { SourceBadge } from "../SourceBadge";
import { Swatch } from "../Swatch";

type Prov = Record<string, { source: Source; sourceRef?: string | null } | undefined>;

interface Props {
  /** Main color (#RRGGBB). */
  colorHex: string;
  /** Comma-separated colors; empty for a single-color filament. */
  colorHexes: string;
  direction: string;
  prov: Prov;
  set: (key: "colorHex" | "colorHexes" | "multiColorDirection", value: string) => void;
}

const MAX_COLORS = 6;
const isHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);

/**
 * Single or multi-color filament. For multi-color, the user lists the
 * colors, says how they're laid out, and stars the main one - OrcaSlicer
 * presets carry a single color, so that's what it will show.
 */
export function ColorEditor({ colorHex, colorHexes, direction, prov, set }: Props) {
  const hexes = splitHexes(colorHexes);
  const multi = hexes.length >= 2 || colorHexes.trim() !== "";
  const main = effectiveMain(colorHex, hexes);

  const setHexes = (list: string[]) => set("colorHexes", list.join(","));
  const switchTo = (toMulti: boolean) => {
    if (toMulti) {
      const first = isHex(colorHex) ? colorHex.toUpperCase() : "#808080";
      setHexes([first, "#FFFFFF"]);
      set("colorHex", first);
      if (!direction) set("multiColorDirection", "coaxial");
    } else {
      set("colorHex", main || hexes[0] || "");
      set("colorHexes", "");
      set("multiColorDirection", "");
    }
  };

  const tab = (active: boolean) =>
    `flex-1 rounded px-3 py-1.5 text-sm whitespace-nowrap ${active ? "bg-ink-700 text-ink-50" : "text-ink-400 hover:text-ink-100"}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink-200" id="color-mode-label">
          Color
        </span>
        <div role="radiogroup" aria-labelledby="color-mode-label" className="flex rounded-md border border-ink-700 bg-ink-900/60 p-0.5">
          <button type="button" role="radio" aria-checked={!multi} className={tab(!multi)} onClick={() => multi && switchTo(false)}>
            Single
          </button>
          <button type="button" role="radio" aria-checked={multi} className={tab(multi)} onClick={() => !multi && switchTo(true)}>
            Multi-color
          </button>
        </div>
      </div>

      {!multi ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Color picker"
            value={isHex(colorHex) ? colorHex : "#808080"}
            onChange={(e) => set("colorHex", e.target.value.toUpperCase())}
            className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-ink-700 bg-ink-900 p-1"
          />
          <input
            className="field min-w-0 flex-1 font-mono"
            aria-label="Color hex"
            placeholder="#RRGGBB"
            value={colorHex}
            onChange={(e) => set("colorHex", e.target.value)}
          />
          {prov.colorHex && colorHex && <SourceBadge compact source={prov.colorHex.source} sourceRef={prov.colorHex.sourceRef} />}
        </div>
      ) : (
        <div className="space-y-3 rounded-md border border-ink-700 p-3">
          <div className="flex items-center gap-3">
            <Swatch hex={main} hexes={hexes} direction={direction === "longitudinal" ? "longitudinal" : "coaxial"} size={44} />
            <p className="text-xs leading-snug text-ink-400">
              OrcaSlicer shows one color per filament. Tap ★ to choose which of these it uses; the center of the swatch shows it.
            </p>
            {prov.colorHexes && <SourceBadge compact source={prov.colorHexes.source} sourceRef={prov.colorHexes.sourceRef} />}
          </div>

          <ul className="space-y-2" aria-label="Filament colors">
            {hexes.map((h, i) => {
              const isMain = h === main;
              return (
                <li key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={isMain}
                    aria-label={isMain ? `Color ${i + 1} is the main color` : `Make color ${i + 1} the main color`}
                    title={isMain ? "Main color (sent to OrcaSlicer)" : "Make this the main color"}
                    onClick={() => set("colorHex", h)}
                    className={`h-9 w-9 shrink-0 rounded-md border text-lg ${isMain ? "border-accent-500 text-accent-400" : "border-ink-700 text-ink-500 hover:text-ink-200"}`}
                  >
                    {isMain ? "★" : "☆"}
                  </button>
                  <input
                    type="color"
                    aria-label={`Color ${i + 1} picker`}
                    value={isHex(h) ? h : "#808080"}
                    onChange={(e) => {
                      const next = [...hexes];
                      next[i] = e.target.value.toUpperCase();
                      setHexes(next);
                      if (isMain) set("colorHex", next[i]);
                    }}
                    className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-ink-700 bg-ink-900 p-1"
                  />
                  <input
                    className="field min-w-0 flex-1 py-1.5 font-mono"
                    aria-label={`Color ${i + 1} hex`}
                    value={h}
                    onChange={(e) => {
                      const next = [...hexes];
                      next[i] = e.target.value.toUpperCase();
                      setHexes(next);
                      if (isMain) set("colorHex", next[i]);
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Remove color ${i + 1}`}
                    disabled={hexes.length <= 2}
                    onClick={() => setHexes(hexes.filter((_, j) => j !== i))}
                    className="h-9 w-9 shrink-0 rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn py-1 text-xs" disabled={hexes.length >= MAX_COLORS} onClick={() => setHexes([...hexes, "#FFFFFF"])}>
            ＋ Add color
          </button>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink-200">How the colors change</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(DIRECTION_LABELS).map(([value, d]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${direction === value ? "border-accent-500 bg-accent-500/10" : "border-ink-700"}`}
                >
                  <input type="radio" name="color-direction" className="sr-only" checked={direction === value} onChange={() => set("multiColorDirection", value)} />
                  <span className="flex items-center gap-2 font-medium">
                    <Swatch hex={null} hexes={hexes.length >= 2 ? hexes : ["#E9B443", "#5A6194"]} direction={value as "coaxial" | "longitudinal"} size={20} />
                    {d.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-400">{d.help}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
