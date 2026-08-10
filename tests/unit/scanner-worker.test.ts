import { describe, expect, it, vi } from "vitest";
import { BrowserScannerFrameDecoder } from "../../packages/browser/src/scanner/scanner-session";
import { DecodeWorkerClient, type DecodeWorkerLike } from "../../packages/browser/src/worker/worker-client";
import type { WorkerRequest, WorkerResponse } from "../../packages/browser/src/worker/worker-messages";
import { CaptureRouter, createRgbaFrame, sdkError, type NormalizedFrame, type ScanOutcome } from "@scanly/core";
import { getBuiltinScenario } from "@scanly/scenario-schema";
describe("Scanner worker contract", () => it("exposes bounded worker statistics", () => { const d = new BrowserScannerFrameDecoder({ useWorker: false }); expect(d.getStatistics().activeTaskCount).toBe(0); d.dispose(); }));
it("reuses one Worker-like test double for 1,000 sequential component calls", async () => {
  class WorkerStub implements DecodeWorkerLike {
    onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    terminate(): void {}
    postMessage(message: WorkerRequest): void {
      if (message.type !== "scan") return;
      queueMicrotask(() => this.onmessage?.({ data: { type: "result", jobId: message.jobId, generation: message.generation, outcome: { ok: false, error: sdkError("no_symbol_found", "sequence miss"), frameId: message.frame.id, scenarioId: message.scenario.id, attemptCount: 1, timing: { totalMs: 0 } } } } as MessageEvent<WorkerResponse>));
    }
  }
  const client = new DecodeWorkerClient(() => new WorkerStub()); const scenario = getBuiltinScenario("fast");
  for (let index = 0; index < 1_000; index += 1) await client.scan(createRgbaFrame(new Uint8ClampedArray(16), 2, 2, { id: `worker-${index}`, ownership: "owned" }), scenario);
  expect(client.getStatistics()).toMatchObject({ workerCreatedCount: 1, workerTerminatedCount: 0, activeTaskCount: 0, peakActiveTaskCount: 1 });
  client.dispose(); expect(client.getStatistics().workerTerminatedCount).toBe(1);
});

it("recovers from a malformed Worker response through the documented main-thread fallback", async () => {
  const success = (frameId: string): ScanOutcome => {
    const result = { format: "qr_code" as const, rawText: "FALLBACK", engine: { id: "fake", version: "1" }, preprocessingPath: [], frameId, structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 } };
    return { ok: true, results: [result], primary: result, frameId, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } };
  };
  class FallbackRouter extends CaptureRouter {
    override scan(frame: NormalizedFrame): Promise<ScanOutcome> { return Promise.resolve(success(frame.id)); }
    override updateScenario(): void {}
  }
  const router = new FallbackRouter();
  const routerSpy = vi.spyOn(router, "scan");
  const worker = {
    onmessage: null as ((event: MessageEvent<WorkerResponse>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    postMessage: vi.fn(function (this: { onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null }, request: WorkerRequest) {
      if (request.type !== "scan") return;
      queueMicrotask(() => this.onmessage?.({ data: null } as unknown as MessageEvent<WorkerResponse>));
    }),
    terminate: vi.fn(),
  } satisfies DecodeWorkerLike;
  const decoder = new BrowserScannerFrameDecoder({ router, workerFactory: () => worker, useWorker: true, disposeRouter: false });
  const outcome = await decoder.decode(
    createRgbaFrame(new Uint8ClampedArray(16), 2, 2, { id: "malformed-fallback", ownership: "owned" }),
    {
      profile: "fast",
      quality: {
        blurScore: 1,
        brightness: 0.5,
        contrast: 0.5,
        glareRatio: 0,
        edgeDensity: 0.5,
        underexposed: false,
        overexposed: false,
        blurred: false,
        glareDominated: false,
        usable: true,
      },
      signal: new AbortController().signal,
      generation: 1,
    },
  );

  expect(outcome.ok).toBe(true);
  expect(routerSpy).toHaveBeenCalledOnce();
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(decoder.getStatistics()).toMatchObject({ workerCreatedCount: 1, workerTerminatedCount: 1 });
  await decoder.dispose();
});
