import { describe, expect, it, vi } from "vitest";
import { DecodeWorkerClient, fromTransferable, toTransferable, type DecodeWorkerLike, type WorkerRequest, type WorkerResponse } from "@scanly/browser";
import { createPixelBuffer } from "@scanly/core/qr";

class FakeWorker implements DecodeWorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: WorkerRequest[] = [];
  terminated = false;

  postMessage(message: WorkerRequest): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: WorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>);
  }

  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function pixels() {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  data.fill(255);
  return createPixelBuffer(data, 4, 4);
}

function success(jobId: string, payload: string): WorkerResponse {
  return {
    type: "result",
    jobId,
    outcome: {
      ok: true,
      results: [{
        payload,
        decoder: "jsqr",
        preprocessing: "original",
        candidateIndex: 0,
        scale: "original",
        rotation: 0,
        cropPadding: "full",
        attemptIndex: 0,
      }],
      primary: {
        payload,
        decoder: "jsqr",
        preprocessing: "original",
        candidateIndex: 0,
        scale: "original",
        rotation: 0,
        cropPadding: "full",
        attemptIndex: 0,
      },
      attempts: [],
      attemptCount: 1,
      elapsedMs: 10,
      cancelled: false,
    },
  };
}

describe("transferable pixel buffers", () => {
  it("round-trips dimensions and pixel bytes", () => {
    const input = pixels();
    const { serialized, transfer } = toTransferable(input);
    expect(transfer).toEqual([serialized.buffer]);
    const output = fromTransferable(serialized);
    expect(output.width).toBe(4);
    expect([...output.data]).toEqual([...input.data]);
  });

  it("copies a view that does not own its full backing buffer", () => {
    const backing = new Uint8ClampedArray(80);
    const view = backing.subarray(8, 72);
    const { serialized } = toTransferable(createPixelBuffer(view, 4, 4));
    expect(serialized.buffer).not.toBe(backing.buffer);
    expect(serialized.buffer.byteLength).toBe(64);
  });
});

describe("DecodeWorkerClient ownership and cancellation", () => {
  it("forwards ordered stage/progress and resolves the active result", async () => {
    const workers: FakeWorker[] = [];
    const stages: string[] = [];
    const progress: number[] = [];
    const client = new DecodeWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });

    const pending = client.decode(pixels(), {
      onStage: (stage) => stages.push(stage),
      onProgress: (item) => progress.push(item.attemptCount),
    });
    const request = workers[0].messages[0];
    expect(request.type).toBe("decode");
    if (request.type !== "decode") throw new Error("expected decode request");

    workers[0].emit({ type: "stage", jobId: request.jobId, stage: "Detecting" });
    workers[0].emit({ type: "progress", jobId: request.jobId, attemptCount: 1 });
    workers[0].emit({ type: "progress", jobId: request.jobId, attemptCount: 2 });
    workers[0].emit(success(request.jobId, "ACTIVE"));

    const outcome = await pending;
    expect(stages).toEqual(["Detecting"]);
    expect(progress).toEqual([1, 2]);
    expect(outcome.ok && outcome.primary.payload).toBe("ACTIVE");
    expect(outcome.phaseTiming?.workerTransferMs).toBeGreaterThanOrEqual(0);
  });

  it("settles a cancelled job, ignores stale messages, and restarts for the next job", async () => {
    const workers: FakeWorker[] = [];
    const staleSuccess = vi.fn();
    const client = new DecodeWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });

    const first = client.decode(pixels(), { onStage: staleSuccess });
    const firstRequest = workers[0].messages[0];
    if (firstRequest.type !== "decode") throw new Error("expected decode request");
    const second = client.decode(pixels());
    expect((await first).ok).toBe(false);
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);

    workers[0].emit({ type: "stage", jobId: firstRequest.jobId, stage: "STALE" });
    workers[0].emit(success(firstRequest.jobId, "STALE"));
    expect(staleSuccess).not.toHaveBeenCalled();

    const secondRequest = workers[1].messages[0];
    if (secondRequest.type !== "decode") throw new Error("expected decode request");
    workers[1].emit(success(secondRequest.jobId, "FRESH"));
    const outcome = await second;
    expect(outcome.ok && outcome.primary.payload).toBe("FRESH");
  });

  it("does not let an already-aborted late caller cancel the current owner", async () => {
    const workers: FakeWorker[] = [];
    const client = new DecodeWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const current = client.decode(pixels());
    const currentRequest = workers[0].messages[0];
    if (currentRequest.type !== "decode") throw new Error("expected decode request");

    const staleController = new AbortController();
    staleController.abort();
    const stale = await client.decode(pixels(), { signal: staleController.signal });
    expect(stale.ok).toBe(false);
    expect(workers[0].terminated).toBe(false);

    workers[0].emit(success(currentRequest.jobId, "CURRENT_OWNER"));
    const outcome = await current;
    expect(outcome.ok && outcome.primary.payload).toBe("CURRENT_OWNER");
  });

  it("records in-flight cancellation latency and can run another task", async () => {
    const workers: FakeWorker[] = [];
    const client = new DecodeWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const first = client.decode(pixels());
    client.cancel();
    const cancelled = await first;
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) {
      expect(cancelled.reason).toBe("cancelled");
      expect(cancelled.cancelled).toBe(true);
      expect(cancelled.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(cancelled.phaseTiming?.cancellationLatencyMs).toBeLessThan(2_000);
    }

    const next = client.decode(pixels());
    const request = workers.at(-1)?.messages[0];
    if (!request || request.type !== "decode") throw new Error("expected decode request");
    workers.at(-1)?.emit(success(request.jobId, "AFTER_CANCEL"));
    expect((await next).ok).toBe(true);
  });

  it("maps worker errors and terminates on dispose", async () => {
    const worker = new FakeWorker();
    const client = new DecodeWorkerClient(() => worker);
    const pending = client.decode(pixels());
    worker.fail("boom");
    const outcome = await pending;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("worker_error");
      expect(outcome.message).toContain("boom");
    }
    expect(worker.terminated).toBe(true);
    client.dispose();
  });

  it("survives 100 termination-based cancellation and recreation cycles", async () => {
    const workers: FakeWorker[] = [];
    const client = new DecodeWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    for (let index = 0; index < 100; index++) {
      const pending = client.decode(pixels());
      client.cancel();
      const outcome = await pending;
      expect(outcome.ok, `cycle ${index}`).toBe(false);
    }
    expect(workers).toHaveLength(100);
    expect(workers.every((worker) => worker.terminated)).toBe(true);
    const recovery = client.decode(pixels());
    const worker = workers.at(-1);
    const request = worker?.messages[0];
    if (!worker || !request || request.type !== "decode") throw new Error("expected recovery request");
    worker.emit(success(request.jobId, "RECOVERED"));
    expect((await recovery).ok).toBe(true);
  });
});
