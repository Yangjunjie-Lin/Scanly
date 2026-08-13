import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { deviceEvidenceOnlyAfterSource } from "./device-evidence-source-policy.js";

const root = path.resolve(__dirname, "..");
execFileSync(process.execPath, ["--import", "tsx", path.join(root, "scripts", "verify-device-evidence.ts")], { cwd: root, stdio: "ignore" });
const directory = path.join(root, "device-evidence", "sessions");
const groundTruth = JSON.parse(fs.readFileSync(path.join(root, "device-lab", "test-targets", "ground-truth.json"), "utf8"));
const deviceManifest = JSON.parse(fs.readFileSync(path.join(root, "device-lab", "manifest.json"), "utf8"));
const evidence = fs.readdirSync(directory)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")));
const physical = (session: any): boolean => ["physical-mobile", "remote-physical-device"].includes(session.evidenceType);
const physicalMobile = (session: any): boolean => session.evidenceType === "physical-mobile";
const normalized = (value: unknown): string => String(value ?? "").trim().toLowerCase();
const iosSafari = (session: any): boolean => physicalMobile(session)
  && /^(ios|ipados)$/.test(normalized(session.device.operatingSystem))
  && normalized(session.browser.name) === "safari";
const androidChrome = (session: any): boolean => physicalMobile(session)
  && normalized(session.device.operatingSystem) === "android"
  && /^(google )?chrome$/.test(normalized(session.browser.name));
