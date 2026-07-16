import { describe, expect, it, vi } from "vitest";
import { createRgbaFrame, type ScanOutcome } from "@scanly/core";
import { DecodeWorkerClient, fromTransferableFrame, toTransferableFrame, type DecodeWorkerLike, type WorkerRequest, type WorkerResponse } from "@scanly/browser";
import { getBuiltinScenario } from "@scanly/scenario-schema";

class FakeWorker implements DecodeWorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: WorkerRequest[] = [];
  readonly terminate = vi.fn();
  postMessage(message: WorkerRequest): void { this.posted.push(message); }
  emit(message: WorkerResponse): void { this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>); }
}

function frame(id = "frame") { return createRgbaFrame(new Uint8ClampedArray(16), 2, 2, { id, sourceType: "upload", ownership: "transferred" }); }
function success(frameId = "frame"): ScanOutcome {
  const result = { format: "qr_code" as const, rawText: "OK", engine: { id: "fake", version: "1" }, preprocessingPath: [], frameId, structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 2 } };
  return { ok: true, results: [result], primary: result, frameId, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 2 } };
}

describe("normalized Worker runtime", () => {
  it("round-trips normalized transferable frame metadata", () => {
    const source = frame("roundtrip");
    const { serialized, transfer } = toTransferableFrame(source);
    expect(transfer).toHaveLength(1);
    expect(fromTransferableFrame(serialized)).toMatchObject({ id: "roundtrip", width: 2, height: 2, pixelFormat: "rgba8888", ownership: "transferred" });
  });

  it("posts a validated scenario and returns public Router outcomes", async () => {
    const worker = new FakeWorker();
    const stages: string[] = [];
    const progress: number[] = [];
    const client = new DecodeWorkerClient(() => worker);
    const pending = client.scan(frame(), getBuiltinScenario("fast"), { onStage: (stage) => stages.push(stage), onProgress: ({ attemptCount }) => progress.push(attemptCount) });
    const request = worker.posted[0];
    expect(request.type).toBe("scan");
    if (request.type !== "scan") throw new Error("expected scan request");
    worker.emit({ type: "stage", jobId: request.jobId, stage: "Routing normalized frame..." });
    worker.emit({ type: "progress", jobId: request.jobId, attemptCount: 1 });
    worker.emit({ type: "result", jobId: request.jobId, outcome: success() });
    const outcome = await pending;
    expect(outcome.ok).toBe(true);
    expect(stages).toEqual(["Routing normalized frame..."]);
    expect(progress).toEqual([1]);
    expect(outcome.timing.workerSetupMs).toBeTypeOf("number");
  });

  it("reuses one initialized Worker across sequential camera-style frames", async () => {
    const workers: FakeWorker[] = [];
    const client = new DecodeWorkerClient(() => { const worker = new FakeWorker(); workers.push(worker); return worker; });
    for (const id of ["camera-one", "camera-two"]) {
      const pending = client.scan(frame(id), getBuiltinScenario("fast"));
      const request = workers[0].posted.at(-1)!;
      if (request.type !== "scan") throw new Error("expected scan request");
      workers[0].emit({ type: "result", jobId: request.jobId, outcome: success(id) });
      expect((await pending).frameId).toBe(id);
    }
    expect(workers).toHaveLength(1);
    expect(workers[0].terminate).not.toHaveBeenCalled();
    client.dispose();
  });

  it("ignores stale responses from replaced jobs", async () => {
    const workers: FakeWorker[] = [];
    const client = new DecodeWorkerClient(() => { const worker = new FakeWorker(); workers.push(worker); return worker; });
    const first = client.scan(frame("one"), getBuiltinScenario("fast"));
    const firstRequest = workers[0].posted[0];
    const second = client.scan(frame("two"), getBuiltinScenario("fast"));
    expect((await first).ok).toBe(false);
    const secondRequest = workers[1].posted[0];
    if (firstRequest.type !== "scan" || secondRequest.type !== "scan") throw new Error("expected scan requests");
    workers[0].emit({ type: "result", jobId: firstRequest.jobId, outcome: success("one") });
    workers[1].emit({ type: "result", jobId: secondRequest.jobId, outcome: success("two") });
    expect((await second).frameId).toBe("two");
  });

  it("cancellation settles immediately and terminates the Worker", async () => {
    const worker = new FakeWorker();
    const client = new DecodeWorkerClient(() => worker);
    const pending = client.scan(frame(), getBuiltinScenario("fast"));
    client.cancel();
    const outcome = await pending;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("cancelled");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("maps Worker crashes and malformed responses to typed failures", async () => {
    const worker = new FakeWorker();
    const client = new DecodeWorkerClient(() => worker);
    const crashed = client.scan(frame(), getBuiltinScenario("fast"));
    worker.onerror?.({ message: "boom" } as ErrorEvent);
    const crashOutcome = await crashed;
    expect(crashOutcome.ok).toBe(false);
    if (!crashOutcome.ok) expect(crashOutcome.error.code).toBe("worker_initialization_failure");
  });

  it("maps Worker construction failure without leaking a job", async () => {
    const client = new DecodeWorkerClient(() => { throw new Error("blocked by CSP"); });
    const outcome = await client.scan(frame(), getBuiltinScenario("fast"));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("worker_initialization_failure");
  });

  it("survives 500 Worker terminate, recreate, cancellation, and recovery cycles", async () => {
    const workers: FakeWorker[] = [];
    const client = new DecodeWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    for (let index = 0; index < 500; index++) {
      const cancelled = client.scan(frame(`cancel-${index}`), getBuiltinScenario("fast"));
      client.cancel();
      expect((await cancelled).ok).toBe(false);

      const recovered = client.scan(frame(`recover-${index}`), getBuiltinScenario("fast"));
      const worker = workers.at(-1)!;
      const request = worker.posted[0];
      if (request.type !== "scan") throw new Error("expected scan request");
      worker.emit({ type: "result", jobId: request.jobId, outcome: success(`recover-${index}`) });
      expect((await recovered).ok).toBe(true);
      client.dispose();
    }
    expect(workers).toHaveLength(1_000);
    expect(workers.filter((worker) => worker.terminate.mock.calls.length === 1)).toHaveLength(1_000);
  });
});
