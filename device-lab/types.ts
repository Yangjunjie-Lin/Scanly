export type EvidenceType = "simulated" | "desktop-camera" | "physical-mobile" | "remote-physical-device";
export type EvidenceFieldSource =
  | "declared-by-tester"
  | "browser-reported"
  | "camera-api-reported"
  | "tester-measured"
  | "tester-estimated"
  | "tester-observed"
  | "tester-recorded"
  | "OS-reported"
  | "external-measured"
  | "provider-reported"
  | "unavailable";
export type ScenarioStatus = "passed" | "failed" | "not-tested" | "unavailable";
export type ObservationResult = "passed" | "failed" | "unsupported";
export type OperationResult = "passed" | "failed" | "unsupported" | "unavailable";
export type MeasuredMetric = number | "unavailable";

export type PermissionLifecyclePhase = "initial-prompt" | "deny" | "retry" | "grant" | "revoke";
export type PermissionScannerState = "idle" | "starting" | "scanning" | "paused" | "stopping" | "stopped" | "failed";

export interface PermissionLifecycleStep {
  phase: PermissionLifecyclePhase;
  observedAt: string;
  outcome: "observed" | "passed" | "failed" | "unavailable";
  scannerState: PermissionScannerState;
  errorCode?: string;
  recoverableState: boolean;
  unhandledRejectionCount: number;
}

export interface DeviceScenarioGroundTruthComparison {
  targetId: string;
  expectedPayload: string;
  expectedFormat: string;
  observedPayload?: string;
  observedFormat?: string;
  physicalInstanceId?: string;
  result: ObservationResult;
  matched: boolean;
}

export interface DeviceScenarioResult {
  scenarioId: string;
  status: ScenarioStatus;
  startedAt: string;
  endedAt: string;
  targetIds: string[];
  groundTruth: DeviceScenarioGroundTruthComparison[];
  falseConfirmedScans: 0;
  cameraStartupMs?: MeasuredMetric;
  firstUsableFrameMs?: MeasuredMetric;
  ttfdMs?: MeasuredMetric;
  ttfcMs?: MeasuredMetric;
  attempts?: MeasuredMetric;
  distanceObservations?: Array<{
    label: "near" | "medium" | "far";
    distance: number;
    unit: "cm" | "m" | "in";
    source: "tester-measured" | "tester-estimated";
    result: ObservationResult;
  }>;
  angleObservations?: Array<{
    label: "0-degrees" | "approximately-20-degrees" | "approximately-40-degrees";
    approximateAngleDegrees: number;
    source: "tester-estimated";
    result: ObservationResult;
  }>;
  lightingObservations?: Array<{
    condition: "normal-room" | "dim-room" | "dark-room-with-screen-illumination";
    result: ObservationResult;
    measuredLux?: number;
    luxSource?: "external-measured";
  }>;
  capturedFrames?: number;
  admittedFrames?: number;
  droppedFrames?: number;
  qualityRejectedFrames?: number;
  glareMedium?: "screen-barcode" | "reflective-surface";
  distance?: number;
  distanceUnit?: "cm" | "m" | "in";
  distanceSource?: "tester-measured" | "tester-estimated";
  cameraResolution?: { width: number; height: number };
  zoom?: MeasuredMetric;
  expectedCount?: number;
  decodedCount?: number;
  sameFrameId?: number | "unavailable";
  formats?: string[];
  payloadCompleteness?: boolean;
  payloadIdentical?: boolean;
  identitySwitchCount?: number;
  fragmentationCount?: number;
  falseTrackCount?: number;
  trackingBindings?: Array<{ label: string; runtimePhysicalInstanceId: string; observedAt: string }>;
  auditedPhysicalTargetCount?: number;
  createdTrackCount?: number;
  confirmedPhysicalInstances?: number;
  completion?: boolean;
  falseCompletion?: boolean;
  negativeSubjects?: string[];
  durationMs: number;
  confirmedScanCount?: number;
  notes?: string;
}

export interface SoakObservedTarget {
  targetId: string;
  payload: string;
  format: string;
}

