"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BatchScanSession,
  BrowserCameraSource,
  BrowserCaptureSession,
  MediaStreamCameraFrameSource,
  ScannerSession,
  createTrackOverlayModels,
} from "@scanly/browser";
import type { BatchState, TrackOverlayModel } from "@scanly/browser";
import { isSafeActionUrl, parseSemanticPayload } from "@scanly/parsers";
import { UrlSafetyClient, UrlSafetyController, structuredUrl, type UrlSafetyPrivacyMode, type UrlSafetyState } from "@scanly/url-safety";
import { UrlSafetyEvidence } from "./UrlSafetyEvidence";
import type { ScanResult, SdkErrorCode } from "@scanly/core";
import { getBuiltinScenario, type ScenarioPresetId } from "@scanly/scenario-schema";

type Mode = "camera" | "upload";
type CameraExperience = "single" | "tracking-batch";
type Preset = "balanced" | "robust" | "multiformat-balanced" | "retail-fast" | "logistics-balanced" | "document-robust" | "industrial" | "dpm-experimental";

function scenarioPreset(preset: Preset): ScenarioPresetId {
  if (preset === "industrial" || preset === "dpm-experimental") return "multiformat-balanced";
  return preset;
}

function recoveryPreset(preset: Preset): false | { profile: "industrial" | "dpm-experimental"; dpmExperimental?: boolean } {
  if (preset === "industrial") return { profile: "industrial" };
  if (preset === "dpm-experimental") return { profile: "dpm-experimental", dpmExperimental: true };
  return false;
}

function formatLabel(format: ScanResult["format"]): string {
  return ({
    qr_code: "QR Code", data_matrix: "Data Matrix", pdf417: "PDF417", code_128: "Code 128",
    ean_13: "EAN-13", ean_8: "EAN-8", upc_a: "UPC-A", upc_e: "UPC-E",
  } as const)[format];
}

function retailMetadata(result: ScanResult | undefined): { checkDigitValid?: boolean; normalizedGtin14?: string; expandedUpcA?: string } | null {
  const value = result?.metadata?.retail;
  return value && typeof value === "object" ? value as { checkDigitValid?: boolean; normalizedGtin14?: string; expandedUpcA?: string } : null;
}

function resultFromScannerEvent(event: import("@scanly/browser").ScanEvent): ScanResult {
  return {
    format: event.barcode.format,
    rawText: event.barcode.text,
    ...(event.barcode.rawBytes ? { rawBytes: event.barcode.rawBytes } : {}),
    ...(event.barcode.cornerPoints ? { cornerPoints: [...event.barcode.cornerPoints] } : {}),
    engine: { id: event.barcode.engineId, version: event.barcode.engineVersion ?? "unknown" },
    preprocessingPath: [], frameId: String(event.frameId), structuredPayload: parseSemanticPayload(event.barcode.text).structured,
    validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 0 },
  };
}

function trackColor(state: TrackOverlayModel["state"]): string {
  if (state === "confirmed") return "#58d68d";
  if (state === "lost") return "#f5b041";
  if (state === "retired") return "#85929e";
  return "#7fb3ff";
}

function trackOverlayStyle(track: TrackOverlayModel, video: HTMLVideoElement | null): React.CSSProperties {
  const frameWidth = video?.videoWidth ?? 0;
  const frameHeight = video?.videoHeight ?? 0;
  const viewportWidth = video?.clientWidth ?? 0;
  const viewportHeight = video?.clientHeight ?? 0;
  if (!frameWidth || !frameHeight || !viewportWidth || !viewportHeight) return { display: "none" };

  // Mirror the preview's object-fit: cover transform so SDK pixel geometry
  // remains aligned when camera and preview aspect ratios differ.
  const scale = Math.max(viewportWidth / frameWidth, viewportHeight / frameHeight);
  const offsetX = (viewportWidth - frameWidth * scale) / 2;
  const offsetY = (viewportHeight - frameHeight * scale) / 2;
  const box = track.boundingBox;
  const color = trackColor(track.state);
  return {
    position: "absolute",
    left: offsetX + box.x * scale,
    top: offsetY + box.y * scale,
    width: Math.max(1, box.width * scale),
    height: Math.max(1, box.height * scale),
    border: `2px solid ${color}`,
    borderRadius: 8,
    boxShadow: `0 0 0 1px rgba(0,0,0,0.55), 0 0 12px ${color}55`,
    opacity: track.state === "lost" ? 0.58 : 1,
  };
}

