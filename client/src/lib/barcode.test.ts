import { describe, expect, it } from "vitest";
import { classifyCode } from "./barcode";

describe("classifyCode", () => {
  it("tells product barcodes from QR links and batch codes", () => {
    expect(classifyCode(" 6938936716785 ")).toEqual({ kind: "product", digits: "6938936716785" });
    expect(classifyCode("012345678905")).toEqual({ kind: "product", digits: "012345678905" });
    expect(classifyCode("https://www.sunlu.com/products/pla")).toEqual({ kind: "link", url: "https://www.sunlu.com/products/pla" });
    expect(classifyCode("LOT2405-PLA-BK")).toEqual({ kind: "other", text: "LOT2405-PLA-BK" });
    expect(classifyCode("1234567")).toMatchObject({ kind: "other" }); // too short for a GTIN
  });
});
