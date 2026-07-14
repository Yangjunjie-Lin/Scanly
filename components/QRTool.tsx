"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { decodeUploadedFile } from "@/lib/qr/decode-upload";
import { looksLikeUrl } from "@/lib/qr/result-normalizer";
import type { DecodedCode, DecodeErrorReason } from "@/lib/qr/types";

type Mode = "camera" | "upload";

function friendlyCameraError(e: unknown): { reason: DecodeErrorReason; message: string } {
  const msg = String(e instanceof Error ? e.message : e);
  if (/NotAllowedError|Permission denied|permission/i.test(msg)) {
    return {
      reason: "camera_permission_denied",
      message: "Camera permission denied. Allow camera access in the browser settings and try again.",
    };
  }
  if (/NotFoundError|DevicesNotFound|Requested device not found|no.*device/i.test(msg)) {
    return {
      reason: "no_camera",
      message: "No camera device found on this device.",
    };
  }
  return { reason: "no_camera", message: msg };
}

export default function QRTool() {
  const [mode, setMode] = useState<Mode>("camera");
  const [status, setStatus] = useState<string>("Idle");
  const [results, setResults] = useState<DecodedCode[]>([]);
  const [lastError, setLastError] = useState<string>("");
  const [errorReason, setErrorReason] = useState<DecodeErrorReason | "">("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadSeqRef = useRef(0);

  const reader = useMemo(() => new BrowserQRCodeReader(), []);

  const primary = results[0]?.payload ?? "";
  const isUrl = primary ? looksLikeUrl(primary) : false;

  useEffect(() => {
    let cancelled = false;
    async function loadDevices() {
      try {
        setLastError("");
        setErrorReason("");
        setStatus("Loading camera devices… (you may need to allow permission first)");
        const list = await BrowserQRCodeReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(list);
        const back = list.find((d) => /back|rear|environment/i.test(d.label));
        const pick = back?.deviceId || list[0]?.deviceId || "";
        setDeviceId((prev) => prev || pick);
        setStatus(list.length ? "Ready" : "Ready (no camera detected)");
        if (list.length === 0) {
          setErrorReason("no_camera");
          setLastError("No camera device found.");
        }
      } catch (e) {
        if (cancelled) return;
        const friendly = friendlyCameraError(e);
        setStatus("Ready (camera devices not available yet)");
        setErrorReason(friendly.reason);
        setLastError(friendly.message);
      }
    }
    loadDevices();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      stopScan();
      uploadAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startScan() {
    setLastError("");
    setErrorReason("");
    setResults([]);

    if (!videoRef.current) {
      setLastError("Video element not ready.");
      return;
    }
    if (!deviceId && devices.length === 0) {
      setErrorReason("no_camera");
      setLastError("No camera device found.");
      return;
    }

    try {
      setStatus("Requesting camera permission…");
      setIsScanning(true);

      const controls = await reader.decodeFromVideoDevice(
        deviceId || undefined,
        videoRef.current,
        (result, _error, ctrl) => {
          if (result) {
            const text = result.getText();
            setResults([
              {
                payload: text,
                decoder: "zxing",
                preprocessing: "original",
                candidateIndex: 0,
                scale: "original",
                rotation: 0,
                cropPadding: "full",
                attemptIndex: 0,
              },
            ]);
            setStatus("Decoded");
            navigator.vibrate?.(50);
            ctrl.stop();
            controlsRef.current = null;
            setIsScanning(false);
          }
        }
      );

      controlsRef.current = controls;
      setStatus("Scanning… point the QR code inside the frame");
    } catch (e) {
      setIsScanning(false);
      setStatus("Ready");
      const friendly = friendlyCameraError(e);
      setErrorReason(friendly.reason);
      setLastError(friendly.message);
    }
  }

  function stopScan() {
    try {
      controlsRef.current?.stop();
    } catch {
      /* ignore */
    }
    // Stop any leftover media tracks
    const video = videoRef.current;
    const stream = video?.srcObject;
    if (video && stream instanceof MediaStream) {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    }
    controlsRef.current = null;
    setIsScanning(false);
    setStatus("Stopped");
  }

  function resetUpload() {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    setIsProcessing(false);
    setResults([]);
    setLastError("");
    setErrorReason("");
    setStatus("Ready");
  }

  async function onUpload(file: File | null) {
    if (!file) return;

    uploadAbortRef.current?.abort();
    const seq = ++uploadSeqRef.current;
    const controller = new AbortController();
    uploadAbortRef.current = controller;

    setLastError("");
    setErrorReason("");
    setResults([]);
    setIsProcessing(true);

    const outcome = await decodeUploadedFile(file, {
      signal: controller.signal,
      onStage: (stage) => {
        if (seq === uploadSeqRef.current) setStatus(stage);
      },
      config: { findMultiple: true, maxMultipleResults: 6 },
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
    } else {
      setResults([]);
      setErrorReason(outcome.reason);
      setLastError(outcome.message);
      setStatus(outcome.cancelled ? "Cancelled" : "Failed to decode image");
    }
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
    if (!looksLikeUrl(text)) return;
    window.open(text, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="card" aria-label="QR code scanner">
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div className="tabs" role="tablist" aria-label="Scan mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "camera"}
            className={`tab ${mode === "camera" ? "active" : ""}`}
            onClick={() => {
              setMode("camera");
              resetUpload();
            }}
          >
            Camera
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            className={`tab ${mode === "upload" ? "active" : ""}`}
            onClick={() => {
              stopScan();
              setMode("upload");
              setLastError("");
              setErrorReason("");
              setResults([]);
              setStatus("Ready");
            }}
          >
            Upload
          </button>
        </div>

        <div className="badge" aria-live="polite">
          <span className="mono">{status}</span>
        </div>
      </div>

      <hr />

      {mode === "camera" && (
        <>
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
        </>
      )}

      {mode === "upload" && (
        <>
          <div className="row" style={{ alignItems: "center" }}>
            <input
              type="file"
              accept="image/*"
              aria-label="Upload QR code image"
              data-testid="upload-input"
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
              onClick={() => uploadAbortRef.current?.abort()}
              disabled={!isProcessing}
              aria-label="Cancel decoding"
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
        </>
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
        />
      </div>

      {results.length > 1 && (
        <ul className="small" style={{ marginTop: 10, paddingLeft: 18 }} data-testid="multi-results">
          {results.map((r, i) => (
            <li key={`${r.payload}-${i}`} style={{ marginBottom: 6 }}>
              <span className="mono">{r.payload}</span>{" "}
              <button type="button" className="btn" style={{ padding: "4px 8px" }} onClick={() => copyResult(r.payload)}>
                Copy
              </button>
              {looksLikeUrl(r.payload) && (
                <button
                  type="button"
                  className="btn primary"
                  style={{ padding: "4px 8px", marginLeft: 6 }}
                  onClick={() => openIfUrl(r.payload)}
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
