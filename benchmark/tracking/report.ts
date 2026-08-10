import { TRACKING_SEQUENCE_SCENARIOS } from "./sequence-fixtures.js";
import { runTrackingScenario } from "./scenario-runner.js";
import type { TrackingAssertion, TrackingScenarioReport } from "./types.js";

export interface TrackingScaleReport {
  targetCount: 1 | 4 | 8 | 16;
  sourceScenarioId: string;
  trackingP50Ms: number;
  trackingP95Ms: number;
  associationP50Ms: number;
  associationP95Ms: number;
  effectiveFps: number;
  decoderCalls: number;
  decoderCallsPerFrame: number;
  maximumAssociationPairs: number;
}

export interface TrackingAggregateMetrics {
  scenarioCount: number;
  groundTruthObjectCount: number;
  confirmedTrackCount: number;
  identitySwitchCount: number;
  trackFragmentationCount: number;
  falseTrackCount: number;
  matchedObservationCount: number;
  missedObservationCount: number;
  trackRecall: number;
  trackPrecision: number;
  samePayloadScenarioCount: number;
  samePayloadScenarioPassCount: number;
  batchScenarioCount: number;
  batchScenarioPassCount: number;
  falseBatchCompletionCount: number;
}

export interface TrackingSuiteResult {
  scenarios: readonly TrackingScenarioReport[];
  scales: readonly TrackingScaleReport[];
  aggregateMetrics: TrackingAggregateMetrics;
  aggregateGates: readonly TrackingAssertion[];
  pass: boolean;
  failureReasons: readonly string[];
}

function gate(id: string, pass: boolean, expected: unknown, observed: unknown, sourceScenarioIds: readonly string[], message: string): TrackingAssertion & { sourceScenarioIds: readonly string[] } {
  return { id, pass, expected, observed, sourceScenarioIds, message };
}

const SCALE_SCENARIOS = new Map<1 | 4 | 8 | 16, string>([
  [1, "basic-scale-1-static"],
  [4, "multi-scale-4-static"],
  [8, "multi-scale-8-static"],
  [16, "multi-scale-16-static"],
]);

