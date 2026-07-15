export const SDK_ERROR_CODES = [
    "no_symbol_found", "unsupported_format", "invalid_image", "resource_limit_exceeded", "timeout",
    "cancelled", "worker_initialization_failure", "engine_initialization_failure", "engine_execution_failure",
    "camera_permission_denied", "camera_unavailable", "source_disconnected", "unsupported_browser_capability",
    "malformed_scenario", "invalid_configuration", "internal_invariant_failure", "session_not_running",
    "session_disposed", "concurrent_call_rejected",
];
export class SdkException extends Error {
    error;
    constructor(error) {
        super(error.message);
        this.name = "SdkException";
        this.error = error;
    }
}
export function sdkError(code, message, details, cause) {
    const category = code === "invalid_image" || code === "unsupported_format" || code === "no_symbol_found" ? "input" :
        code === "resource_limit_exceeded" || code === "timeout" ? "resource" :
            code.includes("engine") || code.includes("worker") ? "engine" :
                code.includes("camera") || code === "source_disconnected" || code === "unsupported_browser_capability" ? "source" :
                    code.includes("scenario") || code === "invalid_configuration" ? "configuration" :
                        code === "internal_invariant_failure" ? "internal" : "lifecycle";
    const retryable = !["unsupported_format", "malformed_scenario", "invalid_configuration", "session_disposed"].includes(code);
    return { code, category, message, retryable, details, ...(cause === undefined ? {} : { cause }) };
}
//# sourceMappingURL=errors.js.map