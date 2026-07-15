export const SDK_ERROR_CODES = [
  "no_symbol_found", "unsupported_format", "invalid_image", "resource_limit_exceeded", "timeout",
  "cancelled", "worker_initialization_failure", "engine_initialization_failure", "engine_execution_failure",
  "camera_permission_denied", "camera_unavailable", "source_disconnected", "unsupported_browser_capability",
  "malformed_scenario", "invalid_configuration", "internal_invariant_failure", "session_not_running",
  "session_disposed", "concurrent_call_rejected",
] as const;

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

export class SdkException extends Error {
  readonly error: SdkError;
  constructor(error: SdkError) {
    super(error.message);
    this.name = "SdkException";
    this.error = error;
  }
}

export function sdkError(code: SdkErrorCode, message: string, details?: SdkError["details"], cause?: unknown): SdkError {
  const category: SdkErrorCategory =
    code === "invalid_image" || code === "unsupported_format" || code === "no_symbol_found" ? "input" :
    code === "resource_limit_exceeded" || code === "timeout" ? "resource" :
    code.includes("engine") || code.includes("worker") ? "engine" :
    code.includes("camera") || code === "source_disconnected" || code === "unsupported_browser_capability" ? "source" :
    code.includes("scenario") || code === "invalid_configuration" ? "configuration" :
    code === "internal_invariant_failure" ? "internal" : "lifecycle";
  const retryable = !["unsupported_format", "malformed_scenario", "invalid_configuration", "session_disposed"].includes(code);
  return { code, category, message, retryable, details, ...(cause === undefined ? {} : { cause }) };
}
