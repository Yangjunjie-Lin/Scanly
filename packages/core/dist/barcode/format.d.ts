import type { BarcodeFormat, BarcodeFormatClass } from "@scanly/scenario-schema";
export type { BarcodeFormat, BarcodeFormatClass } from "@scanly/scenario-schema";
export declare const PUBLIC_BARCODE_FORMATS: readonly BarcodeFormat[];
export declare const BARCODE_FORMAT_CLASS: Readonly<Record<BarcodeFormat, BarcodeFormatClass>>;
export declare function barcodeFormatClass(format: BarcodeFormat): BarcodeFormatClass;
export declare function isPublicBarcodeFormat(value: unknown): value is BarcodeFormat;
//# sourceMappingURL=format.d.ts.map