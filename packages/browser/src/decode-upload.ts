import type { ScanOutcome } from "@scanly/core";
import type { ScenarioDefinition } from "@scanly/scenario-schema";
import { BrowserCaptureSession, type BrowserScanFileOptions } from "./browser-session.js";

let compatibilitySession: BrowserCaptureSession | null = null;

/**
 * @deprecated Prefer BrowserCaptureSession. This compatibility wrapper executes
 * the same CaptureRouter path and no longer owns a separate decode pipeline.
 */
export async function decodeUploadedFile(file: File, options: BrowserScanFileOptions & { scenario?: ScenarioDefinition } = {}): Promise<ScanOutcome> {
  if (!compatibilitySession) {
    compatibilitySession = new BrowserCaptureSession({ scenario: options.scenario });
    compatibilitySession.start();
  } else if (options.scenario) {
    compatibilitySession.updateConfiguration(options.scenario);
  }
  return compatibilitySession.scanFile(file, options);
}

export function cancelUploadedDecode(): void { compatibilitySession?.cancel(); }
export async function disposeUploadedDecodeWorker(): Promise<void> {
  const session = compatibilitySession;
  compatibilitySession = null;
  await session?.dispose();
}
