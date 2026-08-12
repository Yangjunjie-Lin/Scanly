"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BROWSER_SDK_VERSION,
  MediaStreamCameraFrameSource,
  ScannerSession,
  type DeviceDiagnostics,
  type ScanEvent,
  type ScannerDiagnostic,
  type ScannerSessionStatistics,
} from "@scanly/browser";
import deviceManifest from "../../../device-lab/manifest.json";
import groundTruth from "../../../device-lab/test-targets/ground-truth.json";

type EvidenceType = "simulated" | "desktop-camera" | "physical-mobile" | "remote-physical-device";

const unavailable = "unavailable";
const sourceCommit = process.env.NEXT_PUBLIC_SCANLY_SOURCE_COMMIT || unavailable;
const sourceTree = process.env.NEXT_PUBLIC_SCANLY_SOURCE_TREE || unavailable;
const newSessionId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `device-session-${Date.now()}`;

function publicBrowserFacts() {
  if (typeof navigator === "undefined" || typeof window === "undefined") return undefined;
  const orientation = screen.orientation ? `${screen.orientation.type} (${screen.orientation.angle}°)` : unavailable;
  return {
    userAgent: navigator.userAgent || unavailable,
    platform: navigator.platform || unavailable,
    language: navigator.language || unavailable,
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    screenOrientation: orientation,
    devicePixelRatio: window.devicePixelRatio || unavailable,
    online: navigator.onLine,
  };
}

function pretty(value: unknown): string {
  if (value === undefined || value === null) return unavailable;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return unavailable; }
}

const blankStatistics: ScannerSessionStatistics | undefined = undefined;
type PerformanceWindow = { label: "first-5-min" | "middle-5-min" | "last-5-min"; elapsedMs: number; p50DecodeMs: number; p95DecodeMs: number; effectiveDecodeFps: number; frameDropRate: number; ttfcMs?: number };
type ScenarioStatus = "not-tested" | "passed" | "failed" | "unavailable";

