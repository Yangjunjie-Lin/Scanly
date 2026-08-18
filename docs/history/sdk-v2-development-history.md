# Scanly SDK v2 development history

This document preserves the engineering narrative that preceded the published v2.0.0 Stable release. It is historical evidence, not the current installation or support status.

## Milestone timeline

| Milestone | Historical scope | Preserved evidence |
| --- | --- | --- |
| Alpha.1–Alpha.4 | Workspace architecture, bounded QR pipeline, benchmark lifecycle, Worker routing, and the optional ZXing-C++ WASM foundation | [Changelog](../../CHANGELOG.md), [benchmark evidence lifecycle](../benchmarking/evidence-lifecycle.md), historical tags and baselines |
| Alpha.5 | Eight-format public vocabulary, explicit format masks, retail checksum rules, multi-format fixtures, and measured symbology gates | [Symbology documentation](../symbologies.md), [Alpha.5 assessment](../releases/alpha5-release-assessment.md) |
| Beta 1 | Realtime scanner scheduling, lifecycle, temporal confirmation, camera contracts, and Worker/WASM soaks | [Realtime runtime history](../beta1-realtime-runtime.md), [migration note](beta1-realtime-scanner-migration.md) |
| Beta 2 | Multi-object tracking, physical-instance identity, and batch completion | [Tracking and batch history](../beta2-tracking-batch.md) |
| Beta 3 | Diagnosis-driven, budgeted industrial recovery and the experimental DPM boundary | [Industrial recovery history](../beta3-industrial-recovery.md) |
| Beta 4 | Device Lab, fail-closed evidence schemas, and camera/platform hardening | [Device validation history](../beta4-device-validation.md), [Issue #13](https://github.com/Yangjunjie-Lin/Scanly/issues/13) |
| Beta 5 | Shared native C ABI, Swift package, Android AAR/JNI, native fixtures, API/ABI gates | [Native mobile history](../beta5-native-mobile.md) |
| RC1 | Software freeze, public API classification, security and reproducibility qualification | [RC1 freeze](../rc1-software-freeze.md), `release/rc1/`, tag `v2-rc1-r1` |
| RC2 | Exact-candidate artifact, manifest, API/ABI, Native, and Stable policy validation | [RC2 integrity history](../releases/rc2-manifest-integrity-v2.md), `release/rc2/`, tags `v2-rc2-r1` through `v2-rc2-r4` |
| v2.0.0 | Stable publication through GitHub Release, npm `latest`, native source package, Android AAR, and production Web deployment | [Stable release notes](../releases/v2.0.0.md), `release/stable/`, tag `v2.0.0` |

## Evidence boundary

Historical benchmark, Alpha/Beta gate, and RC qualification language remains valid only for the milestone it records. It must not be read as the current repository state. v2.0.0 has shipped; physical qualification remains a separate post-release program with zero admitted physical sessions until real evidence is added.

The immutable chain is:

1. RC and Stable qualification evidence under `release/` and immutable tags.
2. The v2.0.0 publication record, which records external publication facts without rewriting qualification.
3. A future physical qualification record, created only after Issue #13 has admissible real-hardware evidence.

## Historical frozen benchmark evidence

The last fully frozen pre-v2 benchmark evidence is **Alpha.4 r4** (`v2-alpha4-r4`). Its dataset is the legacy 74-fixture QR suite. The canonical evidence identity is `alpha4-cc1a5968d39ffbea`, sourced from commit `a139c8b7064a83c26cfba5a9ff4fb75c3f6c9f83` and tree `31da835767e4d691716f3c327f4cbb0b615d95ac`.

<!-- HISTORICAL_BENCHMARK_SUMMARY_START -->
| Historical Alpha.4 r4 canonical evidence | Value |
| --- | ---: |
| Legacy QR fixtures | 74 |
| Generated fixtures | 65 |
| Project-owned photographs | 9 |
| Balanced success | **73/74 (98.6%)** |
| Positive decode recall | **62/63 (98.4%)** |
| Negative false positives | **0/11 (0.0%)** |
| Remaining failure | `14-damaged` |
| Parallel execution | experimental |
| Benchmark date | 2026-07-18 |
<!-- HISTORICAL_BENCHMARK_SUMMARY_END -->

## Historical Alpha.5 integration corpus

Alpha.5 integration evidence is development evidence. It is not frozen canonical release evidence.

<!-- ALPHA5_INTEGRATION_SUMMARY_START -->
| Historical Alpha.5 development evidence | Value |
| --- | ---: |
| Generated Alpha.5 fixtures | 146 |
| Curated open-license camera photographs | **16 (minimum 12)** |
| Single-format positives | 113 |
| Mixed positives | 15 |
| Negative fixtures | 34 |
| Generated clean | **15/15** |
| Generated difficult | **75/85** |
| Mixed completeness | **12/12** |
| GS1 recognition | **8/8** |
| False positives | **0** |
| Optional project-owned photographs | **0** |
<!-- ALPHA5_INTEGRATION_SUMMARY_END -->

Curated open-license camera photographs satisfy the Beta 1 photo gate but do not constitute physical-camera/device evidence or project ownership.
