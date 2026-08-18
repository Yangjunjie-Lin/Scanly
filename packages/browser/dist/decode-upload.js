import { BrowserCaptureSession } from "./browser-session.js";
let compatibilitySession = null;
/**
 * @deprecated Prefer BrowserCaptureSession. This compatibility wrapper executes
 * the same CaptureRouter path and no longer owns a separate decode pipeline.
 */
export async function decodeUploadedFile(file, options = {}) {
    if (!compatibilitySession) {
        compatibilitySession = new BrowserCaptureSession({ scenario: options.scenario });
        compatibilitySession.start();
    }
    else if (options.scenario) {
        compatibilitySession.updateConfiguration(options.scenario);
    }
    return compatibilitySession.scanFile(file, options);
}
export function cancelUploadedDecode() { compatibilitySession?.cancel(); }
export async function disposeUploadedDecodeWorker() {
    const session = compatibilitySession;
    compatibilitySession = null;
    await session?.dispose();
}
//# sourceMappingURL=decode-upload.js.map