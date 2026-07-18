import type { BarcodeFormat } from "@scanly/scenario-schema";
export declare const SCANLY_TO_NATIVE_FORMAT: Readonly<Record<BarcodeFormat, string>>;
export declare const NATIVE_TO_SCANLY_FORMAT: Readonly<Record<string, BarcodeFormat>>;
export declare function nativeFormatsFor(requested: readonly BarcodeFormat[]): string;
export declare function scanlyFormatFromNative(value: unknown): BarcodeFormat | undefined;
//# sourceMappingURL=formats.d.ts.map