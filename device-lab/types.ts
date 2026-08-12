export type EvidenceType = "simulated" | "desktop-camera" | "physical-mobile" | "remote-physical-device";
export type EvidenceFieldSource =
  | "declared-by-tester"
  | "browser-reported"
  | "camera-api-reported"
  | "tester-observed"
  | "OS-reported"
  | "external-measured"
  | "unavailable";

export interface DeviceScenarioGroundTruthComparison {
  targetId: string;
  expectedPayload: string;
  expectedFormat: string;
  observedPayload?: string;
  observedFormat?: string;
  physicalInstanceId?: string;
  matched: boolean;
}

export interface DeviceScenarioResult {
  scenarioId: string;
  status: "passed" | "failed" | "not-tested" | "unavailable";
  targetIds: string[];
  groundTruth: DeviceScenarioGroundTruthComparison[];
  falseConfirmedScans: number;
  cameraStartupMs?: number;
  firstUsableFrameMs?: number;
  ttfdMs?: number;
  ttfcMs?: number;
  attempts?: number;
  capturedFrames?: number;
  admittedFrames?: number;
  droppedFrames?: number;
  qualityRejectedFrames?: number;
  decodeP50Ms?: number;
  decodeP95Ms?: number;
  effectiveDecodeFps?: number;
  frameDropRate?: number;
  recoveryRoutes?: string[];
  identitySwitches?: number;
  fragmentation?: number;
  falseTracks?: number;
  expectedCount?: number;
  confirmedCount?: number;
  stalePublicEvents?: number;
  notes?: string;
}

export interface PhysicalDeviceEvidence {
  schemaVersion: string;
  sourceCommit: string;
  sourceTree: string;
  sdkVersion: string;
  evidenceId: string;
  evidenceType: EvidenceType;
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
  browser: {
    name: string;
    version: string;
    userAgent: string;
  };
  camera: {
    label?: string;
    settings: Record<string, unknown>;
    capabilities: Record<string, unknown>;
    constraints: Record<string, unknown>;
  };
  scenarios: DeviceScenarioResult[];
  longRun?: {
    durationMs: number;
    capturedFrames: number;
    admittedFrames: number;
    droppedFrames: number;
    decodeAttempts: number;
    results: number;
    falseConfirmations: number;
    workerCount: number;
    sessionRestarts: number;
    cameraTrackEndings: number;
    errors: number;
    stalePublicEvents: number;
    finalControlledResources: number;
    windows: Array<{
      label: "first-5-min" | "middle-5-min" | "last-5-min";
      ttfcMs?: number;
      decodeP50Ms: number;
      decodeP95Ms: number;
      effectiveDecodeFps: number;
      frameDropRate: number;
    }>;
  };
  thermalObservation?: {
    source: "tester-observed" | "OS-reported" | "external-measured" | "unavailable";
    throttlingSymptom?: string;
    fpsDegradation?: number;
    decodeLatencyDriftMs?: number;
  };
  batteryObservation?: {
    source: "tester-recorded" | "unavailable";
    startPercent?: number;
    endPercent?: number;
    durationMs?: number;
    screenBrightnessPolicy?: string;
  };
  networkIsolation: {
    tested: boolean;
    scannerContinuedAfterNetworkDisabled: boolean | "not-tested";
    barcodePixelsUploaded: false;
    barcodePayloadUploaded: false;
  };
  fieldSources: Record<string, EvidenceFieldSource>;
  sensitiveDataReviewed: boolean;
  rightsReviewed: boolean;
  repositoryDirty: boolean;
}
