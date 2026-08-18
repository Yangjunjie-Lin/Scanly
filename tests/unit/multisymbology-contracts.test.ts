import { describe, expect, it } from "vitest";
import {
  BARCODE_FORMAT_CLASS,
  InvalidBarcodeChecksumError,
  normalizeFormatSelection,
  normalizeRetailBarcode,
  canonicalizeRetailText,
  barcodeFormatClass,
  compressUpcA,
  expandUpcE,
} from "@scanly/core";
import { getBuiltinScenario, validateScenario } from "@scanly/scenario-schema";

describe("Alpha.5 public format contracts", () => {
  it("normalizes duplicate explicit selections and rejects empty or deferred formats", () => {
    expect(normalizeFormatSelection({ formats: ["qr_code", "qr_code", "data_matrix"] }).formats).toEqual(["qr_code", "data_matrix"]);
    expect(() => normalizeFormatSelection({ formats: [] })).toThrow(/At least one/);
    expect(() => normalizeFormatSelection({ formats: ["aztec" as never] })).toThrow(/Unsupported barcode format/);
  });

  it("classifies every public format", () => {
    expect(BARCODE_FORMAT_CLASS).toMatchObject({ qr_code: "matrix", data_matrix: "matrix", pdf417: "stacked", code_128: "linear", ean_13: "linear", ean_8: "linear", upc_a: "linear", upc_e: "linear" });
    expect(barcodeFormatClass("pdf417")).toBe("stacked");
  });

  it("keeps QR as the default while exposing explicit Alpha.5 presets", () => {
    expect(getBuiltinScenario("balanced").acceptedFormats).toEqual(["qr_code"]);
    expect(getBuiltinScenario("multiformat-balanced").acceptedFormats).toHaveLength(8);
    expect(getBuiltinScenario("retail-fast").acceptedFormats).toEqual(["ean_13", "ean_8", "upc_a", "upc_e", "code_128"]);
    expect(validateScenario(getBuiltinScenario("logistics-balanced")).ok).toBe(true);
  });
});

describe("retail checksum policy", () => {
  it("validates and preserves retail formats", () => {
    expect(normalizeRetailBarcode("ean_13", "4006381333931")).toMatchObject({ checkDigitValid: true, gtin: "4006381333931", normalizedGtin14: "04006381333931" });
    expect(normalizeRetailBarcode("upc_a", "036000291452")).toMatchObject({ checkDigitValid: true, gtin: "036000291452" });
    expect(normalizeRetailBarcode("ean_13", "4006381333932")?.checkDigitValid).toBe(false);
    expect(expandUpcE("04252614")).toBe("042100005264");
    expect(compressUpcA("042100005264")).toBe("04252614");
    expect(canonicalizeRetailText("upc_a", "0036000291452")).toBe("036000291452");
    expect(canonicalizeRetailText("upc_e", "0042100005264")).toBe("04252614");
    expect(canonicalizeRetailText("upc_e", "0042100005265")).toBe("0042100005265");
  });

  it("keeps checksum failures typed for callers that opt into strict validation", () => {
    expect(new InvalidBarcodeChecksumError("bad").code).toBe("invalid_barcode_checksum");
  });
});
