"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserCaptureSession, type BrowserCaptureSessionOptions, type BrowserScanFileOptions } from "@scanly/browser";
import type { ScanOutcome } from "@scanly/core";

export interface UseScanlyResult {
  session: BrowserCaptureSession;
  outcome: ScanOutcome | null;
  scanning: boolean;
  scanFile(file: File, options?: BrowserScanFileOptions): Promise<ScanOutcome>;
  cancel(): void;
  reset(): void;
}

export function useScanly(options: BrowserCaptureSessionOptions = {}): UseScanlyResult {
  const session = useMemo(() => new BrowserCaptureSession(options), []);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [scanning, setScanning] = useState(false);
  useEffect(() => {
    session.initialize();
    session.start();
    return () => session.dispose();
  }, [session]);
  const scanFile = useCallback(async (file: File, scanOptions: BrowserScanFileOptions = {}) => {
    setScanning(true);
    try {
      const next = await session.scanFile(file, scanOptions);
      setOutcome(next);
      return next;
    } finally {
      setScanning(false);
    }
  }, [session]);
  const cancel = useCallback(() => { session.cancel(); setScanning(false); }, [session]);
  const reset = useCallback(() => { session.cancel(); setScanning(false); setOutcome(null); }, [session]);
  return { session, outcome, scanning, scanFile, cancel, reset };
}
