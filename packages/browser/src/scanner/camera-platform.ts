import { sdkError, type SdkError, type SdkErrorCode } from "@scanly/core";

export type CameraLifecycleReason =
  | "orientation-change"
  | "resolution-change"
  | "constraints-renegotiated"
  | "background-suspended"
  | "foreground-resumed";

export interface CameraLifecycleEvent {
  reason: CameraLifecycleReason;
  timestamp: number;
  detail?: string;
}

export interface CameraConstraintPolicy {
  deviceId?: string;
  facingMode?: "user" | "environment";
  preferredWidth?: number;
  preferredHeight?: number;
  preferredFrameRate?: number;
  /** Device selection is exact only when a caller explicitly supplies a device id. */
  exactDevice?: boolean;
  /** Bounded acquisition attempts. Defaults to three and is capped at four. */
  maximumAttempts?: number;
}

export interface CameraConstraintAttempt {
  index: number;
  constraints: MediaTrackConstraints | true;
  result: "negotiated" | "failed";
  errorCode?: SdkErrorCode;
  errorMessage?: string;
}

export interface DeviceDiagnostics {
  requestedConstraints: CameraConstraintPolicy;
  supportedConstraints: Record<string, boolean> | "unavailable";
  attempts: readonly CameraConstraintAttempt[];
  negotiatedSettings: Record<string, unknown> | "unavailable";
  trackCapabilities: Record<string, unknown> | "unavailable";
  trackConstraints: Record<string, unknown> | "unavailable";
}

export interface CameraRecoveryPolicy {
  maximumRetries?: number;
  baseDelayMs?: number;
  maximumDelayMs?: number;
  wait?: (delayMs: number) => Promise<void>;
}

export interface CameraRecoveryDecision {
  retry: boolean;
  attempt: number;
  delayMs: number;
  reason: string;
}

export interface CameraRecoveryStatistics {
  attempts: number;
  restarts: number;
  failures: number;
  exhausted: boolean;
}

const record = (value: unknown): Record<string, unknown> | "unavailable" => {
  if (!value || typeof value !== "object") return "unavailable";
  return { ...(value as Record<string, unknown>) };
};

function safeCall<T>(read: (() => T) | undefined): T | undefined {
  try { return read?.(); } catch { return undefined; }
}

export function cameraError(error: unknown, fallback = "Camera operation failed."): SdkError {
  const existing = error as Partial<SdkError> | undefined;
  if (existing?.code && existing.category && existing.message && typeof existing.retryable === "boolean") return existing as SdkError;
  const value = error as { name?: string; message?: string } | undefined;
  const name = value?.name ?? "";
  const message = (value?.message || String(error || fallback)).slice(0, 2_048);
  const code: SdkErrorCode =
    name === "NotAllowedError" || name === "SecurityError" || /permission denied|not allowed/i.test(message)
      ? "camera_permission_denied"
      : name === "NotFoundError" || name === "DevicesNotFoundError" || /requested device not found|no camera/i.test(message)
        ? "camera_not_found"
        : name === "NotReadableError" || name === "TrackStartError" || /could not start video source|camera.*busy/i.test(message)
          ? "camera_busy"
          : name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError" || /constraint/i.test(message)
            ? "camera_constraint_failed"
            : /track ended/i.test(message)
              ? "camera_track_ended"
              : "source_disconnected";
  return sdkError(code, message || fallback, { browserErrorName: name || "unavailable" }, error);
}

function supportedMediaConstraints(): MediaTrackSupportedConstraints | undefined {
  if (typeof navigator === "undefined") return undefined;
  return safeCall(() => navigator.mediaDevices?.getSupportedConstraints?.());
}

function preferredConstraints(policy: CameraConstraintPolicy): MediaTrackConstraints {
  const supported = supportedMediaConstraints();
  const accepts = (key: keyof MediaTrackSupportedConstraints): boolean => supported?.[key] !== false;
  return {
    ...(policy.deviceId && accepts("deviceId")
      ? { deviceId: policy.exactDevice === false ? { ideal: policy.deviceId } : { exact: policy.deviceId } }
      : {}),
    ...(policy.facingMode && accepts("facingMode") ? { facingMode: { ideal: policy.facingMode } } : {}),
    ...(policy.preferredWidth && accepts("width") ? { width: { ideal: policy.preferredWidth } } : {}),
    ...(policy.preferredHeight && accepts("height") ? { height: { ideal: policy.preferredHeight } } : {}),
    ...(policy.preferredFrameRate && accepts("frameRate") ? { frameRate: { ideal: policy.preferredFrameRate } } : {}),
  };
}