const permissionLifecyclePassed = (session: any): boolean => {
  const lifecycle = session.permissionLifecycle;
  if (!lifecycle) return false;
  const expectedPhases = lifecycle.revoke === "unavailable"
    ? ["initial-prompt", "deny", "retry", "grant"]
    : ["initial-prompt", "deny", "retry", "grant", "revoke"];
  const steps = lifecycle.steps;
  const times = Array.isArray(steps) ? steps.map((step: any) => Date.parse(step.observedAt)) : [];
  const [prompt, deny, retry, grant, revoke] = Array.isArray(steps) ? steps : [];
  return Array.isArray(steps)
    && lifecycle.status === "passed"
    && steps.length === expectedPhases.length
    && steps.every((step: any, index: number) => step.phase === expectedPhases[index] && step.unhandledRejectionCount === 0)
    && times.every((time: number, index: number) => Number.isFinite(time) && (index === 0 || time > times[index - 1]))
    && prompt.outcome === "observed"
    && deny.outcome === "passed"
    && deny.errorCode === "camera_permission_denied"
    && deny.scannerState === "failed"
    && deny.recoverableState === true
    && retry.outcome === "passed"
    && ["starting", "scanning"].includes(retry.scannerState)
    && retry.recoverableState === true
    && !retry.errorCode
    && grant.outcome === "passed"
    && grant.scannerState === "scanning"
    && grant.recoverableState === true
    && !grant.errorCode
    && (!revoke || revoke.outcome === lifecycle.revoke)
    && lifecycle.initialPrompt === "observed"
    && lifecycle.deny === "passed"
    && lifecycle.retry === "passed"
    && lifecycle.grant === "passed"
    && lifecycle.typedError === true
    && lifecycle.recoverableState === true
    && lifecycle.noUnhandledRejection === true
    && lifecycle.unhandledRejectionCount === 0;
};
const soakTargetMatches = (actual: any, expected: any): boolean => actual?.targetId === expected.targetId && actual.payload === expected.payload && actual.format === expected.format;
const targetById = new Map<string, any>(groundTruth.targets.map((target: any) => [target.targetId, target]));
const p9TargetIds = deviceManifest.scenarios.find((scenario: any) => scenario.id === "P9")?.targetIds ?? [];
const fixedSoakTargets = {
  basic: targetById.get("qr-basic"),
  multi: p9TargetIds.map((targetId: string) => targetById.get(targetId)),
};
const validSoakRuntimeObservations = (activities: any[], ended: number, finalLiveness: any): boolean => activities.every((activity: any, index: number) => {
  const intervalStart = Date.parse(activity.observedAt);
  const intervalEnd = index + 1 < activities.length ? Date.parse(activities[index + 1].observedAt) : ended;
  const observation = activity.runtimeObservation;
  if (!observation || !Number.isFinite(intervalStart) || !Number.isFinite(intervalEnd)) return false;
  if (activity.type === "basic") {
    const confirmedAt = Date.parse(observation.confirmedAt);
    return observation.kind === "basic-runtime-confirmation" && Number.isInteger(observation.frameId) && Boolean(observation.physicalInstanceId)
      && soakTargetMatches(observation.target, fixedSoakTargets.basic) && confirmedAt >= intervalStart && confirmedAt < intervalEnd;
  }
  if (activity.type === "multi-code") {
    const observedAt = Date.parse(observation.observedAt);
    const ids = fixedSoakTargets.multi.map((target: any) => target.targetId);
    return observation.kind === "multi-code-same-frame" && Number.isInteger(observation.frameId) && observedAt >= intervalStart && observedAt < intervalEnd
      && Array.isArray(observation.expectedTargetIds) && observation.expectedTargetIds.every((id: string, position: number) => id === ids[position]) && observation.expectedTargetIds.length === ids.length
      && Array.isArray(observation.targets) && observation.targets.length === ids.length && new Set(observation.targets.map((target: any) => target.targetId)).size === ids.length
      && fixedSoakTargets.multi.every((target: any) => observation.targets.some((actual: any) => soakTargetMatches(actual, target)));
  }
  if (activity.type === "moving") {
    const expected = fixedSoakTargets.multi.find((target: any) => target.targetId === observation.targetId);
    const startObserved = Date.parse(observation.startObservedAt); const endObserved = Date.parse(observation.endObservedAt);
    const dx = Number(observation.endCenter?.x) - Number(observation.startCenter?.x); const dy = Number(observation.endCenter?.y) - Number(observation.startCenter?.y);
    const displacement = Math.hypot(dx, dy);
    return observation.kind === "moving-track-displacement" && Boolean(expected && soakTargetMatches(observation, expected)) && Boolean(observation.physicalInstanceId)
      && startObserved >= intervalStart && endObserved < intervalEnd && endObserved > startObserved && observation.endFrameId > observation.startFrameId && observation.observedFrameCount >= 2
      && displacement > 0 && Math.abs(displacement - observation.displacementPixels) <= 0.01 && observation.identitySwitchCount === 0 && observation.fragmentationCount === 0 && observation.falseTrackCount === 0;
  }
  const next = index + 1 < activities.length ? activities[index + 1] : finalLiveness;
  return activity.type === "negative" && observation.kind === "negative-runtime-interval" && Date.parse(observation.startedAt) === intervalStart && Date.parse(observation.endedAt) === intervalEnd && intervalEnd > intervalStart
    && observation.capturedFrameDelta === next.capturedFrames - activity.capturedFrames && observation.admittedFrameDelta === next.admittedFrames - activity.admittedFrames && observation.decodeAttemptDelta === next.decodeAttempts - activity.decodeAttempts && observation.confirmedScanDelta === next.confirmedScans - activity.confirmedScans
    && observation.capturedFrameDelta > 0 && observation.admittedFrameDelta > 0 && observation.decodeAttemptDelta > 0 && observation.confirmedScanDelta === 0;
});
const qualifyingPhysicalSoak = (session: any): boolean => {
  const soak = session.longRun;
  if (!physicalMobile(session) || soak?.qualifyingPhysicalSoak !== true || soak.cameraActive !== true || soak.endedCameraActive !== true || soak.durationMs < 1_800_000) return false;
  if (!(soak.capturedFrames > 0 && soak.admittedFrames > 0 && soak.decodeAttempts > 0) || soak.falseConfirmedScans !== 0 || soak.stalePublicEvents !== 0) return false;
  const activities = Array.isArray(soak.activities) ? soak.activities : [];
  const activityTimes = activities.map((entry: any) => Date.parse(entry.observedAt));
  const types = new Set(activities.map((entry: any) => entry.type));
  const negativeIndex = activities.findIndex((entry: any) => entry.type === "negative");
  const started = Date.parse(soak.startedAt); const ended = Date.parse(soak.endedAt); const midpoint = started + soak.durationMs / 2;
  if (activityTimes[0] !== started || ended - activityTimes.at(-1) > 600_000 || !activityTimes.every((time: number, index: number) => Number.isFinite(time) && (index === 0 || (time > activityTimes[index - 1] && time - activityTimes[index - 1] <= 600_000))) || negativeIndex < 0 || negativeIndex >= activities.length - 1 || !["basic", "multi-code", "moving", "negative"].every((type) => types.has(type) && activities.some((entry: any) => entry.type === type && Date.parse(entry.observedAt) < midpoint) && activities.some((entry: any) => entry.type === type && Date.parse(entry.observedAt) >= midpoint))) return false;
  if (!activities.every((entry: any, index: number) => entry.cameraActive === true && (index === 0 || (entry.capturedFrames > activities[index - 1].capturedFrames && entry.admittedFrames > activities[index - 1].admittedFrames && entry.decodeAttempts > activities[index - 1].decodeAttempts && entry.confirmedScans >= activities[index - 1].confirmedScans)))) return false;
  const liveness = Array.isArray(soak.livenessSamples) ? soak.livenessSamples : [];
  const livenessTimes = liveness.map((entry: any) => Date.parse(entry.observedAt));
  const first = liveness[0]; const last = liveness.at(-1); const finalActivity = activities.at(-1);
  return liveness.length >= 2
    && livenessTimes[0] === started
    && livenessTimes.at(-1) === ended
    && liveness.every((entry: any, index: number) => entry.cameraActive === true && entry.scannerState === "scanning" && (index === 0 || (livenessTimes[index] > livenessTimes[index - 1] && livenessTimes[index] - livenessTimes[index - 1] <= 10_000 && entry.capturedFrames >= liveness[index - 1].capturedFrames && entry.admittedFrames >= liveness[index - 1].admittedFrames && entry.decodeAttempts >= liveness[index - 1].decodeAttempts && entry.confirmedScans >= liveness[index - 1].confirmedScans)))
    && activities[0].capturedFrames === first.capturedFrames && activities[0].admittedFrames === first.admittedFrames && activities[0].decodeAttempts === first.decodeAttempts && activities[0].confirmedScans === first.confirmedScans
    && last.capturedFrames > finalActivity.capturedFrames && last.admittedFrames > finalActivity.admittedFrames && last.decodeAttempts > finalActivity.decodeAttempts
    && soak.capturedFrames === last.capturedFrames - first.capturedFrames && soak.admittedFrames === last.admittedFrames - first.admittedFrames && soak.decodeAttempts === last.decodeAttempts - first.decodeAttempts
    && validSoakRuntimeObservations(activities, ended, last)
    && Object.values(soak.finalResources ?? {}).length === 6
    && Object.values(soak.finalResources).every((value) => value === 0);
};
const deviceKey = (session: any): string => [
  session.device.manufacturer,
  session.device.declaredModel,
  session.device.operatingSystem,
  session.device.operatingSystemVersion,
].map(normalized).join("|");
const quantile = (values: number[], q: number): number | null => values.length
  ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * q) - 1)]
  : null;
