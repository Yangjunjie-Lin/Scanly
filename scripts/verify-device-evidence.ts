import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import { deviceEvidenceOnlyAfterSource } from "./device-evidence-source-policy.js";

const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const Ajv = require("ajv/dist/2020").default as new (options?: object) => { compile(schema: object): ((value: unknown) => boolean) & { errors?: unknown[] } };
const addFormats = require("ajv-formats").default as (ajv: object) => void;

type Json = Record<string, any>;
type EvidenceType = "simulated" | "desktop-camera" | "physical-mobile" | "remote-physical-device";
const PHYSICAL_TYPES = new Set<EvidenceType>(["physical-mobile", "remote-physical-device"]);
const SCENARIO_IDS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "N1"] as const;
const PHYSICAL_FIELD_SOURCES = [
  "device.declaredModel",
  "device.manufacturer",
  "device.operatingSystem",
  "device.operatingSystemVersion",
  "browser.name",
  "browser.version",
  "browser.userAgent",
  "camera.settings",
  "camera.capabilities",
  "camera.constraints",
];
const REMOTE_HARDWARE_FIELD_SOURCES = ["remoteHardware.provider", "remoteHardware.providerSessionId", "remoteHardware.providerDeviceId", "remoteHardware.realHardware", "remoteHardware.attestationUrl", "remoteHardware.attestationSha256"] as const;
const FULL_MATRIX_GAPS = [
  "Issue #13 full matrix: second iPhone generation",
  "Issue #13 full matrix: Android lower-end device",
  "Issue #13 full matrix: Android mid-range device",
  "Issue #13 full matrix: Android flagship device",
  "Issue #13 full matrix: desktop real webcam session",
] as const;
const FOUNDATION_GAPS = [
  "Beta 4 Foundation: iOS Safari physical-mobile session",
  "Beta 4 Foundation: Android Chrome physical-mobile session",
  "Beta 4 Foundation: 30-minute physical-mobile camera soak",
] as const;
const FOUNDATION_PERMISSION_GAP = "Beta 4 Foundation: complete physical permission lifecycle audit";
const FOUNDATION_CAMERA_SWITCH_GAP = "Beta 4 Foundation: verified rear-front-rear camera switch";
const FORBIDDEN_PHYSICAL_KEYS = /(^|[_-])(simulated|simulation|emulated|emulation|synthetic|mock|spoofed)([_-]|$)/i;

const read = (file: string): Json => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const git = (...args: string[]): string => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const existsCommit = (sha: string): boolean => {
  try { return git("cat-file", "-t", sha) === "commit"; } catch { return false; }
};
const fail: (message: string) => never = (message) => { throw new Error(message); };
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) fail(message); };
const milliseconds = (iso: string, label: string): number => {
  const value = Date.parse(iso);
  assert(Number.isFinite(value), `${label}: invalid date-time.`);
  return value;
};
const exactArray = (actual: unknown, expected: readonly unknown[]): boolean =>
  Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
const sameSet = (actual: unknown[], expected: unknown[]): boolean =>
  actual.length === expected.length && new Set(actual).size === actual.length && expected.every((value) => actual.includes(value));
const normalized = (value: unknown): string => String(value ?? "").trim().toLowerCase();
const targetMatches = (observed: Json, expected: Json): boolean =>
  observed.targetId === expected.targetId && observed.payload === expected.payload && observed.format === expected.format;
const activityIntervalEnd = (activities: Json[], index: number, ended: number): number =>
  index + 1 < activities.length ? Date.parse(activities[index + 1].observedAt) : ended;
const isPhysicalMobile = (evidence: Json): boolean => evidence.evidenceType === "physical-mobile";
const isIosSafari = (evidence: Json): boolean =>
  isPhysicalMobile(evidence) && /^(ios|ipados)$/.test(normalized(evidence.device.operatingSystem)) && normalized(evidence.browser.name) === "safari";
const isAndroidChrome = (evidence: Json): boolean =>
  isPhysicalMobile(evidence) && normalized(evidence.device.operatingSystem) === "android" && /^(google )?chrome$/.test(normalized(evidence.browser.name));
const permissionLifecyclePassed = (lifecycle: Json): boolean =>
  lifecycle.status === "passed"
  && lifecycle.initialPrompt === "observed"
  && lifecycle.deny === "passed"
  && lifecycle.retry === "passed"
  && lifecycle.grant === "passed"
  && lifecycle.typedError === true
  && lifecycle.recoverableState === true
  && lifecycle.noUnhandledRejection === true
  && lifecycle.unhandledRejectionCount === 0;
const hasUsableZoom = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return value === true;
  const range = value as Json;
  return Number.isFinite(range.min) && Number.isFinite(range.max) && range.max > range.min;
};
const findForbiddenPhysicalClaim = (value: unknown, trail = "evidence"): string | undefined => {
  if (!value || typeof value !== "object") return undefined;
  for (const [key, child] of Object.entries(value as Json)) {
    const next = `${trail}.${key}`;
    if (FORBIDDEN_PHYSICAL_KEYS.test(key)) return next;
    if (typeof child === "string" && /^(simulated|emulated|synthetic|mock|spoofed)$/i.test(child.trim())) return next;
    const nested = findForbiddenPhysicalClaim(child, next);
    if (nested) return nested;
  }
  return undefined;
};
const evidenceOnlyAfterSource = (sourceCommit: string): boolean => deviceEvidenceOnlyAfterSource(root, sourceCommit);

const schema = read("device-evidence/schema.json");
const manifest = read("device-lab/manifest.json");
const truth = read("device-lab/test-targets/ground-truth.json");
const status = read("device-evidence/status.json");
const packageJson = read("package.json");
const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv);
const validate = ajv.compile(schema);

assert(packageJson.version === "2.0.0-beta.4", "Repository SDK version is not Beta 4.");
assert(manifest.schemaVersion === "beta4-device-manifest-1" && manifest.status === "DEVICE_MATRIX_PARTIAL", "Device manifest identity/status failed.");
assert(manifest.groundTruthPolicy === "decoder-independent-fixed-before-scan", "Device manifest Ground Truth policy failed.");
assert(exactArray((manifest.scenarios as Json[]).map((entry) => entry.id), SCENARIO_IDS), "Device protocol must contain exact P1-P12+N1 order.");
assert(truth.schemaVersion === "beta4-ground-truth-1" && truth.createdBeforeScanning === true && truth.decoderGeneratedGroundTruth === false, "Ground Truth provenance failed.");

