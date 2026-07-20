import { describe, expect, it } from "vitest";
import { NATIVE_TO_SCANLY_FORMAT, SCANLY_TO_NATIVE_FORMAT, nativeFormatsFor, scanlyFormatFromNative, scanlyFormatFromNativeResult } from "@scanly/engine-zxing-cpp-wasm";

describe("ZXing-C++ Alpha.5 format boundary", () => {
  it("maps only the public format set in both directions", () => {
    expect(Object.keys(SCANLY_TO_NATIVE_FORMAT)).toHaveLength(8);
    expect(nativeFormatsFor(["qr_code", "code_128", "ean_13"])).toBe("QRCodeModel2,Code128,EAN13");
    expect(scanlyFormatFromNative("DataMatrix")).toBe("data_matrix");
    expect(scanlyFormatFromNative("MicroQRCode")).toBeUndefined();
    expect(NATIVE_TO_SCANLY_FORMAT.MicroPDF417).toBeUndefined();
    expect(scanlyFormatFromNativeResult("EAN13", "0036000291452", ["ean_13"])).toBe("ean_13");
    expect(scanlyFormatFromNativeResult("EAN13", "0036000291452", ["ean_13", "upc_a"])).toBe("upc_a");
  });
});
