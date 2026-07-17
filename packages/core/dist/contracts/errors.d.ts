export declare const SDK_ERROR_CODES: readonly ["no_symbol_found", "unsupported_format", "invalid_image", "resource_limit_exceeded", "timeout", "cancelled", "worker_initialization_failure", "engine_initialization_failure", "engine_execution_failure", "camera_permission_denied", "camera_unavailable", "source_disconnected", "unsupported_browser_capability", "malformed_scenario", "invalid_configuration", "internal_invariant_failure", "session_not_running", "session_disposed", "concurrent_call_rejected"];
export type SdkErrorCode = (typeof SDK_ERROR_CODES)[number];
export type SdkErrorCategory = "input" | "resource" | "lifecycle" | "engine" | "source" | "configuration" | "internal";
export interface SdkError {
    code: SdkErrorCode;
    category: SdkErrorCategory;
    message: string;
    retryable: boolean;
    details?: Readonly<Record<string, string | number | boolean | null>>;
    cause?: unknown;
}
export declare class SdkException extends Error {
    readonly error: SdkError;
    constructor(error: SdkError);
}
export declare function sdkError(code: SdkErrorCode, message: string, details?: SdkError["details"], cause?: unknown): SdkError;
//# sourceMappingURL=errors.d.ts.map