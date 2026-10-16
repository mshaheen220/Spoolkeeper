// Color families for filtering ("show me the greens"). Filament color
// names say more than their swatch hex - Walnut and Silver are greyish hexes
// but not "gray" spools, and "Clear" is stored as gray - so the name decides
// when it names a color, and the hex is the fallback.

export const FAMILIES = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "brown", "black", "white", "gray", "clear"] as const;
export type ColorFamily = (typeof FAMILIES)[number];

/** A representative swatch for each family's filter chip. */
export const FAMILY_SWATCH: Record<ColorFamily, string> = {
  red: "#E53935",
  orange: "#FB8C00",
  yellow: "#FDD835",
  green: "#43A047",
  blue: "#1E88E5",
  purple: "#8E24AA",
  pink: "#EC407A",
  brown: "#795548",
  black: "#111111",
  white: "#FFFFFF",
  gray: "#9E9E9E",
  clear: "repeating-linear-gradient(45deg, #ffffff55 0 3px, transparent 3px 6px), #9fb7c955",
};

const NAME_WORDS: [RegExp, ColorFamily][] = [
  [/\b(red|crimson|scarlet|burgundy|maroon)\b/, "red"],
  [/\b(orange|tangerine|amber)\b/, "orange"],
  [/\b(yellow|gold|golden|lemon|mustard)\b/, "yellow"],
  [/\b(green|olive|army|lime|mint|emerald|jade|forest)\b/, "green"],
  [/\b(blue|azure|navy|cyan|sky|cobalt|teal|turquoise|aqua)\b/, "blue"],
  [/\b(purple|violet|lavender|magenta|lilac)\b/, "purple"],
  [/\b(pink|rose|peach|salmon|coral|fuchsia)\b/, "pink"],
  [/\b(brown|wood|walnut|cherry|maple|chocolate|coffee|bronze|copper|tan|beige)\b/, "brown"],
  [/\bblack\b/, "black"],
  [/\b(white|ivory|cream)\b/, "white"],
  [/\b(gr[ae]y|silver|charcoal|graphite)\b/, "gray"],
  [/\b(clear|transparent|natural)\b/, "clear"],
];

function fromName(name: string): ColorFamily[] {
  const n = name.toLowerCase();
  return NAME_WORDS.filter(([re]) => re.test(n)).map(([, f]) => f);
}

/** Family of a single #RRGGBB, by hue/saturation/lightness. */
export function familyFromHex(hex: string): ColorFamily | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  if (l < 0.12) return "black";
  // Near white, saturation is meaningless (#FFFEFA is "100% saturated"); judge by how far the channels spread.
  if (l > 0.92 || (l > 0.85 && d < 0.1)) return "white";
  // Warm, muted, not too light: browns (wood, walnut) rather than orange or gray.
  if (h < 50 && l < 0.55 && s < 0.65 && s >= 0.08) return "brown";
  if (s < 0.12) return l > 0.8 ? "white" : "gray";
  if (h < 15 || h >= 345) return l > 0.75 ? "pink" : "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

/** Every family a filament belongs to: from its name, else from its color(s). */
export function colorFamilies(p: { colorName: string | null; colorHex: string | null; colorHexes: string[] | null }): ColorFamily[] {
  const named = fromName(p.colorName ?? "");
  if (named.length) return [...new Set(named)];
  const hexes = p.colorHexes?.length ? p.colorHexes : p.colorHex ? [p.colorHex] : [];
  return [...new Set(hexes.map(familyFromHex).filter((f): f is ColorFamily => !!f))];
}

/** Hue-ish order for sorting by color: families in rainbow order, then lighter first within a family. */
export function colorSortKey(p: { colorName: string | null; colorHex: string | null; colorHexes: string[] | null }): number {
  const fam = colorFamilies(p)[0];
  const idx = fam ? FAMILIES.indexOf(fam) : FAMILIES.length;
  const hex = p.colorHex ?? "";
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const lightness = m ? (parseInt(m[1].slice(0, 2), 16) + parseInt(m[1].slice(2, 4), 16) + parseInt(m[1].slice(4, 6), 16)) / 765 : 0;
  return idx * 10 + (1 - lightness);
}
