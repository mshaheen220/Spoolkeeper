import { describe, expect, it } from "vitest";
import { finishForLine, LINE_SUGGESTIONS, splitFinishes, toggleFinish } from "./productFields";

describe("finishForLine", () => {
  it("recognizes lines that are really a finish", () => {
    expect(finishForLine("Translucent")).toBe("Translucent");
    expect(finishForLine("Transparent")).toBe("Translucent");
    expect(finishForLine("Wood")).toBe("Wood Fill");
    expect(finishForLine("Glow")).toBe("Glow in the Dark");
    expect(finishForLine(" silk ")).toBe("Silk");
    expect(finishForLine("Basic")).toBe("Basic");
  });

  it("leaves real product lines alone", () => {
    expect(finishForLine("PLA+")).toBeNull();
    expect(finishForLine("High Speed")).toBeNull();
    expect(finishForLine("")).toBeNull();
    expect(finishForLine(null)).toBeNull();
  });

  it("never suggests a finish as a line", () => {
    expect(LINE_SUGGESTIONS.filter((l) => finishForLine(l))).toEqual([]);
  });
});

describe("toggleFinish", () => {
  it("combines finishes, kept in a stable order", () => {
    expect(toggleFinish(["Translucent"], "Glitter")).toEqual(["Glitter", "Translucent"]);
    expect(toggleFinish(["Glitter", "Translucent"], "Glitter")).toEqual(["Translucent"]);
  });

  it("treats Basic as exclusive - it means plain", () => {
    expect(toggleFinish(["Silk", "Glitter"], "Basic")).toEqual(["Basic"]);
    expect(toggleFinish(["Basic"], "Matte")).toEqual(["Matte"]);
  });

  it("reads the form's comma string", () => {
    expect(splitFinishes("Glitter, Translucent")).toEqual(["Glitter", "Translucent"]);
    expect(splitFinishes("")).toEqual([]);
  });
});