const evidenceOnlyAfterSource = (sourceCommit: string): boolean => deviceEvidenceOnlyAfterSource(root, sourceCommit);
const drift = (longRun: any): any => {
  if (!longRun?.windows || longRun.windows.length !== 3) return null;
  const first = longRun.windows[0]; const last = longRun.windows[2];
  const change = (key: string): number => Number(last[key]) - Number(first[key]);
  return { baseline: "last-5-min-minus-first-5-min", decodeP50DeltaMs: change("decodeP50Ms"), decodeP95DeltaMs: change("decodeP95Ms"), effectiveDecodeFpsDelta: change("effectiveDecodeFps"), frameDropRateDelta: change("frameDropRate") };
};

const devices = evidence.map((session) => {
  const executed = session.scenarios.filter((scenario: any) => !["not-tested", "unavailable"].includes(scenario.status));
  const values = (key: string): number[] => executed.map((scenario: any) => scenario[key]).filter(Number.isFinite);
  return {
    evidenceId: session.evidenceId,
    sourceCommit: session.sourceCommit,
    sourceTree: session.sourceTree,
    sdkVersion: session.sdkVersion,
    evidenceType: session.evidenceType,
    device: session.device,
    browser: session.browser,
    scenarioCount: executed.length,
    passedScenarios: executed.filter((scenario: any) => scenario.status === "passed").length,
    failedScenarios: executed.filter((scenario: any) => scenario.status === "failed").length,
    unsupportedObservations: executed.reduce((sum: number, scenario: any) => sum + scenario.groundTruth.filter((comparison: any) => comparison.result === "unsupported").length, 0),
    falseConfirmedScans: executed.reduce((sum: number, scenario: any) => sum + scenario.falseConfirmedScans, 0),
    ttfd: { p50Ms: quantile(values("ttfdMs"), 0.5), p95Ms: quantile(values("ttfdMs"), 0.95) },
    ttfc: { p50Ms: quantile(values("ttfcMs"), 0.5), p95Ms: quantile(values("ttfcMs"), 0.95) },
    tracking: {
      identitySwitchCount: executed.reduce((sum: number, scenario: any) => sum + (scenario.identitySwitchCount ?? 0), 0),
      fragmentationCount: executed.reduce((sum: number, scenario: any) => sum + (scenario.fragmentationCount ?? 0), 0),
      falseTrackCount: executed.reduce((sum: number, scenario: any) => sum + (scenario.falseTrackCount ?? 0), 0),
    },
    batch: executed
      .filter((scenario: any) => scenario.scenarioId === "P12")
      .map((scenario: any) => ({ expected: scenario.expectedCount, confirmed: scenario.confirmedPhysicalInstances, completion: scenario.completion, falseCompletion: scenario.falseCompletion, status: scenario.status })),
    qualifyingPhysicalSoak: qualifyingPhysicalSoak(session),
    longRun: session.longRun ?? null,
    performanceDrift: drift(session.longRun),
  };
});

