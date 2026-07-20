import type { BarcodeFormat, BarcodeFormatClass } from "@scanly/scenario-schema";
import type { CornerPoint, ScanResult } from "../contracts/result.js";
import type { RetailBarcodeMetadata } from "./retail.js";
export interface Gs1Metadata {
    applicationIdentifiers: readonly string[];
    rawFnc1?: boolean;
    parseWarnings?: readonly string[];
}
export interface BarcodeMetadata {
    retail?: RetailBarcodeMetadata;
    gs1?: Gs1Metadata;
    [key: string]: unknown;
}
export interface StructuredAppendMetadata {
    index: number;
    total: number;
    parity?: number;
}
export interface DecodedBarcode {
    text: string;
    rawBytes?: Uint8Array;
    format: BarcodeFormat;
    formatClass: BarcodeFormatClass;
    symbologyIdentifier?: string;
    isGs1?: boolean;
    cornerPoints?: readonly CornerPoint[];
    orientation?: number;
    engineId: string;
    engineVersion?: string;
    engineMetadata?: Record<string, unknown>;
    structuredAppend?: StructuredAppendMetadata;
    metadata?: BarcodeMetadata;
}
export declare class UnsupportedBarcodeFormatError extends Error {
    readonly code: "unsupported_format";
    constructor(message: string);
}
export declare class InvalidBarcodeChecksumError extends Error {
    readonly code: "invalid_barcode_checksum";
    constructor(message: string);
}
/** Convert the legacy Alpha.4 result shape to the generic Alpha.5 contract. */
export declare function toDecodedBarcode(result: ScanResult): DecodedBarcode;
//# sourceMappingURL=contracts.d.ts.map