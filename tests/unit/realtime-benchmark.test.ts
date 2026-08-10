import { describe, expect, it } from "vitest";
import { validateFrame } from "@scanly/core";
import { FrameQualityAnalyzer } from "@scanly/browser";
import { REALTIME_SCENARIO_DRIVERS, runRealtimeScenario, type RealtimeScenarioDriver } from "../../benchmark/realtime/scenario-drivers";
import { REALTIME_SEQUENCE_SCENARIOS, makeSequenceFrame } from "../../benchmark/realtime/sequence-fixtures";

function scenario(id: string) {
  const value = REALTIME_SEQUENCE_SCENARIOS.find((entry) => entry.id === id);
  if (!value) throw new Error(`Missing scenario ${id}`);
  return value;
}

function quality(id: string, index: number) {
  const value = scenario(id);
  return new FrameQualityAnalyzer().analyze(makeSequenceFrame(value, index));
}

describe("Realtime benchmark ground-truth contract", () => {
  it("contains exactly twenty named scenarios and one semantic driver per scenario", () => {
    expect(REALTIME_SEQUENCE_SCENARIOS).toHaveLength(20);
    expect(new Set(REALTIME_SEQUENCE_SCENARIOS.map((entry) => entry.id)).size).toBe(20);
    expect(REALTIME_SCENARIO_DRIVERS.map((entry) => entry.id)).toEqual(REALTIME_SEQUENCE_SCENARIOS.map((entry) => entry.id));
  });

  it("keeps decoder stimuli separate from expected output ground truth", () => {
    for (const entry of REALTIME_SEQUENCE_SCENARIOS) {
      expect(entry.timeline.length, entry.id).toBeGreaterThan(0);
      expect(entry.expected.emittedEvents, entry.id).toBeDefined();
      expect(entry.expected.maximumFalseConfirmedScans, entry.id).toBe(0);
      expect(entry.expected.maximumStaleEvents, entry.id).toBe(0);
      expect(entry.timeline, entry.id).not.toBe(entry.expected);
    }
  });

  it("encodes blur, underexposure, glare and malformed-frame claims in actual frame bytes", () => {
    expect(quality("sequence-d-blur-to-clear", 0).blurred).toBe(true);
    expect(quality("sequence-d-blur-to-clear", 6).usable).toBe(true);
    expect(quality("sequence-g-underexposed-probe", 0).underexposed).toBe(true);
    expect(quality("sequence-h-glare-recovery", 0).glareDominated).toBe(true);
    const malformed = scenario("sequence-r-invalid-frame");
    expect(validateFrame(makeSequenceFrame(malformed, 0)).length).toBeGreaterThan(0);
    expect(validateFrame(makeSequenceFrame(malformed, 1))).toEqual([]);
  });

  it("declares observable runtime evidence for every semantic scenario", () => {
    for (const entry of REALTIME_SEQUENCE_SCENARIOS) {
      expect(entry.expected.requiredRuntimeEvidence?.length, entry.id).toBeGreaterThan(0);
    }
  });

  it("fails when decoder output is deliberately changed away from independent ground truth", async () => {
    const base = REALTIME_SCENARIO_DRIVERS.find((entry) => entry.id === "sequence-b-repeat-50");
    if (!base) throw new Error("Missing repeat driver");
    const corrupted: RealtimeScenarioDriver = {
      id: base.id,
      scenario: {
        ...base.scenario,
        expected: { ...base.scenario.expected, emittedEvents: [{ payload: "INTENTIONALLY-WRONG-GROUND-TRUTH", format: "qr_code" }] },
      },
      createSource: () => base.createSource(),
      configureSession: (source, runtime) => base.configureSession(source, runtime),
      run: (session, source, runtime) => base.run(session, source, runtime),
      assert: (report) => base.assert(report),
    };
    const report = await runRealtimeScenario(corrupted);
    expect(report.pass).toBe(false);
    expect(report.observed.falseConfirmedScans).toBeGreaterThan(0);
    expect(report.assertions.find((entry) => entry.id === "ground-truth-emitted-events")?.pass).toBe(false);
  });
});