const physicalSessions = evidence.filter(physical);
const physicalMobileSessions = evidence.filter(physicalMobile);
const bySource = new Map<string, any[]>();
for (const session of physicalMobileSessions) {
  if (!evidenceOnlyAfterSource(session.sourceCommit)) continue;
  const key = `${session.sourceCommit}:${session.sourceTree}:${session.sdkVersion}`;
  bySource.set(key, [...(bySource.get(key) ?? []), session]);
}
const minimumGatePassed = [...bySource.values()].some((sessions) =>
  sessions.some(iosSafari)
  && sessions.some(androidChrome)
  && sessions.filter((session) => iosSafari(session) || androidChrome(session)).every((session) => session.scenarios.every((scenario: any) => ["passed", "failed"].includes(scenario.status) && scenario.falseConfirmedScans === 0))
  && sessions.some(qualifyingPhysicalSoak)
  && sessions.some((session) => physicalMobile(session) && permissionLifecyclePassed(session))
  && sessions.some((session) => physicalMobile(session) && session.cameraSwitch?.tested === true && session.cameraSwitch?.result === "passed" && session.cameraSwitch?.staleResultCount === 0));
const currentExactSourceSessions = [...bySource.values()].flat();
const currentExactSourceDeviceCount = new Set(currentExactSourceSessions.map(deviceKey)).size;
const currentExactSourceIosSafariCount = currentExactSourceSessions.filter(iosSafari).length;
const currentExactSourceAndroidChromeCount = currentExactSourceSessions.filter(androidChrome).length;
const currentExactSourceScenarioCount = currentExactSourceSessions.reduce((sum, session) => sum + session.scenarios.filter((scenario: any) => ["passed", "failed"].includes(scenario.status)).length, 0);
const currentExactSourceLongSessionCount = currentExactSourceSessions.filter(qualifyingPhysicalSoak).length;

const report = {
  schemaVersion: "beta4-device-benchmark-1",
  matrixStatus: "DEVICE_MATRIX_PARTIAL",
  fullDeviceMatrixStatus: "FULL_DEVICE_MATRIX_PENDING",
  physicalValidationStatus: minimumGatePassed
    ? "PHYSICAL_DEVICE_VALIDATION_STARTED_AND_MINIMUM_GATE_PASSED"
    : "PHYSICAL_DEVICE_VALIDATION_DEFERRED_TO_RC",
  counts: {
    sessions: currentExactSourceSessions.length,
    browsers: new Set(currentExactSourceSessions.map((entry) => `${entry.browser.name} ${entry.browser.version}`)).size,
    scenarios: currentExactSourceScenarioCount,
    physicalMobileDevices: currentExactSourceDeviceCount,
    iosSafari: currentExactSourceIosSafariCount,
    androidChrome: currentExactSourceAndroidChromeCount,
    physicalScenarios: currentExactSourceScenarioCount,
    physicalLongSessions: currentExactSourceLongSessionCount,
  },
  historicalTotals: {
    sessions: devices.length,
    browsers: new Set(devices.map((entry) => `${entry.browser.name} ${entry.browser.version}`)).size,
    scenarios: devices.reduce((sum, entry) => sum + entry.scenarioCount, 0),
    physicalSessions: physicalSessions.length,
    physicalMobileSessions: physicalMobileSessions.length,
  },
  aggregationPolicy: "per-device-only-no-cross-device-performance-average",
  devices,
};
const output = path.join(root, "benchmark-results", "device", "device-evidence-summary.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
