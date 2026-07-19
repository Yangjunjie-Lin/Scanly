import type { BarcodeFormat } from "@scanly/scenario-schema";
export declare const SCANLY_TO_NATIVE_FORMAT: Readonly<Record<BarcodeFormat, string>>;
export declare const NATIVE_TO_SCANLY_FORMAT: Readonly<Record<string, BarcodeFormat>>;
export declare function nativeFormatsFor(requested: readonly BarcodeFormat[]): string;
export declare function scanlyFormatFromNative(value: unknown): BarcodeFormat | undefined;
/** Resolve ZXing's EAN-13 representation of a requested UPC-A symbol. */
export declare function scanlyFormatFromNativeResult(nativeFormat: unknown, nativeText: unknown, requested: readonly BarcodeFormat[]): BarcodeFormat | undefined;
//# sourceMappingURL=formats.d.ts.map