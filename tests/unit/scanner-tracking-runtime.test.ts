import { describe, expect, it, vi } from "vitest";
import {
  CaptureRouter,
  type NormalizedFrame,
  type ScanOutcome,
  type ScanResult,
} from "@scanly/core";
import {
  BrowserScannerFrameDecoder,
  DeterministicFrameSequenceSource,
  ScannerSession,
  type DecodeProfile,
  type FrameQuality,
  type ScannerDecodeRequest,
  type ScannerFrameDecoder,
} from "@scanly/browser";
import { getBuiltinScenario, validateScenario, type ScenarioDefinition } from "@scanly/scenario-schema";

const quality: FrameQuality = {
  blurScore: 1,
  brightness: 0.5,
  contrast: 1,
  glareRatio: 0,
  edgeDensity: 1,
  underexposed: false,
  overexposed: false,
  blurred: false,
  glareDominated: false,
  usable: true,
};

function frame(index: number): NormalizedFrame {
  const data = new Uint8ClampedArray(100 * 50 * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    const value = (offset / 4 + index) % 2 === 0 ? 32 : 224;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return {
    id: `tracking-${index}`,
    timestampMs: index * 40,
    width: 100,
    height: 50,
    rowStride: 400,
    pixelFormat: "rgba8888",
    orientation: 0,
    sourceType: "camera",
    data,
    ownership: "owned",
    dispose: vi.fn(),
  };
}

function result(frameId: string, payload: string, x: number): ScanResult {
  return {
    format: "qr_code",
    rawText: payload,
    cornerPoints: [
      { x, y: 10 },
      { x: x + 10, y: 10 },
      { x: x + 10, y: 20 },
      { x, y: 20 },
    ],
    engine: { id: "deterministic-tracking", version: "1" },
    preprocessingPath: [],
    frameId,
    structuredPayload: null,
    validation: { valid: true, validatorIds: [], messages: [] },
    warnings: [],
    timing: { totalMs: 1 },
  };
}

function success(frameId: string, results: [ScanResult, ...ScanResult[]]): ScanOutcome {
  return {
    ok: true,
    results,
    primary: results[0],
    frameId,
    scenarioId: "tracking",
    attemptCount: 1,
    timing: { totalMs: 1 },
  };
}

class RegionAwareDecoder implements ScannerFrameDecoder {
  readonly calls: Array<{
    frameId: string;
    profile: DecodeProfile;
    mode: ScannerDecodeRequest["mode"];
    maxResults: number | undefined;
    roiPhase: ScannerDecodeRequest["roiPhase"];
    roi: ScannerDecodeRequest["roi"];
  }> = [];

  async decode(input: NormalizedFrame, request: ScannerDecodeRequest): Promise<ScanOutcome> {
    this.calls.push({
      frameId: input.id,
      profile: request.profile,
      mode: request.mode,
      maxResults: request.maxResults,
      roiPhase: request.roiPhase,
      roi: request.roi,
    });
    const visible: [ScanResult, ...ScanResult[]] = [
      result(input.id, "TRACK-A", 5),
      result(input.id, "TRACK-B", 25),
    ];
    if (input.id === "tracking-4" && request.roiPhase === "full-frame") {
      visible.push(result(input.id, "TRACK-C", 80));
    }
    return success(input.id, visible);
  }

  cancel(): void {}
  dispose(): void {}
}

describe("ScannerSession tracking runtime", () => {
  it("uses bounded tracked/uncovered requests and recovers a newly entering target on a periodic full-frame scan", async () => {
    const frames = [frame(1), frame(2), frame(3), frame(4)];
    const source = new DeterministicFrameSequenceSource(() => frames);
    const decoder = new RegionAwareDecoder();
    const session = new ScannerSession({
      source,
      decoder,
      decodeMode: "tracking",
      tracking: {
        maxResults: 8,
        profile: "balanced",
        trackerOptions: { confirmationObservations: 1, maxMissedFrames: 3 },
        roi: {
          expansion: 0.1,
          globalScanIntervalFrames: 3,
          uncoveredGridSize: 4,
          maxUncoveredRegions: 8,
        },
        uncoveredRegionIntervalFrames: 2,
      },
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
    const trackSnapshots: Array<Array<{ payload: string; trackId: string }>> = [];
    session.onObservations(() => {
      trackSnapshots.push(session.getTracks().map((track) => ({ payload: track.payload, trackId: track.trackId })));
    });

    await session.start();
    await source.finished();
    await vi.waitFor(() => expect(session.getState()).toBe("stopped"));

    expect(decoder.calls).toHaveLength(frames.length);
    expect(decoder.calls.map((call) => call.roiPhase)).toEqual([
      "full-frame",
      "tracked-rois",
      "uncovered-regions",
      "full-frame",
    ]);
    expect(decoder.calls.map((call) => ({
      frameId: call.frameId,
      profile: call.profile,
      roi: call.roi,
    }))).toEqual([
      { frameId: "tracking-1", profile: "balanced", roi: undefined },
      { frameId: "tracking-2", profile: "balanced", roi: expect.objectContaining({ x: expect.any(Number), width: expect.any(Number) }) },
      { frameId: "tracking-3", profile: "balanced", roi: expect.objectContaining({ x: expect.any(Number), width: expect.any(Number) }) },
      { frameId: "tracking-4", profile: "balanced", roi: undefined },
    ]);
    expect(decoder.calls.every((call) => call.mode === "tracking" && call.maxResults === 8)).toBe(true);
    expect(decoder.calls[1]?.roi?.x ?? 1).toBeLessThan(0.1);
    expect((decoder.calls[1]?.roi?.x ?? 0) + (decoder.calls[1]?.roi?.width ?? 1)).toBeLessThan(0.5);
    expect(trackSnapshots.at(-1)?.map((track) => track.payload).sort()).toEqual(["TRACK-A", "TRACK-B", "TRACK-C"]);
    for (const payload of ["TRACK-A", "TRACK-B"]) {
      expect(new Set(trackSnapshots.flat().filter((track) => track.payload === payload).map((track) => track.trackId)).size).toBe(1);
    }
    expect(session.getTracks()).toHaveLength(0);
    expect(session.getTrackingStatistics()).toMatchObject({ activeTrackCount: 0, pendingObservationCount: 0 });
    expect(session.getStatistics()).toMatchObject({ capturedFrames: 4, admittedFrames: 4, finalControlledMemory: 0 });
    expect(frames.every((input) => (input.dispose as ReturnType<typeof vi.fn>).mock.calls.length === 1)).toBe(true);
    await session.dispose();
  });

  it.each<DecodeProfile>(["fast", "balanced", "robust"])(
    "keeps every valid result and spatial multi-code semantics in the %s profile",
    async (profile) => {
      const scenarios: ScenarioDefinition[] = [];
      const router = {
        engines: new Map(),
        scan: vi.fn(async (input: NormalizedFrame, options: { scenario: ScenarioDefinition }): Promise<ScanOutcome> => {
          scenarios.push(options.scenario);
          return success(input.id, [
            result(input.id, "SAME", 5),
            result(input.id, "SAME", 35),
            result(input.id, "NEW", 70),
          ]);
        }),
        dispose: vi.fn(),
      } as unknown as CaptureRouter;
      const decoder = new BrowserScannerFrameDecoder({ router, useWorker: false, disposeRouter: false });
      const outcome = await decoder.decode(frame(10), {
        profile,
        quality,
        mode: "tracking",
        maxResults: 32,
        roiPhase: "full-frame",
        signal: new AbortController().signal,
        generation: 1,
      });

      expect(outcome.ok && outcome.results.map((entry) => [entry.rawText, entry.cornerPoints?.[0]?.x])).toEqual([
        ["SAME", 5],
        ["SAME", 35],
        ["NEW", 70],
      ]);
      expect(scenarios).toHaveLength(1);
      const effectiveMaximum = Math.min(32, getBuiltinScenario(profile).budgets.maxAttempts);
      expect(scenarios[0]).toMatchObject({
        id: profile,
        input: { roi: { mode: "full-frame" } },
        multiCode: { enabled: true, maxResults: effectiveMaximum, deduplication: "payload-format-spatial" },
        localization: { maxCandidates: effectiveMaximum },
      });
      expect(scenarios[0]?.budgets.maxCandidates).toBeGreaterThanOrEqual(effectiveMaximum);
      expect(scenarios[0]?.budgets.maxAttempts).toBe(getBuiltinScenario(profile).budgets.maxAttempts);
      expect(validateScenario(scenarios[0]).ok).toBe(true);
    },
  );

  it.each<DecodeProfile>(["fast", "balanced", "robust"])(
    "normalizes a non-finite public maxResults value before building the %s scenario",
    async (profile) => {
      const scenarios: ScenarioDefinition[] = [];
      const router = {
        engines: new Map(),
        scan: vi.fn(async (input: NormalizedFrame, options: { scenario: ScenarioDefinition }): Promise<ScanOutcome> => {
          scenarios.push(options.scenario);
          return success(input.id, [result(input.id, "FINITE", 5)]);
        }),
        dispose: vi.fn(),
      } as unknown as CaptureRouter;
      const decoder = new BrowserScannerFrameDecoder({ router, useWorker: false, disposeRouter: false });
      await decoder.decode(frame(11), {
        profile,
        quality,
        mode: "tracking",
        maxResults: Number.NaN,
        roiPhase: "full-frame",
        signal: new AbortController().signal,
        generation: 1,
      });

      expect(scenarios[0]?.multiCode.maxResults).toBe(Math.min(32, getBuiltinScenario(profile).budgets.maxAttempts));
      expect(validateScenario(scenarios[0]).ok).toBe(true);
    },
  );
});
