import { describe, expect, it } from "vitest";
import { productDisplayName } from "./repo";

describe("productDisplayName", () => {
  it.each([
    [{ vendorName: "Sunlu", material: "PLA", line: "Wood", colorName: "Walnut" }, "Sunlu PLA Wood Walnut"],
    [{ vendorName: "Sunlu", material: "PLA", line: "PLA+", colorName: "Black" }, "Sunlu PLA+ Black"],
    [{ vendorName: "Sunlu", material: "PLA", line: "PLA Wood", colorName: "Walnut" }, "Sunlu PLA Wood Walnut"],
    [{ vendorName: "Overture", material: "PETG", line: null, colorName: "White" }, "Overture PETG White"],
    [{ vendorName: "Inslogic", material: "TPU", line: null, colorName: null }, "Inslogic TPU"],
  ])("%o -> %s", (input, expected) => {
    expect(productDisplayName(input)).toBe(expected);
  });
});