export async function runTrackingSuite(): Promise<TrackingSuiteResult> {
  const scenarios: TrackingScenarioReport[] = [];
  for (const scenario of TRACKING_SEQUENCE_SCENARIOS) scenarios.push(await runTrackingScenario(scenario));

  const groundTruthObservations = scenarios.reduce((sum, report) => sum + report.observed.matchedObservationCount + report.observed.missedObservationCount, 0);
  const predictedObservations = scenarios.reduce((sum, report) => sum + report.observed.matchedObservationCount + report.observed.falseTrackObservationCount, 0);
  const matchedObservationCount = scenarios.reduce((sum, report) => sum + report.observed.matchedObservationCount, 0);
  const samePayload = scenarios.filter((report) => report.expected.samePayloadInstanceSeparation);
  const batch = scenarios.filter((report) => report.expected.batch);
  const aggregateMetrics: TrackingAggregateMetrics = {
    scenarioCount: scenarios.length,
    groundTruthObjectCount: scenarios.reduce((sum, report) => sum + report.observed.groundTruthObjectCount, 0),
    confirmedTrackCount: scenarios.reduce((sum, report) => sum + report.observed.confirmedTrackCount, 0),
    identitySwitchCount: scenarios.reduce((sum, report) => sum + report.observed.identitySwitchCount, 0),
    trackFragmentationCount: scenarios.reduce((sum, report) => sum + report.observed.trackFragmentationCount, 0),
    falseTrackCount: scenarios.reduce((sum, report) => sum + report.observed.falseTrackCount, 0),
    matchedObservationCount,
    missedObservationCount: scenarios.reduce((sum, report) => sum + report.observed.missedObservationCount, 0),
    trackRecall: groundTruthObservations === 0 ? 1 : matchedObservationCount / groundTruthObservations,
    trackPrecision: predictedObservations === 0 ? 1 : matchedObservationCount / predictedObservations,
    samePayloadScenarioCount: samePayload.length,
    samePayloadScenarioPassCount: samePayload.filter((report) => report.pass).length,
    batchScenarioCount: batch.length,
    batchScenarioPassCount: batch.filter((report) => report.pass).length,
    falseBatchCompletionCount: batch.filter((report) =>
      report.expected.batch?.status !== "complete" && report.observed.batch?.status === "complete",
    ).length,
  };

  const scales = [...SCALE_SCENARIOS].map(([targetCount, id]): TrackingScaleReport => {
    const report = scenarios.find((entry) => entry.id === id);
    if (!report) throw new Error(`Missing required ${targetCount}-target scale scenario ${id}.`);
    return { targetCount, sourceScenarioId: id, ...report.metrics };
  });
  const basicIdentityIds = scenarios.filter((report) => report.category === "basic" || report.category === "multi-object" || report.category === "identity").map(({ id }) => id);
  const aggregateGates = [
    gate("minimum-semantic-scenario-count", scenarios.length >= 24, ">= 24", scenarios.length, scenarios.map(({ id }) => id), "Tracking integration must execute at least 24 semantic scenarios."),
    gate("all-scenario-assertions-pass", scenarios.every((report) => report.pass), "all pass", scenarios.filter((report) => !report.pass).map(({ id }) => id), scenarios.map(({ id }) => id), "Every scenario assertion must pass."),
    gate("false-confirmed-tracks", aggregateMetrics.falseTrackCount === 0, 0, aggregateMetrics.falseTrackCount, scenarios.map(({ id }) => id), "No confirmed track may exist without ground truth."),
    gate("basic-identity-switches", scenarios.filter((report) => basicIdentityIds.includes(report.id)).every((report) => report.observed.identitySwitchCount === 0), 0, scenarios.filter((report) => basicIdentityIds.includes(report.id)).reduce((sum, report) => sum + report.observed.identitySwitchCount, 0), basicIdentityIds, "Basic, multi-object, and crossing identity cases require zero identity switches."),
    gate("basic-fragmentation", scenarios.filter((report) => basicIdentityIds.includes(report.id)).every((report) => report.observed.trackFragmentationCount === 0), 0, scenarios.filter((report) => basicIdentityIds.includes(report.id)).reduce((sum, report) => sum + report.observed.trackFragmentationCount, 0), basicIdentityIds, "Non-occlusion basic cases require zero fragmentation."),
    gate("same-payload-instance-accuracy", aggregateMetrics.samePayloadScenarioPassCount === aggregateMetrics.samePayloadScenarioCount, "100%", `${aggregateMetrics.samePayloadScenarioPassCount}/${aggregateMetrics.samePayloadScenarioCount}`, samePayload.map(({ id }) => id), "All equal-payload physical-instance cases must preserve distinct identities."),
    gate("batch-completion-accuracy", aggregateMetrics.batchScenarioPassCount === aggregateMetrics.batchScenarioCount, "100%", `${aggregateMetrics.batchScenarioPassCount}/${aggregateMetrics.batchScenarioCount}`, batch.map(({ id }) => id), "All deterministic batch classifications and completions must match ground truth."),
    gate("false-batch-completion", aggregateMetrics.falseBatchCompletionCount === 0, 0, aggregateMetrics.falseBatchCompletionCount, batch.filter((report) => report.expected.batch?.status !== "complete").map(({ id }) => id), "Incomplete expected-count and checklist batches must remain collecting."),
    gate("scale-baselines-present", scales.length === 4 && scales.every((entry) => entry.decoderCallsPerFrame === 1), "1/4/8/16 targets; one decoder call/frame", scales.map((entry) => ({ targetCount: entry.targetCount, decoderCallsPerFrame: entry.decoderCallsPerFrame })), scales.map(({ sourceScenarioId }) => sourceScenarioId), "All required scale baselines must record bounded decoder and association metrics."),
    gate("disposed-tracking-state", scenarios.every((report) => report.observed.finalActiveTrackCount === 0 && report.observed.finalLostTrackCount === 0 && report.observed.finalPendingObservationCount === 0 && report.observed.finalControlledMemory === 0), "all final state = 0", scenarios.filter((report) => report.observed.finalControlledMemory !== 0).map(({ id }) => id), scenarios.map(({ id }) => id), "Every scenario must release controlled tracking state."),
  ];
  const failureReasons = [
    ...scenarios.flatMap((report) => report.failureReasons.map((reason) => `${report.id}: ${reason}`)),
    ...aggregateGates.filter((entry) => !entry.pass).map((entry) => `${entry.id}: ${entry.message}`),
  ];
  return { scenarios, scales, aggregateMetrics, aggregateGates, pass: failureReasons.length === 0, failureReasons };
}
