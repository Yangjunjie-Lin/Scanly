# @scanly/browser

Reusable upload Worker and camera-source lifecycle for plain browser JavaScript, bundlers, and React adapters. Worker code is self-hosted through `new URL(..., import.meta.url)` and no network service or telemetry is used. Deployments must allow the emitted Worker URL in `worker-src`; future WASM engines will require an explicit self-hosted asset resolver.