export default function DeviceLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<ScannerSession>();
  const sourceRef = useRef<MediaStreamCameraFrameSource>();
  const startedAtRef = useRef<string>();
  const startedAtMsRef = useRef<number>();
  const cameraReadyMsRef = useRef<number>();
  const firstUsableFrameMsRef = useRef<number>();
  const wentOfflineRef = useRef(false);
  const [sessionId, setSessionId] = useState(newSessionId);
  const [browserFacts, setBrowserFacts] = useState<ReturnType<typeof publicBrowserFacts>>();
  const [state, setState] = useState("idle");
  const [diagnostics, setDiagnostics] = useState<DeviceDiagnostics>();
  const [statistics, setStatistics] = useState(blankStatistics);
  const [performanceWindows, setPerformanceWindows] = useState<PerformanceWindow[]>([]);
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [log, setLog] = useState<ScannerDiagnostic[]>([]);
  const [error, setError] = useState<string>();
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("simulated");
  const [declaredModel, setDeclaredModel] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [operatingSystem, setOperatingSystem] = useState("");
  const [operatingSystemVersion, setOperatingSystemVersion] = useState("");
  const [browserName, setBrowserName] = useState("");
  const [browserVersion, setBrowserVersion] = useState("");
  const [cameraDevices, setCameraDevices] = useState<Array<{ deviceId: string; label: string; groupId: string }>>([]);
  const [thermalSource, setThermalSource] = useState<"tester-observed" | "OS-reported" | "external-measured" | "unavailable">("unavailable");
  const [thermalNotes, setThermalNotes] = useState("");
  const [batteryStart, setBatteryStart] = useState("");
  const [batteryEnd, setBatteryEnd] = useState("");
  const [brightnessPolicy, setBrightnessPolicy] = useState("");
  const [externalRequests, setExternalRequests] = useState<string[]>([]);
  const [scenarioStatuses, setScenarioStatuses] = useState<Record<string, ScenarioStatus>>(() => Object.fromEntries(deviceManifest.scenarios.map((scenario) => [scenario.id, "not-tested"])));
  const [wentOfflineDuringSession, setWentOfflineDuringSession] = useState(false);
  const [framesObservedOffline, setFramesObservedOffline] = useState(false);

  useEffect(() => {
    const update = () => {
      setBrowserFacts(publicBrowserFacts());
      if (!navigator.onLine && startedAtMsRef.current !== undefined) { wentOfflineRef.current = true; setWentOfflineDuringSession(true); }
    };
    update(); window.addEventListener("resize", update); window.addEventListener("orientationchange", update); window.addEventListener("online", update); window.addEventListener("offline", update);
    const timer = window.setInterval(() => {
      const external = performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => {
        try { return new URL(name, location.href).origin !== location.origin; } catch { return false; }
      });
      setExternalRequests([...new Set(external)].slice(-20));
      const snapshot = sessionRef.current?.getStatistics(); setStatistics(snapshot);
      if (wentOfflineRef.current && !navigator.onLine && (snapshot?.capturedFrames ?? 0) > 0) setFramesObservedOffline(true);
      setDiagnostics(sessionRef.current?.getDeviceDiagnostics());
      if (snapshot && startedAtMsRef.current !== undefined) {
        const elapsedMs = Date.now() - startedAtMsRef.current;
        const label = elapsedMs >= 25 * 60_000 ? "last-5-min" : elapsedMs >= 12.5 * 60_000 && elapsedMs < 17.5 * 60_000 ? "middle-5-min" : elapsedMs <= 5 * 60_000 ? "first-5-min" : undefined;
        if (label) setPerformanceWindows((current) => [...current.filter((entry) => entry.label !== label), { label, elapsedMs, p50DecodeMs: snapshot.p50DecodeMs, p95DecodeMs: snapshot.p95DecodeMs, effectiveDecodeFps: snapshot.effectiveDecodeFps, frameDropRate: snapshot.frameDropRate, ...(snapshot.timeToFirstConfirmedScanMs === undefined ? {} : { ttfcMs: snapshot.timeToFirstConfirmedScanMs }) }]);
      }
    }, 1_000);
    return () => {
      window.clearInterval(timer); window.removeEventListener("resize", update); window.removeEventListener("orientationchange", update); window.removeEventListener("online", update); window.removeEventListener("offline", update);
      void sessionRef.current?.dispose();
    };
  }, []);

  const camera = useMemo(() => {
    const settings = diagnostics?.negotiatedSettings;
    const capabilities = diagnostics?.trackCapabilities;
    const constraints = diagnostics?.trackConstraints;
    return { settings, capabilities, constraints };
  }, [diagnostics]);

  async function start(): Promise<void> {
    if (!videoRef.current) return;
    setError(undefined); setEvents([]); setLog([]); setPerformanceWindows([]); wentOfflineRef.current = false; setWentOfflineDuringSession(false); setFramesObservedOffline(false); firstUsableFrameMsRef.current = undefined; cameraReadyMsRef.current = undefined; performance.clearResourceTimings();
    await sessionRef.current?.dispose();
    const source = new MediaStreamCameraFrameSource({
      video: videoRef.current,
      facingMode: "environment",
      preferredWidth: 1_920,
      preferredHeight: 1_080,
      preferredFrameRate: 30,
      maximumConstraintAttempts: 3,
      stopWhenPageHidden: false,
    });
    const session = new ScannerSession({
      source,
      decodeMode: "tracking",
      tracking: { maxResults: 32 },
      repeatPolicy: { mode: "physical-instance" },
      cameraRecovery: { maximumRetries: 3, baseDelayMs: 250, maximumDelayMs: 2_000 },
    });
    sourceRef.current = source; sessionRef.current = session; startedAtRef.current = new Date().toISOString(); startedAtMsRef.current = Date.now();
    session.onStateChange(setState);
    session.onResult((event) => setEvents((current) => [...current.slice(-49), event]));
    session.onDiagnostics((entry) => {
      if (entry.quality?.usable && firstUsableFrameMsRef.current === undefined && startedAtMsRef.current !== undefined) firstUsableFrameMsRef.current = Date.now() - startedAtMsRef.current;
      if (entry.type === "camera" || entry.type === "error" || entry.type === "recovery") setLog((current) => [...current.slice(-99), entry]);
      if (entry.error) setError(`${entry.error.code}: ${entry.error.message}`);
    });
    try {
      await session.start(); cameraReadyMsRef.current = startedAtMsRef.current === undefined ? undefined : Date.now() - startedAtMsRef.current; setDiagnostics(session.getDeviceDiagnostics());
      const listed = await MediaStreamCameraFrameSource.listDevices(); setCameraDevices(listed.map((device) => ({ deviceId: device.deviceId, label: device.label || unavailable, groupId: device.groupId || unavailable })));
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function stop(): Promise<void> {
    await sessionRef.current?.stop();
    setStatistics(sessionRef.current?.getStatistics()); setDiagnostics(sessionRef.current?.getDeviceDiagnostics());
  }

  async function switchFacingMode(facingMode: "user" | "environment"): Promise<void> {
    if (!videoRef.current || !sessionRef.current) return;
    const next = new MediaStreamCameraFrameSource({ video: videoRef.current, facingMode, preferredWidth: 1_920, preferredHeight: 1_080, preferredFrameRate: 30 });
    sourceRef.current = next;
    try { await sessionRef.current.switchSource(next); setDiagnostics(sessionRef.current.getDeviceDiagnostics()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function capability(operation: "torch-on" | "torch-off" | "zoom-min" | "zoom-middle" | "zoom-max" | "focus"): Promise<void> {
    const session = sessionRef.current; if (!session) return;
    const caps = session.getCameraCapabilities();
    const result = operation === "torch-on" ? await session.setTorch(true)
      : operation === "torch-off" ? await session.setTorch(false)
        : operation === "focus" ? await session.requestFocus()
          : caps.zoom ? await session.setZoom(operation === "zoom-min" ? caps.zoom.min : operation === "zoom-max" ? caps.zoom.max : (caps.zoom.min + caps.zoom.max) / 2) : undefined;
    if (!result) setError("camera_capability_unsupported: Zoom is unavailable.");
    else if (!result.ok) setError(`${result.error.code}: ${result.error.message}`);
    else setError(undefined);
    setDiagnostics(session.getDeviceDiagnostics());
  }

  function exportDraft(): void {
    const track = sourceRef.current?.currentTrack();
    const expectedPayloads = new Set(groundTruth.targets.map((target) => target.payload));
    const unexpectedConfirmedEvents = events.filter((event) => !expectedPayloads.has(event.barcode.text)).length;
    const comparisons = deviceManifest.scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      status: scenarioStatuses[scenario.id] ?? "not-tested",
      targetIds: "targetIds" in scenario ? scenario.targetIds : [],
      groundTruth: ("targetIds" in scenario && Array.isArray(scenario.targetIds) ? scenario.targetIds : []).map((targetId) => {
        const expected = groundTruth.targets.find((target) => target.targetId === targetId)!;
        const observed = events.find((event) => event.barcode.text === expected.payload);
        return { targetId, expectedPayload: expected.payload, expectedFormat: expected.format, ...(observed ? { observedPayload: observed.barcode.text, observedFormat: observed.barcode.format, physicalInstanceId: observed.physicalInstanceId } : {}), matched: Boolean(observed && observed.barcode.format === expected.format) };
      }),
      falseConfirmedScans: unexpectedConfirmedEvents,
    }));
    const currentStatistics = statistics ?? sessionRef.current?.getStatistics();
    const durationMs = startedAtMsRef.current === undefined ? 0 : Date.now() - startedAtMsRef.current;
    const draft = {
      schemaVersion: "beta4-device-lab-draft-1",
      admissibleEvidence: false,
      reviewRequired: true,
      sourceCommit,
      sourceTree,
      sdkVersion: BROWSER_SDK_VERSION,
      evidenceType,
      session: { sessionId, startedAt: startedAtRef.current ?? unavailable, endedAt: new Date().toISOString() },
      device: { declaredModel: declaredModel || unavailable, manufacturer: manufacturer || unavailable, operatingSystem: operatingSystem || unavailable, operatingSystemVersion: operatingSystemVersion || unavailable },
      browser: { name: browserName || unavailable, version: browserVersion || unavailable, userAgent: browserFacts?.userAgent ?? unavailable },
      camera: { label: track?.label || unavailable, settings: camera.settings ?? unavailable, capabilities: camera.capabilities ?? unavailable, constraints: camera.constraints ?? unavailable },
      viewport: browserFacts,
      statistics: currentStatistics ?? unavailable,
      cameraStartup: {
        cameraReadyMs: cameraReadyMsRef.current ?? unavailable,
        firstUsableFrameMs: firstUsableFrameMsRef.current ?? unavailable,
        ttfdMs: statistics?.timeToFirstDecodeMs ?? unavailable,
        ttfcMs: statistics?.timeToFirstConfirmedScanMs ?? unavailable,
      },
      performanceWindows,
      longRunDraft: currentStatistics ? {
        durationMs,
        capturedFrames: currentStatistics.capturedFrames,
        admittedFrames: currentStatistics.admittedFrames,
        droppedFrames: currentStatistics.droppedFrames,
        decodeAttempts: currentStatistics.fastAttempts + currentStatistics.balancedAttempts + currentStatistics.robustAttempts,
        results: currentStatistics.emittedEvents,
        falseConfirmations: unexpectedConfirmedEvents,
        workerCount: currentStatistics.workerCreatedCount,
        sessionRestarts: currentStatistics.cameraRecovery.restarts,
        cameraTrackEndings: currentStatistics.cameraTrackEndings,
        errors: log.filter((entry) => entry.type === "error").length,
        stalePublicEvents: currentStatistics.staleEvents,
        finalControlledResources: currentStatistics.finalControlledMemory,
        windows: performanceWindows,
        durationGate: durationMs >= 30 * 60_000 ? "duration-met-review-required" : "under-30-minutes",
      } : unavailable,
      thermalObservation: { source: thermalSource, ...(thermalNotes ? { throttlingSymptom: thermalNotes } : {}) },
      batteryObservation: batteryStart && batteryEnd ? { source: "tester-recorded", startPercent: Number(batteryStart), endPercent: Number(batteryEnd), durationMs, screenBrightnessPolicy: brightnessPolicy || unavailable } : { source: "unavailable" },
      scenarios: comparisons,
      events,
      lifecycleDiagnostics: log,
      privacyObservation: { barcodePixelsUploaded: false, barcodePayloadUploaded: false, observedExternalResourceRequests: externalRequests, networkIsolationTested: wentOfflineDuringSession, scannerFramesObservedWhileOffline: framesObservedOffline },
      fieldSources: {
        "device.declaredModel": "declared-by-tester", "device.manufacturer": "declared-by-tester", "device.operatingSystem": "declared-by-tester",
        "browser.userAgent": "browser-reported", "camera.settings": "camera-api-reported", "camera.capabilities": "camera-api-reported", "camera.constraints": "camera-api-reported",
      },
    };
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${sessionId}-device-lab-draft.json`; link.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="deviceLab">
      <section className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "start" }}>
          <div><h1>Scanly Device Lab</h1><p className="small">Dedicated physical-camera validation harness. A browser run is not repository evidence until the exported draft is reviewed and passes the fail-closed verifier.</p></div>
          <a className="btn" href="/device-lab/targets">Open screen targets</a>
        </div>
        <div className="diagnosticGrid">
          <Fact label="SDK version" value={BROWSER_SDK_VERSION} /><Fact label="Source commit" value={sourceCommit} /><Fact label="Source tree" value={sourceTree} /><Fact label="Session ID" value={sessionId} />
          <Fact label="Scanner state" value={state} /><Fact label="Evidence type" value={evidenceType} /><Fact label="Browser / User Agent" value={browserFacts?.userAgent} /><Fact label="OS / platform report" value={browserFacts?.platform} />
          <Fact label="Viewport" value={browserFacts?.viewport} /><Fact label="Orientation" value={browserFacts?.screenOrientation} /><Fact label="devicePixelRatio" value={browserFacts?.devicePixelRatio} /><Fact label="Network" value={browserFacts ? (browserFacts.online ? "online" : "offline") : undefined} />
        </div>
      </section>

      <section className="card">
        <video ref={videoRef} muted playsInline aria-label="Device Lab camera preview" />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" type="button" onClick={() => void start()}>Start camera session</button><button className="btn" type="button" onClick={() => void stop()}>Stop</button>
          <button className="btn" type="button" onClick={() => void switchFacingMode("user")}>Front camera</button><button className="btn" type="button" onClick={() => void switchFacingMode("environment")}>Rear camera</button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" type="button" onClick={() => void capability("torch-on")}>Torch on</button><button className="btn" type="button" onClick={() => void capability("torch-off")}>Torch off</button>
          <button className="btn" type="button" onClick={() => void capability("zoom-min")}>Zoom min</button><button className="btn" type="button" onClick={() => void capability("zoom-middle")}>Zoom middle</button><button className="btn" type="button" onClick={() => void capability("zoom-max")}>Zoom max-safe</button><button className="btn" type="button" onClick={() => void capability("focus")}>Request focus</button>
        </div>
        {error && <p role="alert" className="errorText">{error}</p>}
      </section>

      <section className="card">
        <h2>Camera API diagnostics</h2>
        <div className="diagnosticGrid"><Fact label="Camera label" value={sourceRef.current?.currentTrack()?.label} /><Fact label="width" value={(camera.settings as any)?.width} /><Fact label="height" value={(camera.settings as any)?.height} /><Fact label="frameRate" value={(camera.settings as any)?.frameRate} /><Fact label="facingMode" value={(camera.settings as any)?.facingMode} /><Fact label="torch support" value={(camera.capabilities as any)?.torch} /><Fact label="zoom support" value={(camera.capabilities as any)?.zoom} /><Fact label="focus support" value={(camera.capabilities as any)?.focusMode} /></div>
        <Details label="MediaTrack settings" value={camera.settings} /><Details label="MediaTrack capabilities" value={camera.capabilities} /><Details label="MediaTrack constraints" value={camera.constraints} /><Details label="Constraint negotiation" value={diagnostics?.attempts} /><Details label="Browser-exposed camera devices/lenses" value={cameraDevices} />
      </section>

      <section className="card"><h2>Session metrics</h2><Details label="ScannerSession statistics" value={statistics} /><Details label="Performance drift windows" value={performanceWindows} /><Details label="Lifecycle / recovery diagnostics" value={log} /><Details label="Confirmed public events" value={events} /><Fact label="Observed external resource requests during session" value={externalRequests.length ? externalRequests.join("\n") : "none observed"} /><p className="small">Core decode is local-only. This runtime observation reports resource requests; the repository contract additionally scans Device Lab source for external decode/analytics integrations.</p></section>

      <section className="card"><h2>Physical scenario checklist</h2><p className="small">Set a status only after executing the protocol. Draft comparisons always use the fixed pre-scan Ground Truth. `passed` is review-required and will still fail repository admission if false confirmations, missing target matches, or physical metadata are incomplete.</p><div className="scenarioList">{deviceManifest.scenarios.map((scenario) => <label key={scenario.id}><span><strong>{scenario.id}</strong> {scenario.name}</span><select value={scenarioStatuses[scenario.id]} onChange={(event) => setScenarioStatuses((current) => ({ ...current, [scenario.id]: event.target.value as ScenarioStatus }))}><option value="not-tested">not-tested</option><option value="passed">passed</option><option value="failed">failed</option><option value="unavailable">unavailable</option></select></label>)}</div><Fact label="Network disabled during session" value={wentOfflineDuringSession} /><Fact label="Frames observed while offline" value={framesObservedOffline} /></section>

      <section className="card"><h2>Evidence draft metadata</h2><p className="small">Choose the truthful hardware class. Selecting physical-mobile does not make the draft admissible; hardware metadata, fixed Ground Truth comparisons, privacy review, source identity, and verifier approval are still mandatory.</p>
        <div className="formGrid"><label>Evidence type<select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as EvidenceType)}><option value="simulated">simulated</option><option value="desktop-camera">desktop-camera</option><option value="physical-mobile">physical-mobile</option><option value="remote-physical-device">remote-physical-device</option></select></label><label>Declared model<input value={declaredModel} onChange={(event) => setDeclaredModel(event.target.value)} /></label><label>Manufacturer<input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} /></label><label>Operating system<input value={operatingSystem} onChange={(event) => setOperatingSystem(event.target.value)} /></label><label>OS version<input value={operatingSystemVersion} onChange={(event) => setOperatingSystemVersion(event.target.value)} /></label><label>Browser name<input value={browserName} onChange={(event) => setBrowserName(event.target.value)} /></label><label>Browser version<input value={browserVersion} onChange={(event) => setBrowserVersion(event.target.value)} /></label><label>Thermal source<select value={thermalSource} onChange={(event) => setThermalSource(event.target.value as typeof thermalSource)}><option value="unavailable">unavailable</option><option value="tester-observed">tester-observed</option><option value="OS-reported">OS-reported</option><option value="external-measured">external-measured</option></select></label><label>Throttling/FPS/latency observation<input value={thermalNotes} onChange={(event) => setThermalNotes(event.target.value)} /></label><label>Battery start %<input inputMode="decimal" value={batteryStart} onChange={(event) => setBatteryStart(event.target.value)} /></label><label>Battery end %<input inputMode="decimal" value={batteryEnd} onChange={(event) => setBatteryEnd(event.target.value)} /></label><label>Screen brightness policy<input value={brightnessPolicy} onChange={(event) => setBrightnessPolicy(event.target.value)} /></label></div>
        <div className="row" style={{ marginTop: 12 }}><button className="btn" type="button" onClick={() => setSessionId(newSessionId())}>New session ID</button><button className="btn primary" type="button" onClick={exportDraft}>Export review-required draft</button></div>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: unknown }) { return <div className="fact"><span>{label}</span><code>{value === undefined || value === "" ? unavailable : String(value)}</code></div>; }
function Details({ label, value }: { label: string; value: unknown }) { return <details><summary>{label}</summary><pre>{pretty(value)}</pre></details>; }
