/** Fisher-Yates shuffle of [0, length) - used to tour every tip exactly
 * once in a random order before repeating, rather than picking randomly
 * with replacement (which can stall on a few tips and never reach others). */
export function shuffleIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}