const targets = new Map<string, Json>();
for (const target of truth.targets as Json[]) {
  assert(!targets.has(target.targetId), `Duplicate Ground Truth target '${target.targetId}'.`);
  assert(target.payload && target.format && target.creationSource && target.medium && target.file, `Incomplete Ground Truth target '${target.targetId}'.`);
  targets.set(target.targetId, target);
}
const protocol = new Map<string, Json>();
for (const scenario of manifest.scenarios as Json[]) {
  protocol.set(scenario.id, scenario);
  const ids = scenario.targetIds ?? [];
  assert(new Set(ids).size === ids.length, `${scenario.id}: manifest targetIds contain duplicates.`);
  for (const targetId of ids) assert(targets.has(targetId), `${scenario.id}: unknown Ground Truth target '${targetId}'.`);
}

const hashManifest = read("device-lab/test-targets/sha256.json");
for (const [relative, expected] of Object.entries(hashManifest.hashes as Record<string, string>)) {
  const bytes = fs.readFileSync(path.join(root, ...relative.split("/")));
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  assert(actual === expected, `Target SHA-256 mismatch: ${relative}`);
}

const sessionDirectory = path.join(root, "device-evidence", "sessions");
const sessionFiles = fs.readdirSync(sessionDirectory).filter((name) => name.endsWith(".json")).sort();
const counts: Record<EvidenceType, number> = { "physical-mobile": 0, "remote-physical-device": 0, "desktop-camera": 0, simulated: 0 };
const evidenceIds = new Set<string>();
const physicalSessions: Json[] = [];
let physicalScenarioCount = 0;

