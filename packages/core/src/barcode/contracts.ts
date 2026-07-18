import type { BarcodeFormat, BarcodeFormatClass } from "@scanly/scenario-schema";
import type { CornerPoint, ScanResult } from "../contracts/result.js";
import type { RetailBarcodeMetadata } from "./retail.js";
import { barcodeFormatClass } from "./format.js";

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

export class UnsupportedBarcodeFormatError extends Error {
  readonly code = "unsupported_format" as const;
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedBarcodeFormatError";
  }
}

export class InvalidBarcodeChecksumError extends Error {
  readonly code = "invalid_barcode_checksum" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvalidBarcodeChecksumError";
  }
}

/** Convert the legacy Alpha.4 result shape to the generic Alpha.5 contract. */
export function toDecodedBarcode(result: ScanResult): DecodedBarcode {
  return {
    text: result.rawText,
    ...(result.rawBytes ? { rawBytes: result.rawBytes } : {}),
    format: result.format,
    formatClass: result.formatClass ?? barcodeFormatClass(result.format),
    ...(result.symbologyIdentifier ? { symbologyIdentifier: result.symbologyIdentifier } : {}),
    ...(result.isGs1 !== undefined ? { isGs1: result.isGs1 } : {}),
    ...(result.cornerPoints ? { cornerPoints: result.cornerPoints } : {}),
    ...(result.orientation !== undefined ? { orientation: result.orientation } : {}),
    engineId: result.engine.id,
    engineVersion: result.engine.version,
    engineMetadata: result.engine,
    ...(result.metadata ? { metadata: result.metadata } : {}),
  };
}
