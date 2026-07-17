# Worker deployment and self-hosting

`@scanly/browser` creates a module Worker using a relative ESM asset URL. The package build emits `dist/worker/decode-worker.js`; bundlers must copy or chunk that asset on the same origin. Worker creation, termination, malformed-message failure, stale-ID rejection, and lazy recreation are tested in unit and production browser paths.

## CSP

At minimum a host policy must permit its application scripts and emitted Worker asset. A common starting point is `worker-src 'self' blob:` and `img-src 'self' blob: data:`. Do not paste this into production blindly: Next.js script/style nonce strategy and Safari Worker behavior must be verified for the actual deployment. Scanly does not ship a permissive universal CSP because that would either break consumers or weaken their policy.

The reference application sets `nosniff`, strict referrer policy, camera-only Permissions Policy, and frame denial. It has no remote logging/report endpoint.

## Future WASM

No ZXing-C++ WASM binary is included. A future engine package must expose an explicit same-origin asset resolver, document MIME types, pin the binary checksum in release provenance, avoid `eval`, and test initialization failure/recovery under the same engine contract. Subresource Integrity does not automatically cover `fetch()`/Worker-loaded WASM in every integration; verify the chosen loading design.
