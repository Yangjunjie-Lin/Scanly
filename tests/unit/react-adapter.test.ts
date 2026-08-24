import { beforeEach, describe, expect, it, vi } from "vitest";
import { sdkError, type ScanOutcome } from "@scanly/core";

const reactHarness = vi.hoisted(() => {
  type EffectSlot = {
    dependencies?: readonly unknown[];
    setup: () => void | (() => void);
    cleanup?: () => void;
  };
  let stateSlots: unknown[] = [];
  let refSlots: Array<{ current: unknown }> = [];
  let effectSlots: EffectSlot[] = [];
  let stateCursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  let mounted = true;
  let staleWrites = 0;
  return {
    reset() {
      stateSlots = [];
      refSlots = [];
      effectSlots = [];
      stateCursor = 0;
      refCursor = 0;
      effectCursor = 0;
      mounted = true;
      staleWrites = 0;
    },
    beginRender() { stateCursor = 0; refCursor = 0; effectCursor = 0; },
    useState<T>(initial: T | (() => T)): [T, (value: T | ((current: T) => T)) => void] {
      const index = stateCursor++;
      if (!(index in stateSlots)) stateSlots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      return [stateSlots[index] as T, (value) => {
        if (!mounted) staleWrites += 1;
        const current = stateSlots[index] as T;
        stateSlots[index] = typeof value === "function" ? (value as (previous: T) => T)(current) : value;
      }];
    },
    useRef<T>(initial: T): { current: T } {
      const index = refCursor++;
      if (!(index in refSlots)) refSlots[index] = { current: initial };
      return refSlots[index] as { current: T };
    },
    useCallback<T extends (...args: never[]) => unknown>(callback: T): T { return callback; },
    useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void {
      const index = effectCursor++;
      const previous = effectSlots[index];
      const changed = !previous || !dependencies || !previous.dependencies || dependencies.length !== previous.dependencies.length || dependencies.some((value, dependencyIndex) => value !== previous.dependencies![dependencyIndex]);
      if (!changed) return;
      previous?.cleanup?.();
      const cleanup = effect();
      effectSlots[index] = { dependencies, setup: effect, ...(cleanup ? { cleanup } : {}) };
    },
    strictModeReplayEffects() {
      for (const effect of effectSlots) effect.cleanup?.();
      for (const effect of effectSlots) {
        const cleanup = effect.setup();
        effect.cleanup = cleanup ?? undefined;
      }
    },
    unmount() {
      mounted = false;
      for (const effect of effectSlots) effect.cleanup?.();
      effectSlots = [];
    },
    staleWrites: () => staleWrites,
  };
});

const browserHarness = vi.hoisted(() => ({
  initialize: vi.fn(),
  start: vi.fn(),
  scanFile: vi.fn(),
  cancel: vi.fn(),
  dispose: vi.fn(),
  lifecycle: "idle" as "idle" | "initialized" | "running" | "disposed",
}));

function sessionDisposed(): Error {
  return Object.assign(new Error("Browser capture session has been disposed."), { code: "session_disposed" });
}

vi.mock("react", () => ({
  useState: reactHarness.useState,
  useRef: reactHarness.useRef,
  useCallback: reactHarness.useCallback,
  useEffect: reactHarness.useEffect,
}));

vi.mock("@scanly/browser", () => ({
  BrowserCaptureSession: class {
    initialize(): void {
      if (browserHarness.lifecycle === "disposed") throw sessionDisposed();
      browserHarness.initialize();
      browserHarness.lifecycle = "initialized";
    }
    start(): void {
      if (browserHarness.lifecycle === "disposed") throw sessionDisposed();
      browserHarness.start();
      browserHarness.lifecycle = "running";
    }
    scanFile(file: File, options: unknown): Promise<ScanOutcome> {
      if (browserHarness.lifecycle === "disposed") return Promise.reject(sessionDisposed());
      return browserHarness.scanFile(file, options);
    }
    cancel(): void { browserHarness.cancel(); }
    dispose(): Promise<void> {
      if (browserHarness.lifecycle === "disposed") return Promise.resolve();
      browserHarness.lifecycle = "disposed";
      return browserHarness.dispose();
    }
  },
}));

import { useScanly } from "../../packages/react/src/index";

const file = {} as File;

function success(frameId: string): ScanOutcome {
  const result = { format: "qr_code" as const, rawText: frameId, engine: { id: "fake", version: "1" }, preprocessingPath: [], frameId, structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 } };
  return { ok: true, results: [result], primary: result, frameId, scenarioId: "balanced", attemptCount: 1, timing: { totalMs: 1 } };
}

