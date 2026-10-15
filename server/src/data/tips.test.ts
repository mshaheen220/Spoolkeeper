import { describe, expect, it } from "vitest";
import { TIPS } from "./tips";

describe("tips", () => {
  it("matches the Mashghal tip-source shape: { tips: [{ category, text }] }", () => {
    const body = JSON.parse(JSON.stringify({ tips: TIPS }));
    expect(Object.keys(body)).toEqual(["tips"]);
    expect(body.tips.length).toBeGreaterThan(20);
    for (const t of body.tips) {
      expect(Object.keys(t).sort()).toEqual(["category", "text"]);
      expect(["filament", "drying", "calibration", "slicing"]).toContain(t.category);
      expect(t.text.trim().length).toBeGreaterThan(20);
    }
  });

  it("has no duplicate tips", () => {
    expect(new Set(TIPS.map((t) => t.text)).size).toBe(TIPS.length);
  });
});
