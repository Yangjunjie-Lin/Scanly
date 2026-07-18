"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserCameraSource, BrowserCaptureSession } from "@scanly/browser";
import { isSafeActionUrl } from "@scanly/parsers";
import type { ScanResult, SdkErrorCode } from "@scanly/core";

type Mode = "camera" | "upload";

export default function QRTool() {
  const [mode, setMode] = useState<Mode>("camera");
  const [status, setStatus] = useState<string>("Idle");
  const [results, setResults] = useState<ScanResult[]>([]);
  const [lastError, setLastError] = useState<string>("");
  const [errorReason, setErrorReason] = useState<SdkErrorCode | "">("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadReady, setUploadReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadSeqRef = useRef(0);
  const uploadStageRef = useRef("Preparing image…");
  const modeRef = useRef<Mode>("camera");

  const uploadSession = useMemo(() => new BrowserCaptureSession(), []);
  const cameraSource = useMemo(() => new BrowserCameraSource(), []);

  const primary = results[0]?.rawText ?? "";
  const isUrl = primary ? isSafeActionUrl(primary) : false;

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
      void cameraSource.dispose();
      uploadAbortRef.current?.abort();
      void uploadSession.dispose();
    };
  }, [cameraSource, uploadSession]);

  async function startScan() {
    setLastError("");
    setErrorReason("");
    setResults([]);

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

      await cameraSource.start(videoRef.current, {
        deviceId: deviceId || undefined,
        stopAfterResult: true,
        onResult: (outcome) => {
          if (!outcome.ok) return;
          setResults(outcome.results);
          setStatus("Decoded");
          navigator.vibrate?.(50);
          setIsScanning(false);
        },
        onError: (outcome) => {
          setErrorReason(outcome.error.code);
          setLastError(outcome.error.message);
          setIsScanning(false);
        },
      });
      setStatus("Scanning… point the QR code inside the frame");
    } catch (e) {
      setIsScanning(false);
      setStatus("Ready");
      const message = e instanceof Error ? e.message : String(e);
      setErrorReason(/NotAllowedError|permission denied/i.test(message) ? "camera_permission_denied" : "camera_unavailable");
      setLastError(message);
    }
  }

  function stopScan() {
    cameraSource.stop();
    // Stop any leftover media tracks
    const video = videoRef.current;
    const stream = video?.srcObject;
    if (video && typeof MediaStream !== "undefined" && stream instanceof MediaStream) {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    }
    setIsScanning(false);
    setStatus("Stopped");
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

      {mode === "camera" && (
        <div role="tabpanel" id="camera-panel" aria-labelledby="camera-tab">
          <div className="videoWrap">
            <video ref={videoRef} muted playsInline aria-label="Camera preview" />
            <div className="overlay" aria-hidden="true">
              <div className="scanBox" />
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
          {primary && <span className="mono">{isUrl ? "URL" : "TEXT"}</span>}
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
            className="btn primary"
            onClick={() => openIfUrl()}
            disabled={!primary || !isUrl}
            aria-label="Open decoded URL"
            data-testid="open-link-button"
          >
            Open Link
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <textarea
          className="mono"
          placeholder="Decoded QR content will appear here…"
          value={primary}
          readOnly
          aria-label="Decoded QR content"
          data-testid="decoded-output"
          data-engine={results[0]?.engine.id ?? ""}
          data-engine-variant={results[0]?.engine.variant ?? ""}
        />
      </div>

      {results.length > 1 && (
        <ul className="small" style={{ marginTop: 10, paddingLeft: 18 }} data-testid="multi-results">
          {results.map((r, i) => (
            <li
              key={`${r.rawText}-${i}`}
              style={{ marginBottom: 6 }}
              data-testid="decoded-result-item"
              data-payload={r.rawText}
              data-engine={r.engine.id}
              data-engine-variant={r.engine.variant ?? ""}
            >
              <span className="mono">{r.rawText}</span>{" "}
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
                  className="btn primary"
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