function failure(code: "cancelled" | "concurrent_call_rejected", frameId: string): ScanOutcome {
  return { ok: false, error: sdkError(code, code), frameId, scenarioId: "balanced", attemptCount: 0, timing: { totalMs: 0 } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
}

function HookHarness() {
  reactHarness.beginRender();
  return useScanly();
}

beforeEach(() => {
  reactHarness.reset();
  browserHarness.initialize.mockReset();
  browserHarness.start.mockReset();
  browserHarness.scanFile.mockReset();
  browserHarness.cancel.mockReset();
  browserHarness.dispose.mockReset().mockResolvedValue(undefined);
  browserHarness.lifecycle = "idle";
});

describe("useScanly operation ownership", () => {
  it("keeps scanning true when a replaced call settles before its replacement", async () => {
    const first = deferred<ScanOutcome>();
    const second = deferred<ScanOutcome>();
    browserHarness.scanFile.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    let hook = HookHarness();

    const firstScan = hook.scanFile(file);
    hook = HookHarness();
    const secondScan = hook.scanFile(file);
    first.resolve(failure("cancelled", "first"));
    await firstScan;
    hook = HookHarness();

    expect(hook.scanning).toBe(true);
    expect(hook.outcome).toBeNull();

    second.resolve(success("second"));
    await secondScan;
    hook = HookHarness();
    expect(hook.scanning).toBe(false);
    expect(hook.outcome?.frameId).toBe("second");
  });

  it("keeps scanning true when a rejected concurrent call settles while the accepted call remains active", async () => {
    const first = deferred<ScanOutcome>();
    browserHarness.scanFile.mockReturnValueOnce(first.promise).mockResolvedValueOnce(failure("concurrent_call_rejected", "second"));
    let hook = HookHarness();

    const firstScan = hook.scanFile(file);
    hook = HookHarness();
    const rejected = await hook.scanFile(file);
    hook = HookHarness();

    expect(rejected.ok).toBe(false);
    expect(hook.scanning).toBe(true);
    expect(hook.outcome?.frameId).toBe("second");

    first.resolve(success("first"));
    await firstScan;
    hook = HookHarness();
    expect(hook.scanning).toBe(false);
    expect(hook.outcome?.frameId).toBe("second");
  });

  it("invalidates a pending completion when reset clears public state", async () => {
    const pending = deferred<ScanOutcome>();
    browserHarness.scanFile.mockReturnValueOnce(pending.promise);
    let hook = HookHarness();
    const scan = hook.scanFile(file);
    hook = HookHarness();
    expect(hook.scanning).toBe(true);

    hook.reset();
    hook = HookHarness();
    expect(hook.scanning).toBe(false);
    expect(hook.outcome).toBeNull();
    pending.resolve(success("late-reset"));
    await scan;
    hook = HookHarness();

    expect(hook.scanning).toBe(false);
    expect(hook.outcome).toBeNull();
  });

  it("invalidates a pending completion when cancel immediately releases public ownership", async () => {
    const pending = deferred<ScanOutcome>();
    browserHarness.scanFile.mockReturnValueOnce(pending.promise);
    let hook = HookHarness();
    const scan = hook.scanFile(file);
    hook = HookHarness();
    expect(hook.scanning).toBe(true);

    hook.cancel();
    hook = HookHarness();
    expect(hook.scanning).toBe(false);
    expect(hook.outcome).toBeNull();
    pending.resolve(success("late-cancel"));
    await scan;
    hook = HookHarness();

    expect(hook.scanning).toBe(false);
    expect(hook.outcome).toBeNull();
  });

  it("disposes the session and suppresses pending state writes after unmount", async () => {
    const pending = deferred<ScanOutcome>();
    browserHarness.scanFile.mockReturnValueOnce(pending.promise);
    const hook = HookHarness();
    const scan = hook.scanFile(file);

    reactHarness.unmount();
    await flushMicrotasks();
    expect(browserHarness.dispose).toHaveBeenCalledOnce();
    pending.resolve(success("late-unmount"));
    await scan;

    expect(reactHarness.staleWrites()).toBe(0);
  });
});

describe("useScanly StrictMode effect replay", () => {
  it("replays setup after transient cleanup without disposing the live session", async () => {
    HookHarness();

    expect(() => reactHarness.strictModeReplayEffects()).not.toThrow();
    await flushMicrotasks();

    expect(browserHarness.lifecycle).toBe("running");
    expect(browserHarness.initialize).toHaveBeenCalledTimes(2);
    expect(browserHarness.start).toHaveBeenCalledTimes(2);
    expect(browserHarness.cancel).toHaveBeenCalledOnce();
    expect(browserHarness.dispose).not.toHaveBeenCalled();
  });

  it("keeps scanFile usable after replay", async () => {
    browserHarness.scanFile.mockResolvedValueOnce(success("after-replay"));
    let hook = HookHarness();
    reactHarness.strictModeReplayEffects();
    await flushMicrotasks();

    const result = await hook.scanFile(file);
    hook = HookHarness();

    expect(result.frameId).toBe("after-replay");
    expect(hook.outcome?.frameId).toBe("after-replay");
    expect(hook.scanning).toBe(false);
  });

  it("finally disposes exactly once on real unmount after replay", async () => {
    HookHarness();
    reactHarness.strictModeReplayEffects();
    await flushMicrotasks();
    expect(browserHarness.dispose).not.toHaveBeenCalled();

    reactHarness.unmount();
    await flushMicrotasks();

    expect(browserHarness.dispose).toHaveBeenCalledOnce();
    expect(browserHarness.lifecycle).toBe("disposed");
  });

  it("suppresses a pending completion after real unmount following replay", async () => {
    const pending = deferred<ScanOutcome>();
    browserHarness.scanFile.mockReturnValueOnce(pending.promise);
    const hook = HookHarness();
    reactHarness.strictModeReplayEffects();
    const scan = hook.scanFile(file);

    reactHarness.unmount();
    await flushMicrotasks();
    pending.resolve(success("late-real-unmount"));
    await scan;

    expect(browserHarness.dispose).toHaveBeenCalledOnce();
    expect(reactHarness.staleWrites()).toBe(0);
  });

  it("invalidates an active scan across transient cleanup and accepts the next scan", async () => {
    const first = deferred<ScanOutcome>();
    browserHarness.scanFile.mockReturnValueOnce(first.promise).mockResolvedValueOnce(success("second"));
    let hook = HookHarness();
    const firstScan = hook.scanFile(file);
    hook = HookHarness();
    expect(hook.scanning).toBe(true);

    reactHarness.strictModeReplayEffects();
    await flushMicrotasks();
    hook = HookHarness();
    expect(hook.scanning).toBe(false);
    expect(browserHarness.cancel).toHaveBeenCalledOnce();
    first.resolve(success("stale-first"));
    await firstScan;
    hook = HookHarness();
    expect(hook.outcome).toBeNull();

    const second = await hook.scanFile(file);
    hook = HookHarness();
    expect(second.frameId).toBe("second");
    expect(hook.outcome?.frameId).toBe("second");
    expect(hook.scanning).toBe(false);
  });

  it("keeps cancel and reset deterministic after replay", async () => {
    const cancelled = deferred<ScanOutcome>();
    const reset = deferred<ScanOutcome>();
    browserHarness.scanFile.mockReturnValueOnce(cancelled.promise).mockReturnValueOnce(reset.promise);
    let hook = HookHarness();
    reactHarness.strictModeReplayEffects();
    await flushMicrotasks();

    const cancelledScan = hook.scanFile(file);
    hook = HookHarness();
    hook.cancel();
    cancelled.resolve(success("late-cancel-after-replay"));
    await cancelledScan;
    hook = HookHarness();
    expect(hook.scanning).toBe(false);
    expect(hook.outcome).toBeNull();

    const resetScan = hook.scanFile(file);
    hook = HookHarness();
    hook.reset();
    reset.resolve(success("late-reset-after-replay"));
    await resetScan;
    hook = HookHarness();
    expect(hook.scanning).toBe(false);
    expect(hook.outcome).toBeNull();
  });

  it("survives repeated replays without double disposal or stale publication", async () => {
    const pending = deferred<ScanOutcome>();
    browserHarness.scanFile.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(success("usable"));
    let hook = HookHarness();
    const staleScan = hook.scanFile(file);

    expect(() => reactHarness.strictModeReplayEffects()).not.toThrow();
    expect(() => reactHarness.strictModeReplayEffects()).not.toThrow();
    expect(() => reactHarness.strictModeReplayEffects()).not.toThrow();
    await flushMicrotasks();
    pending.resolve(success("stale-after-replays"));
    await staleScan;
    hook = HookHarness();
    expect(hook.outcome).toBeNull();

    await hook.scanFile(file);
    hook = HookHarness();
    expect(hook.outcome?.frameId).toBe("usable");
    expect(browserHarness.dispose).not.toHaveBeenCalled();

    reactHarness.unmount();
    await flushMicrotasks();
    expect(browserHarness.dispose).toHaveBeenCalledOnce();
    expect(reactHarness.staleWrites()).toBe(0);
  });
});