export type SoakRuntimeObservation =
  | {
    kind: "basic-runtime-confirmation";
    frameId: number;
    target: SoakObservedTarget;
    confirmedAt: string;
    physicalInstanceId: string;
  }
  | {
    kind: "multi-code-same-frame";
    frameId: number;
    observedAt: string;
    expectedTargetIds: string[];
    targets: SoakObservedTarget[];
  }
  | {
    kind: "moving-track-displacement";
    targetId: string;
    payload: string;
    format: string;
    physicalInstanceId: string;
    startFrameId: number;
    endFrameId: number;
    startObservedAt: string;
    endObservedAt: string;
    startCenter: { x: number; y: number };
    endCenter: { x: number; y: number };
    displacementPixels: number;
    observedFrameCount: number;
    identitySwitchCount: 0;
    fragmentationCount: 0;
    falseTrackCount: 0;
  }
  | {
    kind: "negative-runtime-interval";
    startedAt: string;
    endedAt: string;
    capturedFrameDelta: number;
    admittedFrameDelta: number;
    decodeAttemptDelta: number;
    confirmedScanDelta: 0;
  };

export interface SoakActivityEvidence {
  type: "basic" | "multi-code" | "moving" | "negative";
  observedAt: string;
  cameraActive: true;
  capturedFrames: number;
  admittedFrames: number;
  decodeAttempts: number;
  confirmedScans: number;
  runtimeObservation: SoakRuntimeObservation;
}

