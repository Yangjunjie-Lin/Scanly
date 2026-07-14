# Security policy

## Supported version

Security fixes target the latest code on `main` and the latest published 1.x release. Older snapshots are not maintained separately.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **Report a vulnerability** / private security advisory flow when available. If that option is unavailable, contact the repository maintainer privately through the contact method on the maintainer's GitHub profile. Do not open a public issue with exploit details, sensitive QR payloads, tokens, or personal images.

Include the affected revision, browser/OS, reproduction steps, impact, and a minimal non-sensitive test case. Allow reasonable time for triage and a coordinated fix before disclosure.

## Scope

Relevant reports include unsafe URL handling, payload-to-HTML injection, dependency vulnerabilities, Worker isolation/ownership failures, unintended network transfer, camera lifecycle/privacy failures, and resource-exhaustion paths.

Scanly has no image upload backend, accounts, storage, analytics, or database. Reports about infrastructure not controlled by this repository may need to go to Vercel, the browser vendor, or the affected dependency.

## Dependency policy

High and critical production advisories are investigated promptly and fixed with the smallest supported update that passes the production build, cross-browser Worker checks, and required benchmark. Security work does not lower fixture or coverage gates.
