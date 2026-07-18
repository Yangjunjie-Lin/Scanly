# Threat model

The Alpha.4 WASM binary is executable supply-chain input. It is pinned, shipped locally, verified by SHA-256 before instantiation, and never selected from user data. The native boundary enforces dimensions, bytes, allocation arithmetic, result count, payload size, and geometry limits. Worker execution provides realm isolation; synchronous native cancellation remains cooperative.

## Assets and trust boundaries

Assets are user image bytes, camera frames, decoded content, browser permissions, CPU/memory availability, and host-application integrity. Untrusted boundaries include uploaded files, pixel-buffer metadata, QR payload strings, scenario JSON, Worker messages, media devices, npm dependencies, custom plugins, and future WASM binaries.

## Principal threats and controls

| Threat | Current controls | Remaining risk |
| --- | --- | --- |
| Image exfiltration | no backend, analytics, telemetry, history, or remote logging | host application can add networking; integrator must audit it |
| Script/HTML injection | payloads remain text; no HTML rendering; semantic parsers are side-effect free | host application may render unsafely |
| Dangerous URI action | only parsed HTTP/HTTPS enables reference Open Link; explicit user action | redirects and destination content remain outside Scanly |
| Resource exhaustion | file bytes, dimensions, pixels, attempts, candidates, time, results, retained artifacts, concurrency, and output lengths are bounded | browser image decompression occurs before full pixel validation on some APIs |
| Worker spoof/stale result | bounded request/response validation, validated scenarios, job ownership, termination cancellation, recreation | same-origin compromised script can control application state |
| Camera privacy leak | explicit permission, unified stop/unmount/visibility track cleanup, no recording/storage | hardware/browser bugs and host misuse |
| Malformed configuration | versioned validation, unknown-field rejection, compile-time capability checks | custom validators/operators remain integrator code |
| Hostile decoder output | decoded text, warnings, messages, traces, attempts, and results are bounded; traces omit payload/pixels | third-party engine code executes with host privileges |
| Supply chain | lockfile, Dependabot, engine boundary, tarball/import/build gates, dependency audit | new advisories and optional engine assets require ongoing triage |
| WASM substitution | no WASM shipped | future asset integrity/loading design is unresolved |

Decoded text is capped at 65,536 characters. Warning and validation arrays are capped at 32 entries with 512-character messages. Error messages, Worker stage messages, public attempts, and Router trace events/details are bounded. Traces and attempts deliberately exclude payloads and image bytes. Any future diagnostics must be opt-in and redact both.
