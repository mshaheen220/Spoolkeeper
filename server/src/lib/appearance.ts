// How a filament looks: finish, multi-color layout, flexibility. Kept in
// one place so the API, enrichment and the OrcaSlicer import agree on the
// same vocabulary (close to the Finish choices used in Spoolman before).

export const FINISHES = [
  "Standard",
  "Silk",
  "Matte",
  "Glossy",
  "Marble",
  "Glitter",
  "Glow in the Dark",
  "Translucent",
  "Iridescent",
  "Wood Fill",
  "Carbon Fiber",
  "Glass Fiber",
  "Metal Fill",
  "Other",
] as const;
export type Finish = (typeof FINISHES)[number];

/**
 * coaxial: the colors run side by side down the strand (dual/tri-color silk),
 * so every layer shows all of them. longitudinal: the color changes along
 * the length (gradient/rainbow), so it shifts as the print grows.
 */
export const COLOR_DIRECTIONS = ["coaxial", "longitudinal"] as const;
export type ColorDirection = (typeof COLOR_DIRECTIONS)[number];

export const SHORE_SCALES = ["A", "D"] as const;

/** A finish named by a word in a product line or name ("Silk", "Glow", "Transparent"...). */
export function finishFromWord(text: string | null | undefined): Finish | null {
  const t = (text ?? "").toLowerCase();
  if (!t) return null;
  const rules: [RegExp, Finish][] = [
    [/\bsilk/, "Silk"],
    [/\bmatte?\b/, "Matte"],
    [/\bmarble/, "Marble"],
    [/\b(glitter|sparkle|galaxy|twinkl)/, "Glitter"],
    [/\bglow/, "Glow in the Dark"],
    [/\b(translucent|transparent|clear)\b/, "Translucent"],
    [/\b(iridescent|pearl|chameleon)/, "Iridescent"],
    [/\bwood/, "Wood Fill"],
    [/\b(carbon|cf)\b/, "Carbon Fiber"],
    [/\b(glass fiber|gf)\b/, "Glass Fiber"],
    [/\b(metal|copper|bronze|steel)\b/, "Metal Fill"],
    [/\bglossy\b/, "Glossy"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? null;
}

/**
 * OrcaSlicer presets hold a single color, so a multi-color filament needs a
 * "main" one. It must be one of the filament's colors; when it isn't set
 * (or no longer is), the first color is used.
 */
export function mainColor(colorHex: string | null | undefined, colorHexes: string[] | null | undefined): string | null {
  if (!colorHexes || colorHexes.length === 0) return colorHex ?? null;
  return colorHex && colorHexes.includes(colorHex) ? colorHex : colorHexes[0];
}
