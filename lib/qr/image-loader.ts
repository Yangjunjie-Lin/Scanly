import type { PixelBuffer } from "./types";
import { createPixelBuffer, flattenAlphaOntoWhite } from "./grayscale";

/** Load image file bytes into a PixelBuffer via browser createImageBitmap + canvas. */
export async function loadPixelBufferFromBlob(blob: Blob): Promise<PixelBuffer> {
  if (!blob || blob.size === 0) {
    throw Object.assign(new Error("Empty or missing image file."), { code: "empty_image" as const });
  }
  if (blob.type && !blob.type.startsWith("image/")) {
    throw Object.assign(new Error("Please select a valid image file."), { code: "invalid_file" as const });
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw Object.assign(new Error("Unsupported or corrupted image."), {
      code: "unsupported_image" as const,
    });
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw Object.assign(new Error("Canvas is not supported in this browser."), {
        code: "unsupported_image" as const,
      });
    }
    // White underlay so transparent PNG modules remain decodable
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return flattenAlphaOntoWhite(
      createPixelBuffer(imageData.data, imageData.width, imageData.height)
    );
  } finally {
    bitmap.close();
  }
}

/** Decode a File through the same path (revokes nothing — blob from File is owned by browser). */
export async function loadPixelBufferFromFile(file: File): Promise<PixelBuffer> {
  return loadPixelBufferFromBlob(file);
}

/** Convert browser ImageData to PixelBuffer. */
export function pixelBufferFromImageData(imageData: ImageData): PixelBuffer {
  return createPixelBuffer(imageData.data, imageData.width, imageData.height);
}
