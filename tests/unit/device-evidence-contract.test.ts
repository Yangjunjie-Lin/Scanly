import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sessionDirectory = path.join(root, "device-evidence", "sessions");
const statusPath = path.join(root, "device-evidence", "status.json");
const read = (relative: string) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

type Json = Record<string, any>;

const fullMatrixGaps = [
  "Issue #13 full matrix: second iPhone generation",
  "Issue #13 full matrix: Android lower-end device",
  "Issue #13 full matrix: Android mid-range device",
  "Issue #13 full matrix: Android flagship device",
  "Issue #13 full matrix: desktop real webcam session",
];
const foundationGaps = [
  "Beta 4 Foundation: iOS Safari physical-mobile session",
  "Beta 4 Foundation: Android Chrome physical-mobile session",
  "Beta 4 Foundation: 30-minute physical-mobile camera soak",
  "Beta 4 Foundation: complete physical permission lifecycle audit",
  "Beta 4 Foundation: verified rear-front-rear camera switch",
];

interface EvidenceSnapshot {
  status: string;
  sessions: Map<string, string>;
}

function emptyStatus(): Json {
  return {
    ...read("device-evidence/status.json"),
    matrixStatus: "DEVICE_MATRIX_PARTIAL",
    physicalValidationStatus: "PHYSICAL_DEVICE_VALIDATION_DEFERRED_TO_RC",
    physicalMobileSessionCount: 0,
    remotePhysicalDeviceSessionCount: 0,
    desktopCameraSessionCount: 0,
    simulatedSessionCount: 0,
    physicalMobileDeviceCount: 0,
    iosSafariSessionCount: 0,
    androidChromeSessionCount: 0,
    physicalScenarioCount: 0,
    physicalLongSessionCount: 0,
    requiredGaps: [...foundationGaps, ...fullMatrixGaps],
  };
}

function snapshotRepositoryEvidence(): EvidenceSnapshot {
  const sessions = new Map<string, string>();
  for (const name of fs.readdirSync(sessionDirectory).filter((entry) => entry.endsWith(".json"))) {
    sessions.set(name, fs.readFileSync(path.join(sessionDirectory, name), "utf8"));
  }
  return { status: fs.readFileSync(statusPath, "utf8"), sessions };
}

function restoreRepositoryEvidence(snapshot: EvidenceSnapshot): void {
  for (const name of fs.readdirSync(sessionDirectory).filter((entry) => entry.endsWith(".json"))) {
    fs.rmSync(path.join(sessionDirectory, name));
  }
  for (const [name, contents] of snapshot.sessions) fs.writeFileSync(path.join(sessionDirectory, name), contents);
  fs.writeFileSync(statusPath, snapshot.status);
}

function assertRepositoryEvidenceRestored(snapshot: EvidenceSnapshot): void {
  expect(fs.readFileSync(statusPath, "utf8")).toBe(snapshot.status);
  const current = new Map<string, string>();
  for (const name of fs.readdirSync(sessionDirectory).filter((entry) => entry.endsWith(".json"))) current.set(name, fs.readFileSync(path.join(sessionDirectory, name), "utf8"));
  expect([...current.entries()]).toEqual([...snapshot.sessions.entries()]);
}

function statusForPhysicalFixture(): Json {
  return {
    ...read("device-evidence/status.json"),
    matrixStatus: "DEVICE_MATRIX_PARTIAL",
    physicalValidationStatus: "PHYSICAL_DEVICE_VALIDATION_DEFERRED_TO_RC",
    physicalMobileSessionCount: 1,
    remotePhysicalDeviceSessionCount: 0,
    desktopCameraSessionCount: 0,
    simulatedSessionCount: 0,
    physicalMobileDeviceCount: 1,
    iosSafariSessionCount: 0,
    androidChromeSessionCount: 1,
    physicalScenarioCount: 13,
    physicalLongSessionCount: 0,
    requiredGaps: [foundationGaps[0], foundationGaps[2], ...fullMatrixGaps],
  };
}

