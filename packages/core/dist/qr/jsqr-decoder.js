import jsQR from "jsqr";
/**
 * Decode with jsQR. Uses attemptBoth by default; callers may pass invertFirst/onlyInvert.
 */
export function decodeWithJsQR(buffer, inversionAttempts = "attemptBoth") {
    if (buffer.width < 1 || buffer.height < 1)
        return null;
    try {
        const code = jsQR(buffer.data, buffer.width, buffer.height, { inversionAttempts });
        if (!code?.data)
            return null;
        return { payload: code.data, rawBytes: Uint8Array.from(code.binaryData) };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=jsqr-decoder.js.map