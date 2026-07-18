import type { BarcodeFormat } from "@scanly/scenario-schema";

export const SCANLY_TO_NATIVE_FORMAT: Readonly<Record<BarcodeFormat, string>> = Object.freeze({
  qr_code: "QRCodeModel2",
  data_matrix: "DataMatrix",
  pdf417: "PDF417",
  code_128: "Code128",
  ean_13: "EAN13",
  ean_8: "EAN8",
  upc_a: "UPCA",
  upc_e: "UPCE",
});

export const NATIVE_TO_SCANLY_FORMAT: Readonly<Record<string, BarcodeFormat>> = Object.freeze({
  QRCode: "qr_code",
  QRCodeModel2: "qr_code",
  DataMatrix: "data_matrix",
  PDF417: "pdf417",
  Code128: "code_128",
  EAN13: "ean_13",
  EAN8: "ean_8",
  UPCA: "upc_a",
  UPCE: "upc_e",
});

export function nativeFormatsFor(requested: readonly BarcodeFormat[]): string {
  return requested.map((format) => SCANLY_TO_NATIVE_FORMAT[format]).join(",");
}

export function scanlyFormatFromNative(value: unknown): BarcodeFormat | undefined {
  return typeof value === "string" ? NATIVE_TO_SCANLY_FORMAT[value] : undefined;
}

