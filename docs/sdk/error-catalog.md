# Error catalog

All platforms expose a typed error code. Applications must branch on the code,
not on a localized message.

| Code | Meaning | Recoverable | User action | Platforms |
| --- | --- | --- | --- | --- |
| `invalid_image` | dimensions, stride, or pixel buffer is invalid | no | provide a normalized frame | all |
| `no_symbol_found` | no supported symbol was decoded | yes | retry or adjust framing | all |
| `unsupported_format` | requested format has no registered engine | no | select a supported format | all |
| `resource_limit_exceeded` | bounded pixels, payload, result, or memory budget exceeded | yes | reduce input size/count | all |
| `timeout` | bounded decode deadline elapsed | yes | retry or use a larger budget | all |
| `cancelled` | caller cancelled the operation | yes | start a new operation | all |
| `worker_initialization_failure` | browser Worker/WASM could not initialize | yes | check HTTPS/CSP/assets | Web |
| `engine_initialization_failure` | decoder engine could not initialize | usually | retry and inspect diagnostics | all |
| `engine_execution_failure` | decoder failed during execution | yes | retry and collect diagnostics | all |
| `camera_permission_denied` | camera permission was denied | yes | grant camera permission | Web/iOS/Android |
| `camera_unavailable` | no usable camera is available | yes | select another camera | Web/iOS/Android |
| `source_disconnected` | camera source ended or was detached | yes | restart the session | Web/iOS/Android |
| `unsupported_browser_capability` | requested torch/zoom/focus is unavailable | yes | omit the optional capability | Web |
| `malformed_scenario` | scenario contract is invalid | no | correct the scenario | Web/Node |
| `invalid_configuration` | options violate a bounded contract | no | correct options | all |
| `session_not_running` | operation requires a running session | yes | start the session | Web/iOS/Android |
| `session_disposed` | operation was attempted after disposal | no | create a new session | all |
| `concurrent_call_rejected` | configured concurrency policy rejected a call | yes | retry after the active call | all |
| `internal_invariant_failure` | an internal invariant failed | no | report diagnostics; do not retry blindly | all |

Native wrappers map C status values to the same taxonomy and preserve result
ordering and geometry semantics.
