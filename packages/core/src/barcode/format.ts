import type { BarcodeFormat, BarcodeFormatClass } from "@scanly/scenario-schema";

export type { BarcodeFormat, BarcodeFormatClass } from "@scanly/scenario-schema";

export const PUBLIC_BARCODE_FORMATS: readonly BarcodeFormat[] = Object.freeze([
  "qr_code", "data_matrix", "pdf417", "code_128", "ean_13", "ean_8", "upc_a", "upc_e",
]);

export const BARCODE_FORMAT_CLASS: Readonly<Record<BarcodeFormat, BarcodeFormatClass>> = Object.freeze({
  qr_code: "matrix",
  data_matrix: "matrix",
  pdf417: "stacked",
  code_128: "linear",
  ean_13: "linear",
  ean_8: "linear",
  upc_a: "linear",
  upc_e: "linear",
});

export function barcodeFormatClass(format: BarcodeFormat): BarcodeFormatClass {
  return BARCODE_FORMAT_CLASS[format];
}

export function isPublicBarcodeFormat(value: unknown): value is BarcodeFormat {
  return typeof value === "string" && (PUBLIC_BARCODE_FORMATS as readonly string[]).includes(value);
}

