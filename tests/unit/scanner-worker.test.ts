import { describe, expect, it } from "vitest";
import { BrowserScannerFrameDecoder } from "../../packages/browser/src/scanner/scanner-session";
import { DecodeWorkerClient, type DecodeWorkerLike } from "../../packages/browser/src/worker/worker-client";
import type { WorkerRequest, WorkerResponse } from "../../packages/browser/src/worker/worker-messages";
import { createRgbaFrame, sdkError } from "@scanly/core";
import { getBuiltinScenario } from "@scanly/scenario-schema";
describe("Scanner worker contract", () => it("exposes bounded worker statistics", () => { const d = new BrowserScannerFrameDecoder({ useWorker: false }); expect(d.getStatistics().activeTaskCount).toBe(0); d.dispose(); }));
it("reuses one persistent Worker for 1,000 sequential frames", async () => {
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
