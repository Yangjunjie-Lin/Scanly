# Threat model

## Assets and trust boundaries

Assets are user image bytes, camera frames, decoded content, browser permissions, CPU/memory availability, and host-application integrity. Untrusted boundaries include uploaded files, pixel-buffer metadata, QR payload strings, scenario JSON, Worker messages, media devices, npm dependencies, and future WASM binaries.

## Principal threats and controls

| Threat | Current controls | Remaining risk |
| --- | --- | --- |
| Image exfiltration | no backend, analytics, telemetry, history, or remote logging | host application can add networking; integrator must audit it |
| Script/HTML injection | payloads remain text; no HTML rendering; semantic parsers are side-effect free | host application may render unsafely |
| Dangerous URI action | only parsed HTTP/HTTPS enables reference Open Link; explicit user action | redirects and destination content remain outside Scanly |
| Resource exhaustion | file bytes, dimensions, pixels, attempts, candidates, time, results, retained artifacts, and concurrency are bounded | browser image decompression occurs before full pixel validation on some APIs |
| Worker spoof/stale result | runtime message validation, job ownership, termination cancellation, recreation | same-origin compromised script can control application state |
| Camera privacy leak | explicit permission, stop/unmount/visibility track cleanup, no recording/storage | hardware/browser bugs and host misuse |
| Malformed configuration | versioned runtime validation with paths/messages | custom validators/operators remain integrator code |
| Supply chain | lockfile, Dependabot, explicit engine versions, package build gates, zero-advisory audit at verification | new advisories and optional engine assets require ongoing triage |
| WASM substitution | no WASM shipped | future asset integrity/loading design is unresolved |

Decoded text and image pixels must never be included in diagnostics by default. Any future diagnostics must be opt-in and redact both.
