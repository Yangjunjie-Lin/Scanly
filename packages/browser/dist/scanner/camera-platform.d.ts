import { type SdkError, type SdkErrorCode } from "@scanly/core";
export type CameraLifecycleReason = "orientation-change" | "resolution-change" | "constraints-renegotiated" | "background-suspended" | "foreground-resumed";
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
export declare function cameraError(error: unknown, fallback?: string): SdkError;
export declare function negotiateCameraStream(policy: CameraConstraintPolicy): Promise<{
    stream: MediaStream;
    diagnostics: DeviceDiagnostics;
}>;
export declare function diagnosticsForTrack(policy: CameraConstraintPolicy, track: MediaStreamTrack | undefined, attempts?: readonly CameraConstraintAttempt[]): DeviceDiagnostics;
export declare class CameraRecoveryController {
    private attempts;
    private restarts;
    private failures;
    private exhausted;
    private readonly maximumRetries;
    private readonly baseDelayMs;
    private readonly maximumDelayMs;
    private readonly waiter;
    constructor(policy?: CameraRecoveryPolicy);
    next(reason: string): CameraRecoveryDecision;
    wait(decision: CameraRecoveryDecision): Promise<void>;
    markRestarted(): void;
    markFailed(): void;
    reset(): void;
    getStatistics(): CameraRecoveryStatistics;
}
//# sourceMappingURL=camera-platform.d.ts.map