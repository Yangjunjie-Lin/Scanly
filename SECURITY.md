# Security policy

## Supported version

Security fixes target the latest code on `main`, the latest published 1.x release, and the active `architecture/sdk-v2-foundation` preview until it is merged or superseded. SDK v2 alpha packages in this repository are not yet published or covered by a stable support promise.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **Report a vulnerability** / private security advisory flow when available. If that option is unavailable, contact the repository maintainer privately through the contact method on the maintainer's GitHub profile. Do not open a public issue with exploit details, sensitive QR payloads, tokens, or personal images.

Include the affected revision, browser/OS, reproduction steps, impact, and a minimal non-sensitive test case. Allow reasonable time for triage and a coordinated fix before disclosure.

## Scope

Relevant reports include unsafe URL handling, payload-to-HTML injection, parser confusion, malformed frame/scenario handling, dependency vulnerabilities, Worker message/ownership failures, unintended network transfer, camera lifecycle/privacy failures, and resource-exhaustion paths.

Scanly has no image upload backend, accounts, storage, analytics, or database. Reports about infrastructure not controlled by this repository may need to go to Vercel, the browser vendor, or the affected dependency.

## Dependency policy

High and critical production advisories are investigated promptly and fixed with the smallest supported update that passes the production build, cross-browser Worker checks, and required benchmark. Security work does not lower fixture or coverage gates.

Dependency audit results are recorded in verification rather than hidden. Breaking forced upgrades are not applied without testing and maintainer review.

## Privacy and diagnostics

The shipped SDK has no analytics, tracking, remote upload, remote logging, or diagnostic endpoint. Image pixels and decoded content must not be added to logs by default. Any future diagnostics must be opt-in and redact both classes of data.

See the [threat model](docs/security/threat-model.md) and [secure integration guide](docs/security/secure-integration.md).
