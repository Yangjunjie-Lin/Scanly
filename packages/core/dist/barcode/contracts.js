import { barcodeFormatClass } from "./format.js";
export class UnsupportedBarcodeFormatError extends Error {
    code = "unsupported_format";
    constructor(message) {
        super(message);
        this.name = "UnsupportedBarcodeFormatError";
    }
}
export class InvalidBarcodeChecksumError extends Error {
    code = "invalid_barcode_checksum";
    constructor(message) {
        super(message);
        this.name = "InvalidBarcodeChecksumError";
    }
}
/** Convert the legacy Alpha.4 result shape to the generic Alpha.5 contract. */
export function toDecodedBarcode(result) {
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
//# sourceMappingURL=contracts.js.map