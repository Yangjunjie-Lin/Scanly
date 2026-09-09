"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [session] = useState(() => new BrowserCaptureSession(options));
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [scanning, setScanning] = useState(false);
  const mounted = useRef(true);
  const stateEpoch = useRef(0);
  const nextCallId = useRef(0);
  const latestCallId = useRef(0);
  const activeCalls = useRef(new Map<number, number>());
  const lifecycleGeneration = useRef(0);
  useEffect(() => {
    const calls = activeCalls.current;
    lifecycleGeneration.current += 1;
    mounted.current = true;
    setScanning(calls.size > 0);
    session.initialize();
    session.start();
    return () => {
      mounted.current = false;
      stateEpoch.current += 1;
      calls.clear();
      session.cancel();
      const cleanupGeneration = ++lifecycleGeneration.current;
      queueMicrotask(() => {
        if (lifecycleGeneration.current === cleanupGeneration) void session.dispose();
      });
    };
  }, [session]);
  const scanFile = useCallback(async (file: File, scanOptions: BrowserScanFileOptions = {}) => {
    const callId = ++nextCallId.current;
    const epoch = stateEpoch.current;
    latestCallId.current = callId;
    activeCalls.current.set(callId, epoch);
    if (mounted.current) setScanning(true);
    try {
      const next = await session.scanFile(file, scanOptions);
      if (mounted.current && stateEpoch.current === epoch && latestCallId.current === callId) setOutcome(next);
      return next;
    } finally {
      if (stateEpoch.current === epoch) {
        activeCalls.current.delete(callId);
        if (mounted.current) setScanning(activeCalls.current.size > 0);
      }
    }
  }, [session]);
  const cancel = useCallback(() => {
    stateEpoch.current += 1;
    activeCalls.current.clear();
    session.cancel();
    if (mounted.current) setScanning(false);
  }, [session]);
  const reset = useCallback(() => {
    stateEpoch.current += 1;
    activeCalls.current.clear();
    session.cancel();
    if (mounted.current) {
      setScanning(false);
      setOutcome(null);
    }
  }, [session]);
  return { session, outcome, scanning, scanFile, cancel, reset };
}