interface PhysicalCameraEvidenceBase {
  schemaVersion: "beta4-physical-device-evidence-1";
  sourceCommit: string;
  sourceTree: string;
  sdkVersion: "2.0.0-beta.4";
  evidenceId: string;
  evidenceType: EvidenceType;
  deployment?: { url: string; deploymentId: string; gitCommit: string };
  remoteHardware?: { provider: string; providerSessionId: string; providerDeviceId: string; realHardware: true; attestationUrl: string; attestationSha256: string };
  session: {
    sessionId: string;
    startedAt: string;
    endedAt: string;
    testerId: string;
    hardwareAccess: "simulated" | "desktop-local" | "physical-local" | "remote-device-farm";
  };
  device: {
    declaredModel?: string;
    manufacturer?: string;
    operatingSystem: string;
    operatingSystemVersion?: string;
  };
  browser: { name: string; version: string; userAgent: string };
  camera: {
    label?: string;
    settings: Record<string, unknown>;
    capabilities: Record<string, unknown>;
    constraints: Record<string, unknown>;
  };
  capabilityEvidence: {
    torch: { reported: boolean; on: OperationResult; off: OperationResult };
    zoom: {
      reported: boolean;
      minimum: MeasuredMetric;
      maximum: MeasuredMetric;
      current: MeasuredMetric;
      manualZoom: OperationResult;
      autoZoom: OperationResult;
      manualOverride: OperationResult;
      cooldown: OperationResult;
    };
    focus: { reported: boolean; result: OperationResult };
  };
  permissionLifecycle: {
    status: "passed" | "failed" | "not-tested" | "unavailable";
    initialPrompt: "observed" | "failed" | "not-tested" | "unavailable";
    grant: "passed" | "failed" | "not-tested" | "unavailable";
    deny: "passed" | "failed" | "not-tested" | "unavailable";
    retry: "passed" | "failed" | "not-tested" | "unavailable";
    revoke: "passed" | "failed" | "unavailable";
    typedError: boolean | "unavailable";
    noUnhandledRejection: boolean | "unavailable";
    recoverableState: boolean | "unavailable";
    unhandledRejectionCount: number;
    steps: PermissionLifecycleStep[];
  };
  cameraSwitch: {
    tested: boolean;
    result: OperationResult;
    sequence: Array<"rear" | "front">;
    oldTrackStopped: boolean | "unavailable";
    newCameraActive: boolean | "unavailable";
    generationInvalidated: boolean | "unavailable";
    staleResultCount: number;
    browserReportedMetadataComplete?: boolean;
    distinctRearAndFrontDevices?: boolean;
    deviceIds?: string[];
  };
  orientation: {
    tested: true;
    result: "passed" | "failed";
    sequence: ["portrait", "landscape", "portrait"];
    decodedGeometryCorrect: boolean;
    trackingGeometryCorrect: boolean;
    overlayGeometryCorrect: boolean;
    noMirrorOrQuarterTurnOffset: boolean;
    frameDimensions: Array<{ orientation: "portrait" | "landscape"; width: number; height: number }>;
  };
  backgroundForeground: {
    tested: true;
    waitDurationMs: number;
    result: "recovered" | "explicit-restart-required" | "failed";
    observations: Array<{
      phase: "foreground-before" | "background" | "foreground-after";
      mediaStreamTrackReadyState: string;
      scannerSessionState: string;
      workerState: string;
    }>;
    recoveryTimeMs: MeasuredMetric;
    staleResultCount: number;
    silentDeadState: false;
  };
  scenarios: DeviceScenarioResult[];
  longRun?: {
    qualifyingPhysicalSoak: boolean;
    startedAt?: string;
    endedAt?: string;
    durationMs: number;
    cameraActive?: boolean;
    endedCameraActive?: boolean;
    activities?: SoakActivityEvidence[];
    livenessSamples?: Array<{ observedAt: string; cameraActive: true; scannerState: "scanning"; capturedFrames: number; admittedFrames: number; decodeAttempts: number; confirmedScans: number }>;
    capturedFrames?: number;
    admittedFrames?: number;
    droppedFrames?: number;
    decodeAttempts?: number;
    confirmedScans?: number;
    falseConfirmedScans?: 0;
    suppressedRepeats?: number;
    cameraTrackEndings?: number;
    scannerRestarts?: number;
    workerRestarts?: number;
    errors?: number;
    stalePublicEvents?: 0;
    finalResources?: {
      activeDecode: 0;
      pendingFrames: 0;
      activeTasks: 0;
      liveNativeResults: 0;
      wasmInputAllocations: 0;
      controlledMemory: 0;
    };
    windows?: Array<{
      label: "first-5-min" | "middle-5-min" | "last-5-min";
      startedAt: string;
      endedAt: string;
      durationMs: 300000;
      ttfdMs: MeasuredMetric;
      ttfcMs: MeasuredMetric;
      decodeP50Ms: number;
      decodeP95Ms: number;
      effectiveDecodeFps: number;
      frameDropRate: number;
    }>;
  };
  thermalObservation: {
    source: "tester-observed" | "OS-reported" | "external-measured" | "unavailable";
    deviceBecameWarm: boolean | "unavailable";
    visibleThrottling: boolean | "unavailable";
    performanceDegraded: boolean | "unavailable";
    notes?: string;
  };
  batteryObservation: {
    source: "tester-recorded" | "unavailable";
    startPercent?: number;
    endPercent?: number;
    durationMs?: number;
    screenBrightnessSetting?: string;
    chargingState?: "charging" | "not-charging" | "unknown";
  };
  networkIsolation: {
    tested: boolean;
    scannerContinuedAfterNetworkDisabled: boolean | "not-tested";
    payloadRemainedLocal: boolean;
    cloudDecodeRequests: number;
    barcodePixelsUploaded: false;
    barcodePayloadUploaded: false;
  };
  fieldSources: Record<string, EvidenceFieldSource>;
  sensitiveDataReviewed: true;
  rightsReviewed: true;
  repositoryDirty: false;
}

export type PhysicalDeviceEvidence = PhysicalCameraEvidenceBase & (
  | {
    evidenceType: "physical-mobile";
    session: PhysicalCameraEvidenceBase["session"] & { hardwareAccess: "physical-local" };
  }
  | {
    evidenceType: "remote-physical-device";
    session: PhysicalCameraEvidenceBase["session"] & { hardwareAccess: "remote-device-farm" };
  }
  | {
    evidenceType: "desktop-camera";
    session: PhysicalCameraEvidenceBase["session"] & { hardwareAccess: "desktop-local" };
  }
  | {
    evidenceType: "simulated";
    session: PhysicalCameraEvidenceBase["session"] & { hardwareAccess: "simulated" };
  }
);
