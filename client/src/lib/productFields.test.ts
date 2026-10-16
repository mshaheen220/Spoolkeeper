import { describe, expect, it } from "vitest";
import { finishForLine, LINE_SUGGESTIONS } from "./productFields";

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
