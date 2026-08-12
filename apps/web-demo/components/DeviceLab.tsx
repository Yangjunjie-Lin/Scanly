"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  BROWSER_SDK_VERSION,
  BatchScanSession,
  MediaStreamCameraFrameSource,
  ScannerSession,
  createTrackOverlayModels,
  type BarcodeObservationSet,
  type BarcodeTrack,
  type BatchState,
  type DeviceDiagnostics,
  type ScanEvent,
  type ScannerDiagnostic,
  type ScannerSessionStatistics,
  type TrackOverlayModel,
  type TrackingStatistics,
} from "@scanly/browser";
import { getBuiltinScenario } from "@scanly/scenario-schema";
import deviceManifest from "../../../device-lab/manifest.json";
import groundTruth from "../../../device-lab/test-targets/ground-truth.json";

type EvidenceType = "simulated" | "desktop-camera" | "physical-mobile" | "remote-physical-device";
type ScenarioStatus = "not-tested" | "passed" | "failed";
type DraftOutcome = "not-tested" | "passed" | "failed" | "unsupported" | "unavailable";
type Json = Record<string, any>;
type ManifestScenario = { id: string; name: string; targetIds?: string[]; negativeSubjects?: string[]; expectedPhysicalTargetCount?: number };
type ObservationSet = BarcodeObservationSet & { receivedAt: number };
type TrackSample = { at: number; frameId: number; tracks: BarcodeTrack[] };
type ScenarioDraft = {
  status: ScenarioStatus;
  measurements: string;
  startedAt?: string;
  endedAt?: string;
  startedAtMs?: number;
  events?: ScanEvent[];
  observationSets?: ObservationSet[];
  trackSamples?: TrackSample[];
  startStatistics?: ScannerSessionStatistics;
  endStatistics?: ScannerSessionStatistics;
  startTracking?: TrackingStatistics;
  endTracking?: TrackingStatistics;
  batchState?: BatchState;
  p10Labels?: PhysicalTrackLabel[];
};
type TimedStatistics = { at: number; statistics: ScannerSessionStatistics };
type DecodeSample = { at: number; decodeMs: number; success: boolean };
type PhysicalTrackLabel = { label: string; runtimePhysicalInstanceId: string; observedAt: string };
type CapabilityResults = {
  torchOn: DraftOutcome;
  torchOff: DraftOutcome;
  zoomMin: DraftOutcome;
  zoomMiddle: DraftOutcome;
  zoomMax: DraftOutcome;
  autoZoom: DraftOutcome;
  manualOverride: DraftOutcome;
  cooldown: DraftOutcome;
  focus: DraftOutcome;
};
type ZoomAudit = { operation: string; observedAt: string; before: number | "unavailable"; after: number | "unavailable"; result: DraftOutcome; detail?: string };
type AutoZoomRuntimeObservation = { frameId: number; observedAt: number; browserReportedZoom: number | "unavailable" };
type AutoZoomAuditState = {
  operationGeneration: number;
  armedAt: number;
  beforeZoom: number;
  firstFrameId?: number;
  firstTriggerAt?: number;
  firstAppliedAt?: number;
  firstAppliedZoom?: number;
  cooldownEndsAt?: number;
  cooldownObservations: AutoZoomRuntimeObservation[];
  earlyAutoZoomCount: number;
  cooldownWindowPassed?: boolean;
  cooldownWindowRecorded?: boolean;
  cooldownTimer?: number;
};
type SoakActivityType = "basic" | "multi-code" | "moving" | "negative";
const decodeAttemptCount = (snapshot: ScannerSessionStatistics): number => snapshot.fastAttempts + snapshot.balancedAttempts + snapshot.robustAttempts;
type PermissionStep = {
  phase: "initial-prompt" | "deny" | "retry" | "grant" | "revoke";
  observedAt: string;
  outcome: "observed" | "passed" | "failed" | "unavailable";
  scannerState: string;
  errorCode?: string;
  recoverableState: boolean;
  unhandledRejectionCount: number;
};

const unavailable = "unavailable";
const scenarios = deviceManifest.scenarios as ManifestScenario[];
const qrSmallPayload = groundTruth.targets.find((target) => target.targetId === "qr-small")?.payload;
const sourceCommit = process.env.NEXT_PUBLIC_SCANLY_SOURCE_COMMIT || unavailable;
const sourceTree = process.env.NEXT_PUBLIC_SCANLY_SOURCE_TREE || unavailable;
const sourceRepositoryDirty = process.env.NEXT_PUBLIC_SCANLY_REPOSITORY_DIRTY === "true"
  ? true
  : process.env.NEXT_PUBLIC_SCANLY_REPOSITORY_DIRTY === "false" ? false : unavailable;
const newSessionId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `device-session-${Date.now()}`;
const finiteOrUnavailable = (value: unknown): number | "unavailable" => value !== "" && Number.isFinite(Number(value)) ? Number(value) : unavailable;
const jsonObject = (value: unknown): Json => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const nonNegativeDelta = (after: ScannerSessionStatistics | undefined, before: ScannerSessionStatistics | undefined, key: keyof ScannerSessionStatistics): number => {
  const end = Number(after?.[key] ?? 0);
  const start = Number(before?.[key] ?? 0);
  return end >= start ? end - start : 0;
};
const counterDelta = (after: Json | undefined, before: Json | undefined, key: string): number => {
  const end = Number(after?.[key] ?? 0);
  const start = Number(before?.[key] ?? 0);
  return end >= start ? end - start : 0;
};
const quantile = (values: number[], q: number): number | "unavailable" => values.length
  ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * q) - 1)]
  : unavailable;
const reportedFacing = (settings: Json): "rear" | "front" | "unknown" => settings.facingMode === "environment" ? "rear" : settings.facingMode === "user" ? "front" : "unknown";
const reportedString = (value: unknown): string | "unavailable" => typeof value === "string" && value.trim() ? value : unavailable;
const sameZoom = (left: number, right: number): boolean => Math.abs(left - right) <= 0.001;

function cameraSwitchObservation(track: MediaStreamTrack | undefined, kind: "initial" | "switch", requestedFacingMode: "user" | "environment"): Json {
  const settings = jsonObject(track?.getSettings() ?? {});
  const facingMode = reportedString(settings.facingMode);
  const deviceId = reportedString(settings.deviceId);
  return {
    camera: reportedFacing(settings),
    kind,
    requestedFacingMode,
    observedAt: new Date().toISOString(),
    deviceId,
    facingMode,
    label: reportedString(track?.label),
    settings,
    browserReported: true,
  };
}

function publicBrowserFacts() {
  if (typeof navigator === "undefined" || typeof window === "undefined") return undefined;
  return {
    userAgent: navigator.userAgent || unavailable,
    platform: navigator.platform || unavailable,
    language: navigator.language || unavailable,
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    screenOrientation: screen.orientation ? `${screen.orientation.type} (${screen.orientation.angle}°)` : unavailable,
    devicePixelRatio: window.devicePixelRatio || unavailable,
    online: navigator.onLine,
  };
}

function pretty(value: unknown): string {
  if (value === undefined || value === null) return unavailable;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return unavailable; }
}

function manualZoomAuditPassed(audit: ZoomAudit[], operation: "zoomMin" | "zoomMiddle" | "zoomMax" | "manualOverride"): boolean {
  const entry = [...audit].reverse().find((candidate) => candidate.operation === operation);
  if (!entry || entry.result !== "passed" || entry.before === unavailable || entry.after === unavailable || !entry.detail) return false;
  const requested = Number(entry.detail.match(/requested=([0-9.+-]+)/)?.[1]);
  return Number.isFinite(requested) && sameZoom(entry.after, requested) && (sameZoom(entry.before, requested) || !sameZoom(entry.before, entry.after));
}

function scenarioTemplate(id: string): Json {
  if (id === "P1") return { notes: "TTFD and TTFC are derived from runtime observations inside this scenario window." };
  if (id === "P2") return { unsupportedTargetIds: [], notes: "Record every fixed format as PASS, FAIL, or UNSUPPORTED." };
  if (id === "P3") return { distanceObservations: [
    { label: "near", distance: 0, unit: "cm", source: "tester-measured", result: "failed" },
    { label: "medium", distance: 0, unit: "cm", source: "tester-measured", result: "failed" },
    { label: "far", distance: 0, unit: "cm", source: "tester-estimated", result: "failed" },
  ] };
  if (id === "P4") return { angleObservations: [
    { label: "0-degrees", approximateAngleDegrees: 0, source: "tester-estimated", result: "failed" },
    { label: "approximately-20-degrees", approximateAngleDegrees: 20, source: "tester-estimated", result: "failed" },
    { label: "approximately-40-degrees", approximateAngleDegrees: 40, source: "tester-estimated", result: "failed" },
  ] };
  if (id === "P5") return { lightingObservations: [
    { condition: "normal-room", result: "failed" },
    { condition: "dim-room", result: "failed" },
    { condition: "dark-room-with-screen-illumination", result: "failed" },
  ], notes: "Do not add lux without a real meter and external-measured source." };
  if (id === "P6") return { motion: "real-handheld-light-motion", notes: "Frame counters and TTFC are captured automatically." };
  if (id === "P7") return { glareMedium: "screen-barcode", notes: "Use screen-barcode or reflective-surface and retain a real failure." };
  if (id === "P8") return { distance: 0, distanceUnit: "cm", distanceSource: "tester-measured", zoom: "camera-api-reported", notes: "Resolution is captured automatically." };
  if (id === "P9") return { expectedCount: 4, notes: "All four targets must occur in one runtime observation set / frame." };
  if (id === "P10") return { notes: "Instance identity comes only from runtime tracking; tester text cannot replace it." };
  if (id === "P11") return { notes: "Move at least two labelled targets; metrics are computed from runtime track samples." };
  if (id === "P12") return { expectedCount: 4, notes: "Device Lab creates an SDK BatchScanSession in expected-count mode." };
  return { negativeSubjects: ["desk", "keyboard", "wall", "fabric", "packaging-without-barcode", "screen-without-barcode"], notes: "Keep the camera active for a sustained negative run." };
}

function initialScenarioDrafts(): Record<string, ScenarioDraft> {
  return Object.fromEntries(scenarios.map((scenario) => [scenario.id, { status: "not-tested", measurements: JSON.stringify(scenarioTemplate(scenario.id), null, 2) }]));
}

function parseMeasurements(text: string): Json {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { reviewError: "Measurements must be a JSON object." };
  } catch (cause) {
    return { reviewError: cause instanceof Error ? cause.message : String(cause), unparsedMeasurements: text };
  }
}

function workerState(snapshot: ScannerSessionStatistics | undefined): string {
  if (!snapshot) return unavailable;
  if (snapshot.activeTaskCount > 0 || snapshot.activeDecodeCount > 0) return "active";
  return snapshot.workerCreatedCount > snapshot.workerTerminatedCount ? "idle-worker" : "terminated";
}

function trackOverlayStyle(track: TrackOverlayModel, video: HTMLVideoElement | null, geometryFrame?: { width: number; height: number }): React.CSSProperties {
  const frameWidth = geometryFrame?.width ?? video?.videoWidth ?? 0;
  const frameHeight = geometryFrame?.height ?? video?.videoHeight ?? 0;
  const viewportWidth = video?.clientWidth ?? 0;
  const viewportHeight = video?.clientHeight ?? 0;
  if (!frameWidth || !frameHeight || !viewportWidth || !viewportHeight) return { display: "none" };
  const scale = Math.max(viewportWidth / frameWidth, viewportHeight / frameHeight);
  const offsetX = (viewportWidth - frameWidth * scale) / 2;
  const offsetY = (viewportHeight - frameHeight * scale) / 2;
  return {
    position: "absolute",
    left: offsetX + track.boundingBox.x * scale,
    top: offsetY + track.boundingBox.y * scale,
    width: Math.max(1, track.boundingBox.width * scale),
    height: Math.max(1, track.boundingBox.height * scale),
    border: "2px solid #58d68d",
    borderRadius: 8,
    boxShadow: "0 0 0 1px rgba(0,0,0,.6)",
  };
}

