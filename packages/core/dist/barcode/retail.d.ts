import type { BarcodeFormat } from "@scanly/scenario-schema";
export interface RetailBarcodeMetadata {
    gtin?: string;
    checkDigitValid: boolean;
    normalizedGtin14?: string;
    expandedUpcA?: string;
}
/** Restore the public UPC representation emitted by the physical symbol. */
export declare function canonicalizeRetailText(format: BarcodeFormat, value: string): string;
export declare function isValidRetailChecksum(value: string): boolean;
export declare function normalizeRetailBarcode(format: BarcodeFormat, value: string): RetailBarcodeMetadata | null;
/** Expand a valid number-system-0 UPC-E payload without replacing the original text. */
export declare function expandUpcE(value: string): string | null;
/** Compress UPC-A only when an exact, checksum-valid UPC-E round trip exists. */
export declare function compressUpcA(value: string): string | null;
//# sourceMappingURL=retail.d.ts.map