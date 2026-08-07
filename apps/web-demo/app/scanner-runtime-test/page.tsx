"use client";

import { useEffect, useState } from "react";
import { DeterministicFrameSequenceSource, ScannerSession, type ScannerFrameDecoder } from "@scanly/browser";
import { createRgbaFrame, sdkError, type NormalizedFrame, type ScanOutcome } from "@scanly/core";

function frame(index: number): NormalizedFrame {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let offset = 0; offset < data.length; offset += 4) { const value = (offset / 4 + index) % 2 ? 220 : 20; data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255; }
  return createRgbaFrame(data, 32, 32, { id: `browser-sequence-${index}`, timestampMs: index * 40, sourceType: "camera", ownership: "owned" });
}

function decoder(): ScannerFrameDecoder {
  return {
    async decode(input: NormalizedFrame): Promise<ScanOutcome> {
      const index = Number(input.id.split("-").at(-1) ?? 0);
      if (index < 2) return { ok: false, error: sdkError("no_symbol_found", "simulator miss"), frameId: input.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } };
      const result = { format: "qr_code" as const, rawText: "BROWSER-SIMULATOR", cornerPoints: [{ x: 8, y: 8 }, { x: 20, y: 8 }, { x: 20, y: 20 }, { x: 8, y: 20 }], engine: { id: "jsqr", version: "simulator" }, preprocessingPath: [], frameId: input.id, structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 } };
      return { ok: true, results: [result], primary: result, frameId: input.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } };
    },
    cancel() {}, dispose() {}, getStatistics: () => ({ workerCreatedCount: 0, workerTerminatedCount: 0, activeTaskCount: 0, peakActiveTaskCount: 1 }),
  };
}

export default function ScannerRuntimeTestPage() {
  const [report, setReport] = useState("running");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const source = new DeterministicFrameSequenceSource(function* () { for (let index = 0; index < 8; index += 1) yield frame(index); });
      const session = new ScannerSession({ source, decoder: decoder(), confirmation: { mode: "confirm-two" }, repeatPolicy: { mode: "once-per-session" }, quality: { blurThreshold: 0, contrastThreshold: 0 } });
      await session.start(); await source.finished(); await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const statistics = session.getStatistics(); await session.dispose();
      if (alive) setReport(JSON.stringify({ browser: navigator.userAgent, ...statistics }));
    })();
    return () => { alive = false; };
  }, []);
  return <main><h1>Scanner runtime simulator</h1><pre data-testid="scanner-runtime-report">{report}</pre></main>;
}
