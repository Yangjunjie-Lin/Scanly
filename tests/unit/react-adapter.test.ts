import { beforeEach, describe, expect, it, vi } from "vitest";
import { sdkError, type ScanOutcome } from "@scanly/core";

const reactHarness = vi.hoisted(() => {
  type EffectSlot = { dependencies?: readonly unknown[]; cleanup?: () => void };
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
      effectSlots[index] = { dependencies, ...(cleanup ? { cleanup } : {}) };
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
}));

vi.mock("react", () => ({
  useState: reactHarness.useState,
  useRef: reactHarness.useRef,
  useCallback: reactHarness.useCallback,
  useEffect: reactHarness.useEffect,
}));

vi.mock("@scanly/browser", () => ({
  BrowserCaptureSession: class {
    initialize(): void { browserHarness.initialize(); }
    start(): void { browserHarness.start(); }
    scanFile(file: File, options: unknown): Promise<ScanOutcome> { return browserHarness.scanFile(file, options); }
    cancel(): void { browserHarness.cancel(); }
    dispose(): Promise<void> { return browserHarness.dispose(); }
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
    expect(browserHarness.dispose).toHaveBeenCalledOnce();
    pending.resolve(success("late-unmount"));
    await scan;

    expect(reactHarness.staleWrites()).toBe(0);
  });
});
