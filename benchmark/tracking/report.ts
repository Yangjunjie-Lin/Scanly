import { createHash } from "node:crypto";
import { TRACKING_SEQUENCE_SCENARIOS } from "./sequence-fixtures.js";
import { runTrackingScenario } from "./scenario-runner.js";
import {
  REQUIRED_BATCH_SCENARIOS_BY_MODE,
  REQUIRED_SAME_PAYLOAD_SCENARIO_IDS,
  REQUIRED_TRACKING_SCENARIO_IDS,
  serializeTrackingExecutableSemantics,
  serializeTrackingSemanticContract,
  TRACKING_EXECUTABLE_SEMANTICS_SHA256,
  TRACKING_SEMANTIC_CONTRACT_SHA256,
  TRACKING_SEMANTIC_CONTRACT_VERSION,
  TRACKING_SEMANTIC_SCENARIOS,
} from "./semantic-contract.js";
import type { TrackingAssertion, TrackingScenarioReport } from "./types.js";

export interface TrackingScaleReport {
  targetCount: 1 | 4 | 8 | 16;
  sourceScenarioId: string;
  decoderEvidence: "deterministic-observation-driver";
  decoderP50Ms: number;
  decoderP95Ms: number;
  trackingP50Ms: number;
  trackingP95Ms: number;
  associationP50Ms: number;
  associationP95Ms: number;
  totalFrameP50Ms: number;
  totalFrameP95Ms: number;
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
  semanticContract: {
    version: string;
    sha256: string;
    executableSemanticsSha256: string;
    requiredScenarioIds: readonly string[];
    samePayloadScenarioIds: readonly string[];
    batchScenarioIdsByMode: Readonly<Record<string, readonly string[]>>;
  };
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
  const semanticContractHash = createHash("sha256").update(serializeTrackingSemanticContract()).digest("hex");
  if (semanticContractHash !== TRACKING_SEMANTIC_CONTRACT_SHA256) {
    throw new Error("Tracking semantic contract changed without an explicit version/hash migration.");
  }
  const executableSemanticsHash = createHash("sha256")
    .update(serializeTrackingExecutableSemantics(TRACKING_SEQUENCE_SCENARIOS))
    .digest("hex");
  if (executableSemanticsHash !== TRACKING_EXECUTABLE_SEMANTICS_SHA256) {
    throw new Error("Tracking stimuli/Ground Truth/expectations changed without an explicit corpus migration.");
  }
  const scenarios: TrackingScenarioReport[] = [];
  for (const scenario of TRACKING_SEQUENCE_SCENARIOS) scenarios.push(await runTrackingScenario(scenario));

  const reportsById = new Map(scenarios.map((report) => [report.id, report]));
  const requiredReports = (ids: readonly string[]): TrackingScenarioReport[] => ids.map((id) => {
    const report = reportsById.get(id);
    if (!report) throw new Error(`Missing frozen tracking semantic scenario ${id}.`);
    return report;
  });

