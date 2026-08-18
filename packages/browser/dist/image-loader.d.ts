import type { PixelBuffer } from "@scanly/core/qr";
export declare const MAX_UPLOAD_BYTES: number;
export declare const MAX_IMAGE_PIXELS = 24000000;
export declare const MAX_IMAGE_SIDE = 12000;
/** Load image file bytes into a PixelBuffer via browser createImageBitmap + canvas. */
export declare function loadPixelBufferFromBlob(blob: Blob): Promise<PixelBuffer>;
/** Decode a File through the same path (revokes nothing — blob from File is owned by browser). */
export declare function loadPixelBufferFromFile(file: File): Promise<PixelBuffer>;
/** Convert browser ImageData to PixelBuffer. */
export declare function pixelBufferFromImageData(imageData: ImageData): PixelBuffer;
//# sourceMappingURL=image-loader.d.ts.map