function withTemporaryEvidence(evidence: Json, assertion: () => void): void {
  const snapshot = snapshotRepositoryEvidence();
  try {
    for (const name of fs.readdirSync(sessionDirectory).filter((entry) => entry.endsWith(".json"))) {
      fs.rmSync(path.join(sessionDirectory, name));
    }
    fs.writeFileSync(path.join(sessionDirectory, `${evidence.evidenceId}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
    fs.writeFileSync(statusPath, `${JSON.stringify(statusForPhysicalFixture(), null, 2)}\n`);
    assertion();
  } finally {
    restoreRepositoryEvidence(snapshot);
    assertRepositoryEvidenceRestored(snapshot);
  }
}

function withTemporaryEvidenceSet(entries: Json[], status: Json, assertion: () => void): void {
  const snapshot = snapshotRepositoryEvidence();
  try {
    for (const name of fs.readdirSync(sessionDirectory).filter((entry) => entry.endsWith(".json"))) fs.rmSync(path.join(sessionDirectory, name));
    for (const evidence of entries) fs.writeFileSync(path.join(sessionDirectory, `${evidence.evidenceId}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
    fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
    assertion();
  } finally {
    restoreRepositoryEvidence(snapshot);
    assertRepositoryEvidenceRestored(snapshot);
  }
}

function statusForFoundationFixtures(): Json {
  return {
    ...emptyStatus(),
    physicalValidationStatus: "PHYSICAL_DEVICE_VALIDATION_STARTED_AND_MINIMUM_GATE_PASSED",
    physicalMobileSessionCount: 2,
    physicalMobileDeviceCount: 2,
    iosSafariSessionCount: 1,
    androidChromeSessionCount: 1,
    physicalScenarioCount: 26,
    physicalLongSessionCount: 1,
    requiredGaps: [...fullMatrixGaps],
  };
}

function runVerifier(): string {
  return execFileSync(process.execPath, ["--import", "tsx", "scripts/verify-device-evidence.ts"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function expectVerifierFailure(evidence: Json): void {
  withTemporaryEvidence(evidence, () => expect(() => runVerifier()).toThrow());
}

function validPhysicalFixture(): Json {
  const sourceCommit = git("rev-parse", "HEAD");
  const sourceTree = git("show", "-s", "--format=%T", sourceCommit);
  const manifest = read("device-lab/manifest.json");
  const truth = read("device-lab/test-targets/ground-truth.json");
  const targets = new Map<string, Json>(truth.targets.map((target: Json) => [target.targetId, target]));
  const scenarios = manifest.scenarios.map((definition: Json) => {
    const targetIds = definition.targetIds ?? [];
    const scenario: Json = {
      scenarioId: definition.id,
      status: "passed",
      startedAt: "2026-08-12T01:01:00.000Z",
      endedAt: "2026-08-12T01:02:00.000Z",
      durationMs: 60_000,
      targetIds,
      groundTruth: targetIds.map((targetId: string) => {
        const target = targets.get(targetId)!;
        return {
          targetId,
          expectedPayload: target.payload,
          expectedFormat: target.format,
          observedPayload: target.payload,
          observedFormat: target.format,
          ...(definition.id === "P10" ? { physicalInstanceId: target.physicalInstanceId } : {}),
          result: "passed",
          matched: true,
        };
      }),
      falseConfirmedScans: 0,
    };
    if (definition.id === "P1") Object.assign(scenario, { cameraStartupMs: 250, firstUsableFrameMs: 300, ttfdMs: 425, ttfcMs: 650, attempts: 2 });
    if (definition.id === "P3") scenario.distanceObservations = [
      { label: "near", distance: 12, unit: "cm", source: "tester-measured", result: "passed" },
      { label: "medium", distance: 35, unit: "cm", source: "tester-measured", result: "passed" },
      { label: "far", distance: 80, unit: "cm", source: "tester-estimated", result: "passed" },
    ];
    if (definition.id === "P4") scenario.angleObservations = [
      { label: "0-degrees", approximateAngleDegrees: 0, source: "tester-estimated", result: "passed" },
      { label: "approximately-20-degrees", approximateAngleDegrees: 20, source: "tester-estimated", result: "passed" },
      { label: "approximately-40-degrees", approximateAngleDegrees: 40, source: "tester-estimated", result: "passed" },
    ];
    if (definition.id === "P5") scenario.lightingObservations = [
      { condition: "normal-room", result: "passed" },
      { condition: "dim-room", result: "passed" },
      { condition: "dark-room-with-screen-illumination", result: "passed" },
    ];
    if (definition.id === "P6") Object.assign(scenario, { capturedFrames: 120, admittedFrames: 100, droppedFrames: 20, qualityRejectedFrames: 4, ttfcMs: 900 });
    if (definition.id === "P7") scenario.glareMedium = "screen-barcode";
    if (definition.id === "P8") Object.assign(scenario, { distance: 18, distanceUnit: "cm", distanceSource: "tester-measured", cameraResolution: { width: 1920, height: 1080 }, zoom: 1 });
    if (definition.id === "P9") Object.assign(scenario, { expectedCount: 4, sameFrameId: 42, decodedCount: 4, formats: ["qr_code", "data_matrix", "code_128", "ean_13"], payloadCompleteness: true });
    if (definition.id === "P10") scenario.payloadIdentical = true;
    if (definition.id === "P11") Object.assign(scenario, {
      identitySwitchCount: 0, fragmentationCount: 0, falseTrackCount: 0, auditedPhysicalTargetCount: 2, createdTrackCount: 2,
      trackingBindings: [
        { label: "multi-qr", runtimePhysicalInstanceId: "physical-multi-qr", observedAt: "2026-08-12T01:01:10.000Z" },
        { label: "multi-data-matrix", runtimePhysicalInstanceId: "physical-multi-data-matrix", observedAt: "2026-08-12T01:01:15.000Z" },
        { label: "multi-qr", runtimePhysicalInstanceId: "physical-multi-qr", observedAt: "2026-08-12T01:01:40.000Z" },
        { label: "multi-data-matrix", runtimePhysicalInstanceId: "physical-multi-data-matrix", observedAt: "2026-08-12T01:01:45.000Z" },
      ],
    });
    if (definition.id === "P12") Object.assign(scenario, { expectedCount: 4, confirmedPhysicalInstances: 4, completion: true, falseCompletion: false });
    if (definition.id === "N1") Object.assign(scenario, {
      negativeSubjects: ["desk", "keyboard", "wall", "fabric", "screen-without-barcode", "packaging-without-barcode"],
      confirmedScanCount: 0,
    });
    return scenario;
  });

  return {
    schemaVersion: "beta4-physical-device-evidence-1",
    sourceCommit,
    sourceTree,
    sdkVersion: "2.0.0-beta.4",
    evidenceId: "beta4-contract-physical-fixture",
    evidenceType: "physical-mobile",
    session: {
      sessionId: "physical-fixture-session",
      startedAt: "2026-08-12T01:00:00.000Z",
      endedAt: "2026-08-12T01:40:00.000Z",
      testerId: "tester-001",
      hardwareAccess: "physical-local",
    },
    device: { declaredModel: "Model One", manufacturer: "Acme", operatingSystem: "Android", operatingSystemVersion: "15" },
    browser: { name: "Chrome", version: "140.0", userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36" },
    camera: {
      label: "Back Camera",
      settings: { width: 1920, height: 1080, frameRate: 30, facingMode: "environment" },
      capabilities: { torch: false, zoom: { min: 1, max: 1 } },
      constraints: { facingMode: "environment", width: 1920, height: 1080 },
    },
    capabilityEvidence: {
      torch: { reported: false, on: "unsupported", off: "unsupported" },
      zoom: { reported: false, minimum: "unavailable", maximum: "unavailable", current: "unavailable", manualZoom: "unavailable", autoZoom: "unavailable", manualOverride: "unavailable", cooldown: "unavailable" },
      focus: { reported: false, result: "unavailable" },
    },
    permissionLifecycle: {
      status: "passed",
      initialPrompt: "observed",
      grant: "passed",
      deny: "passed",
      retry: "passed",
      revoke: "unavailable",
      typedError: true,
      noUnhandledRejection: true,
      recoverableState: true,
      unhandledRejectionCount: 0,
      steps: [
        { phase: "initial-prompt", observedAt: "2026-08-12T01:00:01.000Z", outcome: "observed", scannerState: "starting", recoverableState: true, unhandledRejectionCount: 0 },
        { phase: "deny", observedAt: "2026-08-12T01:00:02.000Z", outcome: "passed", scannerState: "failed", errorCode: "camera_permission_denied", recoverableState: true, unhandledRejectionCount: 0 },
        { phase: "retry", observedAt: "2026-08-12T01:00:03.000Z", outcome: "passed", scannerState: "starting", recoverableState: true, unhandledRejectionCount: 0 },
        { phase: "grant", observedAt: "2026-08-12T01:00:04.000Z", outcome: "passed", scannerState: "scanning", recoverableState: true, unhandledRejectionCount: 0 },
      ],
    },
    cameraSwitch: { tested: true, result: "passed", sequence: ["rear", "front", "rear"], browserReportedMetadataComplete: true, distinctRearAndFrontDevices: true, deviceIds: ["rear-device", "front-device", "rear-device"], oldTrackStopped: true, newCameraActive: true, generationInvalidated: true, staleResultCount: 0 },
    orientation: {
      tested: true,
      result: "passed",
      sequence: ["portrait", "landscape", "portrait"],
      decodedGeometryCorrect: true,
      trackingGeometryCorrect: true,
      overlayGeometryCorrect: true,
      noMirrorOrQuarterTurnOffset: true,
      frameDimensions: [
        { orientation: "portrait", width: 1080, height: 1920 },
        { orientation: "landscape", width: 1920, height: 1080 },
        { orientation: "portrait", width: 1080, height: 1920 },
      ],
    },
    backgroundForeground: {
      tested: true,
      waitDurationMs: 10_000,
      result: "recovered",
      observations: [
        { phase: "foreground-before", mediaStreamTrackReadyState: "live", scannerSessionState: "scanning", workerState: "running" },
        { phase: "background", mediaStreamTrackReadyState: "live", scannerSessionState: "paused", workerState: "paused" },
        { phase: "foreground-after", mediaStreamTrackReadyState: "live", scannerSessionState: "scanning", workerState: "running" },
      ],
      recoveryTimeMs: 500,
      staleResultCount: 0,
      silentDeadState: false,
    },
    scenarios,
    thermalObservation: { source: "unavailable", deviceBecameWarm: "unavailable", visibleThrottling: "unavailable", performanceDegraded: "unavailable" },
    batteryObservation: { source: "unavailable" },
    networkIsolation: { tested: true, scannerContinuedAfterNetworkDisabled: true, payloadRemainedLocal: true, cloudDecodeRequests: 0, barcodePixelsUploaded: false, barcodePayloadUploaded: false },
    fieldSources: {
      "device.declaredModel": "declared-by-tester",
      "device.manufacturer": "declared-by-tester",
      "device.operatingSystem": "declared-by-tester",
      "device.operatingSystemVersion": "declared-by-tester",
      "browser.name": "declared-by-tester",
      "browser.version": "declared-by-tester",
      "browser.userAgent": "browser-reported",
      "camera.settings": "camera-api-reported",
      "camera.capabilities": "camera-api-reported",
      "camera.constraints": "camera-api-reported",
    },
    sensitiveDataReviewed: true,
    rightsReviewed: true,
    repositoryDirty: false,
  };
}

function qualifyingSoak(durationMs = 30 * 60_000): Json {
  const startedAtMs = Date.parse("2026-08-12T01:00:00.000Z");
  const endedAt = new Date(startedAtMs + durationMs).toISOString();
  const lastWindowStartedAt = new Date(startedAtMs + durationMs - 5 * 60_000).toISOString();
  const at = (milliseconds: number) => new Date(startedAtMs + milliseconds).toISOString();
  const activityMinutes = [0, 4, 8, 12, 14, 16, 20, 24, 28];
  const activityTypes = ["basic", "multi-code", "moving", "negative", "basic", "multi-code", "moving", "negative", "basic"];
  const basicTarget = { targetId: "qr-basic", payload: "SCANLY-BETA4-QR-001", format: "qr_code" };
  const multiTargets = [
    { targetId: "multi-qr", payload: "SCANLY-BETA4-MULTI-QR", format: "qr_code" },
    { targetId: "multi-data-matrix", payload: "SCANLY-BETA4-MULTI-DM", format: "data_matrix" },
    { targetId: "multi-code128", payload: "SCANLY-BETA4-MULTI-C128", format: "code_128" },
    { targetId: "multi-ean13", payload: "4006381333931", format: "ean_13" },
  ];
  const confirmedScansAt = (elapsedMs: number) => {
    const negativeWindows = [[12 * 60_000, 14 * 60_000], [24 * 60_000, 28 * 60_000]];
    const negativeElapsed = negativeWindows.reduce((total, [negativeStart, negativeEnd]) => total + Math.max(0, Math.min(elapsedMs, negativeEnd) - Math.min(elapsedMs, negativeStart)), 0);
    return Math.floor(Math.max(0, elapsedMs - negativeElapsed) / 60_000);
  };
  const livenessSamples = Array.from({ length: Math.floor(durationMs / 10_000) + 1 }, (_, index) => {
    const elapsed = Math.min(durationMs, index * 10_000);
    return { observedAt: at(elapsed), cameraActive: true, scannerState: "scanning", capturedFrames: elapsed / 1_000 * 30, admittedFrames: elapsed / 1_000 * 25, decodeAttempts: elapsed / 1_000 * 5, confirmedScans: confirmedScansAt(elapsed) };
  });
  if (Date.parse(livenessSamples.at(-1)!.observedAt) !== startedAtMs + durationMs) livenessSamples.push({ observedAt: endedAt, cameraActive: true, scannerState: "scanning", capturedFrames: durationMs / 1_000 * 30, admittedFrames: durationMs / 1_000 * 25, decodeAttempts: durationMs / 1_000 * 5, confirmedScans: confirmedScansAt(durationMs) });
  return {
    qualifyingPhysicalSoak: true,
    startedAt: "2026-08-12T01:00:00.000Z",
    endedAt,
    durationMs,
    cameraActive: true,
    endedCameraActive: true,
    activities: activityMinutes.map((minute, index) => {
      const type = activityTypes[index];
      const elapsedSeconds = Math.min(minute * 60, durationMs / 1_000 - (activityMinutes.length - index));
      const observedAt = at(elapsedSeconds * 1_000);
      const nextElapsedSeconds = index + 1 < activityMinutes.length
        ? Math.min(activityMinutes[index + 1] * 60, durationMs / 1_000 - (activityMinutes.length - index - 1))
        : durationMs / 1_000;
      const runtimeObservation = type === "basic"
        ? { kind: "basic-runtime-confirmation", frameId: index * 100 + 1, target: basicTarget, confirmedAt: at(elapsedSeconds * 1_000 + 1_000), physicalInstanceId: `basic-track-${index}` }
        : type === "multi-code"
          ? { kind: "multi-code-same-frame", frameId: index * 100 + 2, observedAt: at(elapsedSeconds * 1_000 + 1_000), expectedTargetIds: multiTargets.map((target) => target.targetId), targets: multiTargets }
          : type === "moving"
            ? { kind: "moving-track-displacement", ...multiTargets[0], physicalInstanceId: `moving-track-${index}`, startFrameId: index * 100 + 3, endFrameId: index * 100 + 8, startObservedAt: at(elapsedSeconds * 1_000 + 1_000), endObservedAt: at(elapsedSeconds * 1_000 + 6_000), startCenter: { x: 100, y: 100 }, endCenter: { x: 130, y: 140 }, displacementPixels: 50, observedFrameCount: 6, identitySwitchCount: 0, fragmentationCount: 0, falseTrackCount: 0 }
            : { kind: "negative-runtime-interval", startedAt: observedAt, endedAt: at(nextElapsedSeconds * 1_000), capturedFrameDelta: (nextElapsedSeconds - elapsedSeconds) * 30, admittedFrameDelta: (nextElapsedSeconds - elapsedSeconds) * 25, decodeAttemptDelta: (nextElapsedSeconds - elapsedSeconds) * 5, confirmedScanDelta: 0 };
      const confirmedScans = confirmedScansAt(elapsedSeconds * 1_000);
      return { type, observedAt, cameraActive: true, capturedFrames: elapsedSeconds * 30, admittedFrames: elapsedSeconds * 25, decodeAttempts: elapsedSeconds * 5, confirmedScans, runtimeObservation };
    }),
    livenessSamples,
    capturedFrames: durationMs / 1_000 * 30,
    admittedFrames: durationMs / 1_000 * 25,
    droppedFrames: durationMs / 1_000 * 5,
    decodeAttempts: durationMs / 1_000 * 5,
    confirmedScans: confirmedScansAt(durationMs),
    falseConfirmedScans: 0,
    suppressedRepeats: 100,
    cameraTrackEndings: 0,
    scannerRestarts: 0,
    workerRestarts: 0,
    errors: 0,
    stalePublicEvents: 0,
    finalResources: { activeDecode: 0, pendingFrames: 0, activeTasks: 0, liveNativeResults: 0, wasmInputAllocations: 0, controlledMemory: 0 },
    windows: [
      { label: "first-5-min", startedAt: "2026-08-12T01:00:00.000Z", endedAt: "2026-08-12T01:05:00.000Z", durationMs: 300_000, ttfdMs: 400, ttfcMs: 600, decodeP50Ms: 12, decodeP95Ms: 20, effectiveDecodeFps: 5, frameDropRate: 0.1 },
      { label: "middle-5-min", startedAt: "2026-08-12T01:12:30.000Z", endedAt: "2026-08-12T01:17:30.000Z", durationMs: 300_000, ttfdMs: 420, ttfcMs: 620, decodeP50Ms: 13, decodeP95Ms: 21, effectiveDecodeFps: 5, frameDropRate: 0.1 },
      { label: "last-5-min", startedAt: lastWindowStartedAt, endedAt, durationMs: 300_000, ttfdMs: 410, ttfcMs: 610, decodeP50Ms: 12, decodeP95Ms: 20, effectiveDecodeFps: 5, frameDropRate: 0.1 },
    ],
  };
}

describe.sequential("Beta 4 device evidence contracts", () => {
  it("keeps Ground Truth fixed before scan and covers every physical protocol target", () => {
    const truth = read("device-lab/test-targets/ground-truth.json");
    const protocol = read("device-lab/manifest.json");
    expect(truth).toMatchObject({ schemaVersion: "beta4-ground-truth-1", createdBeforeScanning: true, decoderGeneratedGroundTruth: false });
    expect(truth.targets).toHaveLength(16);
    expect(new Set(truth.targets.map((target: Json) => target.targetId)).size).toBe(16);
    expect(protocol.scenarios.map((scenario: Json) => scenario.id)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "N1"]);
    expect(protocol.scenarios.find((scenario: Json) => scenario.id === "P9").expectedPhysicalTargetCount).toBe(4);
    expect(protocol.scenarios.find((scenario: Json) => scenario.id === "P10").requiredResultFields).toContain("physicalInstanceId");
  });

  it("accepts a complete physical fixture before testing fail-closed mutations", () => {
    withTemporaryEvidence(validPhysicalFixture(), () => expect(runVerifier()).toContain("Device evidence verification passed"));
  }, 30_000);

  it("rejects physical-mobile evidence with missing device metadata", () => {
    const evidence = validPhysicalFixture();
    delete evidence.device.declaredModel;
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects physical-mobile evidence with a missing scenario result", () => {
    const evidence = validPhysicalFixture();
    evidence.scenarios = evidence.scenarios.filter((scenario: Json) => scenario.scenarioId !== "P8");
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects physical-mobile evidence with a duplicate scenario result", () => {
    const evidence = validPhysicalFixture();
    evidence.scenarios[12] = clone(evidence.scenarios[0]);
    expectVerifierFailure(evidence);
  }, 30_000);

  it.each(["simulated", "emulated", "synthetic"])("rejects a physical-mobile record carrying a %s flag", (flag) => {
    const evidence = validPhysicalFixture();
    evidence[flag] = true;
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects a qualifying physical soak shorter than 30 minutes", () => {
    const evidence = validPhysicalFixture();
    evidence.longRun = qualifyingSoak(30 * 60_000 - 1);
    expectVerifierFailure(evidence);
  }, 30_000);

  it.each([
    ["first marker not aligned to soak start", (soak: Json) => { soak.activities[0].observedAt = "2026-08-12T01:00:01.000Z"; }],
    ["non-increasing markers", (soak: Json) => { soak.activities[2].observedAt = soak.activities[1].observedAt; }],
    ["negative as the final activity", (soak: Json) => { soak.activities = soak.activities.slice(0, 4); }],
    ["camera inactive at completion", (soak: Json) => { soak.endedCameraActive = false; }],
    ["duplicate liveness timestamp", (soak: Json) => { soak.livenessSamples[1].observedAt = soak.livenessSamples[0].observedAt; }],
    ["liveness gap over ten seconds", (soak: Json) => { soak.livenessSamples.splice(1, 1); }],
    ["liveness decode attempts regress", (soak: Json) => { soak.livenessSamples[2].decodeAttempts = soak.livenessSamples[1].decodeAttempts - 1; }],
    ["all activity markers clustered at the start", (soak: Json) => { soak.activities.forEach((entry: Json, index: number) => { entry.observedAt = new Date(Date.parse(soak.startedAt) + index * 1_000).toISOString(); }); }],
    ["an activity absent from the second half", (soak: Json) => { soak.activities = soak.activities.filter((entry: Json) => entry.type !== "moving" || Date.parse(entry.observedAt) < Date.parse(soak.startedAt) + soak.durationMs / 2); }],
    ["activity marker gap over ten minutes", (soak: Json) => { soak.activities[1].observedAt = new Date(Date.parse(soak.startedAt) + 11 * 60_000).toISOString(); }],
    ["final activity marker more than ten minutes before soak end", (soak: Json) => { soak.activities = soak.activities.filter((entry: Json) => Date.parse(entry.observedAt) <= Date.parse(soak.endedAt) - 11 * 60_000); }],
    ["activity interval without frame or decode progress", (soak: Json) => { Object.assign(soak.activities[2], { capturedFrames: soak.activities[1].capturedFrames, admittedFrames: soak.activities[1].admittedFrames, decodeAttempts: soak.activities[1].decodeAttempts }); }],
    ["basic marker without runtime confirmation", (soak: Json) => { delete soak.activities.find((entry: Json) => entry.type === "basic").runtimeObservation; }],
    ["basic confirmation for the wrong payload", (soak: Json) => { soak.activities.find((entry: Json) => entry.type === "basic").runtimeObservation.target.payload = "WRONG"; }],
    ["multi-code marker without one same-frame target", (soak: Json) => { soak.activities.find((entry: Json) => entry.type === "multi-code").runtimeObservation.targets.pop(); }],
    ["multi-code target set split across claimed frames", (soak: Json) => { soak.activities.find((entry: Json) => entry.type === "multi-code").runtimeObservation.targets[0].frameId = 999; }],
    ["moving marker without displacement", (soak: Json) => { const moving = soak.activities.find((entry: Json) => entry.type === "moving").runtimeObservation; moving.endCenter = { ...moving.startCenter }; moving.displacementPixels = 0; }],
    ["moving marker with an identity switch", (soak: Json) => { soak.activities.find((entry: Json) => entry.type === "moving").runtimeObservation.identitySwitchCount = 1; }],
    ["negative interval with a confirmed scan", (soak: Json) => { soak.activities.find((entry: Json) => entry.type === "negative").runtimeObservation.confirmedScanDelta = 1; }],
    ["negative interval counter mismatch", (soak: Json) => { soak.activities.find((entry: Json) => entry.type === "negative").runtimeObservation.decodeAttemptDelta += 1; }],
    ["zero admitted frames", (soak: Json) => { soak.admittedFrames = 0; }],
    ["zero decode attempts", (soak: Json) => { soak.decodeAttempts = 0; }],
  ])("rejects qualifying soak with %s", (_name, mutate) => {
    const evidence = validPhysicalFixture();
    evidence.longRun = qualifyingSoak();
    mutate(evidence.longRun);
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects any false confirmed scan, even when the scenario is already failed", () => {
    const evidence = validPhysicalFixture();
    const negative = evidence.scenarios.find((scenario: Json) => scenario.scenarioId === "N1");
    negative.status = "failed";
    negative.falseConfirmedScans = 1;
    negative.confirmedScanCount = 1;
    expectVerifierFailure(evidence);
  }, 30_000);

  it("accepts P2 UNSUPPORTED items when the scenario retains an honest failed status", () => {
    const evidence = validPhysicalFixture();
    const multiFormat = evidence.scenarios.find((scenario: Json) => scenario.scenarioId === "P2");
    multiFormat.status = "failed";
    const pdf417 = multiFormat.groundTruth.find((comparison: Json) => comparison.targetId === "pdf417-basic");
    delete pdf417.observedPayload;
    delete pdf417.observedFormat;
    pdf417.result = "unsupported";
    pdf417.matched = false;
    withTemporaryEvidence(evidence, () => expect(runVerifier()).toContain("Device evidence verification passed"));
  }, 30_000);

  it("rejects P2 UNSUPPORTED items hidden behind a scenario PASS", () => {
    const evidence = validPhysicalFixture();
    const multiFormat = evidence.scenarios.find((scenario: Json) => scenario.scenarioId === "P2");
    const pdf417 = multiFormat.groundTruth.find((comparison: Json) => comparison.targetId === "pdf417-basic");
    delete pdf417.observedPayload;
    delete pdf417.observedFormat;
    pdf417.result = "unsupported";
    pdf417.matched = false;
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects a P9 PASS without a runtime same-frame ID", () => {
    const evidence = validPhysicalFixture();
    evidence.scenarios.find((scenario: Json) => scenario.scenarioId === "P9").sameFrameId = "unavailable";
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects missing scenario execution timestamps", () => {
    const evidence = validPhysicalFixture();
    delete evidence.scenarios[0].startedAt;
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects a P11 PASS with an identity switch", () => {
    const evidence = validPhysicalFixture();
    evidence.scenarios.find((scenario: Json) => scenario.scenarioId === "P11").identitySwitchCount = 1;
    expectVerifierFailure(evidence);
  }, 30_000);

  it("accepts an honest P10 FAILED when tracking cannot distinguish the two physical instances", () => {
    const evidence = validPhysicalFixture();
    const samePayload = evidence.scenarios.find((scenario: Json) => scenario.scenarioId === "P10");
    samePayload.status = "failed";
    samePayload.groundTruth[1].physicalInstanceId = samePayload.groundTruth[0].physicalInstanceId;
    withTemporaryEvidence(evidence, () => expect(runVerifier()).toContain("Device evidence verification passed"));
  }, 30_000);

  it("accepts an honest P11 FAILED with an audited identity switch", () => {
    const evidence = validPhysicalFixture();
    const tracking = evidence.scenarios.find((scenario: Json) => scenario.scenarioId === "P11");
    tracking.status = "failed";
    tracking.trackingBindings[2].runtimePhysicalInstanceId = "physical-reassigned";
    tracking.identitySwitchCount = 1;
    withTemporaryEvidence(evidence, () => expect(runVerifier()).toContain("Device evidence verification passed"));
  }, 30_000);

  it("accepts an honest P12 FAILED with false completion retained", () => {
    const evidence = validPhysicalFixture();
    const batch = evidence.scenarios.find((scenario: Json) => scenario.scenarioId === "P12");
    Object.assign(batch, { status: "failed", confirmedPhysicalInstances: 3, completion: true, falseCompletion: true });
    withTemporaryEvidence(evidence, () => expect(runVerifier()).toContain("Device evidence verification passed"));
  }, 30_000);

  it("rejects a P11 identity switch hidden behind zero summary metrics", () => {
    const evidence = validPhysicalFixture();
    const tracking = evidence.scenarios.find((scenario: Json) => scenario.scenarioId === "P11");
    tracking.trackingBindings[2].runtimePhysicalInstanceId = "physical-reassigned";
    expectVerifierFailure(evidence);
  }, 30_000);

  it.each([
    ["missing browser-reported metadata", (cameraSwitch: Json) => { cameraSwitch.browserReportedMetadataComplete = false; }],
    ["the same device for rear and front", (cameraSwitch: Json) => { cameraSwitch.deviceIds = ["same-device", "same-device", "same-device"]; cameraSwitch.distinctRearAndFrontDevices = false; }],
    ["a different final rear device", (cameraSwitch: Json) => { cameraSwitch.deviceIds[2] = "other-rear-device"; }],
  ])("rejects a camera switch PASS with %s", (_name, mutate) => {
    const evidence = validPhysicalFixture();
    mutate(evidence.cameraSwitch);
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects an out-of-order permission lifecycle audit", () => {
    const evidence = validPhysicalFixture();
    [evidence.permissionLifecycle.steps[1], evidence.permissionLifecycle.steps[2]] = [evidence.permissionLifecycle.steps[2], evidence.permissionLifecycle.steps[1]];
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects physical permission evidence without its audit steps", () => {
    const evidence = validPhysicalFixture();
    delete evidence.permissionLifecycle.steps;
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects permission audit timestamps that are not strictly increasing", () => {
    const evidence = validPhysicalFixture();
    evidence.permissionLifecycle.steps[2].observedAt = evidence.permissionLifecycle.steps[1].observedAt;
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects permission denial without the typed camera_permission_denied error", () => {
    const evidence = validPhysicalFixture();
    delete evidence.permissionLifecycle.steps[1].errorCode;
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects a non-recoverable retry/grant permission path", () => {
    const evidence = validPhysicalFixture();
    evidence.permissionLifecycle.steps[2].recoverableState = false;
    evidence.permissionLifecycle.recoverableState = false;
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects any permission-lifecycle unhandled rejection", () => {
    const evidence = validPhysicalFixture();
    evidence.permissionLifecycle.steps[2].unhandledRejectionCount = 1;
    evidence.permissionLifecycle.unhandledRejectionCount = 1;
    evidence.permissionLifecycle.noUnhandledRejection = false;
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects permission summary values that disagree with the audit steps", () => {
    const evidence = validPhysicalFixture();
    evidence.permissionLifecycle.grant = "failed";
    expectVerifierFailure(evidence);
  }, 30_000);

  it.each(["not-tested", "unavailable"])("accepts an honestly %s permission lifecycle without synthetic steps", (status) => {
    const evidence = validPhysicalFixture();
    evidence.permissionLifecycle = {
      status,
      initialPrompt: status,
      grant: status,
      deny: status,
      retry: status,
      revoke: "unavailable",
      typedError: "unavailable",
      noUnhandledRejection: "unavailable",
      recoverableState: "unavailable",
      unhandledRejectionCount: 0,
      steps: [],
    };
    const pendingStatus = { ...statusForPhysicalFixture(), requiredGaps: [foundationGaps[0], foundationGaps[2], foundationGaps[3], ...fullMatrixGaps] };
    withTemporaryEvidenceSet([evidence], pendingStatus, () => expect(runVerifier()).toContain("Device evidence verification passed"));
  }, 30_000);

  it("rejects not-tested permission evidence carrying fabricated audit steps", () => {
    const evidence = validPhysicalFixture();
    evidence.permissionLifecycle.status = "not-tested";
    evidence.permissionLifecycle.initialPrompt = "not-tested";
    evidence.permissionLifecycle.grant = "not-tested";
    evidence.permissionLifecycle.deny = "not-tested";
    evidence.permissionLifecycle.retry = "not-tested";
    evidence.permissionLifecycle.typedError = "unavailable";
    evidence.permissionLifecycle.noUnhandledRejection = "unavailable";
    evidence.permissionLifecycle.recoverableState = "unavailable";
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects a recovered lifecycle without an observed paused background state", () => {
    const evidence = validPhysicalFixture();
    evidence.backgroundForeground.observations[1].scannerSessionState = "scanning";
    expectVerifierFailure(evidence);
  }, 30_000);

  it("accepts a supported revoke observation only after grant", () => {
    const evidence = validPhysicalFixture();
    evidence.permissionLifecycle.revoke = "passed";
    evidence.permissionLifecycle.steps.push({
      phase: "revoke",
      observedAt: "2026-08-12T01:00:05.000Z",
      outcome: "passed",
      scannerState: "stopped",
      recoverableState: true,
      unhandledRejectionCount: 0,
    });
    withTemporaryEvidence(evidence, () => expect(runVerifier()).toContain("Device evidence verification passed"));
  }, 30_000);

  it("rejects a revoke claim without its post-grant audit observation", () => {
    const evidence = validPhysicalFixture();
    evidence.permissionLifecycle.revoke = "passed";
    expectVerifierFailure(evidence);
  }, 30_000);

  it("requires unavailable rather than unsupported when revocation cannot be exercised", () => {
    const evidence = validPhysicalFixture();
    evidence.permissionLifecycle.revoke = "unsupported";
    expectVerifierFailure(evidence);
  }, 30_000);

  it("passes the minimum two-platform gate with one honest failed scenario and permission audited on only one device", () => {
    const android = validPhysicalFixture();
    android.evidenceId = "beta4-contract-android-foundation";
    android.longRun = qualifyingSoak();
    const multiFormat = android.scenarios.find((scenario: Json) => scenario.scenarioId === "P2");
    multiFormat.status = "failed";
    const pdf417 = multiFormat.groundTruth.find((comparison: Json) => comparison.targetId === "pdf417-basic");
    delete pdf417.observedPayload; delete pdf417.observedFormat; pdf417.result = "unsupported"; pdf417.matched = false;

    const ios = clone(android);
    ios.evidenceId = "beta4-contract-ios-foundation";
    ios.device = { declaredModel: "iPhone declared by tester", manufacturer: "Apple", operatingSystem: "iOS", operatingSystemVersion: "19.0" };
    ios.browser = { name: "Safari", version: "19.0", userAgent: "fixture-ios" };
    ios.longRun = { qualifyingPhysicalSoak: false, durationMs: 0 };
    ios.permissionLifecycle = { status: "not-tested", initialPrompt: "not-tested", grant: "not-tested", deny: "not-tested", retry: "not-tested", revoke: "unavailable", typedError: "unavailable", noUnhandledRejection: "unavailable", recoverableState: "unavailable", unhandledRejectionCount: 0, steps: [] };

    withTemporaryEvidenceSet([android, ios], statusForFoundationFixtures(), () => {
      expect(runVerifier()).toContain("PHYSICAL_DEVICE_VALIDATION_STARTED_AND_MINIMUM_GATE_PASSED");
    });
  }, 30_000);

  it("keeps the Foundation gate pending when every physical session leaves permission untested", () => {
    const android = validPhysicalFixture(); android.evidenceId = "beta4-contract-android-pending"; android.longRun = qualifyingSoak();
    const ios = clone(android); ios.evidenceId = "beta4-contract-ios-pending"; ios.device = { declaredModel: "iPhone declared by tester", manufacturer: "Apple", operatingSystem: "iOS", operatingSystemVersion: "19.0" }; ios.browser = { name: "Safari", version: "19.0", userAgent: "fixture-ios" }; ios.longRun = { qualifyingPhysicalSoak: false, durationMs: 0 };
    for (const evidence of [android, ios]) evidence.permissionLifecycle = { status: "not-tested", initialPrompt: "not-tested", grant: "not-tested", deny: "not-tested", retry: "not-tested", revoke: "unavailable", typedError: "unavailable", noUnhandledRejection: "unavailable", recoverableState: "unavailable", unhandledRejectionCount: 0, steps: [] };
    const status = { ...statusForFoundationFixtures(), physicalValidationStatus: "PHYSICAL_DEVICE_VALIDATION_DEFERRED_TO_RC", requiredGaps: [foundationGaps[3], ...fullMatrixGaps] };
    withTemporaryEvidenceSet([android, ios], status, () => expect(runVerifier()).toContain("PHYSICAL_DEVICE_VALIDATION_DEFERRED_TO_RC"));
  }, 30_000);

  it("rejects an otherwise physical record when repository status omits derived counts", () => {
    const evidence = validPhysicalFixture();
    withTemporaryEvidence(evidence, () => {
      const current = read("device-evidence/status.json");
      delete current.physicalScenarioCount;
      fs.writeFileSync(statusPath, `${JSON.stringify(current, null, 2)}\n`);
      expect(() => runVerifier()).toThrow();
    });
  }, 30_000);

  it("rejects a remote device-farm session claiming the local physical-mobile soak gate", () => {
    const evidence = validPhysicalFixture();
    evidence.evidenceType = "remote-physical-device";
    evidence.session.hardwareAccess = "remote-device-farm";
    evidence.longRun = qualifyingSoak();
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects a remote device-farm declaration without provider-backed real-hardware identity", () => {
    const evidence = validPhysicalFixture();
    evidence.evidenceType = "remote-physical-device";
    evidence.session.hardwareAccess = "remote-device-farm";
    evidence.longRun = { qualifyingPhysicalSoak: false, durationMs: 0 };
    expectVerifierFailure(evidence);
  }, 30_000);

  it("accepts provider-backed remote real-hardware evidence without counting it as the mobile soak", () => {
    const evidence = validPhysicalFixture();
    evidence.evidenceType = "remote-physical-device";
    evidence.session.hardwareAccess = "remote-device-farm";
    evidence.longRun = { qualifyingPhysicalSoak: false, durationMs: 0 };
    evidence.remoteHardware = { provider: "Example Real Device Cloud", providerSessionId: "provider-session-001", providerDeviceId: "provider-device-001", realHardware: true, attestationUrl: "https://device-cloud.example/sessions/provider-session-001", attestationSha256: "a".repeat(64) };
    for (const field of ["remoteHardware.provider", "remoteHardware.providerSessionId", "remoteHardware.providerDeviceId", "remoteHardware.realHardware", "remoteHardware.attestationUrl", "remoteHardware.attestationSha256"]) evidence.fieldSources[field] = "provider-reported";
    const status = {
      ...emptyStatus(),
      remotePhysicalDeviceSessionCount: 1,
    };
    withTemporaryEvidenceSet([evidence], status, () => expect(runVerifier()).toContain("Device evidence verification passed"));
  }, 30_000);

  it("does not let remote real-hardware iOS/Android sessions satisfy the local physical-mobile Foundation rows", () => {
    const android = validPhysicalFixture();
    android.evidenceId = "beta4-contract-remote-android";
    android.evidenceType = "remote-physical-device";
    android.session.hardwareAccess = "remote-device-farm";
    android.longRun = { qualifyingPhysicalSoak: false, durationMs: 0 };
    android.remoteHardware = { provider: "Example Real Device Cloud", providerSessionId: "remote-android-session", providerDeviceId: "remote-android-device", realHardware: true, attestationUrl: "https://device-cloud.example/sessions/remote-android-session", attestationSha256: "b".repeat(64) };
    const ios = clone(android);
    ios.evidenceId = "beta4-contract-remote-ios";
    ios.device = { declaredModel: "Remote iPhone", manufacturer: "Apple", operatingSystem: "iOS", operatingSystemVersion: "19.0" };
    ios.browser = { name: "Safari", version: "19.0", userAgent: "remote-ios" };
    ios.remoteHardware = { provider: "Example Real Device Cloud", providerSessionId: "remote-ios-session", providerDeviceId: "remote-ios-device", realHardware: true, attestationUrl: "https://device-cloud.example/sessions/remote-ios-session", attestationSha256: "c".repeat(64) };
    for (const evidence of [android, ios]) for (const field of ["remoteHardware.provider", "remoteHardware.providerSessionId", "remoteHardware.providerDeviceId", "remoteHardware.realHardware", "remoteHardware.attestationUrl", "remoteHardware.attestationSha256"]) evidence.fieldSources[field] = "provider-reported";
    const status = { ...emptyStatus(), remotePhysicalDeviceSessionCount: 2 };
    withTemporaryEvidenceSet([android, ios], status, () => expect(runVerifier()).toContain("0 iOS Safari, 0 Android Chrome"));
  }, 30_000);

  it("rejects source commit/tree mismatch", () => {
    const evidence = validPhysicalFixture();
    evidence.sourceTree = "0".repeat(40);
    expectVerifierFailure(evidence);
  }, 30_000);

  it.each([
    ["device.declaredModel", (evidence: Json) => { evidence.device.declaredModel = "unavailable"; }],
    ["device.manufacturer", (evidence: Json) => { evidence.device.manufacturer = "unknown"; }],
    ["device.operatingSystemVersion", (evidence: Json) => { evidence.device.operatingSystemVersion = "N/A"; }],
    ["browser.version", (evidence: Json) => { evidence.browser.version = "not-tested"; }],
  ])("rejects placeholder required physical identity %s", (_field, mutate) => {
    const evidence = validPhysicalFixture();
    mutate(evidence);
    expectVerifierFailure(evidence);
  }, 30_000);

  it("rejects a localhost deployment claim", () => {
    const evidence = validPhysicalFixture();
    evidence.deployment = { url: "https://localhost:3000", deploymentId: "local-dev", gitCommit: evidence.sourceCommit };
    expectVerifierFailure(evidence);
  }, 30_000);

  it("verifies the current honest empty matrix and deterministic target bytes", () => {
    expect(() => runVerifier()).not.toThrow();
    expect(() => execFileSync(process.execPath, ["--import", "tsx", "scripts/generate-device-test-targets.ts", "--verify"], { cwd: root, stdio: "pipe" })).not.toThrow();
    expect(read("device-evidence/status.json")).toMatchObject({ matrixStatus: "DEVICE_MATRIX_PARTIAL", physicalValidationStatus: "PHYSICAL_DEVICE_VALIDATION_DEFERRED_TO_RC", physicalMobileSessionCount: 0 });
  }, 30_000);

  it("keeps Device Lab free of network decode and analytics code paths", () => {
    const source = fs.readFileSync(path.join(root, "apps/web-demo/components/DeviceLab.tsx"), "utf8");
    for (const forbidden of ["fetch(", "XMLHttpRequest", "sendBeacon", "external decode API", "barcode cloud service"]) expect(source).not.toContain(forbidden);
    expect(source).toContain("barcodePixelsUploaded: false");
    expect(source).toContain("barcodePayloadUploaded: false");
    expect(source).toContain('getBuiltinScenario("multiformat-balanced")');
    expect(source).toContain("Reset all + new session ID");
    expect(source).toContain("async function resetSession()");
    expect(source).toContain("browserReportedMetadataComplete");
    expect(source).toContain("distinctRearAndFrontDevices");
    expect(source).toContain("auto-zoom-cooldown-suppression-window");
    expect(source).toContain("operationGenerationRef");
    expect(source).toContain("freezeLastSoakInterval");
    expect(source).toContain("requestedZoom");
    expect(source).toContain("manualZoomAuditPassed");
    expect(source).toContain("observedResourceRequests: observedRequests, zoomAudit");
    expect(source).toContain("await previousSession?.dispose()");
    expect(source).toContain("NEXT_PUBLIC_SCANLY_REPOSITORY_DIRTY");
    expect(source).toContain("repositoryDirty: sourceRepositoryDirty");
    expect(source).toContain("remoteProviderSessionId");
    expect(source).toContain('realHardware: "review-required"');
    expect(source).toContain('(soakStartStatistics?.workerCreatedCount ?? 0) === 0 && soakFinalStatistics.workerCreatedCount > 0 ? 1 : 0');
    expect(source).not.toContain("New session ID</button>");
    expect(source).not.toContain("boundingBox: { x: 0, y: 0, width: 1, height: 1 }");
    expect(source).not.toContain("recordZoomCooldown");
  });
});
