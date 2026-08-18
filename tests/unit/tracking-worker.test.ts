import { describe, expect, it, vi } from "vitest";
import {
  createRgbaFrame,
  type ScanOutcome,
  type ScanResult,
} from "../../packages/core/src/index";
import {
  BrowserScannerFrameDecoder,
  ScannerSession,
} from "../../packages/browser/src/scanner/scanner-session";
import { DeterministicFrameSequenceSource } from "../../packages/browser/src/scanner/frame-source";
import { BarcodeTracker } from "../../packages/browser/src/tracking/barcode-tracker";
import type { DecodeWorkerLike } from "../../packages/browser/src/worker/worker-client";
import type { WorkerRequest, WorkerResponse } from "../../packages/browser/src/worker/worker-messages";
import { getBuiltinScenario } from "../../packages/scenario-schema/src/index";

const PAYLOADS = ["TRACKING-WORKER-A", "TRACKING-WORKER-B"] as const;

function result(frameId: string, payload: string, x: number): ScanResult {
  return {
    format: "qr_code",
    rawText: payload,
    cornerPoints: [
      { x, y: 1 },
      { x: x + 4, y: 1 },
      { x: x + 4, y: 5 },
      { x, y: 5 },
    ],
    engine: { id: "zxing-cpp-wasm", version: "test", executionModel: "wasm" },
    preprocessingPath: [],
    frameId,
    structuredPayload: null,
    validation: { valid: true, validatorIds: [], messages: [] },
    warnings: [],
    timing: { totalMs: 1 },
  };
}

class MultiResultWorker implements DecodeWorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly terminate = vi.fn();
  decodeCount = 0;

  postMessage(message: WorkerRequest): void {
    if (message.type !== "scan") return;
    this.decodeCount += 1;
    const results = [
      result(message.frame.id, PAYLOADS[0], 1),
      result(message.frame.id, PAYLOADS[1], 12),
    ] as [ScanResult, ...ScanResult[]];
    const outcome: ScanOutcome = {
      ok: true,
      results,
      primary: results[0],
      frameId: message.frame.id,
      scenarioId: message.scenario.id,
      attemptCount: 1,
      timing: { totalMs: 1 },
    };
    queueMicrotask(() => this.onmessage?.({
      data: {
        type: "result",
        jobId: message.jobId,
        generation: message.generation,
        outcome,
        wasmMemory: {
          initialLinearMemoryBytes: 1_024,
          currentLinearMemoryBytes: 1_024,
          peakLinearMemoryBytes: 1_024,
          inputAllocationBytes: 0,
          peakInputAllocationBytes: 160,
          activeNativeResultCount: 0,
          releasedNativeResultCount: this.decodeCount * PAYLOADS.length,
        },
      },
    } as MessageEvent<WorkerResponse>));
  }
}

describe("tracking Worker multi-result contract", () => {
  it("preserves complete Worker observation sets through ScannerSession into BarcodeTracker", async () => {
    const worker = new MultiResultWorker();
    const scenario = getBuiltinScenario("balanced");
    scenario.acceptedFormats = ["qr_code"];
    scenario.multiCode = { ...scenario.multiCode, enabled: true, maxResults: PAYLOADS.length };
    const decoder = new BrowserScannerFrameDecoder({
      useWorker: true,
      workerFactory: () => worker,
      scenario,
    });
    let disposedFrames = 0;
    const source = new DeterministicFrameSequenceSource(function* () {
      for (let index = 0; index < 2; index += 1) {
        yield createRgbaFrame(new Uint8ClampedArray(20 * 10 * 4).fill(127), 20, 10, {
          id: `tracking-worker-${index}`,
          timestampMs: 1_000 + index,
          sourceType: "camera",
          ownership: "owned",
          dispose: () => { disposedFrames += 1; },
        });
      }
    });
    const tracker = new BarcodeTracker({ confirmationObservations: 1, maxTracks: 2, maxObservations: 2 });
    const observationPayloads: string[][] = [];
    const session = new ScannerSession({
      source,
      decoder,
      confirmation: { mode: "immediate" },
      repeatPolicy: { mode: "allow" },
      quality: {
        underexposedThreshold: 0,
        overexposedThreshold: 1,
        blurThreshold: 0,
        contrastThreshold: 0,
        glareThreshold: 1,
      },
      autoZoom: { enabled: false },
    });
    session.onObservations((set) => {
      observationPayloads.push(set.observations.map((observation) => observation.barcode.text).sort());
      tracker.observeFrame(set.observations.flatMap((observation) => observation.geometry ? [{
        payload: observation.barcode.text,
        format: observation.barcode.format,
        geometry: observation.geometry,
      }] : []), { frameId: set.frameId, timestamp: set.timestamp });
    });

    await session.start();
    await source.finished();
    await vi.waitFor(() => expect(session.getState()).toBe("stopped"));

    expect(observationPayloads).toEqual([
      [...PAYLOADS].sort(),
      [...PAYLOADS].sort(),
    ]);
    expect(tracker.getTracks()).toEqual(expect.arrayContaining(PAYLOADS.map((payload) => expect.objectContaining({
      payload,
      state: "confirmed",
      observationCount: 2,
    }))));
    expect(new Set(tracker.getTracks().map((track) => track.trackId)).size).toBe(2);
    expect(new Set(tracker.getTracks().map((track) => track.physicalInstanceId)).size).toBe(2);
    expect(session.getStatistics()).toMatchObject({
      admittedFrames: 2,
      decodeSuccesses: 4,
      activeDecodeCount: 0,
      pendingFrameCount: 0,
      workerCreatedCount: 1,
      workerTerminatedCount: 0,
      activeTaskCount: 0,
      peakActiveTaskCount: 1,
      workerWasmDecodeCount: 2,
    });
    expect(tracker.getStatistics()).toMatchObject({
      processedFrames: 2,
      receivedObservations: 4,
      activeTrackCount: 2,
      pendingObservationCount: 0,
      peakTrackCount: 2,
    });
    expect(worker.decodeCount).toBe(2);
    expect(disposedFrames).toBe(2);

    await session.dispose();
    await decoder.dispose();
    tracker.dispose();

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(decoder.getStatistics()).toMatchObject({
      workerCreatedCount: 1,
      workerTerminatedCount: 1,
      activeTaskCount: 0,
      wasmInputAllocationBytes: 0,
      wasmActiveNativeResultCount: 0,
      wasmCurrentLinearMemoryBytes: 0,
    });
    expect(tracker.getStatistics()).toMatchObject({
      activeTrackCount: 0,
      lostTrackCount: 0,
      pendingObservationCount: 0,
    });
  });
});
