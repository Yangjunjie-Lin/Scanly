import { SdkException, sdkError } from "../contracts/errors.js";
import { isPublicBarcodeFormat, PUBLIC_BARCODE_FORMATS } from "./format.js";
const MAX_REQUESTED_FORMATS = PUBLIC_BARCODE_FORMATS.length;
export function normalizeFormatSelection(selection) {
    const formats = Array.isArray(selection) ? selection : selection?.formats;
    const strict = Array.isArray(selection) || !selection ? true : selection.strict ?? true;
    if (!formats || formats.length === 0) {
        throw new SdkException(sdkError("unsupported_format", "At least one barcode format must be requested."));
    }
    const unique = [];
    const seen = new Set();
    for (const format of formats) {
        if (!isPublicBarcodeFormat(format)) {
            throw new SdkException(sdkError("unsupported_format", `Unsupported barcode format '${String(format)}'.`, { format: String(format) }));
        }
        if (!seen.has(format)) {
            seen.add(format);
            unique.push(format);
        }
    }
    if (unique.length > MAX_REQUESTED_FORMATS) {
        throw new SdkException(sdkError("resource_limit_exceeded", `At most ${MAX_REQUESTED_FORMATS} barcode formats may be requested.`));
    }
    return Object.freeze({ formats: Object.freeze(unique), strict });
}
export function assertFormatsSupported(requested, supported, engineId) {
    const missing = requested.filter((format) => !supported.includes(format));
    if (missing.length) {
        throw new SdkException(sdkError("unsupported_format", `Engine '${engineId}' does not support: ${missing.join(", ")}.`, { engineId, formats: missing.join(",") }));
    }
}
//# sourceMappingURL=format-selection.js.map