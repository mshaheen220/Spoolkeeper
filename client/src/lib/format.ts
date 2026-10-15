export function range(min: number | null, max: number | null, unit: string): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max} ${unit}`;
  return `${min ?? max} ${unit}`;
}

export function money(n: number | null): string | null {
  return n == null ? null : n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function grams(n: number | null): string | null {
  return n == null ? null : n >= 1000 ? `${+(n / 1000).toFixed(2)} kg` : `${n} g`;
}