for (const name of sessionFiles) {
  const evidence = JSON.parse(fs.readFileSync(path.join(sessionDirectory, name), "utf8")) as Json;
  assert(validate(evidence), `${name}: schema validation failed: ${JSON.stringify(validate.errors)}`);
  assert(name === `${evidence.evidenceId}.json`, `${name}: filename must be the evidenceId plus .json.`);
  assert(!evidenceIds.has(evidence.evidenceId), `${name}: duplicate evidenceId '${evidence.evidenceId}'.`);
  evidenceIds.add(evidence.evidenceId);
  counts[evidence.evidenceType as EvidenceType] += 1;

  assert(evidence.sdkVersion === packageJson.version, `${name}: sdkVersion does not match the repository package version.`);
  assert(existsCommit(evidence.sourceCommit), `${name}: sourceCommit is not a repository commit.`);
  assert(git("show", "-s", "--format=%T", evidence.sourceCommit) === evidence.sourceTree, `${name}: sourceTree does not match sourceCommit.`);
  assert(evidence.repositoryDirty === false, `${name}: dirty repository evidence is not admissible.`);
  assert(milliseconds(evidence.session.endedAt, `${name}/session.endedAt`) > milliseconds(evidence.session.startedAt, `${name}/session.startedAt`), `${name}: session endedAt must be after startedAt.`);
  if (evidence.deployment) {
    assert(evidence.deployment.gitCommit === evidence.sourceCommit, `${name}: deployment Git commit does not match sourceCommit.`);
    assert(/^https:\/\//.test(evidence.deployment.url) && !/\b(localhost|127\.0\.0\.1|\[::1\])\b/i.test(evidence.deployment.url), `${name}: formal deployment evidence requires a non-local HTTPS URL.`);
  }

  const expectedAccess: Record<EvidenceType, string> = {
    simulated: "simulated",
    "desktop-camera": "desktop-local",
    "physical-mobile": "physical-local",
    "remote-physical-device": "remote-device-farm",
  };
  assert(evidence.session.hardwareAccess === expectedAccess[evidence.evidenceType as EvidenceType], `${name}: evidenceType/hardwareAccess mismatch.`);
  if (evidence.evidenceType === "remote-physical-device") {
    assert(evidence.remoteHardware?.realHardware === true, `${name}: remote device-farm evidence requires a real-hardware attestation.`);
    assert(evidence.remoteHardware.provider && evidence.remoteHardware.providerSessionId && evidence.remoteHardware.providerDeviceId && evidence.remoteHardware.attestationUrl && evidence.remoteHardware.attestationSha256, `${name}: remote device-farm provider identity/attestation is incomplete.`);
    assert(!/^(device farm|provider|test|unknown)$/i.test(evidence.remoteHardware.provider.trim()), `${name}: remote hardware provider must identify the actual service.`);
    assert(/^https:\/\//.test(evidence.remoteHardware.attestationUrl) && !/\b(localhost|127\.0\.0\.1|\[::1\])\b/i.test(evidence.remoteHardware.attestationUrl), `${name}: remote hardware attestation must use a non-local HTTPS provider URL.`);
    for (const field of REMOTE_HARDWARE_FIELD_SOURCES) assert(evidence.fieldSources[field] === "provider-reported", `${name}: remote hardware field '${field}' must be provider-reported.`);
  }

  const physical = PHYSICAL_TYPES.has(evidence.evidenceType as EvidenceType);
  if (physical) {
    const forbidden = findForbiddenPhysicalClaim(evidence);
    assert(!forbidden, `${name}: physical evidence contains a simulated/emulated/synthetic claim at ${forbidden}.`);
    assert(["physical-local", "remote-device-farm"].includes(evidence.session.hardwareAccess), `${name}: physical evidence lacks qualifying hardware access.`);
    for (const [field, value] of [
      ["device.declaredModel", evidence.device.declaredModel],
      ["device.manufacturer", evidence.device.manufacturer],
      ["device.operatingSystem", evidence.device.operatingSystem],
      ["device.operatingSystemVersion", evidence.device.operatingSystemVersion],
      ["browser.name", evidence.browser.name],
      ["browser.version", evidence.browser.version],
    ] as const) assert(typeof value === "string" && value.trim().length > 0 && !/^(unavailable|unknown|not[- ]?tested|n\/?a)$/i.test(value.trim()), `${name}: required physical identity '${field}' is missing or a placeholder.`);
    for (const field of PHYSICAL_FIELD_SOURCES) assert(evidence.fieldSources[field], `${name}: missing field source '${field}'.`);
    assert(evidence.fieldSources["device.declaredModel"] === "declared-by-tester" || evidence.fieldSources["device.declaredModel"] === "browser-reported", `${name}: model source must be declared-by-tester or browser-reported.`);
    assert(evidence.fieldSources["device.manufacturer"] === "declared-by-tester" || evidence.fieldSources["device.manufacturer"] === "browser-reported", `${name}: manufacturer source must be declared-by-tester or browser-reported.`);
    for (const field of ["device.operatingSystem", "device.operatingSystemVersion", "browser.name", "browser.version"]) {
      assert(["declared-by-tester", "browser-reported"].includes(evidence.fieldSources[field]), `${name}: '${field}' source must be declared-by-tester or browser-reported.`);
    }
    assert(evidence.fieldSources["browser.userAgent"] === "browser-reported", `${name}: User-Agent source must be browser-reported.`);
    assert(evidence.fieldSources["camera.settings"] === "camera-api-reported" && evidence.fieldSources["camera.capabilities"] === "camera-api-reported" && evidence.fieldSources["camera.constraints"] === "camera-api-reported", `${name}: MediaTrack evidence must be camera-api-reported.`);
    assert(evidence.scenarios.length === SCENARIO_IDS.length, `${name}: physical evidence requires exact P1-P12+N1.`);
    assert(sameSet(evidence.scenarios.map((entry: Json) => entry.scenarioId), [...SCENARIO_IDS]), `${name}: physical evidence scenario IDs must be unique exact P1-P12+N1.`);
    assert(!evidence.scenarios.some((entry: Json) => ["not-tested", "unavailable"].includes(entry.status)), `${name}: physical scenarios cannot be not-tested/unavailable; execute the scenario and retain passed/failed outcomes.`);
    assert(evidence.networkIsolation.tested === true && evidence.networkIsolation.scannerContinuedAfterNetworkDisabled === true && evidence.networkIsolation.payloadRemainedLocal === true && evidence.networkIsolation.cloudDecodeRequests === 0, `${name}: network isolation was not fully exercised/local-only.`);
    assert(evidence.orientation.tested === true, `${name}: orientation must be tested.`);
    if (evidence.orientation.result === "passed") assert(evidence.orientation.decodedGeometryCorrect && evidence.orientation.trackingGeometryCorrect && evidence.orientation.overlayGeometryCorrect && evidence.orientation.noMirrorOrQuarterTurnOffset, `${name}: orientation PASS requires every geometry/mirror check to pass.`);
    assert(evidence.backgroundForeground.tested === true && evidence.backgroundForeground.silentDeadState === false, `${name}: background/foreground lifecycle must be tested without a silent dead state.`);
    assert(exactArray(evidence.backgroundForeground.observations.map((entry: Json) => entry.phase), ["foreground-before", "background", "foreground-after"]), `${name}: background/foreground observations must preserve the executed phase order.`);
    const [foregroundBefore, background, foregroundAfter] = evidence.backgroundForeground.observations;
    assert(background.scannerSessionState === "paused" && ["scanning", "failed"].includes(foregroundAfter.scannerSessionState), `${name}: background/foreground observations do not reflect a real pause and terminal recovery outcome.`);
    if (evidence.backgroundForeground.result === "recovered") assert(foregroundBefore.scannerSessionState === "scanning" && foregroundAfter.scannerSessionState === "scanning" && evidence.backgroundForeground.staleResultCount === 0 && Number.isFinite(evidence.backgroundForeground.recoveryTimeMs), `${name}: RECOVERED lifecycle requires scanning before/after, measured recovery, and zero stale results.`);
    if (evidence.backgroundForeground.result === "failed") assert(foregroundAfter.scannerSessionState === "failed", `${name}: FAILED lifecycle must retain the failed ScannerSession state.`);
    const permission = evidence.permissionLifecycle;
    const permissionSteps = permission.steps as Json[];
    if (permission.status === "passed" || permission.status === "failed") {
      const expectedPermissionPhases = permission.revoke === "unavailable"
        ? ["initial-prompt", "deny", "retry", "grant"]
        : ["initial-prompt", "deny", "retry", "grant", "revoke"];
      assert(exactArray(permissionSteps.map((entry) => entry.phase), expectedPermissionPhases), `${name}: an executed permission audit must preserve exact initial-prompt/deny/retry/grant order, with revoke only after grant when available.`);
      let previousPermissionAt = -Infinity;
      for (const step of permissionSteps) {
        const observedAt = milliseconds(step.observedAt, `${name}/permissionLifecycle.${step.phase}.observedAt`);
        assert(observedAt > previousPermissionAt, `${name}: permission audit timestamps must be strictly increasing.`);
        assert(observedAt >= milliseconds(evidence.session.startedAt, `${name}/session.startedAt`) && observedAt <= milliseconds(evidence.session.endedAt, `${name}/session.endedAt`), `${name}: permission audit step '${step.phase}' lies outside the evidence session.`);
        previousPermissionAt = observedAt;
      }
      const [promptStep, denyStep, retryStep, grantStep, revokeStep] = permissionSteps;
      assert(permission.initialPrompt === promptStep.outcome && permission.deny === denyStep.outcome && permission.retry === retryStep.outcome && permission.grant === grantStep.outcome, `${name}: permission summary does not match the ordered audit steps.`);
      if (revokeStep) assert(revokeStep.outcome === permission.revoke, `${name}: revoke summary does not match the optional revoke audit step.`);
      assert(permission.typedError === (denyStep.errorCode === "camera_permission_denied"), `${name}: permission typedError summary does not match the deny observation.`);
      assert(permission.recoverableState === permissionSteps.every((entry) => entry.recoverableState === true), `${name}: permission recoverableState summary does not match the audit steps.`);
      assert(permission.unhandledRejectionCount === Math.max(...permissionSteps.map((entry) => entry.unhandledRejectionCount)), `${name}: permission unhandled-rejection count does not match the audit steps.`);
      assert(permission.noUnhandledRejection === (permission.unhandledRejectionCount === 0), `${name}: permission noUnhandledRejection summary does not match its count.`);
      if (permission.status === "passed") {
        assert(permissionSteps.every((entry) => entry.unhandledRejectionCount === 0), `${name}: passing permission audit observed an unhandled rejection.`);
        assert(promptStep.outcome === "observed", `${name}: initial permission prompt was not observed.`);
        assert(denyStep.outcome === "passed" && denyStep.errorCode === "camera_permission_denied" && denyStep.scannerState === "failed" && denyStep.recoverableState === true, `${name}: deny must surface typed camera_permission_denied in a recoverable failed scanner state.`);
        assert(retryStep.outcome === "passed" && retryStep.recoverableState === true && ["starting", "scanning"].includes(retryStep.scannerState) && !retryStep.errorCode, `${name}: retry must be a clean recoverable transition toward scanning.`);
        assert(grantStep.outcome === "passed" && grantStep.scannerState === "scanning" && grantStep.recoverableState === true && !grantStep.errorCode, `${name}: grant must observe a recovered scanning state after retry.`);
        assert(permissionLifecyclePassed(permission), `${name}: permission prompt/deny/retry/grant lifecycle did not pass fail-closed admission.`);
      }
    } else {
      assert(permissionSteps.length === 0, `${name}: permission ${permission.status} must not carry synthetic audit steps.`);
      assert(permission.unhandledRejectionCount === 0, `${name}: unexecuted permission lifecycle count must remain zero.`);
    }
    assert(evidence.cameraSwitch.tested === true || evidence.cameraSwitch.result === "unavailable", `${name}: camera switch must be tested or explicitly unavailable.`);
    if (evidence.cameraSwitch.tested === true) {
      assert(exactArray(evidence.cameraSwitch.sequence, ["rear", "front", "rear"]), `${name}: tested camera switch must execute rear/front/rear.`);
      assert(evidence.cameraSwitch.deviceIds.length === 3, `${name}: tested camera switch requires three browser-reported device IDs.`);
      if (evidence.cameraSwitch.result === "passed") assert(evidence.cameraSwitch.oldTrackStopped === true && evidence.cameraSwitch.newCameraActive === true && evidence.cameraSwitch.generationInvalidated === true && evidence.cameraSwitch.staleResultCount === 0 && evidence.cameraSwitch.browserReportedMetadataComplete === true && evidence.cameraSwitch.distinctRearAndFrontDevices === true && evidence.cameraSwitch.deviceIds[0] === evidence.cameraSwitch.deviceIds[2] && evidence.cameraSwitch.deviceIds[0] !== evidence.cameraSwitch.deviceIds[1], `${name}: camera switch PASS requires browser-reported rear/front/rear devices, track stop, new camera, generation invalidation, and zero stale results.`);
    } else {
      assert(evidence.cameraSwitch.sequence.length === 0, `${name}: unavailable camera switch must not claim an executed sequence.`);
    }
    const torch = evidence.capabilityEvidence.torch;
    assert((evidence.camera.capabilities.torch === true) === torch.reported, `${name}: torch report must agree with raw MediaTrackCapabilities.`);
    assert(torch.reported ? [torch.on, torch.off].every((value) => ["passed", "failed"].includes(value)) : torch.on === "unsupported" && torch.off === "unsupported", `${name}: torch evidence contradicts reported capability.`);
    const zoom = evidence.capabilityEvidence.zoom;
    const rawZoom = evidence.camera.capabilities.zoom;
    assert(hasUsableZoom(rawZoom) === zoom.reported, `${name}: zoom report must agree with usable raw MediaTrackCapabilities range.`);
    assert(zoom.reported ? [zoom.minimum, zoom.maximum, zoom.current].every(Number.isFinite) : [zoom.minimum, zoom.maximum, zoom.current].every((value) => value === "unavailable"), `${name}: zoom bounds/current contradict reported capability.`);
    if (zoom.reported) {
      assert([zoom.manualZoom, zoom.autoZoom, zoom.manualOverride, zoom.cooldown].every((value) => ["passed", "failed"].includes(value)), `${name}: reported zoom requires manual/auto/override/cooldown results.`);
      assert(zoom.minimum <= zoom.current && zoom.current <= zoom.maximum, `${name}: zoom current value is outside its reported range.`);
    }
    const focus = evidence.capabilityEvidence.focus;
    const rawFocus = evidence.camera.capabilities.focusMode;
    const continuousFocusReported = rawFocus === true || (Array.isArray(rawFocus) && rawFocus.includes("continuous"));
    assert(continuousFocusReported === focus.reported, `${name}: focus report must agree with a true or continuous raw MediaTrackCapabilities focusMode.`);
    assert(focus.reported ? ["passed", "failed"].includes(focus.result) : focus.result === "unavailable", `${name}: focus result contradicts reported capability.`);
    const thermal = evidence.thermalObservation;
    if (thermal.source === "unavailable") assert([thermal.deviceBecameWarm, thermal.visibleThrottling, thermal.performanceDegraded].every((value) => value === "unavailable"), `${name}: unavailable thermal source cannot claim observations.`);
    if (evidence.batteryObservation.source === "tester-recorded") {
      const sessionDuration = milliseconds(evidence.session.endedAt, `${name}/session.endedAt`) - milliseconds(evidence.session.startedAt, `${name}/session.startedAt`);
      assert(evidence.batteryObservation.durationMs <= sessionDuration, `${name}: battery observation duration exceeds the session.`);
    } else {
      assert(Object.keys(evidence.batteryObservation).length === 1, `${name}: unavailable battery source cannot carry recorded values.`);
    }
    physicalSessions.push(evidence);
    physicalScenarioCount += evidence.scenarios.length;
  }

  for (const scenario of evidence.scenarios as Json[]) {
    const scenarioStarted = milliseconds(scenario.startedAt, `${name}/${scenario.scenarioId}.startedAt`);
    const scenarioEnded = milliseconds(scenario.endedAt, `${name}/${scenario.scenarioId}.endedAt`);
    assert(scenarioEnded > scenarioStarted && scenarioEnded - scenarioStarted === scenario.durationMs, `${name}/${scenario.scenarioId}: scenario timestamps/duration are missing or inconsistent.`);
    assert(scenarioStarted >= milliseconds(evidence.session.startedAt, `${name}/session.startedAt`) && scenarioEnded <= milliseconds(evidence.session.endedAt, `${name}/session.endedAt`), `${name}/${scenario.scenarioId}: scenario lies outside the evidence session.`);
    assert(scenario.falseConfirmedScans === 0, `${name}/${scenario.scenarioId}: falseConfirmedScans must be zero for every status.`);
    const expectedScenario = protocol.get(scenario.scenarioId);
    assert(expectedScenario, `${name}/${scenario.scenarioId}: scenario is outside the fixed protocol.`);
    const expectedIds = (expectedScenario.targetIds ?? []) as string[];
    assert(exactArray(scenario.targetIds, expectedIds), `${name}/${scenario.scenarioId}: targetIds must exactly match the manifest, in manifest order, with no duplicates.`);
    assert(new Set(scenario.groundTruth.map((comparison: Json) => comparison.targetId)).size === scenario.groundTruth.length, `${name}/${scenario.scenarioId}: duplicate Ground Truth comparisons.`);
    assert(exactArray(scenario.groundTruth.map((comparison: Json) => comparison.targetId), expectedIds), `${name}/${scenario.scenarioId}: Ground Truth comparisons must exactly match manifest targetIds.`);

    for (const comparison of scenario.groundTruth as Json[]) {
      const fixed = targets.get(comparison.targetId);
      assert(fixed && fixed.payload === comparison.expectedPayload && fixed.format === comparison.expectedFormat, `${name}/${scenario.scenarioId}: Ground Truth was altered.`);
      const actualMatch = comparison.observedPayload === comparison.expectedPayload && comparison.observedFormat === comparison.expectedFormat;
      assert(comparison.matched === actualMatch, `${name}/${scenario.scenarioId}: result consistency failed.`);
      assert(comparison.result === "passed" ? comparison.matched === true : comparison.matched === false, `${name}/${scenario.scenarioId}: comparison result/matched disagree.`);
    }
    if (scenario.status === "passed") assert(scenario.groundTruth.every((comparison: Json) => comparison.matched === true), `${name}/${scenario.scenarioId}: PASS requires every fixed target to match.`);
    if (scenario.scenarioId === "P2") assert(scenario.groundTruth.length === 5, `${name}/P2: five required formats must be retained.`);
    if (scenario.scenarioId === "P1" && scenario.status === "passed") assert(Number.isFinite(scenario.ttfdMs) && Number.isFinite(scenario.ttfcMs), `${name}/P1: PASS requires measured TTFD and TTFC.`);
    if (scenario.scenarioId === "P3") {
      assert(exactArray(scenario.distanceObservations?.map((entry: Json) => entry.label), ["near", "medium", "far"]), `${name}/P3: near/medium/far observations are required in order.`);
      if (scenario.status === "passed") assert(scenario.distanceObservations.every((entry: Json) => entry.result === "passed"), `${name}/P3: PASS requires all distance observations to pass.`);
    }
    if (scenario.scenarioId === "P4") {
      assert(exactArray(scenario.angleObservations?.map((entry: Json) => entry.label), ["0-degrees", "approximately-20-degrees", "approximately-40-degrees"]), `${name}/P4: 0/~20/~40 degree observations are required in order.`);
      const angles = scenario.angleObservations.map((entry: Json) => entry.approximateAngleDegrees);
      assert(angles[0] <= 5 && angles[1] >= 10 && angles[1] <= 30 && angles[2] >= 30 && angles[2] <= 50, `${name}/P4: tester-estimated angles do not represent 0/~20/~40 degrees.`);
      if (scenario.status === "passed") assert(scenario.angleObservations.every((entry: Json) => entry.result === "passed"), `${name}/P4: PASS requires all angle observations to pass.`);
    }
    if (scenario.scenarioId === "P5") {
      assert(exactArray(scenario.lightingObservations?.map((entry: Json) => entry.condition), ["normal-room", "dim-room", "dark-room-with-screen-illumination"]), `${name}/P5: required light conditions are incomplete.`);
      if (scenario.status === "passed") assert(scenario.lightingObservations.every((entry: Json) => entry.result === "passed"), `${name}/P5: PASS requires all light observations to pass.`);
    }
    if (scenario.scenarioId === "P6") {
      assert(scenario.admittedFrames <= scenario.capturedFrames && scenario.droppedFrames <= scenario.capturedFrames && scenario.qualityRejectedFrames <= scenario.capturedFrames, `${name}/P6: frame counts are inconsistent.`);
      if (scenario.status === "passed") assert(scenario.capturedFrames > 0 && scenario.admittedFrames > 0 && Number.isFinite(scenario.ttfcMs), `${name}/P6: PASS requires real captured/admitted frames and measured TTFC.`);
    }
    if (scenario.scenarioId === "P7" && scenario.status === "passed") assert(scenario.groundTruth.every((comparison: Json) => comparison.result === "passed"), `${name}/P7: PASS requires the real glare target to pass.`);
    if (scenario.scenarioId === "P8" && scenario.status === "passed") assert(scenario.distance > 0 && scenario.cameraResolution.width > 0 && scenario.cameraResolution.height > 0 && scenario.groundTruth.every((comparison: Json) => comparison.result === "passed"), `${name}/P8: PASS requires measured distance, camera resolution, and qr-small success.`);
    if (scenario.scenarioId === "P9") {
      assert(scenario.expectedCount === expectedScenario.expectedPhysicalTargetCount, `${name}/P9: expected count does not match manifest.`);
      assert(scenario.decodedCount <= scenario.expectedCount, `${name}/P9: decoded unique physical target count exceeds expected count.`);
      const expectedFormats = new Set(expectedIds.map((id) => targets.get(id)!.format));
      assert(scenario.formats.every((format: string) => expectedFormats.has(format)), `${name}/P9: formats contain a value outside fixed Ground Truth.`);
      if (scenario.status === "passed") assert(Number.isInteger(scenario.sameFrameId) && scenario.decodedCount === scenario.expectedCount && scenario.payloadCompleteness === true && sameSet(scenario.formats, [...expectedFormats]), `${name}/P9: PASS requires a same-frame ID, count/formats, and payload completeness.`);
    }
    if (scenario.scenarioId === "P10") {
      const expectedPayloads = scenario.groundTruth.map((comparison: Json) => comparison.expectedPayload);
      assert(new Set(expectedPayloads).size === 1 && scenario.payloadIdentical === true, `${name}/P10: fixed payloads must be identical.`);
      const instances = scenario.groundTruth.map((comparison: Json) => comparison.physicalInstanceId);
      if (scenario.status === "passed") assert(instances.every(Boolean) && new Set(instances).size === expectedIds.length, `${name}/P10: PASS requires distinct physicalInstanceId values.`);
    }
    if (scenario.scenarioId === "P11") {
      const bindings = scenario.trackingBindings as Json[];
      const byLabel = new Map<string, Json[]>();
      for (const binding of bindings) {
        assert(expectedIds.includes(binding.label), `${name}/P11: tracking binding label is outside fixed Ground Truth.`);
        const observed = milliseconds(binding.observedAt, `${name}/P11.trackingBindings.observedAt`);
        assert(observed >= scenarioStarted && observed <= scenarioEnded, `${name}/P11: tracking binding lies outside the scenario window.`);
        byLabel.set(binding.label, [...(byLabel.get(binding.label) ?? []), binding]);
      }
      const audited = [...byLabel.values()].filter((entries) => entries.length >= 2);
      const calculatedSwitches = audited.reduce((sum, entries) => sum + Math.max(0, new Set(entries.map((entry) => entry.runtimePhysicalInstanceId)).size - 1), 0);
      assert(scenario.auditedPhysicalTargetCount === audited.length && audited.length >= 2, `${name}/P11: at least two fixed physical targets require before/after runtime bindings.`);
      assert(scenario.identitySwitchCount === calculatedSwitches, `${name}/P11: identitySwitchCount does not match labelled physical bindings.`);
      assert(scenario.createdTrackCount >= scenario.auditedPhysicalTargetCount, `${name}/P11: created track count is inconsistent with audited targets.`);
      if (scenario.status === "passed") assert(scenario.identitySwitchCount === 0 && scenario.fragmentationCount === 0 && scenario.falseTrackCount === 0, `${name}/P11: PASS requires zero identity switches, fragmentation, and false tracks.`);
    }
    if (scenario.scenarioId === "P12") {
      assert(scenario.expectedCount === expectedScenario.expectedPhysicalTargetCount, `${name}/P12: expected count does not match manifest.`);
      assert(scenario.confirmedPhysicalInstances <= scenario.expectedCount, `${name}/P12: confirmed physical instances exceed expected count.`);
      if (scenario.completion === true && scenario.confirmedPhysicalInstances !== scenario.expectedCount) assert(scenario.falseCompletion === true, `${name}/P12: premature completion must be reported as falseCompletion.`);
      if (scenario.status === "passed") assert(scenario.completion === true && scenario.falseCompletion === false && scenario.confirmedPhysicalInstances === scenario.expectedCount, `${name}/P12: PASS batch completion is inconsistent.`);
    }
    if (scenario.scenarioId === "N1") {
      assert(sameSet(scenario.negativeSubjects, expectedScenario.negativeSubjects), `${name}/N1: all fixed negative subjects are required.`);
      assert(scenario.durationMs > 0 && scenario.confirmedScanCount === 0, `${name}/N1: a sustained duration and zero confirmed scans are required.`);
    }
    if (scenario.status === "failed") {
      const failedComparison = scenario.groundTruth.some((comparison: Json) => ["failed", "unsupported"].includes(comparison.result));
      const failedObservation = scenario.scenarioId === "P3"
        ? scenario.distanceObservations.some((entry: Json) => entry.result !== "passed")
        : scenario.scenarioId === "P4"
          ? scenario.angleObservations.some((entry: Json) => entry.result !== "passed")
          : scenario.scenarioId === "P5"
            ? scenario.lightingObservations.some((entry: Json) => entry.result !== "passed")
            : false;
      const failedPhysicalIdentity = scenario.scenarioId === "P10"
        && (!scenario.groundTruth.every((comparison: Json) => Boolean(comparison.physicalInstanceId))
          || new Set(scenario.groundTruth.map((comparison: Json) => comparison.physicalInstanceId)).size !== expectedIds.length);
      const failedTracking = scenario.scenarioId === "P11"
        && (scenario.identitySwitchCount > 0 || scenario.fragmentationCount > 0 || scenario.falseTrackCount > 0);
      const failedBatch = scenario.scenarioId === "P12"
        && (scenario.completion !== true || scenario.falseCompletion === true || scenario.confirmedPhysicalInstances !== scenario.expectedCount);
      assert(failedComparison || failedObservation || failedPhysicalIdentity || failedTracking || failedBatch, `${name}/${scenario.scenarioId}: FAILED must retain an explicit scenario-level failure.`);
    }
  }

  if (evidence.longRun?.qualifyingPhysicalSoak === true) {
    assert(isPhysicalMobile(evidence), `${name}: qualifyingPhysicalSoak must use physical-mobile hardware; remote and desktop runs cannot satisfy the Foundation soak.`);
    const longRun = evidence.longRun;
    const started = milliseconds(longRun.startedAt, `${name}/longRun.startedAt`);
    const ended = milliseconds(longRun.endedAt, `${name}/longRun.endedAt`);
    assert(ended > started, `${name}: longRun endedAt must be after startedAt.`);
    assert(ended - started === longRun.durationMs && longRun.durationMs >= 1_800_000, `${name}: longRun start/end/duration are inconsistent or under 30 minutes.`);
    assert(started >= milliseconds(evidence.session.startedAt, `${name}/session.startedAt`) && ended <= milliseconds(evidence.session.endedAt, `${name}/session.endedAt`), `${name}: longRun must be contained within its evidence session.`);
    const activityTypes = new Set(longRun.activities.map((entry: Json) => entry.type));
    assert(longRun.cameraActive === true && ["basic", "multi-code", "moving", "negative"].every((type) => activityTypes.has(type)), `${name}: qualifying soak requires active camera plus basic/multi-code/moving/negative activity.`);
    const activityTimes: number[] = [];
    for (const [index, activity] of (longRun.activities as Json[]).entries()) {
      const observed = milliseconds(activity.observedAt, `${name}/longRun.activity.${activity.type}.observedAt`);
      assert(observed >= started && observed <= ended, `${name}: longRun activity '${activity.type}' lies outside the soak.`);
      assert(activity.cameraActive === true, `${name}: every soak activity marker must observe an active camera.`);
      const observation = activity.runtimeObservation as Json;
      assert(observation && typeof observation === "object", `${name}: soak activity '${activity.type}' is missing runtime observation evidence.`);
      if (index > 0) {
        const previous = longRun.activities[index - 1] as Json;
        assert(observed > activityTimes[index - 1] && observed - activityTimes[index - 1] <= 600_000, `${name}: soak activity markers must increase with no gap over 10 minutes.`);
        assert(activity.capturedFrames > previous.capturedFrames && activity.admittedFrames > previous.admittedFrames && activity.decodeAttempts > previous.decodeAttempts && activity.confirmedScans >= previous.confirmedScans, `${name}: every soak activity interval must show captured/admitted/decode progress and a monotonic confirmation counter.`);
      }
      activityTimes.push(observed);
    }
    assert(activityTimes[0] === started && ended - activityTimes.at(-1)! <= 600_000, `${name}: soak markers must cover the run from exact start through its final 10 minutes.`);
    const midpoint = started + longRun.durationMs / 2;
    for (const type of ["basic", "multi-code", "moving", "negative"]) {
      assert(longRun.activities.some((entry: Json) => entry.type === type && milliseconds(entry.observedAt, `${name}/longRun.activity.${type}.observedAt`) < midpoint), `${name}: soak activity '${type}' is missing from the first half.`);
      assert(longRun.activities.some((entry: Json) => entry.type === type && milliseconds(entry.observedAt, `${name}/longRun.activity.${type}.observedAt`) >= midpoint), `${name}: soak activity '${type}' is missing from the second half.`);
    }
    const basicTarget = targets.get("qr-basic")!;
    const fixedMultiIds = (protocol.get("P9")!.targetIds ?? []) as string[];
    const fixedMultiTargets = fixedMultiIds.map((targetId) => targets.get(targetId)!);
    for (const [index, activity] of (longRun.activities as Json[]).entries()) {
      const intervalStart = activityTimes[index];
      const intervalEnd = activityIntervalEnd(longRun.activities as Json[], index, ended);
      const observation = activity.runtimeObservation as Json;
      if (activity.type === "basic") {
        assert(observation.kind === "basic-runtime-confirmation" && targetMatches(observation.target, basicTarget), `${name}: basic soak activity requires a runtime-confirmed qr-basic observation.`);
        const confirmedAt = milliseconds(observation.confirmedAt, `${name}/longRun.basic.confirmedAt`);
        assert(confirmedAt >= intervalStart && confirmedAt < intervalEnd && Number.isInteger(observation.frameId) && observation.physicalInstanceId, `${name}: basic runtime confirmation must fall inside its activity interval and retain frame/physical identity.`);
      } else if (activity.type === "multi-code") {
        assert(observation.kind === "multi-code-same-frame" && Number.isInteger(observation.frameId), `${name}: multi-code soak activity requires one runtime observation-set frame.`);
        const observedAt = milliseconds(observation.observedAt, `${name}/longRun.multi-code.observedAt`);
        assert(observedAt >= intervalStart && observedAt < intervalEnd, `${name}: multi-code runtime frame lies outside its activity interval.`);
        assert(exactArray(observation.expectedTargetIds, fixedMultiIds), `${name}: multi-code expected target set must preserve the fixed P9 manifest order.`);
        assert(Array.isArray(observation.targets) && observation.targets.length === fixedMultiTargets.length && new Set(observation.targets.map((entry: Json) => entry.targetId)).size === fixedMultiTargets.length, `${name}: multi-code runtime frame must contain exactly four unique fixed targets.`);
        for (const expected of fixedMultiTargets) assert(observation.targets.some((entry: Json) => targetMatches(entry, expected)), `${name}: multi-code runtime frame is missing fixed target '${expected.targetId}'.`);
      } else if (activity.type === "moving") {
        assert(observation.kind === "moving-track-displacement", `${name}: moving soak activity requires runtime tracking displacement evidence.`);
        const expected = targets.get(observation.targetId);
        assert(expected && targetMatches(observation, expected) && fixedMultiIds.includes(observation.targetId), `${name}: moving evidence must bind a fixed P9 target payload/format.`);
        const startObserved = milliseconds(observation.startObservedAt, `${name}/longRun.moving.startObservedAt`);
        const endObserved = milliseconds(observation.endObservedAt, `${name}/longRun.moving.endObservedAt`);
        assert(startObserved >= intervalStart && endObserved < intervalEnd && endObserved > startObserved, `${name}: moving tracking evidence must span time inside its activity interval.`);
        assert(observation.endFrameId > observation.startFrameId && observation.observedFrameCount >= 2 && observation.physicalInstanceId, `${name}: moving tracking evidence requires one stable physical identity across multiple increasing frames.`);
        const dx = observation.endCenter.x - observation.startCenter.x;
        const dy = observation.endCenter.y - observation.startCenter.y;
        const calculatedDisplacement = Math.hypot(dx, dy);
        assert(calculatedDisplacement > 0 && Math.abs(calculatedDisplacement - observation.displacementPixels) <= 0.01, `${name}: moving displacement must match runtime track geometry.`);
        assert(observation.identitySwitchCount === 0 && observation.fragmentationCount === 0 && observation.falseTrackCount === 0, `${name}: qualifying moving evidence requires zero tracking identity failures.`);
      } else {
        assert(observation.kind === "negative-runtime-interval", `${name}: negative soak activity requires a measured runtime interval.`);
        const negativeStart = milliseconds(observation.startedAt, `${name}/longRun.negative.startedAt`);
        const negativeEnd = milliseconds(observation.endedAt, `${name}/longRun.negative.endedAt`);
        assert(negativeStart === intervalStart && negativeEnd === intervalEnd && negativeEnd > negativeStart, `${name}: negative runtime interval must exactly match the marker interval.`);
        const nextCounters = index + 1 < longRun.activities.length ? longRun.activities[index + 1] as Json : longRun.livenessSamples.at(-1) as Json;
        assert(observation.capturedFrameDelta === nextCounters.capturedFrames - activity.capturedFrames && observation.admittedFrameDelta === nextCounters.admittedFrames - activity.admittedFrames && observation.decodeAttemptDelta === nextCounters.decodeAttempts - activity.decodeAttempts, `${name}: negative interval counters must match runtime boundary deltas.`);
        assert(observation.confirmedScanDelta === nextCounters.confirmedScans - activity.confirmedScans, `${name}: negative confirmed-scan delta must match runtime boundary counters.`);
        assert(observation.capturedFrameDelta > 0 && observation.admittedFrameDelta > 0 && observation.decodeAttemptDelta > 0 && observation.confirmedScanDelta === 0, `${name}: negative interval requires live frame/decode progress and zero confirmed scans.`);
      }
    }
    const livenessTimes: number[] = [];
    for (const [index, sample] of (longRun.livenessSamples as Json[]).entries()) {
      const observed = milliseconds(sample.observedAt, `${name}/longRun.livenessSamples[${index}].observedAt`);
      assert(observed >= started && observed <= ended && sample.cameraActive === true && sample.scannerState === "scanning", `${name}: soak liveness sample must show an active scanning camera inside the soak.`);
      if (index > 0) {
        const previous = longRun.livenessSamples[index - 1] as Json;
        assert(observed > livenessTimes[index - 1] && observed - livenessTimes[index - 1] <= 10_000, `${name}: soak liveness samples must increase with no gap over 10 seconds.`);
        assert(sample.capturedFrames >= previous.capturedFrames && sample.admittedFrames >= previous.admittedFrames && sample.decodeAttempts >= previous.decodeAttempts && sample.confirmedScans >= previous.confirmedScans, `${name}: soak liveness captured/admitted/decode/confirmation counters must be monotonic.`);
      }
      livenessTimes.push(observed);
    }
    assert(livenessTimes[0] === started && livenessTimes.at(-1) === ended && longRun.endedCameraActive === true, `${name}: soak liveness must cover exact start/end with the camera active at completion.`);
    const firstLiveness = longRun.livenessSamples[0] as Json;
    const finalLiveness = longRun.livenessSamples.at(-1) as Json;
    const firstActivity = longRun.activities[0] as Json;
    const finalActivity = longRun.activities.at(-1) as Json;
    assert(firstActivity.capturedFrames === firstLiveness.capturedFrames && firstActivity.admittedFrames === firstLiveness.admittedFrames && firstActivity.decodeAttempts === firstLiveness.decodeAttempts && firstActivity.confirmedScans === firstLiveness.confirmedScans, `${name}: first soak activity counters must match the exact-start liveness sample.`);
    assert(finalLiveness.capturedFrames > finalActivity.capturedFrames && finalLiveness.admittedFrames > finalActivity.admittedFrames && finalLiveness.decodeAttempts > finalActivity.decodeAttempts, `${name}: the final soak activity interval must show captured/admitted/decode progress through soak end.`);
    assert(longRun.capturedFrames === finalLiveness.capturedFrames - firstLiveness.capturedFrames && longRun.admittedFrames === finalLiveness.admittedFrames - firstLiveness.admittedFrames && longRun.decodeAttempts === finalLiveness.decodeAttempts - firstLiveness.decodeAttempts, `${name}: soak totals must equal exact start/end liveness counter deltas.`);
    assert(longRun.admittedFrames <= longRun.capturedFrames && longRun.droppedFrames <= longRun.capturedFrames, `${name}: longRun frame counts are inconsistent.`);
    assert(longRun.capturedFrames > 0 && longRun.admittedFrames > 0 && longRun.decodeAttempts > 0, `${name}: qualifying soak requires real captured/admitted frames and decode attempts.`);
    assert(longRun.falseConfirmedScans === 0 && longRun.stalePublicEvents === 0, `${name}: longRun false/stale event gate failed.`);
    assert(Object.values(longRun.finalResources).every((value) => value === 0), `${name}: longRun final controlled resources must all be zero.`);
    assert(exactArray(longRun.windows.map((entry: Json) => entry.label), ["first-5-min", "middle-5-min", "last-5-min"]), `${name}: exact first/middle/last five-minute windows are required.`);
    for (const window of longRun.windows as Json[]) {
      const windowStart = milliseconds(window.startedAt, `${name}/${window.label}.startedAt`);
      const windowEnd = milliseconds(window.endedAt, `${name}/${window.label}.endedAt`);
      assert(windowEnd - windowStart === window.durationMs && window.durationMs === 300_000, `${name}/${window.label}: window must span exactly five minutes.`);
      assert(windowStart >= started && windowEnd <= ended, `${name}/${window.label}: window lies outside the soak.`);
    }
    const [firstWindow, middleWindow, lastWindow] = longRun.windows as Json[];
    assert(milliseconds(firstWindow.startedAt, `${name}/first-5-min.startedAt`) === started, `${name}: first window must begin with the soak.`);
    assert(milliseconds(lastWindow.endedAt, `${name}/last-5-min.endedAt`) === ended, `${name}: last window must end with the soak.`);
    const expectedMiddleStart = started + (longRun.durationMs - 300_000) / 2;
    assert(Math.abs(milliseconds(middleWindow.startedAt, `${name}/middle-5-min.startedAt`) - expectedMiddleStart) <= 1, `${name}: middle window is not centered in the soak.`);
  }

  assert(evidence.networkIsolation.barcodePixelsUploaded === false && evidence.networkIsolation.barcodePayloadUploaded === false, `${name}: local-only privacy contract failed.`);
}

for (const [type, count] of Object.entries(counts)) {
  const key = `${type.replace(/-([a-z])/g, (_: string, letter: string) => letter.toUpperCase())}SessionCount`;
  assert(status[key] === count, `status.json ${key}=${status[key]} but verified count=${count}.`);
}

const historicalPhysicalMobileSessions = physicalSessions.filter(isPhysicalMobile);
const bySource = new Map<string, Json[]>();
for (const evidence of historicalPhysicalMobileSessions) {
  if (!evidenceOnlyAfterSource(evidence.sourceCommit)) continue;
  const key = `${evidence.sourceCommit}:${evidence.sourceTree}:${evidence.sdkVersion}`;
  bySource.set(key, [...(bySource.get(key) ?? []), evidence]);
}
const cohortState = (entries: Json[]) => ({
  ios: entries.some(isIosSafari),
  android: entries.some(isAndroidChrome),
  scenarios: entries.filter((entry) => isIosSafari(entry) || isAndroidChrome(entry)).every((entry) => entry.scenarios.every((scenario: Json) => ["passed", "failed"].includes(scenario.status) && scenario.falseConfirmedScans === 0)),
  soak: entries.some((entry) => entry.longRun?.qualifyingPhysicalSoak === true),
  permission: entries.some((entry) => permissionLifecyclePassed(entry.permissionLifecycle)),
  cameraSwitch: entries.some((entry) => entry.cameraSwitch.tested === true && entry.cameraSwitch.result === "passed" && entry.cameraSwitch.staleResultCount === 0),
});
const exactSourceCohorts = [...bySource.values()].map(cohortState);
const currentExactSourceSessions = [...bySource.values()].flat();
const currentExactSourceDeviceKeys = new Set(currentExactSourceSessions.map((entry) => [entry.device.manufacturer, entry.device.declaredModel, entry.device.operatingSystem, entry.device.operatingSystemVersion].map(normalized).join("|")));
const expectedIos = currentExactSourceSessions.filter(isIosSafari).length;
const expectedAndroid = currentExactSourceSessions.filter(isAndroidChrome).length;
const expectedPhysicalScenarios = currentExactSourceSessions.reduce((sum, entry) => sum + entry.scenarios.filter((scenario: Json) => ["passed", "failed"].includes(scenario.status)).length, 0);
const expectedLongRuns = currentExactSourceSessions.filter((entry) => entry.longRun?.qualifyingPhysicalSoak === true).length;
for (const [key, expected] of [
  ["physicalMobileDeviceCount", currentExactSourceDeviceKeys.size],
  ["iosSafariSessionCount", expectedIos],
  ["androidChromeSessionCount", expectedAndroid],
  ["physicalScenarioCount", expectedPhysicalScenarios],
  ["physicalLongSessionCount", expectedLongRuns],
] as const) {
  assert(status[key] === expected, `status.json ${key}=${status[key]} but admissible exact-source cohort count=${expected}.`);
}
const minimumGatePassed = exactSourceCohorts.some((entry) => Object.values(entry).every(Boolean));
const expectedValidationStatus = minimumGatePassed
  ? "PHYSICAL_DEVICE_VALIDATION_STARTED_AND_MINIMUM_GATE_PASSED"
  : "PHYSICAL_DEVICE_VALIDATION_DEFERRED_TO_RC";
assert(status.physicalValidationStatus === expectedValidationStatus, `status.json physicalValidationStatus must be ${expectedValidationStatus}.`);
assert(Array.isArray(status.requiredGaps) && status.requiredGaps.length > 0, "A partial Device Matrix requires documented gaps.");
const present = (key: keyof ReturnType<typeof cohortState>) => exactSourceCohorts.some((entry) => entry[key]);
const expectedGaps = [
  ...(present("ios") ? [] : [FOUNDATION_GAPS[0]]),
  ...(present("android") ? [] : [FOUNDATION_GAPS[1]]),
  ...(present("soak") ? [] : [FOUNDATION_GAPS[2]]),
  ...(present("permission") ? [] : [FOUNDATION_PERMISSION_GAP]),
  ...(present("cameraSwitch") ? [] : [FOUNDATION_CAMERA_SWITCH_GAP]),
  ...FULL_MATRIX_GAPS,
];
assert(exactArray(status.requiredGaps, expectedGaps), `status.json requiredGaps must exactly match verifier-derived pending work: ${JSON.stringify(expectedGaps)}.`);
assert(status.matrixStatus === "DEVICE_MATRIX_PARTIAL", "Beta 4 foundation evidence must not claim the full Device Matrix is complete.");
assert(status.fullDeviceMatrixStatus === "FULL_DEVICE_MATRIX_PENDING", "Issue #13 full Device Matrix must remain pending.");

console.log(`Device evidence verification passed: ${sessionFiles.length} historical sessions (${JSON.stringify(counts)}); admissible exact-source cohorts: ${currentExactSourceDeviceKeys.size} physical mobile devices, ${expectedIos} iOS Safari, ${expectedAndroid} Android Chrome, ${expectedPhysicalScenarios} physical scenarios, ${expectedLongRuns} qualifying physical long sessions; status=${expectedValidationStatus}.`);
