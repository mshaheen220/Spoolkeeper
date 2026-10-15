import { describe, expect, it } from "vitest";
import type { Candidate } from "../api/enrich";
import { agreedFills, defaultSelection, optionsByField, valueKey } from "./suggestions";

const cand = (source: Candidate["source"], id: string, score: number, s: [string, string | number][]): Candidate => ({
  source,
  id,
  title: id,
  sourceRef: null,
  score,
  suggestions: s.map(([field, value]) => ({ field: field as never, value, source, sourceRef: id })),
});

const candidates = [
  cand("ofd", "ofd-walnut", 10, [["density", 1.24], ["colorHex", "#5A4741"]]),
  cand("spoolmandb", "smdb-walnut", 12, [["density", 1.25], ["spoolWeightG", 130], ["colorHex", "#564E44"]]),
  cand("spoolmandb", "smdb-cherry", 5, [["density", 1.25]]),
  cand("spoolz", "sz", 3, [["spoolWeightG", "130"]]),
  cand("default", "PLA", 0, [["density", 1.24], ["dryHours", 5]]),
];

describe("suggestion merging", () => {
  it("selects the best candidate per source", () => {
    expect(defaultSelection(candidates)).toEqual({ ofd: "ofd-walnut", spoolmandb: "smdb-walnut", spoolz: "sz", default: "PLA" });
  });

  it("merges equal values across sources", () => {
    const opts = optionsByField(candidates, defaultSelection(candidates));
    expect(opts.get("spoolWeightG")).toHaveLength(1);
    expect(opts.get("spoolWeightG")![0].suggestions.map((s) => s.source)).toEqual(["spoolmandb", "spoolz"]);
    // OFD 1.24 and default 1.24 merge; SpoolmanDB 1.25 stays separate.
    expect(opts.get("density")!.map((o) => o.value)).toEqual(["1.24", "1.25"]);
  });

  it("only bulk-fills empty fields where real sources agree", () => {
    const opts = optionsByField(candidates, defaultSelection(candidates));
    const fills = agreedFills(opts, { spoolWeightG: "", colorHex: "" });
    expect(fills.map((f) => f.field)).toEqual(["spoolWeightG"]); // density + color disagree, dryHours is default-only
    expect(agreedFills(opts, { spoolWeightG: "140" })).toEqual([]);
  });

  it("compares numbers by value", () => {
    expect(valueKey("1.250")).toBe(valueKey(1.25));
    expect(valueKey("#5a4741")).toBe(valueKey("#5A4741"));
  });
});
