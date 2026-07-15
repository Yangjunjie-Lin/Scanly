import {
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  DecodeHintType,
  BarcodeFormat,
  QRCodeReader,
} from "@zxing/library";
import type { PixelBuffer } from "./types.js";

export interface ZXingDecodeResult {
  payload: string;
  rawBytes?: Uint8Array;
}

let reader: QRCodeReader | null = null;

function getReader(): QRCodeReader {
  if (!reader) reader = new QRCodeReader();
  return reader;
}

/** Decode QR from RGBA pixel buffer using ZXing library (works in Node and browser). */
export function decodeWithZXing(buffer: PixelBuffer): ZXingDecodeResult | null {
  if (buffer.width < 1 || buffer.height < 1) return null;
  try {
    const luminance = new Uint8ClampedArray(buffer.width * buffer.height);
    for (let i = 0, j = 0; i < buffer.data.length; i += 4, j++) {
      luminance[j] = (buffer.data[i] * 0.299 + buffer.data[i + 1] * 0.587 + buffer.data[i + 2] * 0.114) | 0;
    }
    const source = new RGBLuminanceSource(luminance, buffer.width, buffer.height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const result = getReader().decode(bitmap, hints);
    const text = result?.getText();
    if (!text) return null;
    const rawBytes = result.getRawBytes();
    return { payload: text, ...(rawBytes?.byteLength ? { rawBytes } : {}) };
  } catch {
    return null;
  }
}