  const groundTruthObservations = scenarios.reduce((sum, report) => sum + report.observed.matchedObservationCount + report.observed.missedObservationCount, 0);
  const predictedObservations = scenarios.reduce((sum, report) => sum + report.observed.matchedObservationCount + report.observed.falseTrackObservationCount, 0);
  const matchedObservationCount = scenarios.reduce((sum, report) => sum + report.observed.matchedObservationCount, 0);
  const samePayload = requiredReports(REQUIRED_SAME_PAYLOAD_SCENARIO_IDS);
  const requiredBatchScenarioIds = Object.values(REQUIRED_BATCH_SCENARIOS_BY_MODE).flat();
  const batch = requiredReports(requiredBatchScenarioIds);
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
  const semanticContractObserved = scenarios.map((report) => ({
    id: report.id,
    category: report.category,
    batchMode: report.expected.batch?.mode,
    samePayload: Boolean(report.expected.samePayloadInstanceSeparation),
  }));
  const semanticContractPass = semanticContractObserved.length === TRACKING_SEMANTIC_SCENARIOS.length
    && TRACKING_SEMANTIC_SCENARIOS.every((required, index) => {
      const observed = semanticContractObserved[index];
      return observed?.id === required.id
        && observed.category === required.category
        && observed.batchMode === ("batchMode" in required ? required.batchMode : undefined)
        && observed.samePayload === ("samePayload" in required && required.samePayload);
    });
  const aggregateGates = [
    gate("frozen-semantic-scenario-contract", semanticContractPass, TRACKING_SEMANTIC_SCENARIOS, semanticContractObserved, REQUIRED_TRACKING_SCENARIO_IDS, "Tracking integration must execute the exact frozen Beta 2 scenario/category/mode contract."),
    gate("all-scenario-assertions-pass", scenarios.every((report) => report.pass), "all pass", scenarios.filter((report) => !report.pass).map(({ id }) => id), scenarios.map(({ id }) => id), "Every scenario assertion must pass."),
    gate("false-confirmed-tracks", aggregateMetrics.falseTrackCount === 0, 0, aggregateMetrics.falseTrackCount, scenarios.map(({ id }) => id), "No confirmed track may exist without ground truth."),
    gate("basic-identity-switches", scenarios.filter((report) => basicIdentityIds.includes(report.id)).every((report) => report.observed.identitySwitchCount === 0), 0, scenarios.filter((report) => basicIdentityIds.includes(report.id)).reduce((sum, report) => sum + report.observed.identitySwitchCount, 0), basicIdentityIds, "Basic, multi-object, and crossing identity cases require zero identity switches."),
    gate("basic-fragmentation", scenarios.filter((report) => basicIdentityIds.includes(report.id)).every((report) => report.observed.trackFragmentationCount === 0), 0, scenarios.filter((report) => basicIdentityIds.includes(report.id)).reduce((sum, report) => sum + report.observed.trackFragmentationCount, 0), basicIdentityIds, "Non-occlusion basic cases require zero fragmentation."),
    gate("same-payload-instance-accuracy", samePayload.length === REQUIRED_SAME_PAYLOAD_SCENARIO_IDS.length && aggregateMetrics.samePayloadScenarioPassCount === samePayload.length, "100% of frozen same-payload corpus", `${aggregateMetrics.samePayloadScenarioPassCount}/${samePayload.length}`, REQUIRED_SAME_PAYLOAD_SCENARIO_IDS, "All required equal-payload physical-instance cases must preserve distinct identities."),
    gate("batch-completion-accuracy", batch.length === requiredBatchScenarioIds.length && aggregateMetrics.batchScenarioPassCount === batch.length, "100% of frozen batch corpus", `${aggregateMetrics.batchScenarioPassCount}/${batch.length}`, requiredBatchScenarioIds, "All required deterministic batch modes, classifications, and completions must match ground truth."),
    gate("false-batch-completion", aggregateMetrics.falseBatchCompletionCount === 0, 0, aggregateMetrics.falseBatchCompletionCount, batch.filter((report) => report.expected.batch?.status !== "complete").map(({ id }) => id), "Incomplete expected-count and checklist batches must remain collecting."),
    gate("scale-baselines-present", scales.length === 4 && scales.every((entry) => entry.decoderCallsPerFrame === 1), "1/4/8/16 targets; one decoder call/frame", scales.map((entry) => ({ targetCount: entry.targetCount, decoderCallsPerFrame: entry.decoderCallsPerFrame })), scales.map(({ sourceScenarioId }) => sourceScenarioId), "All required scale baselines must record bounded decoder and association metrics."),
    gate("disposed-tracking-state", scenarios.every((report) => report.observed.finalActiveTrackCount === 0 && report.observed.finalLostTrackCount === 0 && report.observed.finalPendingObservationCount === 0 && report.observed.finalControlledMemory === 0), "all final state = 0", scenarios.filter((report) => report.observed.finalControlledMemory !== 0).map(({ id }) => id), scenarios.map(({ id }) => id), "Every scenario must release controlled tracking state."),
  ];
  const failureReasons = [
    ...scenarios.flatMap((report) => report.failureReasons.map((reason) => `${report.id}: ${reason}`)),
    ...aggregateGates.filter((entry) => !entry.pass).map((entry) => `${entry.id}: ${entry.message}`),
  ];
  return {
    semanticContract: {
      version: TRACKING_SEMANTIC_CONTRACT_VERSION,
      sha256: TRACKING_SEMANTIC_CONTRACT_SHA256,
      executableSemanticsSha256: TRACKING_EXECUTABLE_SEMANTICS_SHA256,
      requiredScenarioIds: REQUIRED_TRACKING_SCENARIO_IDS,
      samePayloadScenarioIds: REQUIRED_SAME_PAYLOAD_SCENARIO_IDS,
      batchScenarioIdsByMode: REQUIRED_BATCH_SCENARIOS_BY_MODE,
    },
    scenarios,
    scales,
    aggregateMetrics,
    aggregateGates,
    pass: failureReasons.length === 0,
    failureReasons,
  };
}
