import { describe, expect, it } from "vitest";
import { colorFamilies, familyFromHex } from "./colorFamily";

const f = (colorName: string | null, colorHex: string | null, colorHexes: string[] | null = null) => colorFamilies({ colorName, colorHex, colorHexes });

// Cases taken from the live inventory.
describe("color families", () => {
  it("uses color words in the name when there are any", () => {
    expect(f("Walnut", "#564E44")).toEqual(["brown"]);
    expect(f("Silver", "#818FA0")).toEqual(["gray"]);
    expect(f("Clear", "#767676")).toEqual(["clear"]);
    expect(f("Army Dark Green", "#515234")).toEqual(["green"]);
    expect(f("Fast Gradient Twinkling Translucent Rose", "#800040")).toEqual(["pink"]);
    expect(f("Dual Color Blue & Purple", "#9A58C4")).toEqual(["blue", "purple"]);
    expect(f("Azure", "#00A0EE")).toEqual(["blue"]);
    expect(f("Gold", "#AE8301")).toEqual(["yellow"]);
  });

  it("falls back to the hex, including every color of a multi-color filament", () => {
    expect(f(null, "#5EFF00")).toEqual(["green"]);
    expect(f("Mystery", "#564E44")).toEqual(["brown"]);
    expect(f("Mystery", null, ["#1E3CFF", "#E53935"])).toEqual(["blue", "red"]);
  });

  it("classifies hexes sensibly", () => {
    expect(familyFromHex("#000000")).toBe("black");
    expect(familyFromHex("#2B2B2D")).toBe("gray");
    expect(familyFromHex("#FFFEFA")).toBe("white");
    expect(familyFromHex("#ED7334")).toBe("orange");
    expect(familyFromHex("#FFAF96")).toBe("pink");
    expect(familyFromHex("#CFAF94")).toBe("orange"); // light wood: the name ("Wood") makes it brown
    expect(familyFromHex("#6C4F4C")).toBe("brown");
    expect(familyFromHex("not a color")).toBeNull();
  });
});