export default function QRTool() {
  const [mode, setMode] = useState<Mode>("camera");
  const [status, setStatus] = useState<string>("Idle");
  const [results, setResults] = useState<ScanResult[]>([]);
  const [safetyMode, setSafetyMode] = useState<"disabled" | UrlSafetyPrivacyMode>("disabled");
  const [safetyState, setSafetyState] = useState<UrlSafetyState & { owner?: string }>({ status: "idle" });
  const safetyRef = useRef<UrlSafetyController | null>(null);
  const safetyOwnerRef = useRef<string | undefined>(undefined);
  const safetyClient = useMemo(() => new UrlSafetyClient({ endpoint: "/api/url-safety" }), []);
  const [lastError, setLastError] = useState<string>("");
  const [errorReason, setErrorReason] = useState<SdkErrorCode | "">("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadReady, setUploadReady] = useState(false);
  const [preset, setPreset] = useState<Preset>("balanced");
  const [cameraExperience, setCameraExperience] = useState<CameraExperience>("single");
  const [batchExpectedCount, setBatchExpectedCount] = useState(12);
  const [batchState, setBatchState] = useState<BatchState | null>(null);
  const [trackOverlays, setTrackOverlays] = useState<readonly TrackOverlayModel[]>([]);
  const [scannerState, setScannerState] = useState<string>("idle");
  const [scannerHint, setScannerHint] = useState<string>("searching");
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraCapabilities, setCameraCapabilities] = useState<{ torch: boolean; minZoom?: number; maxZoom?: number; currentZoom?: number }>({ torch: false });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadSeqRef = useRef(0);
  const uploadStageRef = useRef("Preparing image…");
  const modeRef = useRef<Mode>("camera");

  const uploadSession = useMemo(() => new BrowserCaptureSession(), []);
  const cameraSource = useMemo(() => new BrowserCameraSource(), []);
  const scannerSessionRef = useRef<ScannerSession | null>(null);
  const batchSessionRef = useRef<BatchScanSession | null>(null);

  const primaryResult = results[0];
  const safetyUrl = structuredUrl(primaryResult?.structuredPayload) ?? undefined;
  const primarySafetyState = safetyState.owner === safetyUrl ? safetyState : { status: "idle" as const };
  const primary = primaryResult?.rawText ?? "";
  const isUrl = primary ? isSafeActionUrl(primary) : false;
  const retail = retailMetadata(primaryResult);
  const rawBytes = primaryResult?.rawBytes
    ? Array.from(primaryResult.rawBytes, (value) => value.toString(16).padStart(2, "0")).join(" ")
    : "";
  const parsedMetadata = primaryResult && (primaryResult.structuredPayload || primaryResult.metadata)
    ? JSON.stringify({ structuredPayload: primaryResult.structuredPayload, barcode: primaryResult.metadata }, null, 2)
    : "";
  const recoveryDiagnostics = process.env.NODE_ENV !== "production" ? primaryResult?.metadata?.scannerDiagnostics : undefined;
  const activeScenario = useMemo(() => getBuiltinScenario(scenarioPreset(preset)), [preset]);

  useEffect(() => {
    const controller = new UrlSafetyController(safetyClient, (state) => setSafetyState({ ...state, owner: safetyOwnerRef.current }));
    safetyRef.current = controller;
    controller.configure(safetyMode === "disabled" ? undefined : safetyMode);
    return () => { controller.dispose(); safetyRef.current = null; };
  }, [safetyClient, safetyMode]);

  useEffect(() => {
    safetyOwnerRef.current = safetyUrl;
    safetyRef.current?.accept(primaryResult?.structuredPayload);
  }, [primaryResult, safetyMode, safetyUrl]);

  useEffect(() => () => safetyClient.dispose(), [safetyClient]);

  async function disposeCameraRuntime(): Promise<void> {
    safetyRef.current?.cancel();
    const batch = batchSessionRef.current;
    const scanner = scannerSessionRef.current;
    batchSessionRef.current = null;
    scannerSessionRef.current = null;
    if (batch) await batch.dispose();
    else await scanner?.dispose();
  }

  useEffect(() => {
    let cancelled = false;
    async function loadDevices() {
      try {
        setLastError("");
        setErrorReason("");
        setStatus("Loading camera devices… (you may need to allow permission first)");
        const list = await BrowserCameraSource.listDevices();
        if (cancelled) return;
        setDevices(list);
        const back = list.find((d) => /back|rear|environment/i.test(d.label));
        const pick = back?.deviceId || list[0]?.deviceId || "";
        setDeviceId((prev) => prev || pick);
        if (modeRef.current === "camera") {
          setStatus(list.length ? "Ready" : "Ready (no camera detected)");
        }
        if (list.length === 0 && modeRef.current === "camera") {
          setErrorReason("camera_unavailable");
          setLastError("No camera device found.");
        }
      } catch (e) {
        if (cancelled) return;
        if (modeRef.current === "camera") {
          setStatus("Ready (camera devices not available yet)");
          setErrorReason("camera_unavailable");
          setLastError(e instanceof Error ? e.message : String(e));
        }
      }
    }
    loadDevices();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    uploadSession.initialize();
    uploadSession.start();
    setUploadReady(true);
    return () => {
      setUploadReady(false);
      void disposeCameraRuntime();
      void cameraSource.dispose();
      uploadAbortRef.current?.abort();
      void uploadSession.dispose();
    };
  }, [cameraSource, uploadSession]);

  async function startScan() {
    setLastError("");
    setErrorReason("");
    setResults([]);
    setTrackOverlays([]);
    setBatchState(null);

    if (!videoRef.current) {
      setLastError("Video element not ready.");
      return;
    }
    if (!deviceId && devices.length === 0) {
      setErrorReason("camera_unavailable");
      setLastError("No camera device found.");
      return;
    }

    try {
      setStatus("Requesting camera permission…");
      setIsScanning(true);

      await disposeCameraRuntime();
      const source = new MediaStreamCameraFrameSource({ video: videoRef.current, deviceId: deviceId || undefined, stopWhenPageHidden: true });
      const session = new ScannerSession({
        source,
        decoderOptions: { scenario: activeScenario, ...(recoveryPreset(preset) ? { recovery: recoveryPreset(preset) } : {}) },
        confirmation: { mode: "adaptive" },
        repeatPolicy: { mode: "physical-instance", cooldownMs: 1_500 },
        quality: { sampleTarget: 1_024 },
        decodeMode: cameraExperience === "tracking-batch" ? "tracking" : "single",
        ...(cameraExperience === "tracking-batch" ? {
          tracking: { maxResults: 32, trackerOptions: { maxTrackedBarcodes: 32, maxObservations: 32 } },
        } : {}),
      });
      scannerSessionRef.current = session;
      session.onStateChange((state) => {
        setScannerState(state);
        if (state === "scanning") {
          setStatus(cameraExperience === "tracking-batch" ? "Tracking physical barcode instances…" : "Scanning… keep the barcode inside the frame");
        }
      });
      session.onResult((event) => {
        setResults([resultFromScannerEvent(event)]);
        navigator.vibrate?.(50);
        if (cameraExperience === "single") {
          setStatus("Decoded");
          setIsScanning(false);
          setScannerState("stopped");
          setScannerHint("searching");
          void session.stop();
        }
      });
      session.onDiagnostics((diagnostic) => { if (diagnostic.hint) setScannerHint(diagnostic.hint.type); if (diagnostic.error) { setErrorReason(diagnostic.error.code); setLastError(diagnostic.error.message); } });
      if (cameraExperience === "tracking-batch") {
        const batch = new BatchScanSession({
          scanner: session,
          mode: "expected-count",
          expectedCount: batchExpectedCount,
          trackerOptions: { maxTrackedBarcodes: 32, maxObservations: 32 },
        });
        batchSessionRef.current = batch;
        setBatchState(batch.getBatchState());
        batch.onTrack(() => {
          setTrackOverlays([...createTrackOverlayModels(batch.getTracks())]);
        });
        batch.onBatchEvent((event) => {
          setBatchState(batch.getBatchState());
          if (event.type === "batch-completed") {
            setStatus(`Batch complete: ${event.state.confirmedPhysicalInstanceCount} / ${event.state.expectedCount ?? batchExpectedCount}`);
            setIsScanning(false);
            navigator.vibrate?.([60, 40, 60]);
            void batch.stop();
          } else if (event.type === "batch-failed") {
            setStatus("Batch failed");
            setLastError(event.state.failureReason ?? "The tracking batch failed.");
          }
        });
        await batch.start();
      } else {
        await session.start();
      }
      const capabilities = session.getCameraCapabilities();
      setCameraCapabilities({ torch: capabilities.torch, minZoom: capabilities.zoom?.min, maxZoom: capabilities.zoom?.max, currentZoom: capabilities.zoom?.current });
      setScannerHint("searching");
      setStatus(cameraExperience === "tracking-batch" ? "Tracking physical barcode instances…" : "Scanning… keep the barcode inside the frame");
    } catch (e) {
      await disposeCameraRuntime().catch(() => undefined);
      setIsScanning(false);
      setScannerState("failed");
      setStatus("Ready");
      const message = e instanceof Error ? e.message : String(e);
      setErrorReason(/NotAllowedError|permission denied/i.test(message) ? "camera_permission_denied" : "camera_unavailable");
      setLastError(message);
    }
  }

  function selectPreset(next: Preset) {
    setPreset(next);
    uploadSession.updateConfiguration(getBuiltinScenario(scenarioPreset(next)));
    uploadSession.updateRecovery(recoveryPreset(next));
    setResults([]);
    setLastError("");
    setErrorReason("");
    setStatus("Ready");
  }

  function stopScan() {
    safetyRef.current?.cancel();
    if (batchSessionRef.current) void batchSessionRef.current.stop();
    else void scannerSessionRef.current?.stop();
    // Stop any leftover media tracks
    const video = videoRef.current;
    const stream = video?.srcObject;
    if (video && typeof MediaStream !== "undefined" && stream instanceof MediaStream) {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    }
    setIsScanning(false);
    setScannerState("stopped");
    setScannerHint("searching");
    setStatus("Stopped");
  }

  function pauseScan() {
    safetyRef.current?.cancel();
    if (batchSessionRef.current) batchSessionRef.current.pause();
    else scannerSessionRef.current?.pause();
    setScannerState("paused");
    setScannerHint("hold_steady");
    setStatus("Paused");
  }

  function resumeScan() {
    if (batchSessionRef.current) batchSessionRef.current.resume();
    else scannerSessionRef.current?.resume();
    setScannerState("scanning");
    setScannerHint("searching");
    setStatus(cameraExperience === "tracking-batch" ? "Tracking physical barcode instances…" : "Scanning… keep the barcode inside the frame");
  }

  async function toggleTorch() {
    try {
      const result = await scannerSessionRef.current?.setTorch(!torchEnabled);
      if (result && !result.ok) throw new Error(result.error.message);
      setTorchEnabled((value) => !value);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      setErrorReason("camera_capability_unsupported");
    }
  }

  async function setZoom(value: number) {
    try {
      const result = await scannerSessionRef.current?.setZoom(value);
      if (result && !result.ok) throw new Error(result.error.message);
      setCameraCapabilities((current) => ({ ...current, currentZoom: value }));
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      setErrorReason("camera_capability_unsupported");
    }
  }

  function resetUpload() {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    uploadSession.cancel();
    setIsProcessing(false);
    setResults([]);
    setLastError("");
    setErrorReason("");
    setStatus("Ready");
  }

  async function onUpload(file: File | null) {
    if (!file) return;

    uploadAbortRef.current?.abort();
    uploadSession.cancel();
    const seq = ++uploadSeqRef.current;
    const controller = new AbortController();
    uploadAbortRef.current = controller;

    setLastError("");
    setErrorReason("");
    setResults([]);
    setIsProcessing(true);
    uploadStageRef.current = "Preparing image…";

    const outcome = await uploadSession.scanFile(file, {
      signal: controller.signal,
      onStage: (stage) => {
        uploadStageRef.current = stage;
        if (seq === uploadSeqRef.current) setStatus(stage);
      },
      onProgress: ({ attemptCount }) => {
        if (seq === uploadSeqRef.current) {
          setStatus(`${uploadStageRef.current} (${attemptCount} attempts)`);
        }
      },
    });

    if (seq !== uploadSeqRef.current) return;

    setIsProcessing(false);
    if (outcome.ok) {
      setResults(outcome.results);
      setStatus(
        outcome.results.length > 1
          ? `Decoded ${outcome.results.length} codes`
          : "Decoded"
      );
      navigator.vibrate?.(50);
    } else if (outcome.error.code === "cancelled") {
      setResults([]);
      setErrorReason("");
      setLastError("");
      setStatus("Cancelled");
    } else {
      setResults([]);
      setErrorReason(outcome.error.code);
      setLastError(outcome.error.message);
      setStatus("Failed to decode image");
    }
  }

  async function onCancelUpload() {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    uploadSeqRef.current += 1;
    setIsProcessing(false);
    setResults([]);
    setLastError("");
    setErrorReason("");
    setStatus("Cancelled");
    uploadSession.cancel();
  }

  async function copyResult(text = primary) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied to clipboard");
    } catch {
      setStatus("Copy failed (clipboard permission)");
    }
  }

  function openIfUrl(text = primary) {
    if (!isSafeActionUrl(text)) return;
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (safetyMode !== "disabled") {
      const risk = text === primary ? primarySafetyState.analysis?.riskLevel : undefined;
      if (risk !== "low" && !window.confirm(risk === "high" || risk === "critical" ? "High-risk URL. Do not enter credentials. Open anyway?" : "This URL is unverified or has risk indicators. Verify the domain before proceeding. Open with caution?")) return;
    }
    window.open(url.href, "_blank", "noopener,noreferrer");
  }

  function selectMode(nextMode: Mode) {
    if (nextMode === "camera") {
      modeRef.current = "camera";
      setMode("camera");
      resetUpload();
      return;
    }
    modeRef.current = "upload";
    stopScan();
    void onCancelUpload();
    setMode("upload");
    setTrackOverlays([]);
    setBatchState(null);
    setLastError("");
    setErrorReason("");
    setResults([]);
    setStatus("Ready");
  }

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, current: Mode) {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;
    event.preventDefault();
    const next = current === "camera" ? "upload" : "camera";
    selectMode(next);
    document.getElementById(`${next}-tab`)?.focus();
  }

  return (
    <section className="card" aria-label="QR code scanner">
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div className="tabs" role="tablist" aria-label="Scan mode">
          <button
            type="button"
            role="tab"
            id="camera-tab"
            aria-controls="camera-panel"
            aria-selected={mode === "camera"}
            tabIndex={mode === "camera" ? 0 : -1}
            className={`tab ${mode === "camera" ? "active" : ""}`}
            onKeyDown={(event) => onTabKeyDown(event, "camera")}
            onClick={() => selectMode("camera")}
          >
            Camera
          </button>
          <button
            type="button"
            role="tab"
            id="upload-tab"
            aria-controls="upload-panel"
            aria-selected={mode === "upload"}
            tabIndex={mode === "upload" ? 0 : -1}
            className={`tab ${mode === "upload" ? "active" : ""}`}
            onKeyDown={(event) => onTabKeyDown(event, "upload")}
            onClick={() => selectMode("upload")}
          >
            Upload
          </button>
        </div>

        <div className="badge" aria-live="polite" data-testid="processing-status">
          <span className="mono">{status}</span>
        </div>
      </div>

      <hr />

      <div className="row" style={{ alignItems: "center", marginBottom: 12 }}>
        <label className="small" htmlFor="format-preset">Formats</label>
        <select id="format-preset" value={preset} onChange={(event) => selectPreset(event.target.value as Preset)} aria-label="Format preset" disabled={isScanning || isProcessing}>
          <option value="balanced">QR</option>
          <option value="robust">QR Robust</option>
          <option value="retail-fast">Retail</option>
          <option value="logistics-balanced">Logistics</option>
          <option value="document-robust">Document</option>
          <option value="multiformat-balanced">All Alpha.5</option>
          <option value="industrial">Industrial (highest bounded cost)</option>
          <option value="dpm-experimental">DPM Experimental</option>
        </select>
        {mode === "camera" && (
          <>
            <label className="small" htmlFor="camera-experience">Camera mode</label>
            <select
              id="camera-experience"
              value={cameraExperience}
              onChange={(event) => {
                setCameraExperience(event.target.value as CameraExperience);
                setTrackOverlays([]);
                setBatchState(null);
                setResults([]);
              }}
              aria-label="Camera scanning mode"
              disabled={isScanning}
            >
              <option value="single">Single result</option>
              <option value="tracking-batch">Tracking / Batch</option>
            </select>
            {cameraExperience === "tracking-batch" && (
              <label className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                Expected physical items
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={batchExpectedCount}
                  onChange={(event) => setBatchExpectedCount(Math.min(32, Math.max(1, Number(event.target.value) || 1)))}
                  aria-label="Expected physical barcode count"
                  disabled={isScanning}
                  style={{ width: 72, padding: "8px 10px", borderRadius: 10 }}
                />
              </label>
            )}
          </>
        )}
      </div>

      {mode === "camera" && (
        <div role="tabpanel" id="camera-panel" aria-labelledby="camera-tab">
          <div className="videoWrap">
            <video ref={videoRef} muted playsInline aria-label="Camera preview" />
            <div className="overlay" aria-hidden="true">
              {cameraExperience === "single" ? (
                <div className="scanBox" />
              ) : (
                trackOverlays.map((track) => (
                  <div key={track.trackId} style={trackOverlayStyle(track, videoRef.current)}>
                    <span style={{ position: "absolute", left: -2, top: -24, padding: "2px 6px", borderRadius: 6, color: "#071018", background: trackColor(track.state), fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
                      {track.trackId} · {track.state}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="row" style={{ marginTop: 12, alignItems: "center" }}>
            <button
              type="button"
              className="btn primary"
              onClick={startScan}
              disabled={isScanning}
              aria-label="Start camera scan"
            >
              {isScanning ? "Scanning…" : "Start Scan"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={stopScan}
              disabled={!isScanning}
              aria-label="Stop camera scan"
            >
              Stop
            </button>
            <button type="button" className="btn" onClick={scannerState === "paused" ? resumeScan : pauseScan} disabled={!isScanning} aria-label={scannerState === "paused" ? "Resume camera scan" : "Pause camera scan"}>
              {scannerState === "paused" ? "Resume" : "Pause"}
            </button>
            <button type="button" className="btn" onClick={() => void toggleTorch()} disabled={!isScanning || !cameraCapabilities.torch} aria-label="Toggle torch">
              {torchEnabled ? "Torch off" : "Torch on"}
            </button>
            {cameraCapabilities.minZoom !== undefined && cameraCapabilities.maxZoom !== undefined && (
              <label className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                Zoom
                <input aria-label="Camera zoom" type="range" min={cameraCapabilities.minZoom} max={cameraCapabilities.maxZoom} step={0.1} value={cameraCapabilities.currentZoom ?? cameraCapabilities.minZoom} onChange={(event) => void setZoom(Number(event.target.value))} disabled={!isScanning} />
              </label>
            )}

            <div style={{ flex: 1 }} />

            <label className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Camera:
              <select
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                aria-label="Select camera"
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#eaf0ff",
                }}
                disabled={isScanning}
              >
                {devices.length === 0 ? (
                  <option value="">Default</option>
                ) : (
                  devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${d.deviceId.slice(0, 6)}…`}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <div className="small" aria-live="polite" data-testid="scanner-feedback" style={{ marginTop: 8 }}>
            Scanner state: <span className="mono">{scannerState}</span> · hint: <span className="mono">{scannerHint}</span>
          </div>

          {cameraExperience === "tracking-batch" && (
            <section aria-label="Tracking and batch state" style={{ marginTop: 14, padding: 12, border: "1px solid rgba(255,255,255,0.14)", borderRadius: 12 }}>
              <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                <strong>Batch progress</strong>
                <span className="mono" data-testid="batch-progress">
                  {batchState?.confirmedPhysicalInstanceCount ?? 0} / {batchState?.expectedCount ?? batchExpectedCount} · {batchState?.status ?? "ready"}
                </span>
              </div>
              <div className="small" style={{ marginTop: 8 }}>
                Progress counts confirmed physical tracks, not repeated decoder events or unique payload strings.
              </div>
              {trackOverlays.length === 0 ? (
                <p className="small">No barcode tracks yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 8, marginTop: 10 }} data-testid="barcode-track-list">
                  {trackOverlays.map((track) => (
                    <div key={track.trackId} style={{ display: "grid", gridTemplateColumns: "minmax(90px, auto) minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: 9, borderRadius: 10, background: "rgba(255,255,255,0.05)", borderLeft: `4px solid ${trackColor(track.state)}` }}>
                      <span className="mono">{track.trackId}</span>
                      <span style={{ overflowWrap: "anywhere" }}>{track.payload}</span>
                      <span className="small">{formatLabel(track.format)} · {track.state}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="small" style={{ marginTop: 10 }}>
            If permission prompt doesn’t show: on iOS use Safari, ensure the site is HTTPS, and allow camera access.
          </div>
        </div>
      )}

      {mode === "upload" && (
        <div role="tabpanel" id="upload-panel" aria-labelledby="upload-tab">
          <div className="row" style={{ alignItems: "center" }}>
            <label htmlFor="qr-image-upload" className="small">
              Choose a QR image (up to 25 MiB / 24 MP)
            </label>
            <input
              id="qr-image-upload"
              type="file"
              accept="image/*"
              aria-label="Upload QR code image"
              data-testid="upload-input"
              disabled={!uploadReady}
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 12,
                border: "1px dashed rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.05)",
                color: "#eaf0ff",
                cursor: "pointer",
              }}
            />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={() => void onCancelUpload()}
              disabled={!isProcessing}
              aria-label="Cancel decoding"
              data-testid="cancel-button"
            >
              Cancel
            </button>
            <button type="button" className="btn" onClick={resetUpload} aria-label="Reset upload result">
              Reset
            </button>
          </div>
          <div className="small" style={{ marginTop: 10, lineHeight: "1.6" }}>
            Images are processed entirely in your browser. They are not uploaded to a server and are not saved.
          </div>
        </div>
      )}

      <hr />

      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
      <div className="badge">
          <span>Result</span>
          {primary && <span className="mono">{results[0]?.format ?? (isUrl ? "URL" : "TEXT")}</span>}
          {results.length > 1 && <span className="mono">{results.length} codes</span>}
        </div>

        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() => copyResult()}
            disabled={!primary}
            aria-label="Copy decoded result"
            data-testid="copy-button"
          >
            Copy
          </button>
          <button
            type="button"
            className={safetyMode === "disabled" ? "btn primary" : "btn"}
            onClick={() => openIfUrl()}
            disabled={!primary || !isUrl}
            aria-label="Open decoded URL"
            data-testid="open-link-button"
          >
            {safetyMode !== "disabled" && ["high", "critical"].includes(primarySafetyState.analysis?.riskLevel ?? "") ? "Open anyway" : "Open Link"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <textarea
          className="mono"
          placeholder="Decoded barcode content will appear here…"
          value={primary}
          readOnly
          aria-label="Decoded barcode content"
          data-testid="decoded-output"
          data-engine={results[0]?.engine.id ?? ""}
              data-engine-variant={results[0]?.engine.variant ?? ""}
          data-format={results[0]?.format ?? ""}
        />
      </div>

      {primaryResult && (
        <>
          <div className="row small" style={{ marginTop: 10, alignItems: "center", gap: 12 }} data-testid="result-summary">
            <strong data-testid="format-badge">{formatLabel(primaryResult.format)}</strong>
            <span>{primaryResult.engine.id}</span>
            {primaryResult.isGs1 && <strong data-testid="gs1-indicator">GS1</strong>}
            {retail?.checkDigitValid !== undefined && (
              <span data-testid="checksum-status">Checksum: {retail.checkDigitValid ? "valid" : "invalid"}</span>
            )}
          </div>
          {rawBytes && (
            <details className="small" style={{ marginTop: 10 }}>
              <summary>Raw bytes</summary>
              <pre className="mono" data-testid="raw-bytes" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{rawBytes}</pre>
            </details>
          )}
          {parsedMetadata && (
            <details className="small" style={{ marginTop: 10 }}>
              <summary>Parsed metadata</summary>
              <pre className="mono" data-testid="parsed-metadata" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{parsedMetadata}</pre>
            </details>
          )}
          {recoveryDiagnostics && (
            <details className="small" style={{ marginTop: 10 }} data-testid="recovery-diagnostics">
              <summary>Recovery diagnostics (development)</summary>
              <pre className="mono" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(recoveryDiagnostics, null, 2)}</pre>
            </details>
          )}
        </>
      )}

      <UrlSafetyEvidence mode={safetyMode} onMode={setSafetyMode} state={primarySafetyState} />

      {results.length > 1 && (
        <ul className="small" style={{ marginTop: 10, paddingLeft: 18 }} data-testid="multi-results">
          {results.map((r, i) => (
            <li
              key={`${r.rawText}-${i}`}
              style={{ marginBottom: 6 }}
              data-testid="decoded-result-item"
              data-payload={r.rawText}
              data-format={r.format}
              data-engine={r.engine.id}
              data-engine-variant={r.engine.variant ?? ""}
            >
              <strong>{formatLabel(r.format)}</strong>{" "}<span className="mono">{r.rawText}</span>{" "}
              <button
                type="button"
                className="btn"
                style={{ padding: "4px 8px" }}
                onClick={() => copyResult(r.rawText)}
                data-testid="result-copy-button"
              >
                Copy
              </button>
              {isSafeActionUrl(r.rawText) && (
                <button
                  type="button"
                  className="btn"
                  style={{ padding: "4px 8px", marginLeft: 6 }}
                  onClick={() => openIfUrl(r.rawText)}
                  data-testid="result-open-link-button"
                >
                  Open Link
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {lastError && (
        <div
          className="small"
          style={{ marginTop: 10, color: "rgba(255,200,200,0.95)" }}
          role="alert"
          data-testid="error-message"
          data-error-reason={errorReason || undefined}
        >
          Error{errorReason ? ` (${errorReason})` : ""}: <span className="mono">{lastError}</span>
        </div>
      )}
    </section>
  );
}
