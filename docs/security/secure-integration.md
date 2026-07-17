# Secure integration guide

- Keep Worker and future WASM assets self-hosted; do not add an image-upload fallback.
- Treat `rawText`, raw bytes, structured fields, filenames, and scenario descriptions as untrusted data. Render text nodes, not HTML.
- Require a user gesture for navigation, Wi-Fi, email, SMS, telephone, calendar, clipboard, torch, and camera actions.
- Permit navigation only after parsing and allowlisting protocols; consider host/domain policy for higher-risk products.
- Use tight scenario budgets appropriate to the device and call `dispose()` during route/component teardown.
- Do not log image data or decoded content. Avoid including them in exception trackers.
- Configure `Permissions-Policy`, framing policy, referrer policy, MIME types, and a deployment-tested CSP.
- Pin releases and lock dependencies. Investigate high/critical advisories; do not bypass test, benchmark, or package gates to update them.
- Validate custom scenarios before use. Unknown required validators cause validation failure rather than silent acceptance.

See [SECURITY.md](../../SECURITY.md) for private vulnerability reporting.
