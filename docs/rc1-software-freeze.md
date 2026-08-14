# Scanly SDK v2 RC1 software freeze

RC1 is a feature-complete software candidate. `FEATURE_FREEZE=true` applies
from the RC1 source commit. New symbologies, recovery algorithms, tracking,
batch, camera subsystems, and public SDK subsystems are out of scope.

Every RC change must carry exactly one blocker class:

`RC-BLOCKER-CORRECTNESS`, `RC-BLOCKER-SECURITY`, `RC-BLOCKER-API`,
`RC-BLOCKER-ABI`, `RC-BLOCKER-COMPATIBILITY`, `RC-BLOCKER-MEMORY`,
`RC-BLOCKER-RELEASE`, or `RC-BLOCKER-DOCUMENTATION`.

The terms `nice to have` and `while we're here` are not valid RC scope.

## Frozen public surfaces

| Surface | Classification | Freeze evidence |
| --- | --- | --- |
| `@scanly/core`, `@scanly/browser`, `@scanly/node`, `@scanly/react` | Stable | `api-snapshots/public-api.json` |
| Scenario and benchmark contracts | Stable | package API snapshot and contract tests |
| DPM recovery profile | Experimental | explicitly opt-in; no certification claim |
| Recovery implementation, worker internals, camera internals | Internal | not exported as application contracts |
| `native/core/include/scanly/core.h` | Stable C ABI | `api-snapshots/native-abi.json` |
| `ScanlySDK` Swift public types | Stable | `api-snapshots/native-api.json` |
| `io.scanly.sdk` Kotlin public types | Stable | `api-snapshots/native-api.json` |

Breaking changes after RC1 require a new RC candidate and an explicit API/ABI
snapshot review. A stable release is not implied by this candidate.

## Dependency freeze

The authoritative policy is `release/rc1/dependency-freeze.json`. A dependency
may change only for a critical/high security issue, an unsupported runtime, or
a release-breaking incompatibility. Tooling-only and non-security major
upgrades are recorded as `POST_V2` instead of being silently folded into RC1.

## Supported runtime matrix

| Runtime | Supported/tested contract |
| --- | --- |
| Node.js | `>=20.16 <25`, CI-tested on Node 20 and 24 |
| npm | `>=10` |
| Chromium, Firefox, WebKit | automated browser regression tested; camera hardware pending |
| iOS | deployment target iOS 13; Swift tools 5.9; physical validation pending |
| Android | minSdk 24; compile/target SDK 36; Java/Kotlin 17; NDK 27.2.12479018; ABIs `arm64-v8a`, `x86_64` |
| `armeabi-v7a` | unsupported |

State vocabulary is restricted to `supported`, `tested`, `unsupported`, and
`pending-physical`. “Probably works” is not an evidence state.

## Cross-platform contract

Web, Node, iOS, and Android use the same format names, UTF-8 payload semantics,
decoder-provided raw bytes, original-frame pixel geometry, clockwise orientation,
error taxonomy, deterministic result ordering, and multi-result semantics. A
platform adapter must not reinterpret these fields.

## Security and signing boundary

RC1 requires dependency audit, ASan/UBSan, bounded malformed-input fuzz smoke,
secret scan, CycloneDX SBOM, and a complete license inventory. Production
signing is intentionally not established yet; artifacts are CI candidates only
and are marked `SIGNING_NOT_YET_PRODUCTION`.

Physical Web iOS, Web Android, Native iOS, and Native Android evidence remains
`DEFERRED_TO_FINAL_RC_VALIDATION`; Issue #13 stays open.
