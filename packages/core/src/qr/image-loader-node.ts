import sharp from "sharp";
import { createPixelBuffer, flattenAlphaOntoWhite } from "./grayscale.js";
import type { PixelBuffer } from "./types.js";

/** Load an image path into RGBA PixelBuffer (Node). Honors EXIF orientation via sharp. */
export async function loadPixelBufferFromPath(filePath: string): Promise<PixelBuffer> {
  try {
    const { data, info } = await sharp(filePath)
      .rotate() // apply EXIF orientation
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.width < 1 || info.height < 1) {
      throw Object.assign(new Error("Image has no pixel data."), { code: "empty_image" as const });
    }
    const buffer = createPixelBuffer(
      new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      info.width,
      info.height
    );
    return flattenAlphaOntoWhite(buffer);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e) throw e;
    throw Object.assign(new Error("Unsupported or corrupted image."), {
      code: "unsupported_image" as const,
      cause: e,
    });
  }
}