export default function DeviceLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<ScannerSession>();
  const batchRef = useRef<BatchScanSession>();
  const sourceRef = useRef<MediaStreamCameraFrameSource>();
  const stateRef = useRef("idle");
  const eventsRef = useRef<ScanEvent[]>([]);
  const observationsRef = useRef<ObservationSet[]>([]);
  const trackSamplesRef = useRef<TrackSample[]>([]);
  const trackingStatisticsSamplesRef = useRef<Array<{ at: number; statistics: TrackingStatistics }>>([]);
  const statisticsRef = useRef<ScannerSessionStatistics>();
  const diagnosticsRef = useRef<DeviceDiagnostics>();
  const timedStatisticsRef = useRef<TimedStatistics[]>([]);
  const decodeSamplesRef = useRef<DecodeSample[]>([]);
  const auditLogRef = useRef<ScannerDiagnostic[]>([]);
  const startedAtRef = useRef<string>();
  const startedAtMsRef = useRef<number>();
  const cameraAttemptStartedAtRef = useRef<number>();
  const cameraReadyMsRef = useRef<number>();
  const firstUsableFrameAtRef = useRef<number>();
  const offlineAtRef = useRef<number>();
  const offlineStatisticsRef = useRef<ScannerSessionStatistics>();
  const offlineRequestIndexRef = useRef<number>();
  const observedRequestsRef = useRef<Array<{ name: string; startedAt: number }>>([]);
  const unhandledRejectionCountRef = useRef(0);
  const lastTypedErrorRef = useRef<string>();
  const cameraSnapshotRef = useRef<{ label: string; settings: Json; capabilities: Json; constraints: Json; normalizedCapabilities: Json }>();
  const soakLivenessRef = useRef<Array<{ observedAt: string; cameraActive: boolean; scannerState: string; capturedFrames: number; admittedFrames: number; decodeAttempts: number; confirmedScans: number }>>([]);
  const soakActivitiesRef = useRef<Json[]>([]);
  const hiddenAtRef = useRef<number>();
  const foregroundAtRef = useRef<number>();
  const autoZoomAuditRef = useRef<AutoZoomAuditState>();
  const operationGenerationRef = useRef(0);
  const lifecycleTimersRef = useRef<Set<number>>(new Set());

  const [sessionId, setSessionId] = useState("pending-client-session-id");
  const [browserFacts, setBrowserFacts] = useState<ReturnType<typeof publicBrowserFacts>>();
  const [state, setState] = useState("idle");
  const [diagnostics, setDiagnostics] = useState<DeviceDiagnostics>();
  const [statistics, setStatistics] = useState<ScannerSessionStatistics>();
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [trackOverlays, setTrackOverlays] = useState<readonly TrackOverlayModel[]>([]);
  const [overlayFrame, setOverlayFrame] = useState<{ width: number; height: number }>();
  const [log, setLog] = useState<ScannerDiagnostic[]>([]);
  const [error, setError] = useState<string>();
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("simulated");
  const [declaredModel, setDeclaredModel] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [operatingSystem, setOperatingSystem] = useState("");
  const [operatingSystemVersion, setOperatingSystemVersion] = useState("");
  const [browserName, setBrowserName] = useState("");
  const [browserVersion, setBrowserVersion] = useState("");
  const [testerId, setTesterId] = useState("");
  const [deploymentId, setDeploymentId] = useState("");
  const [remoteProvider, setRemoteProvider] = useState("");
  const [remoteProviderSessionId, setRemoteProviderSessionId] = useState("");
  const [remoteProviderDeviceId, setRemoteProviderDeviceId] = useState("");
  const [remoteAttestationUrl, setRemoteAttestationUrl] = useState("");
  const [remoteAttestationSha256, setRemoteAttestationSha256] = useState("");
  const [cameraDevices, setCameraDevices] = useState<Array<{ deviceId: string; label: string; groupId: string }>>([]);
  const [observedRequests, setObservedRequests] = useState<string[]>([]);
  const [networkReview, setNetworkReview] = useState({ payloadRemainedLocal: false, cloudDecodeRequests: "", barcodePixelsUploaded: false, barcodePayloadUploaded: false });
  const [scenarioDrafts, setScenarioDrafts] = useState<Record<string, ScenarioDraft>>(initialScenarioDrafts);
  const [activeScenarioId, setActiveScenarioId] = useState<string>();
  const [p10Labels, setP10Labels] = useState<PhysicalTrackLabel[]>([]);
  const [p11Labels, setP11Labels] = useState<PhysicalTrackLabel[]>([]);
  const [capabilityResults, setCapabilityResults] = useState<CapabilityResults>({
    torchOn: "not-tested", torchOff: "not-tested", zoomMin: "not-tested", zoomMiddle: "not-tested", zoomMax: "not-tested",
    autoZoom: "not-tested", manualOverride: "not-tested", cooldown: "not-tested", focus: "not-tested",
  });
  const [zoomAudit, setZoomAudit] = useState<ZoomAudit[]>([]);
  const [permission, setPermission] = useState({ status: "not-tested", initialPrompt: "not-tested", grant: "not-tested", deny: "not-tested", retry: "not-tested", revoke: "unavailable", typedError: "unavailable" as boolean | "unavailable", recoverableState: "unavailable" as boolean | "unavailable" });
  const [permissionSteps, setPermissionSteps] = useState<PermissionStep[]>([]);
  const [switchSteps, setSwitchSteps] = useState<Json[]>([]);
  const [cameraSwitchUnavailable, setCameraSwitchUnavailable] = useState(false);
  const [orientationFrames, setOrientationFrames] = useState<Json[]>([]);
  const [orientationChecks, setOrientationChecks] = useState({ decoded: false, tracking: false, overlay: false, noMirrorOrQuarterTurn: false });
  const [backgroundObservations, setBackgroundObservations] = useState<Json[]>([]);
  const [backgroundResult, setBackgroundResult] = useState("not-tested");
  const [backgroundRecoveryMs, setBackgroundRecoveryMs] = useState("");
  const [silentDeadState, setSilentDeadState] = useState(false);
  const [wentOfflineDuringSession, setWentOfflineDuringSession] = useState(false);
  const [framesObservedOffline, setFramesObservedOffline] = useState(false);
  const [confirmedResultObservedOffline, setConfirmedResultObservedOffline] = useState(false);
  const [soakStartedAt, setSoakStartedAt] = useState<string>();
  const [soakEndedAt, setSoakEndedAt] = useState<string>();
  const [soakStartStatistics, setSoakStartStatistics] = useState<ScannerSessionStatistics>();
  const [soakFinalStatistics, setSoakFinalStatistics] = useState<ScannerSessionStatistics>();
  const [soakActivities, setSoakActivities] = useState<Json[]>([]);
  const [soakLiveness, setSoakLiveness] = useState<Json[]>([]);
  const [thermalSource, setThermalSource] = useState<"tester-observed" | "OS-reported" | "external-measured" | "unavailable">("unavailable");
  const [deviceBecameWarm, setDeviceBecameWarm] = useState("unavailable");
  const [visibleThrottling, setVisibleThrottling] = useState("unavailable");
  const [performanceDegraded, setPerformanceDegraded] = useState("unavailable");
  const [thermalNotes, setThermalNotes] = useState("");
  const [batteryStart, setBatteryStart] = useState("");
  const [batteryEnd, setBatteryEnd] = useState("");
  const [brightnessSetting, setBrightnessSetting] = useState("");
  const [chargingState, setChargingState] = useState<"charging" | "not-charging" | "unknown">("unknown");

  function updateState(next: string): void { stateRef.current = next; setState(next); }
  function operationIsCurrent(generation: number): boolean { return operationGenerationRef.current === generation; }
  function clearLifecycleTimers(): void {
    for (const timer of lifecycleTimersRef.current) window.clearTimeout(timer);
    lifecycleTimersRef.current.clear();
    const autoZoomTimer = autoZoomAuditRef.current?.cooldownTimer;
    if (autoZoomTimer !== undefined) window.clearTimeout(autoZoomTimer);
  }
  function scheduleLifecycleTimer(callback: () => void, delayMs: number): number {
    const generation = operationGenerationRef.current;
    const timer = window.setTimeout(() => {
      lifecycleTimersRef.current.delete(timer);
      if (operationIsCurrent(generation)) callback();
    }, delayMs);
    lifecycleTimersRef.current.add(timer);
    return timer;
  }
  function currentSnapshot(phase: string): Json {
    const snapshot = sessionRef.current?.getStatistics();
    return {
      phase,
      observedAt: new Date().toISOString(),
      visibilityState: document.visibilityState,
      mediaStreamTrackReadyState: sourceRef.current?.currentTrack()?.readyState ?? unavailable,
      scannerSessionState: stateRef.current,
      workerState: workerState(snapshot),
      staleEvents: snapshot?.staleEvents ?? unavailable,
    };
  }

  useEffect(() => {
    setSessionId(newSessionId());
    const update = () => setBrowserFacts(publicBrowserFacts());
    const offline = () => {
      update();
      if (startedAtMsRef.current !== undefined) {
        offlineAtRef.current = Date.now();
        offlineStatisticsRef.current = sessionRef.current?.getStatistics();
        offlineRequestIndexRef.current = observedRequestsRef.current.length;
        setWentOfflineDuringSession(true);
      }
    };
    const rejected = () => { unhandledRejectionCountRef.current += 1; };
    const visibility = () => {
      if (!sessionRef.current || startedAtMsRef.current === undefined) return;
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        scheduleLifecycleTimer(() => {
          const observation = currentSnapshot("background");
          setBackgroundObservations((current) => [...current.filter((entry) => entry.phase === "foreground-before"), observation]);
        }, 0);
      } else if (hiddenAtRef.current !== undefined) {
        foregroundAtRef.current = Date.now();
        const recoveryDeadline = Date.now() + 30_000;
        const captureRecovered = () => {
          const observation = currentSnapshot("foreground-after");
          const recovered = stateRef.current === "scanning" || stateRef.current === "failed";
          if (!recovered && Date.now() < recoveryDeadline) { scheduleLifecycleTimer(captureRecovered, 50); return; }
          setBackgroundObservations((current) => [...current.filter((entry) => entry.phase !== "foreground-after"), observation]);
          setBackgroundRecoveryMs(String(Math.max(0, Date.now() - foregroundAtRef.current!)));
          foregroundAtRef.current = undefined;
        };
        scheduleLifecycleTimer(captureRecovered, 0);
        hiddenAtRef.current = undefined;
      }
      update();
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", offline);
    window.addEventListener("unhandledrejection", rejected);
    document.addEventListener("visibilitychange", visibility);
    const timer = window.setInterval(() => {
      const requests = performance.getEntriesByType("resource").map((entry) => ({ name: entry.name, startedAt: performance.timeOrigin + entry.startTime }));
      observedRequestsRef.current = requests.slice(-200);
      setObservedRequests(observedRequestsRef.current.map((entry) => entry.name));
      const snapshot = sessionRef.current?.getStatistics();
      statisticsRef.current = snapshot;
      setStatistics(snapshot);
      if (snapshot) {
        timedStatisticsRef.current.push({ at: Date.now(), statistics: snapshot });
        if (timedStatisticsRef.current.length > 7_500) timedStatisticsRef.current.splice(0, timedStatisticsRef.current.length - 7_500);
        if (offlineAtRef.current && !navigator.onLine) {
          const captured = nonNegativeDelta(snapshot, offlineStatisticsRef.current, "capturedFrames");
          const admitted = nonNegativeDelta(snapshot, offlineStatisticsRef.current, "admittedFrames");
          if (captured > 0 && admitted > 0) setFramesObservedOffline(true);
        }
        if (soakLivenessRef.current.length > 0 && sourceRef.current?.currentTrack()?.readyState !== "ended") {
          const sample = {
            observedAt: new Date().toISOString(),
            cameraActive: sourceRef.current?.currentTrack()?.readyState === "live",
            scannerState: stateRef.current,
            capturedFrames: snapshot.capturedFrames,
            admittedFrames: snapshot.admittedFrames,
            decodeAttempts: decodeAttemptCount(snapshot),
            confirmedScans: eventsRef.current.length,
          };
          soakLivenessRef.current.push(sample);
          if (soakLivenessRef.current.length > 10_000) soakLivenessRef.current.shift();
          setSoakLiveness([...soakLivenessRef.current]);
        }
      }
      const device = sessionRef.current?.getDeviceDiagnostics();
      diagnosticsRef.current = device;
      setDiagnostics(device);
      if (sessionRef.current) setTrackOverlays(createTrackOverlayModels(sessionRef.current.getTracks()));
    }, 1_000);
    return () => {
      operationGenerationRef.current += 1;
      clearLifecycleTimers();
      window.clearInterval(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", offline);
      window.removeEventListener("unhandledrejection", rejected);
      document.removeEventListener("visibilitychange", visibility);
      void batchRef.current?.dispose();
      void sessionRef.current?.dispose();
    };
  // Lifecycle observers are intentionally installed once; their mutable state lives in refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start(): Promise<void> {
    if (!videoRef.current) return;
    if (activeScenarioId || (soakStartedAt && !soakEndedAt)) { setError("Finish the active scenario or soak before replacing the ScannerSession."); return; }
    const operationGeneration = ++operationGenerationRef.current;
    clearLifecycleTimers();
    autoZoomAuditRef.current = undefined;
    setError(undefined);
    lastTypedErrorRef.current = undefined;
    const previousBatch = batchRef.current;
    const previousSession = sessionRef.current;
    batchRef.current = undefined; sessionRef.current = undefined; sourceRef.current = undefined;
    if (previousBatch) await previousBatch.dispose();
    await previousSession?.dispose();
    if (!operationIsCurrent(operationGeneration)) return;
    setEvents([]); eventsRef.current = []; observationsRef.current = []; trackSamplesRef.current = []; trackingStatisticsSamplesRef.current = [];
    setTrackOverlays([]); setOverlayFrame(undefined); setLog([]); auditLogRef.current = []; timedStatisticsRef.current = []; decodeSamplesRef.current = [];
    offlineAtRef.current = undefined; offlineStatisticsRef.current = undefined; offlineRequestIndexRef.current = undefined;
    setWentOfflineDuringSession(false); setFramesObservedOffline(false); setConfirmedResultObservedOffline(false);
    firstUsableFrameAtRef.current = undefined; cameraReadyMsRef.current = undefined; performance.clearResourceTimings(); observedRequestsRef.current = [];
    const source = new MediaStreamCameraFrameSource({ video: videoRef.current, facingMode: "environment", preferredWidth: 1_920, preferredHeight: 1_080, preferredFrameRate: 30, maximumConstraintAttempts: 3 });
    const session = new ScannerSession({ source, decoderOptions: { scenario: getBuiltinScenario("multiformat-balanced") }, decodeMode: "tracking", tracking: { maxResults: 32 }, repeatPolicy: { mode: "physical-instance" }, cameraRecovery: { maximumRetries: 3, baseDelayMs: 250, maximumDelayMs: 2_000 } });
    sourceRef.current = source; sessionRef.current = session; startedAtRef.current ??= new Date().toISOString(); cameraAttemptStartedAtRef.current = Date.now();
    session.onStateChange((next) => { if (operationIsCurrent(operationGeneration) && sessionRef.current === session) updateState(next); });
    session.onResult((event) => {
      if (!operationIsCurrent(operationGeneration) || sessionRef.current !== session) return;
      eventsRef.current.push(event);
      setEvents([...eventsRef.current.slice(-100)]);
      if (offlineAtRef.current !== undefined && !navigator.onLine && event.timestamp >= offlineAtRef.current) setConfirmedResultObservedOffline(true);
    });
    session.onObservations((set) => {
      if (!operationIsCurrent(operationGeneration) || sessionRef.current !== session) return;
      const receivedAt = Date.now();
      observationsRef.current.push({ ...set, receivedAt });
      if (observationsRef.current.length > 12_000) observationsRef.current.shift();
      if (Number.isFinite(set.decodeMs)) decodeSamplesRef.current.push({ at: set.timestamp, decodeMs: set.decodeMs!, success: set.observations.length > 0 });
      const tracks = session.getTracks().map((track) => ({ ...track, geometry: { ...track.geometry, boundingBox: { ...track.geometry.boundingBox }, cornerPoints: track.geometry.cornerPoints.map((point) => ({ ...point })) } }));
      trackSamplesRef.current.push({ at: set.timestamp, frameId: set.frameId, tracks });
      if (trackSamplesRef.current.length > 12_000) trackSamplesRef.current.shift();
      const trackingStatistics = session.getTrackingStatistics();
      if (trackingStatistics) {
        trackingStatisticsSamplesRef.current.push({ at: set.timestamp, statistics: trackingStatistics });
        if (trackingStatisticsSamplesRef.current.length > 12_000) trackingStatisticsSamplesRef.current.shift();
      }
      setOverlayFrame({ width: set.frameWidth, height: set.frameHeight });
      setTrackOverlays(createTrackOverlayModels(tracks));
    });
    session.onDiagnostics((entry) => {
      if (!operationIsCurrent(operationGeneration) || sessionRef.current !== session) return;
      if (entry.quality?.usable && firstUsableFrameAtRef.current === undefined) firstUsableFrameAtRef.current = entry.timestamp;
      if (entry.type === "camera" || entry.type === "error" || entry.type === "recovery") {
        auditLogRef.current.push(entry);
        setLog([...auditLogRef.current.slice(-200)]);
      }
      const active = autoZoomAuditRef.current;
      let autoZoom: Json | undefined;
      if (entry.type === "camera" && entry.detail?.startsWith("auto-zoom-result:")) {
        try { autoZoom = jsonObject(JSON.parse(entry.detail.slice("auto-zoom-result:".length))); } catch { autoZoom = undefined; }
      }
      if (autoZoom && active && entry.timestamp >= active.armedAt) {
        const result = autoZoom.result;
        const reportedBefore = finiteOrUnavailable(autoZoom.beforeZoom);
        const reportedAfter = finiteOrUnavailable(autoZoom.afterZoom);
        const settingsZoom = finiteOrUnavailable((sourceRef.current?.currentTrack()?.getSettings() as Json | undefined)?.zoom);
        const observedZoom = reportedAfter !== unavailable ? reportedAfter : settingsZoom;
        if (active.firstAppliedAt === undefined) {
          const passed = result.ok && reportedBefore !== unavailable && observedZoom !== unavailable
            && sameZoom(reportedBefore, active.beforeZoom) && observedZoom > reportedBefore;
          active.firstFrameId = entry.frameId;
          active.firstTriggerAt = Number(autoZoom.triggeredAt ?? entry.timestamp);
          active.firstAppliedAt = entry.timestamp;
          if (passed) active.firstAppliedZoom = observedZoom;
          setCapabilityResults((current) => ({ ...current, autoZoom: passed ? "passed" : "failed" }));
          setZoomAudit((current) => [...current, { operation: "auto-zoom-browser-settings-change", observedAt: new Date(entry.timestamp).toISOString(), before: reportedBefore, after: observedZoom, result: passed ? "passed" : "failed", detail: `Confirmed runtime geometry on frame ${entry.frameId ?? unavailable}; PASS requires diagnostic beforeZoom and browser-reported afterZoom/settings to show a real increase.` }]);
          if (!passed) {
            autoZoomAuditRef.current = undefined;
          } else {
            active.cooldownEndsAt = active.firstTriggerAt + 1_500;
            const delay = Math.max(0, active.cooldownEndsAt - Date.now());
            active.cooldownTimer = window.setTimeout(() => {
              const current = autoZoomAuditRef.current;
              if (!current || current !== active || !operationIsCurrent(current.operationGeneration)) return;
              current.cooldownWindowPassed = current.cooldownObservations.length > 0
                && current.earlyAutoZoomCount === 0
                && current.cooldownObservations.every((observation) => observation.browserReportedZoom !== unavailable && sameZoom(observation.browserReportedZoom, current.firstAppliedZoom!));
              current.cooldownWindowRecorded = true;
              setZoomAudit((audit) => [...audit, {
                operation: "auto-zoom-cooldown-suppression-window",
                observedAt: new Date().toISOString(),
                before: current.firstAppliedZoom!,
                after: current.cooldownObservations.at(-1)?.browserReportedZoom ?? unavailable,
                result: current.cooldownWindowPassed ? "passed" : "failed",
                detail: `Observed ${current.cooldownObservations.length} confirmed qr-small frame(s) inside the 1500ms cooldown; zero auto-zoom diagnostics and unchanged browser settings are required. Continue presenting qr-small after cooldown for the final change.`,
              }]);
              if (!current.cooldownWindowPassed) {
                setCapabilityResults((capabilities) => ({ ...capabilities, cooldown: "failed" }));
                autoZoomAuditRef.current = undefined;
              }
            }, delay);
          }
        } else {
          const triggerAt = Number(autoZoom.triggeredAt ?? entry.timestamp);
          if (active.cooldownEndsAt !== undefined && triggerAt < active.cooldownEndsAt) active.earlyAutoZoomCount += 1;
          const elapsed = triggerAt - (active.firstTriggerAt ?? active.firstAppliedAt);
          const passed = active.cooldownWindowRecorded === true && active.cooldownWindowPassed === true
            && active.earlyAutoZoomCount === 0 && elapsed >= 1_500 && result.ok
            && active.firstAppliedZoom !== undefined && reportedBefore !== unavailable && observedZoom !== unavailable
            && sameZoom(reportedBefore, active.firstAppliedZoom) && observedZoom > reportedBefore;
          setCapabilityResults((current) => ({ ...current, cooldown: passed ? "passed" : "failed" }));
          setZoomAudit((current) => [...current, { operation: "auto-zoom-post-cooldown-browser-settings-change", observedAt: new Date(entry.timestamp).toISOString(), before: reportedBefore, after: observedZoom, result: passed ? "passed" : "failed", detail: `Second confirmed runtime trigger occurred ${elapsed}ms after the first. PASS requires a proven suppression window followed by a browser-reported zoom increase after cooldown.` }]);
          autoZoomAuditRef.current = undefined;
        }
      }
      if (active && entry.type === "event" && (entry.event?.type === "confirmed" || entry.event?.type === "suppressed") && entry.event.barcode.text === qrSmallPayload && active.firstAppliedAt !== undefined && active.cooldownEndsAt !== undefined && entry.timestamp < active.cooldownEndsAt) {
        active.cooldownObservations.push({ frameId: entry.frameId ?? entry.event.frameId, observedAt: entry.timestamp, browserReportedZoom: finiteOrUnavailable((sourceRef.current?.currentTrack()?.getSettings() as Json | undefined)?.zoom) });
      }
      if (entry.error) { lastTypedErrorRef.current = entry.error.code; setError(`${entry.error.code}: ${entry.error.message}`); }
    });
    try {
      await session.start();
      if (!operationIsCurrent(operationGeneration) || sessionRef.current !== session) { await session.dispose(); return; }
      lastTypedErrorRef.current = undefined;
      startedAtMsRef.current = Date.now();
      cameraReadyMsRef.current = cameraAttemptStartedAtRef.current === undefined ? undefined : Date.now() - cameraAttemptStartedAtRef.current;
      const initialTrack = source.currentTrack();
      setSwitchSteps([{ ...cameraSwitchObservation(initialTrack, "initial", "environment"), newCameraActive: initialTrack?.readyState === "live" }]);
      const device = session.getDeviceDiagnostics(); diagnosticsRef.current = device; setDiagnostics(device);
      const track = source.currentTrack();
      cameraSnapshotRef.current = {
        label: track?.label || unavailable,
        settings: jsonObject(track?.getSettings() ?? device?.negotiatedSettings),
        capabilities: jsonObject(track?.getCapabilities?.() ?? device?.trackCapabilities),
        constraints: jsonObject(track?.getConstraints() ?? device?.trackConstraints),
        normalizedCapabilities: session.getCameraCapabilities(),
      };
      const listed = await MediaStreamCameraFrameSource.listDevices();
      if (!operationIsCurrent(operationGeneration) || sessionRef.current !== session) return;
      setCameraDevices(listed.map((entry) => ({ deviceId: entry.deviceId, label: entry.label || unavailable, groupId: entry.groupId || unavailable })));
    } catch (cause) {
      if (!operationIsCurrent(operationGeneration) || sessionRef.current !== session) { await session.dispose(); return; }
      const code = (cause as { error?: { code?: string } })?.error?.code;
      if (code) lastTypedErrorRef.current = code;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function stop(): Promise<ScannerSessionStatistics | undefined> {
    if (activeScenarioId) { setError(`Finish ${activeScenarioId} before stopping.`); return undefined; }
    if (soakStartedAt && !soakEndedAt) { setError("Use ‘End soak and dispose’ so final resources are captured after decoder disposal."); return undefined; }
    const operationGeneration = operationGenerationRef.current;
    const session = sessionRef.current;
    await session?.stop();
    if (!operationIsCurrent(operationGeneration) || sessionRef.current !== session) return undefined;
    const snapshot = session?.getStatistics();
    statisticsRef.current = snapshot; setStatistics(snapshot);
    const device = sessionRef.current?.getDeviceDiagnostics(); diagnosticsRef.current = device; setDiagnostics(device);
    return snapshot;
  }

  async function resetSession(): Promise<void> {
    if (activeScenarioId || (soakStartedAt && !soakEndedAt)) {
      setError("Finish the active scenario or soak before resetting all session data.");
      return;
    }
    const operationGeneration = ++operationGenerationRef.current;
    clearLifecycleTimers();
    const previousBatch = batchRef.current;
    const previousSession = sessionRef.current;
    batchRef.current = undefined; sessionRef.current = undefined; sourceRef.current = undefined;
    if (previousBatch) await previousBatch.dispose();
    await previousSession?.dispose();
    if (!operationIsCurrent(operationGeneration)) return;
    stateRef.current = "idle"; eventsRef.current = []; observationsRef.current = []; trackSamplesRef.current = []; trackingStatisticsSamplesRef.current = [];
    statisticsRef.current = undefined; diagnosticsRef.current = undefined; timedStatisticsRef.current = []; decodeSamplesRef.current = []; auditLogRef.current = [];
    startedAtRef.current = undefined; startedAtMsRef.current = undefined; cameraAttemptStartedAtRef.current = undefined; cameraReadyMsRef.current = undefined; firstUsableFrameAtRef.current = undefined;
    offlineAtRef.current = undefined; offlineStatisticsRef.current = undefined; offlineRequestIndexRef.current = undefined; observedRequestsRef.current = [];
    unhandledRejectionCountRef.current = 0; lastTypedErrorRef.current = undefined; cameraSnapshotRef.current = undefined; soakLivenessRef.current = []; soakActivitiesRef.current = [];
    hiddenAtRef.current = undefined; foregroundAtRef.current = undefined; autoZoomAuditRef.current = undefined;
    performance.clearResourceTimings();

    setSessionId(newSessionId()); setState("idle"); setDiagnostics(undefined); setStatistics(undefined); setEvents([]); setTrackOverlays([]); setOverlayFrame(undefined); setLog([]); setError(undefined);
    setEvidenceType("simulated"); setDeclaredModel(""); setManufacturer(""); setOperatingSystem(""); setOperatingSystemVersion(""); setBrowserName(""); setBrowserVersion(""); setTesterId(""); setDeploymentId("");
    setRemoteProvider(""); setRemoteProviderSessionId(""); setRemoteProviderDeviceId(""); setRemoteAttestationUrl(""); setRemoteAttestationSha256(""); setCameraDevices([]); setObservedRequests([]);
    setNetworkReview({ payloadRemainedLocal: false, cloudDecodeRequests: "", barcodePixelsUploaded: false, barcodePayloadUploaded: false }); setWentOfflineDuringSession(false); setFramesObservedOffline(false); setConfirmedResultObservedOffline(false);
    setScenarioDrafts(initialScenarioDrafts()); setActiveScenarioId(undefined); setP10Labels([]); setP11Labels([]);
    setCapabilityResults({ torchOn: "not-tested", torchOff: "not-tested", zoomMin: "not-tested", zoomMiddle: "not-tested", zoomMax: "not-tested", autoZoom: "not-tested", manualOverride: "not-tested", cooldown: "not-tested", focus: "not-tested" }); setZoomAudit([]);
    setPermission({ status: "not-tested", initialPrompt: "not-tested", grant: "not-tested", deny: "not-tested", retry: "not-tested", revoke: "unavailable", typedError: "unavailable", recoverableState: "unavailable" }); setPermissionSteps([]);
    setSwitchSteps([]); setCameraSwitchUnavailable(false); setOrientationFrames([]); setOrientationChecks({ decoded: false, tracking: false, overlay: false, noMirrorOrQuarterTurn: false });
    setBackgroundObservations([]); setBackgroundResult("not-tested"); setBackgroundRecoveryMs(""); setSilentDeadState(false);
    setSoakStartedAt(undefined); setSoakEndedAt(undefined); setSoakStartStatistics(undefined); setSoakFinalStatistics(undefined); setSoakActivities([]); setSoakLiveness([]);
    setThermalSource("unavailable"); setDeviceBecameWarm("unavailable"); setVisibleThrottling("unavailable"); setPerformanceDegraded("unavailable"); setThermalNotes("");
    setBatteryStart(""); setBatteryEnd(""); setBrightnessSetting(""); setChargingState("unknown");
  }

  function beginScenario(id: string): void {
    const session = sessionRef.current;
    if (!session || stateRef.current !== "scanning") { setError("Start a live camera session before beginning a physical scenario."); return; }
    if (activeScenarioId) { setError(`Finish ${activeScenarioId} before starting another scenario.`); return; }
    if (soakStartedAt && !soakEndedAt) { setError("Do not overlap a P/N scenario window with the soak window."); return; }
    const now = Date.now();
    if (id === "P12") {
      const expectedCount = deviceManifest.scenarios.find((entry) => entry.id === "P12")?.expectedPhysicalTargetCount ?? 4;
      batchRef.current = new BatchScanSession({ scanner: session, mode: "expected-count", expectedCount, disposeScanner: false });
    } else batchRef.current = undefined;
    if (id === "P10") setP10Labels([]);
    if (id === "P11") setP11Labels([]);
    setActiveScenarioId(id); setError(undefined);
    setScenarioDrafts((current) => ({ ...current, [id]: {
      ...current[id], startedAt: new Date(now).toISOString(), startedAtMs: now, startStatistics: session.getStatistics(), startTracking: session.getTrackingStatistics(),
      events: undefined, observationSets: undefined, trackSamples: undefined, endStatistics: undefined, endTracking: undefined, batchState: undefined, endedAt: undefined,
    } }));
  }

  async function endScenario(id: string): Promise<void> {
    const draft = scenarioDrafts[id];
    if (activeScenarioId !== id || draft.startedAtMs === undefined) { setError(`${id} is not the active scenario.`); return; }
    const endedAtMs = Date.now();
    const batchState = id === "P12" ? batchRef.current?.getBatchState() : undefined;
    const physicalLabelSnapshot = id === "P10" ? [...p10Labels] : id === "P11" ? [...p11Labels] : undefined;
    if (id === "P12") { await batchRef.current?.dispose(); batchRef.current = undefined; }
    const endStatistics = sessionRef.current?.getStatistics();
    const endTracking = sessionRef.current?.getTrackingStatistics();
    const captured = eventsRef.current.filter((event) => event.timestamp >= draft.startedAtMs! && event.timestamp <= endedAtMs);
    const observationSets = observationsRef.current.filter((set) => set.timestamp >= draft.startedAtMs! && set.timestamp <= endedAtMs);
    const trackSamples = trackSamplesRef.current.filter((sample) => sample.at >= draft.startedAtMs! && sample.at <= endedAtMs);
    setScenarioDrafts((current) => ({ ...current, [id]: { ...current[id], endedAt: new Date(endedAtMs).toISOString(), events: captured, observationSets, trackSamples, endStatistics, endTracking, ...(batchState ? { batchState } : {}), ...(physicalLabelSnapshot ? { p10Labels: physicalLabelSnapshot } : {}) } }));
    setActiveScenarioId(undefined); setError(undefined);
  }

  function labelP10Instance(label: "same-payload-a" | "same-payload-b"): void {
    if (activeScenarioId !== "P10") { setError("Begin P10 before labelling a physical target."); return; }
    const target = groundTruth.targets.find((entry) => entry.targetId === label);
    const candidates = (sessionRef.current?.getTracks() ?? []).filter((track) => track.state === "confirmed" && track.payload === target?.payload && track.format === target?.format);
    if (candidates.length !== 1) { setError(`Show only ${label}; exactly one confirmed matching runtime track is required (observed ${candidates.length}).`); return; }
    const runtimePhysicalInstanceId = candidates[0].physicalInstanceId;
    setP10Labels((current) => [...current.filter((entry) => entry.label !== label), { label, runtimePhysicalInstanceId, observedAt: new Date().toISOString() }]);
    setError(undefined);
  }

  function labelP11Instance(label: string): void {
    if (activeScenarioId !== "P11") { setError("Begin P11 before labelling a physical target."); return; }
    const target = groundTruth.targets.find((entry) => entry.targetId === label);
    const candidates = (sessionRef.current?.getTracks() ?? []).filter((track) => track.state === "confirmed" && track.payload === target?.payload && track.format === target?.format);
    if (candidates.length !== 1) { setError(`Show only ${label}; exactly one confirmed matching runtime track is required (observed ${candidates.length}).`); return; }
    const runtimePhysicalInstanceId = candidates[0].physicalInstanceId;
    setP11Labels((current) => [...current, { label, runtimePhysicalInstanceId, observedAt: new Date().toISOString() }]);
    setError(undefined);
  }

  async function switchFacingMode(facingMode: "user" | "environment"): Promise<void> {
    const session = sessionRef.current;
    if (!videoRef.current || !session) return;
    if (activeScenarioId || (soakStartedAt && !soakEndedAt)) { setError("Camera switching cannot overlap a scenario or soak window."); return; }
    const currentStep = switchSteps.at(-1);
    const expectedFacingMode = currentStep?.camera === "rear" ? "user" : currentStep?.camera === "front" ? "environment" : undefined;
    if (!expectedFacingMode || facingMode !== expectedFacingMode || switchSteps.length >= 3) {
      setError("Camera switching evidence must follow the single browser-reported rear → front → rear sequence; restart the camera session to retry.");
      return;
    }
    const operationGeneration = operationGenerationRef.current;
    const oldTrack = sourceRef.current?.currentTrack();
    const staleBefore = session.getStatistics().staleEvents;
    const invalidationsBefore = session.getStatistics().cameraGenerationInvalidations;
    const next = new MediaStreamCameraFrameSource({ video: videoRef.current, facingMode, preferredWidth: 1_920, preferredHeight: 1_080, preferredFrameRate: 30 });
    try {
      await session.switchSource(next);
      if (!operationIsCurrent(operationGeneration) || sessionRef.current !== session) { await next.stop(); return; }
      sourceRef.current = next;
      const after = session.getStatistics();
      const invalidationObserved = after.cameraGenerationInvalidations > invalidationsBefore;
      const newTrack = next.currentTrack();
      setSwitchSteps((current) => [...current, {
        ...cameraSwitchObservation(newTrack, "switch", facingMode),
        oldTrackReadyState: oldTrack?.readyState ?? unavailable, oldTrackStopped: oldTrack?.readyState === "ended",
        newCameraActive: newTrack?.readyState === "live", generationInvalidated: invalidationObserved,
        staleResults: Math.max(0, after.staleEvents - staleBefore),
      }]);
      const device = session.getDeviceDiagnostics(); diagnosticsRef.current = device; setDiagnostics(device); setError(undefined);
      const track = newTrack;
      cameraSnapshotRef.current = {
        label: track?.label || unavailable,
        settings: jsonObject(track?.getSettings() ?? device?.negotiatedSettings),
        capabilities: jsonObject(track?.getCapabilities?.() ?? device?.trackCapabilities),
        constraints: jsonObject(track?.getConstraints() ?? device?.trackConstraints),
        normalizedCapabilities: session.getCameraCapabilities(),
      };
    } catch (cause) {
      if (operationIsCurrent(operationGeneration) && sessionRef.current === session) setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function capabilityOutcome(result: any): DraftOutcome {
    if (!result) return "unsupported";
    if (result.ok) return "passed";
    return String(result.error?.code ?? "").includes("unsupported") ? "unsupported" : "failed";
  }

  async function capability(operation: keyof CapabilityResults): Promise<void> {
    const session = sessionRef.current; if (!session) return;
    const operationGeneration = operationGenerationRef.current;
    const caps = session.getCameraCapabilities();
    const before = caps.zoom?.current ?? finiteOrUnavailable((sourceRef.current?.currentTrack()?.getSettings() as Json | undefined)?.zoom);
    let result: any;
    if (operation === "torchOn") result = caps.torch ? await session.setTorch(true) : undefined;
    else if (operation === "torchOff") result = caps.torch ? await session.setTorch(false) : undefined;
    else if (operation === "focus") result = caps.focusMode ? await session.requestFocus() : undefined;
    else if (!caps.zoom) result = undefined;
    else {
      const midpoint = (caps.zoom.min + caps.zoom.max) / 2;
      if (operation === "zoomMin") result = await session.setZoom(caps.zoom.min);
      if (operation === "zoomMiddle") result = await session.setZoom(midpoint);
      if (operation === "zoomMax") result = await session.setZoom(caps.zoom.max);
      if (operation === "autoZoom") {
        result = await session.setZoom(caps.zoom.min, false);
        if (!operationIsCurrent(operationGeneration) || sessionRef.current !== session) return;
        const appliedMinimum = Number(sourceRef.current?.currentTrack()?.getSettings().zoom);
        if (result.ok && Number.isFinite(appliedMinimum)) {
          autoZoomAuditRef.current = { operationGeneration: operationGenerationRef.current, armedAt: Date.now(), beforeZoom: appliedMinimum, cooldownObservations: [], earlyAutoZoomCount: 0 };
          setCapabilityResults((current) => ({ ...current, autoZoom: "not-tested", cooldown: "not-tested" }));
          setZoomAudit((current) => [...current, { operation: "auto-zoom-armed", observedAt: new Date().toISOString(), before, after: appliedMinimum, result: "not-tested", detail: "ScannerSession is armed. Keep qr-small continuously visible: the lab requires a real browser-reported zoom increase, confirmed frames with unchanged settings and no auto-zoom during the 1500ms cooldown, then another real increase after cooldown." }]);
          setError(undefined);
          return;
        }
      }
      if (operation === "manualOverride") result = await session.setZoom(caps.zoom.min, true);
    }
    if (!operationIsCurrent(operationGeneration) || sessionRef.current !== session) return;
    const after = session.getCameraCapabilities().zoom?.current ?? finiteOrUnavailable((sourceRef.current?.currentTrack()?.getSettings() as Json | undefined)?.zoom);
    const requestedZoom = operation === "zoomMin" || operation === "manualOverride" ? caps.zoom?.min
      : operation === "zoomMiddle" && caps.zoom ? (caps.zoom.min + caps.zoom.max) / 2
        : operation === "zoomMax" ? caps.zoom?.max : undefined;
    const apiOutcome = operation === "cooldown" ? capabilityResults.cooldown : capabilityOutcome(result);
    const observedManualZoom = requestedZoom === undefined || before === unavailable || after === unavailable
      ? apiOutcome
      : apiOutcome === "passed" && sameZoom(after, requestedZoom) && (sameZoom(before, requestedZoom) || !sameZoom(before, after)) ? "passed" : "failed";
    const outcome = ["zoomMin", "zoomMiddle", "zoomMax", "manualOverride"].includes(operation) ? observedManualZoom : apiOutcome;
    setCapabilityResults((current) => ({ ...current, [operation]: outcome }));
    setZoomAudit((current) => [...current, { operation, observedAt: new Date().toISOString(), before, after, result: outcome, detail: requestedZoom === undefined ? (result?.value && typeof result.value === "string" ? result.value : undefined) : `requested=${requestedZoom}; PASS requires browser-reported settings.zoom to equal the request and either change from before or already equal the requested boundary.` }]);
    if (outcome === "failed") setError("Camera capability operation failed; retain this failure in the exported draft."); else setError(undefined);
    const device = session.getDeviceDiagnostics(); diagnosticsRef.current = device; setDiagnostics(device);
  }

  function captureOrientation(): void {
    const raw = screen.orientation?.type ?? "unknown";
    const orientation = raw.startsWith("landscape") ? "landscape" : raw.startsWith("portrait") ? "portrait" : "unknown";
    const tracks = sessionRef.current?.getTracks() ?? [];
    setOrientationFrames((current) => [...current, {
      orientation, observedAt: new Date().toISOString(), width: videoRef.current?.videoWidth ?? 0, height: videoRef.current?.videoHeight ?? 0,
      viewport: { width: window.innerWidth, height: window.innerHeight }, trackSettings: sourceRef.current?.currentTrack()?.getSettings() ?? unavailable,
      decodedGeometry: eventsRef.current.at(-1)?.geometry ?? unavailable,
      trackingGeometry: tracks.map((track) => ({ trackId: track.trackId, physicalInstanceId: track.physicalInstanceId, geometry: track.geometry })),
      overlayGeometry: createTrackOverlayModels(tracks),
    }]);
  }

  function captureForegroundBefore(): void {
    const observation = currentSnapshot("foreground-before");
    setBackgroundObservations([observation]);
    setError(undefined);
  }

  function recordPermissionStep(phase: "initial-prompt" | "grant" | "deny" | "retry" | "revoke"): void {
    const required = ["initial-prompt", "deny", "retry", "grant"] as const;
    const expected = permissionSteps.length < required.length ? required[permissionSteps.length] : permission.revoke === "unavailable" ? undefined : "revoke";
    if (phase !== expected) { setError(`Permission audit requires ${expected ?? "no further step"}; '${phase}' cannot be recorded now.`); return; }
    const outcome = phase === "initial-prompt" ? permission.initialPrompt : permission[phase];
    const valid = phase === "initial-prompt" ? outcome === "observed"
      : phase === "deny" ? outcome === "passed" && lastTypedErrorRef.current === "camera_permission_denied" && stateRef.current === "failed"
        : phase === "retry" ? outcome === "passed" && ["starting", "scanning"].includes(stateRef.current)
          : phase === "grant" ? outcome === "passed" && stateRef.current === "scanning"
            : ["passed", "failed"].includes(outcome);
    if (!valid || !permission.recoverableState || unhandledRejectionCountRef.current !== 0) { setError(`Runtime/summary facts do not satisfy the fail-closed '${phase}' permission step.`); return; }
    const priorAt = permissionSteps.length ? Date.parse(permissionSteps.at(-1)!.observedAt) : 0;
    const observedAt = new Date(Math.max(Date.now(), priorAt + 1)).toISOString();
    if (phase === "initial-prompt") startedAtRef.current ??= observedAt;
    setPermissionSteps((current) => [...current, {
      phase, observedAt, outcome: outcome as PermissionStep["outcome"], scannerState: stateRef.current,
      ...(phase === "deny" ? { errorCode: "camera_permission_denied" } : {}), recoverableState: true, unhandledRejectionCount: 0,
    }]);
    if (phase === "grant") setPermission((current) => ({ ...current, status: "passed" }));
    setError(undefined);
  }

  function setPermissionAuditStatus(status: string): void {
    if ((status === "passed" || status === "failed") && permissionSteps.length === 0) {
      setPermission({ status, initialPrompt: "not-tested", grant: "not-tested", deny: "not-tested", retry: "not-tested", revoke: "unavailable", typedError: false, recoverableState: false });
      setError(undefined);
      return;
    }
    if (status === "not-tested" || status === "unavailable") {
      setPermission({ status, initialPrompt: status, grant: status, deny: status, retry: status, revoke: "unavailable", typedError: "unavailable", recoverableState: "unavailable" });
      setPermissionSteps([]);
      setError(undefined);
      return;
    }
    setPermission((current) => ({ ...current, status }));
  }

  function startSoak(): void {
    if (activeScenarioId) { setError(`Finish ${activeScenarioId} before starting the soak.`); return; }
    if (stateRef.current !== "scanning" || !sessionRef.current || sourceRef.current?.currentTrack()?.readyState !== "live") { setError("A live physical camera must be scanning before the soak starts."); return; }
    const now = new Date().toISOString();
    const snapshot = sessionRef.current.getStatistics();
    const initialLiveness = { observedAt: now, cameraActive: true, scannerState: stateRef.current, capturedFrames: snapshot.capturedFrames, admittedFrames: snapshot.admittedFrames, decodeAttempts: decodeAttemptCount(snapshot), confirmedScans: eventsRef.current.length };
    soakLivenessRef.current = [initialLiveness]; setSoakLiveness([initialLiveness]);
    const initialActivity = { type: "basic", observedAt: now, cameraActive: true, capturedFrames: snapshot.capturedFrames, admittedFrames: snapshot.admittedFrames, decodeAttempts: decodeAttemptCount(snapshot), confirmedScans: eventsRef.current.length };
    soakActivitiesRef.current = [initialActivity];
    setSoakStartedAt(now); setSoakEndedAt(undefined); setSoakStartStatistics(snapshot); setSoakFinalStatistics(undefined); setSoakActivities([initialActivity]); setError(undefined);
  }

  function freezeLastSoakInterval(intervalEnd: number, finalLiveness?: Json): void {
    const markers = soakActivitiesRef.current;
    const index = markers.length - 1;
    const current = markers[index];
    if (!current || current.runtimeObservation) return;
    const boundary = { observedAt: new Date(intervalEnd).toISOString() };
    const runtimeObservation = soakRuntimeObservation(current, boundary, intervalEnd, finalLiveness);
    if (runtimeObservation) markers[index] = { ...current, runtimeObservation };
  }

  function markSoakActivity(type: SoakActivityType): void {
    if (!soakStartedAt || soakEndedAt) { setError("Start an active soak before recording an activity."); return; }
    if (sourceRef.current?.currentTrack()?.readyState !== "live" || stateRef.current !== "scanning") { setError("Cannot mark a soak activity while the physical camera/scanner is not active."); return; }
    const snapshot = sessionRef.current?.getStatistics();
    if (!snapshot) { setError("Scanner statistics are unavailable; the soak activity cannot be recorded."); return; }
    const observedAt = Date.now();
    freezeLastSoakInterval(observedAt);
    const activity = { type, observedAt: new Date(observedAt).toISOString(), cameraActive: true, capturedFrames: snapshot.capturedFrames, admittedFrames: snapshot.admittedFrames, decodeAttempts: decodeAttemptCount(snapshot), confirmedScans: eventsRef.current.length };
    soakActivitiesRef.current = [...soakActivitiesRef.current, activity];
    setSoakActivities(soakActivitiesRef.current);
  }

  async function endSoak(): Promise<void> {
    if (!soakStartedAt || soakEndedAt || !sessionRef.current) return;
    const activeTrack = sourceRef.current?.currentTrack();
    const cameraWasActive = activeTrack?.readyState === "live";
    const ended = new Date().toISOString();
    const session = sessionRef.current;
    const device = session.getDeviceDiagnostics();
    cameraSnapshotRef.current = {
      label: activeTrack?.label || unavailable,
      settings: jsonObject(activeTrack?.getSettings() ?? device?.negotiatedSettings),
      capabilities: jsonObject(activeTrack?.getCapabilities?.() ?? device?.trackCapabilities),
      constraints: jsonObject(activeTrack?.getConstraints() ?? device?.trackConstraints),
      normalizedCapabilities: session.getCameraCapabilities(),
    };
    const snapshot = session.getStatistics();
    const finalLiveness = { observedAt: ended, cameraActive: cameraWasActive, scannerState: stateRef.current, capturedFrames: snapshot.capturedFrames, admittedFrames: snapshot.admittedFrames, decodeAttempts: decodeAttemptCount(snapshot), confirmedScans: eventsRef.current.length };
    freezeLastSoakInterval(Date.parse(ended), finalLiveness);
    soakLivenessRef.current.push(finalLiveness); setSoakLiveness([...soakLivenessRef.current]);
    await session.stop();
    await session.dispose();
    const final = session.getStatistics();
    statisticsRef.current = final; setStatistics(final); setSoakEndedAt(ended); setSoakFinalStatistics(final);
    if (!cameraWasActive) setError("The camera was not active when the soak ended; this cannot qualify as a physical-camera soak.");
  }

  function scenarioEvidence(definition: ManifestScenario): Json {
    const draft = scenarioDrafts[definition.id];
    const measurements = parseMeasurements(draft.measurements);
    const startedAtMs = draft.startedAtMs ?? Number.POSITIVE_INFINITY;
    const endedAtMs = draft.endedAt ? Date.parse(draft.endedAt) : Number.NEGATIVE_INFINITY;
    const captured = (draft.events ?? []).filter((event) => event.timestamp >= startedAtMs && event.timestamp <= endedAtMs);
    const observationSets = (draft.observationSets ?? []).filter((set) => set.timestamp >= startedAtMs && set.timestamp <= endedAtMs);
    const expectedTargets = definition.targetIds ?? [];
    const unsupportedIds = new Set(Array.isArray(measurements.unsupportedTargetIds) ? measurements.unsupportedTargetIds : []);
    const expected = expectedTargets.map((targetId) => groundTruth.targets.find((target) => target.targetId === targetId)!);
    const p9Frame = definition.id === "P9" ? observationSets.find((set) => expected.every((target) => set.observations.some((observation) => observation.barcode.text === target.payload && observation.barcode.format === target.format))) : undefined;
    const runtimeP10 = definition.id === "P10" ? (draft.p10Labels ?? []) : [];
    const comparisons = expectedTargets.map((targetId, index) => {
      const target = expected[index];
      const observed = definition.id === "P9"
        ? p9Frame?.observations.find((entry) => entry.barcode.text === target.payload && entry.barcode.format === target.format)
        : definition.id === "P10"
          ? runtimeP10.find((entry) => entry.label === targetId)
          : captured.find((event) => event.barcode.text === target.payload && event.barcode.format === target.format);
      const isUnsupported = unsupportedIds.has(targetId);
      const observedPayload = observed && "barcode" in observed ? observed.barcode.text : observed && "payload" in observed ? observed.payload : observed && "runtimePhysicalInstanceId" in observed ? target.payload : undefined;
      const observedFormat = observed && "barcode" in observed ? observed.barcode.format : observed && "format" in observed ? observed.format : observed && "runtimePhysicalInstanceId" in observed ? target.format : undefined;
      const physicalInstanceId = observed && "physicalInstanceId" in observed ? observed.physicalInstanceId : observed && "runtimePhysicalInstanceId" in observed ? observed.runtimePhysicalInstanceId : undefined;
      return {
        targetId, expectedPayload: target.payload, expectedFormat: target.format,
        ...(observedPayload ? { observedPayload, observedFormat } : {}), ...(physicalInstanceId ? { physicalInstanceId } : {}),
        result: isUnsupported ? "unsupported" : observed ? "passed" : "failed", matched: Boolean(observed),
      };
    });
    const expectedPayloads = new Set(expected.map((target) => target.payload));
    const falseConfirmedScans = definition.id === "N1" ? captured.length : captured.filter((event) => !expectedPayloads.has(event.barcode.text)).length;
    const firstSuccessfulDecode = decodeSamplesRef.current.find((sample) => sample.success && sample.at >= startedAtMs && sample.at <= endedAtMs);
    const firstConfirmed = captured[0];
    const automatic: Json = {};
    if (definition.id === "P1") Object.assign(automatic, {
      cameraStartupMs: cameraReadyMsRef.current ?? unavailable,
      firstUsableFrameMs: firstUsableFrameAtRef.current && startedAtMsRef.current ? Math.max(0, firstUsableFrameAtRef.current - startedAtMsRef.current) : unavailable,
      ttfdMs: firstSuccessfulDecode ? firstSuccessfulDecode.at - startedAtMs : unavailable,
      ttfcMs: firstConfirmed ? firstConfirmed.timestamp - startedAtMs : unavailable,
      attempts: nonNegativeDelta(draft.endStatistics, draft.startStatistics, "fastAttempts") + nonNegativeDelta(draft.endStatistics, draft.startStatistics, "balancedAttempts") + nonNegativeDelta(draft.endStatistics, draft.startStatistics, "robustAttempts"),
    });
    if (definition.id === "P6") Object.assign(automatic, {
      capturedFrames: nonNegativeDelta(draft.endStatistics, draft.startStatistics, "capturedFrames"), admittedFrames: nonNegativeDelta(draft.endStatistics, draft.startStatistics, "admittedFrames"),
      droppedFrames: nonNegativeDelta(draft.endStatistics, draft.startStatistics, "droppedFrames"), qualityRejectedFrames: nonNegativeDelta(draft.endStatistics, draft.startStatistics, "qualityRejectedFrames"),
      ttfcMs: firstConfirmed ? firstConfirmed.timestamp - startedAtMs : unavailable,
    });
    if (definition.id === "P8") {
      const negotiated = diagnosticsRef.current?.negotiatedSettings;
      const settings = negotiated && negotiated !== unavailable ? negotiated : {};
      Object.assign(automatic, { cameraResolution: { width: Number(settings.width ?? videoRef.current?.videoWidth ?? 0), height: Number(settings.height ?? videoRef.current?.videoHeight ?? 0) } });
    }
    if (definition.id === "P9") Object.assign(automatic, { sameFrameId: p9Frame?.frameId ?? unavailable, decodedCount: p9Frame ? comparisons.filter((entry) => entry.matched).length : 0, formats: p9Frame ? [...new Set(comparisons.filter((entry) => entry.matched).map((entry) => entry.observedFormat))] : [], payloadCompleteness: Boolean(p9Frame) });
    if (definition.id === "P10") Object.assign(automatic, { payloadIdentical: new Set(comparisons.map((entry) => entry.expectedPayload)).size === 1 });
    if (definition.id === "P11") Object.assign(automatic, trackingMetrics(draft.trackSamples ?? [], draft.startTracking, draft.endTracking, expectedTargets, draft.p10Labels ?? []));
    if (definition.id === "P12") {
      const batch = draft.batchState;
      Object.assign(automatic, { expectedCount: batch?.expectedCount ?? definition.expectedPhysicalTargetCount ?? 4, confirmedPhysicalInstances: batch?.confirmedPhysicalInstanceCount ?? 0, completion: batch?.status === "complete", falseCompletion: batch?.status === "complete" && batch.confirmedPhysicalInstanceCount !== batch.expectedCount });
    }
    if (definition.id === "N1") Object.assign(automatic, { confirmedScanCount: captured.length });
    return { ...measurements, ...automatic, scenarioId: definition.id, status: draft.status, startedAt: draft.startedAt ?? unavailable, endedAt: draft.endedAt ?? unavailable, durationMs: Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) ? endedAtMs - startedAtMs : 0, targetIds: expectedTargets, groundTruth: comparisons, falseConfirmedScans };
  }

  function closestStatistics(at: number, direction: "after" | "before"): TimedStatistics | undefined {
    const entries = timedStatisticsRef.current.filter((entry) => direction === "after" ? entry.at >= at : entry.at <= at);
    return direction === "after" ? entries[0] : entries.at(-1);
  }

  function performanceWindow(label: string, start: number, end: number): Json {
    const before = closestStatistics(start, "after")?.statistics ?? soakStartStatistics;
    const after = closestStatistics(end, "before")?.statistics ?? soakFinalStatistics;
    const samples = decodeSamplesRef.current.filter((entry) => entry.at >= start && entry.at <= end).map((entry) => entry.decodeMs);
    const firstDecode = decodeSamplesRef.current.find((entry) => entry.success && entry.at >= start && entry.at <= end);
    const windowEvents = eventsRef.current.filter((entry) => entry.timestamp >= start && entry.timestamp <= end);
    const captured = nonNegativeDelta(after, before, "capturedFrames");
    return {
      label, startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(), durationMs: end - start,
      ttfdMs: firstDecode ? firstDecode.at - start : unavailable, ttfcMs: windowEvents[0] ? windowEvents[0].timestamp - start : unavailable,
      decodeP50Ms: quantile(samples, 0.5), decodeP95Ms: quantile(samples, 0.95),
      effectiveDecodeFps: nonNegativeDelta(after, before, "admittedFrames") / Math.max(1, (end - start) / 1_000),
      frameDropRate: captured ? nonNegativeDelta(after, before, "droppedFrames") / captured : 0,
    };
  }

  function soakRuntimeObservation(activity: Json, nextActivity: Json | undefined, soakEnd: number, finalLiveness: Json | undefined): Json | undefined {
    const intervalStart = Date.parse(activity.observedAt);
    const intervalEnd = nextActivity ? Date.parse(nextActivity.observedAt) : soakEnd;
    if (!Number.isFinite(intervalStart) || !Number.isFinite(intervalEnd) || intervalEnd <= intervalStart) return undefined;
    if (activity.type === "basic") {
      const target = groundTruth.targets.find((entry) => entry.targetId === "qr-basic")!;
      const event = eventsRef.current.find((entry) => entry.timestamp >= intervalStart && entry.timestamp < intervalEnd && entry.barcode.text === target.payload && entry.barcode.format === target.format && entry.physicalInstanceId);
      return event ? { kind: "basic-runtime-confirmation", frameId: event.frameId, target: { targetId: target.targetId, payload: target.payload, format: target.format }, confirmedAt: new Date(event.timestamp).toISOString(), physicalInstanceId: event.physicalInstanceId } : undefined;
    }
    if (activity.type === "multi-code") {
      const expectedTargetIds = (scenarios.find((entry) => entry.id === "P9")?.targetIds ?? []).slice();
      const expected = expectedTargetIds.map((targetId) => groundTruth.targets.find((target) => target.targetId === targetId)!);
      const set = observationsRef.current.find((entry) => entry.timestamp >= intervalStart && entry.timestamp < intervalEnd && expected.every((target) => entry.observations.some((observation) => observation.barcode.text === target.payload && observation.barcode.format === target.format)));
      return set ? { kind: "multi-code-same-frame", frameId: set.frameId, observedAt: new Date(set.timestamp).toISOString(), expectedTargetIds, targets: expected.map((target) => ({ targetId: target.targetId, payload: target.payload, format: target.format })) } : undefined;
    }
    if (activity.type === "moving") {
      const allowedIds = scenarios.find((entry) => entry.id === "P9")?.targetIds ?? [];
      const samples = trackSamplesRef.current.filter((entry) => entry.at >= intervalStart && entry.at < intervalEnd);
      const intervalStatistics = trackingStatisticsSamplesRef.current.filter((entry) => entry.at >= intervalStart && entry.at < intervalEnd);
      const firstStatistics = intervalStatistics[0]?.statistics;
      const lastStatistics = intervalStatistics.at(-1)?.statistics;
      const createdTrackDelta = firstStatistics && lastStatistics ? Math.max(0, lastStatistics.createdTrackCount - firstStatistics.createdTrackCount) : Number.POSITIVE_INFINITY;
      const lostTransitionDelta = firstStatistics && lastStatistics ? Math.max(0, lastStatistics.lostTransitionCount - firstStatistics.lostTransitionCount) : Number.POSITIVE_INFINITY;
      const allowedPayloads = new Set(allowedIds.map((targetId) => groundTruth.targets.find((entry) => entry.targetId === targetId)?.payload));
      const falseTrackIds = new Set(samples.flatMap((sample) => sample.tracks).filter((track) => (track.state === "confirmed" || track.observationCount >= 2) && !allowedPayloads.has(track.payload)).map((track) => track.trackId));
      for (const targetId of allowedIds) {
        const target = groundTruth.targets.find((entry) => entry.targetId === targetId)!;
        const byPhysicalInstance = new Map<string, Array<{ sample: TrackSample; track: BarcodeTrack }>>();
        for (const sample of samples) for (const track of sample.tracks) {
          if (track.payload !== target.payload || track.format !== target.format || (track.state !== "confirmed" && track.observationCount < 2)) continue;
          const observations = byPhysicalInstance.get(track.physicalInstanceId) ?? [];
          observations.push({ sample, track }); byPhysicalInstance.set(track.physicalInstanceId, observations);
        }
        const fragmentationCount = Math.max(0, byPhysicalInstance.size - 1, createdTrackDelta - 1, lostTransitionDelta);
        for (const [physicalInstanceId, observations] of byPhysicalInstance) {
          const first = observations[0]; const last = observations.at(-1)!;
          const startCenter = { x: first.track.geometry.boundingBox.x + first.track.geometry.boundingBox.width / 2, y: first.track.geometry.boundingBox.y + first.track.geometry.boundingBox.height / 2 };
          const endCenter = { x: last.track.geometry.boundingBox.x + last.track.geometry.boundingBox.width / 2, y: last.track.geometry.boundingBox.y + last.track.geometry.boundingBox.height / 2 };
          const displacementPixels = Math.hypot(endCenter.x - startCenter.x, endCenter.y - startCenter.y);
          if (observations.length >= 2 && last.sample.frameId > first.sample.frameId && displacementPixels > 0) return {
            kind: "moving-track-displacement", targetId, payload: target.payload, format: target.format, physicalInstanceId,
            startFrameId: first.sample.frameId, endFrameId: last.sample.frameId, startObservedAt: new Date(first.sample.at).toISOString(), endObservedAt: new Date(last.sample.at).toISOString(),
            startCenter, endCenter, displacementPixels, observedFrameCount: observations.length, identitySwitchCount: fragmentationCount, fragmentationCount, falseTrackCount: falseTrackIds.size,
          };
        }
      }
      return undefined;
    }
    const nextCounters = nextActivity ?? finalLiveness;
    if (!nextCounters) return undefined;
    return {
      kind: "negative-runtime-interval", startedAt: activity.observedAt, endedAt: new Date(intervalEnd).toISOString(),
      capturedFrameDelta: Number(nextCounters.capturedFrames) - Number(activity.capturedFrames), admittedFrameDelta: Number(nextCounters.admittedFrames) - Number(activity.admittedFrames),
      decodeAttemptDelta: Number(nextCounters.decodeAttempts) - Number(activity.decodeAttempts), confirmedScanDelta: Number(nextCounters.confirmedScans) - Number(activity.confirmedScans),
    };
  }

  function soakRuntimeActivityQualifies(activity: Json): boolean {
    const observation = jsonObject(activity.runtimeObservation);
    if (activity.type === "basic") return observation.kind === "basic-runtime-confirmation";
    if (activity.type === "multi-code") return observation.kind === "multi-code-same-frame" && Array.isArray(observation.targets) && observation.targets.length === 4;
    if (activity.type === "moving") return observation.kind === "moving-track-displacement" && observation.displacementPixels > 0 && observation.observedFrameCount >= 2 && observation.identitySwitchCount === 0 && observation.fragmentationCount === 0 && observation.falseTrackCount === 0;
    return observation.kind === "negative-runtime-interval" && observation.capturedFrameDelta > 0 && observation.admittedFrameDelta > 0 && observation.decodeAttemptDelta > 0 && observation.confirmedScanDelta === 0;
  }

  function longRunDraft(): Json | "unavailable" {
    if (!soakStartedAt || !soakEndedAt || !soakFinalStatistics) return unavailable;
    const start = Date.parse(soakStartedAt); const end = Date.parse(soakEndedAt); const durationMs = end - start;
    const soakEvents = eventsRef.current.filter((event) => event.timestamp >= start && event.timestamp <= end);
    const activityMarkers = [...soakActivitiesRef.current].filter((entry) => Date.parse(entry.observedAt) >= start && Date.parse(entry.observedAt) <= end).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    const livenessSamples = [...soakLivenessRef.current].filter((entry) => Date.parse(entry.observedAt) >= start && Date.parse(entry.observedAt) <= end).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    const finalLiveness = livenessSamples.at(-1);
    const activities: Json[] = activityMarkers.map((entry, index) => ({ ...entry, runtimeObservation: entry.runtimeObservation ?? soakRuntimeObservation(entry, activityMarkers[index + 1], end, finalLiveness) }));
    const falseConfirmedScans = soakEvents.filter((event) => {
      const activity = [...activities].reverse().find((entry) => Date.parse(entry.observedAt) <= event.timestamp);
      if (!activity || activity.type === "negative") return true;
      const ids = activity.type === "basic" ? ["qr-basic"] : ["multi-qr", "multi-data-matrix", "multi-code128", "multi-ean13"];
      return !ids.some((id) => groundTruth.targets.find((target) => target.targetId === id)?.payload === event.barcode.text);
    }).length;
    const middleStart = start + (durationMs - 300_000) / 2;
    const windows = durationMs >= 1_800_000 ? [performanceWindow("first-5-min", start, start + 300_000), performanceWindow("middle-5-min", middleStart, middleStart + 300_000), performanceWindow("last-5-min", end - 300_000, end)] : [];
    const requiredActivities = ["basic", "multi-code", "moving", "negative"].every((type) => activities.some((entry) => entry.type === type));
    const markerTimes = activities.map((entry) => Date.parse(entry.observedAt));
    const negativeIndex = activities.findIndex((entry) => entry.type === "negative");
    const activitiesSpanBothHalves = ["basic", "multi-code", "moving", "negative"].every((type) => activities.some((entry) => entry.type === type && Date.parse(entry.observedAt) < start + durationMs / 2) && activities.some((entry) => entry.type === type && Date.parse(entry.observedAt) >= start + durationMs / 2));
    const activityIntervalsProgress = activities.every((entry, index) => index === activities.length - 1 || (activities[index + 1].capturedFrames > entry.capturedFrames && activities[index + 1].admittedFrames > entry.admittedFrames && activities[index + 1].decodeAttempts > entry.decodeAttempts));
    const activityCoverageComplete = activities.length > 0 && markerTimes[0] === start && end - markerTimes.at(-1)! <= 600_000 && markerTimes.every((value, index) => index === 0 || (value > markerTimes[index - 1] && value - markerTimes[index - 1] <= 600_000)) && negativeIndex >= 0 && negativeIndex < activities.length - 1 && activitiesSpanBothHalves && activityIntervalsProgress;
    const livenessComplete = livenessSamples.length >= 2 && Date.parse(livenessSamples[0].observedAt) === start && Date.parse(livenessSamples.at(-1)!.observedAt) === end && livenessSamples.every((entry) => entry.cameraActive && entry.scannerState === "scanning") && livenessSamples.every((entry, index) => index === 0 || (Date.parse(entry.observedAt) > Date.parse(livenessSamples[index - 1].observedAt) && Date.parse(entry.observedAt) - Date.parse(livenessSamples[index - 1].observedAt) <= 10_000 && entry.capturedFrames >= livenessSamples[index - 1].capturedFrames && entry.admittedFrames >= livenessSamples[index - 1].admittedFrames && entry.decodeAttempts >= livenessSamples[index - 1].decodeAttempts));
    const firstLiveness = livenessSamples[0]; const finalActivity = activities.at(-1);
    const runtimeActivityComplete = activities.every(soakRuntimeActivityQualifies);
    const counterBoundaryComplete = Boolean(firstLiveness && finalLiveness && finalActivity
      && activities[0]?.capturedFrames === firstLiveness.capturedFrames && activities[0]?.admittedFrames === firstLiveness.admittedFrames && activities[0]?.decodeAttempts === firstLiveness.decodeAttempts
      && finalLiveness.capturedFrames > finalActivity.capturedFrames && finalLiveness.admittedFrames > finalActivity.admittedFrames && finalLiveness.decodeAttempts > finalActivity.decodeAttempts);
    const finalResources = { activeDecode: soakFinalStatistics.activeDecodeCount, pendingFrames: soakFinalStatistics.pendingFrameCount, activeTasks: soakFinalStatistics.activeTaskCount, liveNativeResults: soakFinalStatistics.wasmActiveNativeResultCount, wasmInputAllocations: soakFinalStatistics.wasmInputAllocationBytes, controlledMemory: soakFinalStatistics.finalControlledMemory };
    return {
      qualifyingPhysicalSoak: evidenceType === "physical-mobile" && durationMs >= 1_800_000 && requiredActivities && activityCoverageComplete && runtimeActivityComplete && livenessComplete && counterBoundaryComplete && activities.every((entry) => entry.cameraActive) && nonNegativeDelta(soakFinalStatistics, soakStartStatistics, "capturedFrames") > 0 && nonNegativeDelta(soakFinalStatistics, soakStartStatistics, "admittedFrames") > 0 && falseConfirmedScans === 0 && nonNegativeDelta(soakFinalStatistics, soakStartStatistics, "staleEvents") === 0 && Object.values(finalResources).every((value) => value === 0),
      startedAt: soakStartedAt, endedAt: soakEndedAt, durationMs, cameraActive: livenessComplete, endedCameraActive: livenessSamples.at(-1)?.cameraActive === true, activities, livenessSamples,
      capturedFrames: nonNegativeDelta(soakFinalStatistics, soakStartStatistics, "capturedFrames"), admittedFrames: nonNegativeDelta(soakFinalStatistics, soakStartStatistics, "admittedFrames"), droppedFrames: nonNegativeDelta(soakFinalStatistics, soakStartStatistics, "droppedFrames"),
      decodeAttempts: nonNegativeDelta(soakFinalStatistics, soakStartStatistics, "fastAttempts") + nonNegativeDelta(soakFinalStatistics, soakStartStatistics, "balancedAttempts") + nonNegativeDelta(soakFinalStatistics, soakStartStatistics, "robustAttempts"),
      confirmedScans: soakEvents.length, falseConfirmedScans, suppressedRepeats: nonNegativeDelta(soakFinalStatistics, soakStartStatistics, "suppressedRepeats"),
      cameraTrackEndings: nonNegativeDelta(soakFinalStatistics, soakStartStatistics, "cameraTrackEndings"), scannerRestarts: Math.max(0, soakFinalStatistics.cameraRecovery.restarts - (soakStartStatistics?.cameraRecovery.restarts ?? 0)),
      workerRestarts: Math.max(0,
        nonNegativeDelta(soakFinalStatistics, soakStartStatistics, "workerCreatedCount")
        - ((soakStartStatistics?.workerCreatedCount ?? 0) === 0 && soakFinalStatistics.workerCreatedCount > 0 ? 1 : 0),
      ), errors: auditLogRef.current.filter((entry) => entry.type === "error" && entry.timestamp >= start && entry.timestamp <= end).length,
      stalePublicEvents: nonNegativeDelta(soakFinalStatistics, soakStartStatistics, "staleEvents"), finalResources, windows,
      activityCoverageComplete, runtimeActivityComplete, reviewWarning: "Markers define intervals; qualification additionally requires runtime-confirmed qr-basic, one same-frame fixed four-code set, stable tracked displacement, and a live negative interval with zero confirmed results.",
    };
  }

  function exportDraft(): void {
    const track = sourceRef.current?.currentTrack();
    const cameraSnapshot = cameraSnapshotRef.current;
    const caps = (track ? sessionRef.current?.getCameraCapabilities() : cameraSnapshot?.normalizedCapabilities ?? sessionRef.current?.getCameraCapabilities()) as Json | undefined;
    const zoom = caps?.zoom;
    const normalizedSwitchSteps = switchSteps.slice(-3);
    const normalizedSwitchSequence = normalizedSwitchSteps.map((entry) => entry.camera);
    const browserReportedSwitchMetadata = normalizedSwitchSteps.every((entry) => {
      const settings = jsonObject(entry.settings);
      return entry.browserReported === true && entry.deviceId !== unavailable && entry.facingMode !== unavailable && entry.label !== unavailable
        && settings.deviceId === entry.deviceId && settings.facingMode === entry.facingMode;
    });
    const switchDeviceIds = normalizedSwitchSteps.map((entry) => entry.deviceId);
    const distinctRearAndFrontDevices = switchDeviceIds.length === 3 && switchDeviceIds[0] === switchDeviceIds[2] && switchDeviceIds[0] !== switchDeviceIds[1];
    const cameraSwitchTested = normalizedSwitchSequence.join("|") === "rear|front|rear" && browserReportedSwitchMetadata && distinctRearAndFrontDevices;
    const switchedSteps = normalizedSwitchSteps.filter((entry) => entry.kind === "switch");
    const orientationSequence = orientationFrames.map((entry) => entry.orientation).slice(-3);
    const orientationComplete = orientationSequence.join("|") === "portrait|landscape|portrait";
    const lifecycle = backgroundObservations.slice(-3);
    const lifecycleComplete = lifecycle.map((entry) => entry.phase).join("|") === "foreground-before|background|foreground-after" && lifecycle[1]?.visibilityState === "hidden" && lifecycle[2]?.visibilityState === "visible";
    const backgroundStale = lifecycle.length === 3 ? Math.max(0, Number(lifecycle[2].staleEvents ?? 0) - Number(lifecycle[0].staleEvents ?? 0)) : unavailable;
    const postOfflineRequests = offlineAtRef.current === undefined ? [] : observedRequestsRef.current.filter((entry) => entry.startedAt >= offlineAtRef.current!);
    const cloudDecodeRequests = finiteOrUnavailable(networkReview.cloudDecodeRequests);
    const networkPassed = wentOfflineDuringSession && framesObservedOffline && confirmedResultObservedOffline && networkReview.payloadRemainedLocal && cloudDecodeRequests === 0 && !networkReview.barcodePixelsUploaded && !networkReview.barcodePayloadUploaded;
    const draft = {
      schemaVersion: "beta4-device-lab-draft-3", admissibleEvidence: false, reviewRequired: true,
      reviewWarnings: ["This export is not repository evidence.", "A reviewer must validate declarations, Ground Truth, source identity, network audit, privacy, repository cleanliness, and soak fields before schema conversion."],
      sourceCommit, sourceTree, sdkVersion: BROWSER_SDK_VERSION, evidenceType,
      ...(/^https:\/\//.test(location.origin) && !/\b(localhost|127\.0\.0\.1|\[::1\])\b/i.test(location.hostname) && deploymentId ? { deployment: { url: location.origin, deploymentId, gitCommit: sourceCommit } } : {}),
      ...(evidenceType === "remote-physical-device" ? { remoteHardware: { provider: remoteProvider || unavailable, providerSessionId: remoteProviderSessionId || unavailable, providerDeviceId: remoteProviderDeviceId || unavailable, realHardware: "review-required", attestationUrl: remoteAttestationUrl || unavailable, attestationSha256: remoteAttestationSha256 || unavailable } } : {}),
      session: { sessionId, startedAt: startedAtRef.current ?? unavailable, endedAt: new Date().toISOString(), testerId: testerId || unavailable, hardwareAccess: evidenceType === "physical-mobile" ? "physical-local" : evidenceType === "remote-physical-device" ? "remote-device-farm" : evidenceType === "desktop-camera" ? "desktop-local" : "simulated" },
      device: { declaredModel: declaredModel || unavailable, manufacturer: manufacturer || unavailable, operatingSystem: operatingSystem || unavailable, operatingSystemVersion: operatingSystemVersion || unavailable },
      browser: { name: browserName || unavailable, version: browserVersion || unavailable, userAgent: browserFacts?.userAgent ?? unavailable },
      camera: { label: track?.label || cameraSnapshot?.label || unavailable, settings: track?.getSettings() ?? cameraSnapshot?.settings ?? diagnosticsRef.current?.negotiatedSettings ?? {}, capabilities: track?.getCapabilities?.() ?? cameraSnapshot?.capabilities ?? diagnosticsRef.current?.trackCapabilities ?? {}, constraints: track?.getConstraints() ?? cameraSnapshot?.constraints ?? diagnosticsRef.current?.trackConstraints ?? {} },
      capabilityEvidence: {
        torch: { reported: caps?.torch === true, on: caps?.torch ? capabilityResults.torchOn : "unsupported", off: caps?.torch ? capabilityResults.torchOff : "unsupported" },
        zoom: { reported: Boolean(zoom), minimum: zoom?.min ?? unavailable, maximum: zoom?.max ?? unavailable, current: zoom?.current ?? unavailable, manualZoom: (["zoomMin", "zoomMiddle", "zoomMax"] as const).every((operation) => manualZoomAuditPassed(zoomAudit, operation)) ? "passed" : [capabilityResults.zoomMin, capabilityResults.zoomMiddle, capabilityResults.zoomMax].some((entry) => entry === "failed") ? "failed" : zoom ? "not-tested" : "unsupported", autoZoom: zoom ? capabilityResults.autoZoom : "unsupported", manualOverride: zoom ? (manualZoomAuditPassed(zoomAudit, "manualOverride") ? "passed" : capabilityResults.manualOverride === "failed" ? "failed" : "not-tested") : "unsupported", cooldown: zoom ? capabilityResults.cooldown : "unsupported" },
        focus: { reported: Boolean(caps?.focusMode), result: caps?.focusMode ? capabilityResults.focus : "unavailable" },
      },
      permissionLifecycle: permission.status === "not-tested" || permission.status === "unavailable"
        ? { ...permission, noUnhandledRejection: unavailable, unhandledRejectionCount: 0, steps: [] }
        : { ...permission, noUnhandledRejection: unhandledRejectionCountRef.current === 0, unhandledRejectionCount: unhandledRejectionCountRef.current, steps: permissionSteps },
      cameraSwitch: cameraSwitchUnavailable ? { tested: false, result: "unavailable", sequence: [], oldTrackStopped: unavailable, newCameraActive: unavailable, generationInvalidated: unavailable, staleResultCount: 0 } : { tested: normalizedSwitchSteps.length === 3, result: cameraSwitchTested && switchedSteps.every((entry) => entry.oldTrackStopped && entry.newCameraActive && entry.generationInvalidated && entry.staleResults === 0) ? "passed" : normalizedSwitchSteps.length === 3 ? "failed" : "not-tested", sequence: normalizedSwitchSequence, browserReportedMetadataComplete: browserReportedSwitchMetadata, distinctRearAndFrontDevices, deviceIds: switchDeviceIds, oldTrackStopped: switchedSteps.length ? switchedSteps.every((entry) => entry.oldTrackStopped) : unavailable, newCameraActive: switchedSteps.length ? switchedSteps.every((entry) => entry.newCameraActive) : unavailable, generationInvalidated: switchedSteps.length ? switchedSteps.every((entry) => entry.generationInvalidated) : unavailable, staleResultCount: switchedSteps.reduce((sum, entry) => sum + Number(entry.staleResults ?? 0), 0), draftReviewObservations: normalizedSwitchSteps },
      orientation: { tested: orientationComplete, result: orientationComplete && Object.values(orientationChecks).every(Boolean) ? "passed" : orientationComplete ? "failed" : "not-tested", sequence: orientationSequence, decodedGeometryCorrect: orientationChecks.decoded, trackingGeometryCorrect: orientationChecks.tracking, overlayGeometryCorrect: orientationChecks.overlay, noMirrorOrQuarterTurnOffset: orientationChecks.noMirrorOrQuarterTurn, frameDimensions: orientationFrames.slice(-3).map((entry) => ({ orientation: entry.orientation, width: entry.width, height: entry.height })), geometrySnapshots: orientationFrames.slice(-3) },
      backgroundForeground: { tested: lifecycleComplete, waitDurationMs: lifecycle.length === 3 ? Math.max(0, Date.parse(lifecycle[2].observedAt) - Date.parse(lifecycle[1].observedAt)) : unavailable, result: backgroundResult, observations: lifecycle.map(({ phase, mediaStreamTrackReadyState, scannerSessionState, workerState: runtimeWorkerState }: Json) => ({ phase, mediaStreamTrackReadyState, scannerSessionState, workerState: runtimeWorkerState })), recoveryTimeMs: finiteOrUnavailable(backgroundRecoveryMs), staleResultCount: backgroundStale, silentDeadState },
      scenarios: scenarios.map(scenarioEvidence), longRun: longRunDraft(),
      thermalObservation: { source: thermalSource, deviceBecameWarm: thermalSource === "unavailable" ? unavailable : deviceBecameWarm === "true", visibleThrottling: thermalSource === "unavailable" ? unavailable : visibleThrottling === "true", performanceDegraded: thermalSource === "unavailable" ? unavailable : performanceDegraded === "true", notes: thermalNotes },
      batteryObservation: batteryStart && batteryEnd ? { source: "tester-recorded", startPercent: Number(batteryStart), endPercent: Number(batteryEnd), durationMs: startedAtMsRef.current ? Date.now() - startedAtMsRef.current : 0, screenBrightnessSetting: brightnessSetting || unavailable, chargingState } : { source: "unavailable" },
      networkIsolation: { tested: wentOfflineDuringSession, result: networkPassed ? "passed" : wentOfflineDuringSession ? "failed" : "not-tested", scannerContinuedAfterNetworkDisabled: wentOfflineDuringSession ? framesObservedOffline && confirmedResultObservedOffline : "not-tested", payloadRemainedLocal: networkReview.payloadRemainedLocal, cloudDecodeRequests, barcodePixelsUploaded: networkReview.barcodePixelsUploaded, barcodePayloadUploaded: networkReview.barcodePayloadUploaded, offlineObservedAt: offlineAtRef.current ? new Date(offlineAtRef.current).toISOString() : unavailable, postOfflineResourceRequests: postOfflineRequests },
      fieldSources: { "device.declaredModel": "declared-by-tester", "device.manufacturer": "declared-by-tester", "device.operatingSystem": "declared-by-tester", "device.operatingSystemVersion": "declared-by-tester", "browser.name": "declared-by-tester", "browser.version": "declared-by-tester", "browser.userAgent": "browser-reported", "camera.settings": "camera-api-reported", "camera.capabilities": "camera-api-reported", "camera.constraints": "camera-api-reported", ...(evidenceType === "remote-physical-device" ? { "remoteHardware.provider": "provider-reported", "remoteHardware.providerSessionId": "provider-reported", "remoteHardware.providerDeviceId": "provider-reported", "remoteHardware.attestationUrl": "provider-reported", "remoteHardware.attestationSha256": "provider-reported", "remoteHardware.realHardware": "review-required" } : {}) },
      sensitiveDataReviewed: false, rightsReviewed: false, repositoryDirty: sourceRepositoryDirty, repositoryCleanlinessReview: "review-required", browserFacts, cameraDevices, sessionStatistics: statisticsRef.current ?? unavailable, confirmedPublicEvents: eventsRef.current, observationSets: observationsRef.current, trackingSamples: trackSamplesRef.current, lifecycleDiagnostics: auditLogRef.current, observedResourceRequests: observedRequests, zoomAudit,
    };
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${sessionId}-device-lab-review-required-draft.json`; link.click(); URL.revokeObjectURL(url);
  }

  const cameraSettings = diagnostics?.negotiatedSettings as Json | undefined;
  const cameraCapabilities = diagnostics?.trackCapabilities as Json | undefined;
  const sessionLocked = Boolean(activeScenarioId || (soakStartedAt && !soakEndedAt));

  return <div className="deviceLab">
    <section className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "start" }}><div><h1>Scanly Device Lab</h1><p className="small">Physical-camera evidence capture. Every export remains a review-required draft; selecting a hardware type or PASS never makes evidence admissible.</p></div><a className="btn" href="/device-lab/targets">Open fixed targets</a></div>
      <div className="diagnosticGrid"><Fact label="SDK version" value={BROWSER_SDK_VERSION}/><Fact label="Source commit" value={sourceCommit}/><Fact label="Source tree" value={sourceTree}/><Fact label="Repository dirty at build" value={sourceRepositoryDirty}/><Fact label="Session ID" value={sessionId}/><Fact label="Scanner state" value={state}/><Fact label="Evidence type" value={evidenceType}/><Fact label="Browser / User Agent" value={browserFacts?.userAgent}/><Fact label="Orientation" value={browserFacts?.screenOrientation}/><Fact label="Viewport" value={browserFacts?.viewport}/><Fact label="Network" value={browserFacts ? (browserFacts.online ? "online" : "offline") : undefined}/></div>
    </section>

    <section className="card">
      <div className="deviceLabVideo"><video ref={videoRef} muted playsInline aria-label="Device Lab camera preview"/><div className="overlay" aria-hidden="true">{trackOverlays.map((track) => <div key={track.trackId} style={trackOverlayStyle(track, videoRef.current, overlayFrame)}/>)}</div></div>
      <div className="row" style={{ marginTop: 12 }}><button className="btn primary" type="button" disabled={sessionLocked} onClick={() => void start()}>Start / retry camera session</button><button className="btn" type="button" disabled={sessionLocked} onClick={() => void stop()}>Stop</button><button className="btn" type="button" disabled={sessionLocked} onClick={() => void switchFacingMode("user")}>Switch to front</button><button className="btn" type="button" disabled={sessionLocked} onClick={() => void switchFacingMode("environment")}>Switch to rear</button></div>
      {error && <p role="alert" className="errorText">{error}</p>}
    </section>

    <section className="card"><h2>Camera API diagnostics and capabilities</h2>
      <div className="diagnosticGrid"><Fact label="Camera label" value={sourceRef.current?.currentTrack()?.label}/><Fact label="width" value={cameraSettings?.width}/><Fact label="height" value={cameraSettings?.height}/><Fact label="frameRate" value={cameraSettings?.frameRate}/><Fact label="facingMode" value={cameraSettings?.facingMode}/><Fact label="torch" value={cameraCapabilities?.torch}/><Fact label="zoom" value={cameraCapabilities?.zoom}/><Fact label="focus" value={cameraCapabilities?.focusMode}/></div>
      <Details label="MediaTrackSettings (raw)" value={sourceRef.current?.currentTrack()?.getSettings() ?? diagnostics?.negotiatedSettings}/><Details label="MediaTrackCapabilities (raw)" value={sourceRef.current?.currentTrack()?.getCapabilities?.() ?? diagnostics?.trackCapabilities}/><Details label="MediaTrackConstraints (raw)" value={sourceRef.current?.currentTrack()?.getConstraints() ?? diagnostics?.trackConstraints}/><Details label="Constraint negotiation" value={diagnostics?.attempts}/><Details label="Browser-exposed cameras" value={cameraDevices}/>
      <div className="row"><button className="btn" onClick={() => void capability("torchOn")}>Torch on</button><button className="btn" onClick={() => void capability("torchOff")}>Torch off</button><button className="btn" onClick={() => void capability("zoomMin")}>Zoom min</button><button className="btn" onClick={() => void capability("zoomMiddle")}>Zoom middle</button><button className="btn" onClick={() => void capability("zoomMax")}>Zoom max</button><button className="btn" onClick={() => void capability("autoZoom")}>Auto zoom</button><button className="btn" onClick={() => void capability("manualOverride")}>Manual override</button><button className="btn" onClick={() => void capability("focus")}>Focus</button></div>
      <p className="small">Auto zoom resets to the minimum and arms ScannerSession. Keep the fixed qr-small target continuously visible through the first zoom, the full 1500ms cooldown, and a later second zoom. PASS requires browser-reported settings changes, confirmed frames with unchanged zoom and no auto-zoom during cooldown, then a new change after cooldown.</p><Details label="Capability operation results" value={capabilityResults}/><Details label="Zoom runtime audit" value={zoomAudit}/>
    </section>

    <section className="card"><h2>P1–P12 + N1 scenario capture</h2><p className="small">Run exactly one scenario at a time. Runtime timestamps isolate in-flight frames. P9 uses a single observation set; P10/P11 use tracker identity; P12 uses BatchScanSession.</p>
      <div className="scenarioList">{scenarios.map((scenario) => { const draft = scenarioDrafts[scenario.id]; const completed = Boolean(draft.startedAt && draft.endedAt); return <div className="fact" key={scenario.id}><div className="row" style={{ justifyContent: "space-between" }}><strong>{scenario.id} — {scenario.name}</strong><select disabled={!completed} value={completed ? draft.status : "not-tested"} onChange={(event) => setScenarioDrafts((current) => ({ ...current, [scenario.id]: { ...current[scenario.id], status: event.target.value as ScenarioStatus } }))}><option value="not-tested">not-tested</option><option value="passed">passed</option><option value="failed">failed</option></select></div><textarea aria-label={`${scenario.id} measurements`} value={draft.measurements} onChange={(event) => setScenarioDrafts((current) => ({ ...current, [scenario.id]: { ...current[scenario.id], measurements: event.target.value } }))} rows={8}/>{scenario.id === "P10" && <><p className="small">Show only label A and record it, then show only label B and record it. The buttons bind the fixed tester label to the one live runtime track ID.</p><div className="row"><button className="btn" disabled={activeScenarioId !== "P10"} onClick={() => labelP10Instance("same-payload-a")}>Record label A runtime ID</button><button className="btn" disabled={activeScenarioId !== "P10"} onClick={() => labelP10Instance("same-payload-b")}>Record label B runtime ID</button></div><Details label="P10 label-to-runtime bindings" value={p10Labels}/></>}{scenario.id === "P11" && <><p className="small">For at least two targets, record the runtime ID before movement and again after movement. Identity continuity is computed from these tester-labelled bindings.</p><div className="row">{(scenario.targetIds ?? []).slice(0, 2).map((id) => <button className="btn" key={id} disabled={activeScenarioId !== "P11"} onClick={() => labelP11Instance(id)}>Record {id} runtime ID</button>)}</div><Details label="P11 label-to-runtime bindings" value={p11Labels}/></>}<div className="row"><button className="btn" type="button" disabled={Boolean(activeScenarioId) || Boolean(soakStartedAt && !soakEndedAt)} onClick={() => beginScenario(scenario.id)}>Begin {scenario.id}</button><button className="btn" type="button" disabled={activeScenarioId !== scenario.id} onClick={() => void endScenario(scenario.id)}>End {scenario.id}</button><span className="small">{draft.startedAt ? `${draft.startedAt} → ${draft.endedAt ?? "active"}; events ${draft.events?.length ?? 0}` : "not run"}</span></div></div>; })}</div>
    </section>

    <section className="card"><h2>Permission, switching, orientation, and lifecycle</h2>
      <div className="formGrid"><Select label="Permission audit status" value={permission.status} values={["not-tested", "unavailable", "passed", "failed"]} onChange={setPermissionAuditStatus}/><Select label="Initial permission prompt" value={permission.initialPrompt} values={["not-tested", "observed", "failed", "unavailable"]} onChange={(value) => setPermission((current) => ({ ...current, initialPrompt: value }))}/><Select label="Grant" value={permission.grant} values={["not-tested", "passed", "failed", "unavailable"]} onChange={(value) => setPermission((current) => ({ ...current, grant: value }))}/><Select label="Deny" value={permission.deny} values={["not-tested", "passed", "failed", "unavailable"]} onChange={(value) => setPermission((current) => ({ ...current, deny: value }))}/><Select label="Retry" value={permission.retry} values={["not-tested", "passed", "failed", "unavailable"]} onChange={(value) => setPermission((current) => ({ ...current, retry: value }))}/><Select label="Revoke" value={permission.revoke} values={["unavailable", "passed", "failed"]} onChange={(value) => setPermission((current) => ({ ...current, revoke: value }))}/><Check label="Typed error observed" checked={permission.typedError === true} onChange={(checked) => setPermission((current) => ({ ...current, typedError: checked }))}/><Check label="Recoverable state observed" checked={permission.recoverableState === true} onChange={(checked) => setPermission((current) => ({ ...current, recoverableState: checked }))}/><Check label="Camera switching unavailable" checked={cameraSwitchUnavailable} onChange={setCameraSwitchUnavailable}/></div>
      <p className="small">Record only after performing the real browser/OS action. The enforced audit order is prompt → deny (typed error) → retry → grant, then optional revoke. Camera-switch PASS additionally requires browser-reported deviceId, facingMode, label and settings for each rear/front/rear step; the front deviceId must differ and the final rear must return to the initial deviceId.</p><div className="row" style={{ marginTop: 10 }}><button className="btn" disabled={permissionSteps.length !== 0} onClick={() => recordPermissionStep("initial-prompt")}>Record prompt</button><button className="btn" disabled={permissionSteps.length !== 1} onClick={() => recordPermissionStep("deny")}>Record deny</button><button className="btn" disabled={permissionSteps.length !== 2} onClick={() => recordPermissionStep("retry")}>Record retry</button><button className="btn" disabled={permissionSteps.length !== 3} onClick={() => recordPermissionStep("grant")}>Record grant</button><button className="btn" disabled={permissionSteps.length !== 4 || permission.revoke === "unavailable"} onClick={() => recordPermissionStep("revoke")}>Record revoke</button><button className="btn" onClick={() => setPermissionSteps([])}>Reset permission audit</button></div><Details label="Permission audit trail" value={permissionSteps}/><Details label="Rear/front/rear browser-reported switch observations" value={switchSteps}/>
      <h3>Orientation: portrait → landscape → portrait</h3><div className="row"><button className="btn" onClick={captureOrientation}>Capture current geometry</button></div><div className="formGrid"><Check label="Decoded geometry correct" checked={orientationChecks.decoded} onChange={(checked) => setOrientationChecks((current) => ({ ...current, decoded: checked }))}/><Check label="Tracking geometry correct" checked={orientationChecks.tracking} onChange={(checked) => setOrientationChecks((current) => ({ ...current, tracking: checked }))}/><Check label="Overlay geometry correct" checked={orientationChecks.overlay} onChange={(checked) => setOrientationChecks((current) => ({ ...current, overlay: checked }))}/><Check label="No 90°/mirror offset" checked={orientationChecks.noMirrorOrQuarterTurn} onChange={(checked) => setOrientationChecks((current) => ({ ...current, noMirrorOrQuarterTurn: checked }))}/></div><Details label="Orientation geometry snapshots" value={orientationFrames}/>
      <h3>Background / foreground</h3><p className="small">Capture foreground-before, then really background the browser. Hidden/visible phases are recorded from visibilitychange; there is no synthetic “background” button.</p><div className="row"><button className="btn" onClick={captureForegroundBefore}>Capture foreground-before</button></div><div className="formGrid"><Select label="Outcome" value={backgroundResult} values={["not-tested", "recovered", "explicit-restart-required", "failed"]} onChange={setBackgroundResult}/><Text label="Recovery time ms (override only if measured)" value={backgroundRecoveryMs} onChange={setBackgroundRecoveryMs}/><Check label="Silent dead state observed (must be false)" checked={silentDeadState} onChange={setSilentDeadState}/></div><Details label="Lifecycle observations" value={backgroundObservations}/>
      <h3>Network isolation review</h3><p className="small">After the app/WASM load, disable the network and decode a target. The runtime records post-offline frames/results and resource requests; the tester/reviewer must inspect DevTools and record upload claims explicitly.</p><div className="formGrid"><Check label="Payload remained local" checked={networkReview.payloadRemainedLocal} onChange={(value) => setNetworkReview((current) => ({ ...current, payloadRemainedLocal: value }))}/><Text label="Cloud decode request count" value={networkReview.cloudDecodeRequests} onChange={(value) => setNetworkReview((current) => ({ ...current, cloudDecodeRequests: value }))}/><Check label="Barcode pixels uploaded (must be false)" checked={networkReview.barcodePixelsUploaded} onChange={(value) => setNetworkReview((current) => ({ ...current, barcodePixelsUploaded: value }))}/><Check label="Barcode payload uploaded (must be false)" checked={networkReview.barcodePayloadUploaded} onChange={(value) => setNetworkReview((current) => ({ ...current, barcodePayloadUploaded: value }))}/></div><Fact label="Frames observed after offline" value={framesObservedOffline}/><Fact label="Confirmed result observed after offline" value={confirmedResultObservedOffline}/>
    </section>

    <section className="card"><h2>30-minute physical-mobile camera soak</h2><p className="small">Start only with a live physical camera; Start soak also begins the basic interval. Each marker ends the prior scene and begins the named one. Exercise all four scenes (basic, multi-code, moving, and negative) in both the first and second half, keep marker gaps at ten minutes or less, and leave no more than ten minutes after the final marker. The lab binds each interval to runtime evidence: qr-basic confirmation, all four fixed P9 targets in one frame, stable tracked displacement, or live negative-scene frame/decode progress with zero confirmations. After negative, mark another scene before ending. One-second liveness samples prove the camera and scanner stayed active. End freezes camera capabilities, then disposes the decoder before final-resource capture.</p><div className="row"><button className="btn primary" disabled={Boolean(activeScenarioId) || Boolean(soakStartedAt && !soakEndedAt)} onClick={startSoak}>Start soak + basic</button><button className="btn" onClick={() => markSoakActivity("basic")}>Mark basic</button><button className="btn" onClick={() => markSoakActivity("multi-code")}>Mark multi-code</button><button className="btn" onClick={() => markSoakActivity("moving")}>Mark moving</button><button className="btn" onClick={() => markSoakActivity("negative")}>Mark negative</button><button className="btn" onClick={() => void endSoak()}>End soak and dispose</button></div><Fact label="Soak start" value={soakStartedAt}/><Fact label="Soak end" value={soakEndedAt}/><Details label="Soak activity markers" value={soakActivities}/><Details label="Soak camera/scanner liveness" value={soakLiveness}/><Details label="Computed soak draft / drift windows / final resources" value={longRunDraft()}/></section>

    <section className="card"><h2>Tester metadata, thermal, and battery</h2><div className="formGrid"><label>Evidence type<select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as EvidenceType)}><option value="simulated">simulated</option><option value="desktop-camera">desktop-camera</option><option value="physical-mobile">physical-mobile</option><option value="remote-physical-device">remote-physical-device</option></select></label><Text label="Tester ID" value={testerId} onChange={setTesterId}/><Text label="Declared model (never infer from UA)" value={declaredModel} onChange={setDeclaredModel}/><Text label="Manufacturer" value={manufacturer} onChange={setManufacturer}/><Text label="Operating system" value={operatingSystem} onChange={setOperatingSystem}/><Text label="OS version" value={operatingSystemVersion} onChange={setOperatingSystemVersion}/><Text label="Browser name" value={browserName} onChange={setBrowserName}/><Text label="Browser version" value={browserVersion} onChange={setBrowserVersion}/><Text label="Deployment ID" value={deploymentId} onChange={setDeploymentId}/>{evidenceType === "remote-physical-device" && <><Text label="Remote provider" value={remoteProvider} onChange={setRemoteProvider}/><Text label="Provider session ID" value={remoteProviderSessionId} onChange={setRemoteProviderSessionId}/><Text label="Provider device ID" value={remoteProviderDeviceId} onChange={setRemoteProviderDeviceId}/><Text label="Provider attestation URL" value={remoteAttestationUrl} onChange={setRemoteAttestationUrl}/><Text label="Attestation SHA-256" value={remoteAttestationSha256} onChange={setRemoteAttestationSha256}/></>}<Select label="Thermal source" value={thermalSource} values={["unavailable", "tester-observed", "OS-reported", "external-measured"]} onChange={(value) => setThermalSource(value as typeof thermalSource)}/><Select label="Device became warm" value={deviceBecameWarm} values={["unavailable", "true", "false"]} onChange={setDeviceBecameWarm}/><Select label="Visible throttling" value={visibleThrottling} values={["unavailable", "true", "false"]} onChange={setVisibleThrottling}/><Select label="Performance degraded" value={performanceDegraded} values={["unavailable", "true", "false"]} onChange={setPerformanceDegraded}/><Text label="Thermal notes" value={thermalNotes} onChange={setThermalNotes}/><Text label="Battery start %" value={batteryStart} onChange={setBatteryStart}/><Text label="Battery end %" value={batteryEnd} onChange={setBatteryEnd}/><Text label="Screen brightness setting" value={brightnessSetting} onChange={setBrightnessSetting}/><Select label="Charging state" value={chargingState} values={["charging", "not-charging", "unknown"]} onChange={(value) => setChargingState(value as typeof chargingState)}/></div><div className="row" style={{ marginTop: 12 }}><button className="btn" disabled={Boolean(activeScenarioId) || Boolean(soakStartedAt && !soakEndedAt)} onClick={() => void resetSession()}>Reset all + new session ID</button><button className="btn primary" onClick={exportDraft}>Export review-required draft</button></div><p className="small">Reset disposes the active runtime and clears all measurements, declarations, and lifecycle state before assigning a new ID. Remote hardware fields are copied from the provider but real-hardware status remains review-required until the attestation artifact and SHA-256 are checked. The draft always exports privacy/rights review as false, preserves the build-time repository dirty bit, and cannot become verified from this page.</p></section>

    <section className="card"><h2>Runtime audit trail</h2><Details label="ScannerSession statistics" value={statistics}/><Details label="Lifecycle / recovery diagnostics" value={log}/><Details label="Confirmed public events" value={events}/><Details label="Observed resource requests" value={observedRequests}/></section>
  </div>;
}

function trackingMetrics(samples: TrackSample[], before: TrackingStatistics | undefined, after: TrackingStatistics | undefined, expectedTargetIds: string[], labelledBindings: PhysicalTrackLabel[]): Json {
  const expectedPayloads = new Set(expectedTargetIds.map((id) => groundTruth.targets.find((target) => target.targetId === id)?.payload).filter(Boolean));
  const tracks = new Map<string, BarcodeTrack>();
  for (const sample of samples) for (const track of sample.tracks) tracks.set(track.trackId, track);
  const confirmed = [...tracks.values()].filter((track) => track.state === "confirmed" || track.observationCount >= 2);
  const byIdentity = new Map<string, Set<string>>();
  for (const track of confirmed) {
    const key = `${track.format}\u001f${track.payload}`;
    const ids = byIdentity.get(key) ?? new Set<string>(); ids.add(track.trackId); byIdentity.set(key, ids);
  }
  const byLabel = new Map<string, PhysicalTrackLabel[]>();
  for (const binding of labelledBindings) byLabel.set(binding.label, [...(byLabel.get(binding.label) ?? []), binding]);
  const auditedLabels = [...byLabel.values()].filter((bindings) => bindings.length >= 2);
  const labelledIdentitySwitchCount = auditedLabels.reduce((sum, bindings) => sum + Math.max(0, new Set(bindings.map((entry) => entry.runtimePhysicalInstanceId)).size - 1), 0);
  const runtimeFragmentation = [...byIdentity.values()].reduce((sum, ids) => sum + Math.max(0, ids.size - 1), 0);
  return {
    identitySwitchCount: auditedLabels.length >= 2 ? labelledIdentitySwitchCount : Math.max(1, labelledIdentitySwitchCount),
    fragmentationCount: runtimeFragmentation,
    falseTrackCount: confirmed.filter((track) => !expectedPayloads.has(track.payload)).length,
    trackingBindings: labelledBindings,
    auditedPhysicalTargetCount: auditedLabels.length,
    createdTrackCount: counterDelta(after as Json | undefined, before as Json | undefined, "createdTrackCount"),
  };
}

function Fact({ label, value }: { label: string; value: unknown }) { return <div className="fact"><span>{label}</span><code>{value === undefined || value === "" ? unavailable : String(value)}</code></div>; }
function Details({ label, value }: { label: string; value: unknown }) { return <details><summary>{label}</summary><pre>{pretty(value)}</pre></details>; }
function Text({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label>{label}<input value={value} onChange={(event) => onChange(event.target.value)}/></label>; }
function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) { return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{values.map((entry) => <option value={entry} key={entry}>{entry}</option>)}</select></label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)}/></label>; }