function negotiationCandidates(policy: CameraConstraintPolicy): Array<MediaTrackConstraints | true> {
  const preferred = preferredConstraints(policy);
  const fixedDevice = policy.deviceId
    ? { deviceId: policy.exactDevice === false ? { ideal: policy.deviceId } : { exact: policy.deviceId } }
    : {};
  const facing = policy.facingMode ? { facingMode: { ideal: policy.facingMode } } : {};
  const candidates: Array<MediaTrackConstraints | true> = [preferred];
  candidates.push({ ...fixedDevice, ...facing });
  candidates.push(Object.keys(fixedDevice).length > 0 ? fixedDevice : true);
  const maximum = Math.max(1, Math.min(4, Math.floor(policy.maximumAttempts ?? 3)));
  return candidates.filter((candidate, index, values) =>
    index === values.findIndex((entry) => JSON.stringify(entry) === JSON.stringify(candidate)),
  ).slice(0, maximum);
}

export async function negotiateCameraStream(policy: CameraConstraintPolicy): Promise<{
  stream: MediaStream;
  diagnostics: DeviceDiagnostics;
}> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw cameraError({ name: "NotSupportedError", message: "Camera capture is not supported by this browser." });
  }
  const attempts: CameraConstraintAttempt[] = [];
  let finalError: unknown;
  for (const [index, constraints] of negotiationCandidates(policy).entries()) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
      attempts.push({ index: index + 1, constraints, result: "negotiated" });
      const track = stream.getVideoTracks()[0];
      const supported = supportedMediaConstraints();
      return {
        stream,
        diagnostics: {
          requestedConstraints: { ...policy },
          supportedConstraints: supported ? { ...supported } as Record<string, boolean> : "unavailable",
          attempts,
          negotiatedSettings: record(safeCall(() => track?.getSettings?.())),
          trackCapabilities: record(safeCall(() => track?.getCapabilities?.())),
          trackConstraints: record(safeCall(() => track?.getConstraints?.())),
        },
      };
    } catch (error) {
      finalError = error;
      const typed = cameraError(error);
      attempts.push({ index: index + 1, constraints, result: "failed", errorCode: typed.code, errorMessage: typed.message });
      if (typed.code !== "camera_constraint_failed") break;
    }
  }
  const typed = cameraError(finalError);
  typed.details = { ...typed.details, negotiationAttempts: attempts.length };
  throw typed;
}

export function diagnosticsForTrack(
  policy: CameraConstraintPolicy,
  track: MediaStreamTrack | undefined,
  attempts: readonly CameraConstraintAttempt[] = [],
): DeviceDiagnostics {
  const supported = supportedMediaConstraints();
  return {
    requestedConstraints: { ...policy },
    supportedConstraints: supported ? { ...supported } as Record<string, boolean> : "unavailable",
    attempts,
    negotiatedSettings: record(safeCall(() => track?.getSettings?.())),
    trackCapabilities: record(safeCall(() => track?.getCapabilities?.())),
    trackConstraints: record(safeCall(() => track?.getConstraints?.())),
  };
}

export class CameraRecoveryController {
  private attempts = 0;
  private restarts = 0;
  private failures = 0;
  private exhausted = false;
  private readonly maximumRetries: number;
  private readonly baseDelayMs: number;
  private readonly maximumDelayMs: number;
  private readonly waiter: (delayMs: number) => Promise<void>;

  constructor(policy: CameraRecoveryPolicy = {}) {
    this.maximumRetries = Math.max(0, Math.min(10, Math.floor(policy.maximumRetries ?? 3)));
    this.baseDelayMs = Math.max(0, Math.min(10_000, Math.floor(policy.baseDelayMs ?? 200)));
    this.maximumDelayMs = Math.max(this.baseDelayMs, Math.min(30_000, Math.floor(policy.maximumDelayMs ?? 2_000)));
    this.waiter = policy.wait ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  }

  next(reason: string): CameraRecoveryDecision {
    if (this.attempts >= this.maximumRetries) {
      this.exhausted = true;
      return { retry: false, attempt: this.attempts, delayMs: 0, reason };
    }
    this.attempts += 1;
    const delayMs = Math.min(this.maximumDelayMs, this.baseDelayMs * (2 ** (this.attempts - 1)));
    return { retry: true, attempt: this.attempts, delayMs, reason };
  }

  async wait(decision: CameraRecoveryDecision): Promise<void> {
    if (decision.retry && decision.delayMs > 0) await this.waiter(decision.delayMs);
  }

  markRestarted(): void { this.restarts += 1; }
  markFailed(): void { this.failures += 1; }
  reset(): void { this.attempts = 0; this.restarts = 0; this.failures = 0; this.exhausted = false; }
  getStatistics(): CameraRecoveryStatistics { return { attempts: this.attempts, restarts: this.restarts, failures: this.failures, exhausted: this.exhausted }; }
}
