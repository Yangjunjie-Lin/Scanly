import { createPixelBuffer, flattenAlphaOntoWhite } from "@scanly/core/qr";
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 24_000_000;
export const MAX_IMAGE_SIDE = 12_000;
/** Load image file bytes into a PixelBuffer via browser createImageBitmap + canvas. */
export async function loadPixelBufferFromBlob(blob) {
    if (!blob || blob.size === 0) {
        throw Object.assign(new Error("Empty or missing image file."), { code: "empty_image" });
    }
    if (blob.size > MAX_UPLOAD_BYTES) {
        throw Object.assign(new Error("Image is larger than the 25 MiB upload limit."), {
            code: "image_too_large",
        });
    }
    if (blob.type && !blob.type.startsWith("image/")) {
        throw Object.assign(new Error("Please select a valid image file."), { code: "invalid_file" });
    }
    let bitmap;
    try {
        bitmap = await createImageBitmap(blob);
    }
    catch {
        throw Object.assign(new Error("Unsupported or corrupted image."), {
            code: "unsupported_image",
        });
    }
    try {
        if (bitmap.width < 1 ||
            bitmap.height < 1 ||
            bitmap.width > MAX_IMAGE_SIDE ||
            bitmap.height > MAX_IMAGE_SIDE ||
            bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
            throw Object.assign(new Error("Image dimensions exceed the 24 megapixel processing limit."), { code: "image_too_large" });
        }
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
            throw Object.assign(new Error("Canvas is not supported in this browser."), {
                code: "unsupported_image",
            });
        }
        // White underlay so transparent PNG modules remain decodable
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return flattenAlphaOntoWhite(createPixelBuffer(imageData.data, imageData.width, imageData.height));
    }
    finally {
        bitmap.close();
    }
}
/** Decode a File through the same path (revokes nothing — blob from File is owned by browser). */
export async function loadPixelBufferFromFile(file) {
    return loadPixelBufferFromBlob(file);
}
/** Convert browser ImageData to PixelBuffer. */
export function pixelBufferFromImageData(imageData) {
    return createPixelBuffer(imageData.data, imageData.width, imageData.height);
}
//# sourceMappingURL=image-loader.js.map