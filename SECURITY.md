# Security policy

## Supported versions

v2.0.0 is the current Stable release.

| Version | Security support |
| --- | --- |
| 2.0.x | Supported |
| 1.x | Best-effort security fixes only |
| Alpha, Beta, and RC builds | Unsupported historical development builds |

Security fixes normally target the latest supported patch in the 2.0 line. Support does not expand the public API or physical-device qualification claims of a released version.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's **Report a vulnerability** / private security advisory flow when available. If that option is unavailable, contact the repository maintainer privately through the contact method on the maintainer's GitHub profile. Do not open a public issue with exploit details, sensitive barcode payloads, tokens, or personal images.

Include the affected version or revision, browser/OS, reproduction steps, impact, and a minimal non-sensitive test case. Allow reasonable time for triage and a coordinated fix before disclosure.

## Scope

Relevant reports include unsafe URL handling, payload-to-HTML injection, parser confusion, malformed frame/scenario handling, dependency vulnerabilities, Worker message/ownership failures, unintended network transfer, camera lifecycle/privacy failures, native memory/ABI failures, and resource-exhaustion paths.

Scanly has no image upload backend, account system, storage service, analytics, or cloud decoder. Reports about infrastructure not controlled by this repository may need to go to Vercel, the browser vendor, platform vendor, or affected dependency.

## Dependency policy

High and critical production advisories are investigated promptly and fixed with the smallest supported update that passes the production build, cross-browser Worker checks, Native checks where applicable, and required regression gates. Security work does not lower fixture, coverage, API/ABI, or release-integrity gates.

Dependency audit results are recorded rather than hidden. Breaking forced upgrades are not applied without testing and maintainer review.

## Privacy and diagnostics

The shipped SDK has no analytics, remote tracking, image upload, remote logging, or diagnostic endpoint. Image pixels and decoded content must not be logged by default. Any future diagnostics must be opt-in and redact both classes of data.

See the [threat model](docs/security/threat-model.md) and [secure integration guide](docs/security/secure-integration.md).
