# Scenario enforcement matrix

Every production scenario field is either executed or rejected before execution. There are no accepted-but-ignored fields.

| Field | Status | Enforcement |
|---|---|---|
| `schemaVersion` | Implemented | Only schema `2.0` is accepted. |
| `id`, `revision` | Implemented | Portable id and positive revision are validated and participate in graph-cache identity. |
| `description` | Implemented | Optional, bounded to 512 characters. |
| `acceptedFormats` | Implemented | Compiler requires requested engines to cover every format. Shipped engines cover only `qr_code`. |
| `input.preferredPixelFormats` | Implemented | Router rejects frames whose pixel format is not listed. YUV remains unsupported without a normalization operator. |
| `input.roi` | Implemented | Full-frame or bounded relative ROI is applied before localization. |
| `localization.strategy` | Implemented | `edge-density` or `full-frame` controls localization. |
| `localization.maxCandidates` | Implemented | Drives candidate generation and must not exceed the candidate budget. |
| `localization.cropPaddings` | Implemented | Drives crop geometry. |
| `localization.scales` | Implemented | Drives multi-scale candidates when ablation permits. |
| `enhancement.operators` | Implemented | Ordered preprocessing plan. |
| `enhancement.rotations` | Implemented | Ordered 0/90/180/270 geometry plan. |
| `decoders.order` | Implemented | Plugin ids are resolved exactly and determine deterministic aggregation order. |
| `decoders.execution` | Implemented | Sequential or real parallel branches; unsafe parallel engines are rejected. |
| `multiCode.enabled`, `maxResults` | Implemented | Controls adaptive multi-result collection and hard result bound. |
| `duplicateSuppression` | Implemented | Bounded session/camera policy with payload, format, and optional spatial/track identity support. |
| All `budgets.*` | Implemented | Pixels, candidates, attempts, retained allocations/bytes, execution deadline, and concurrent frames are enforced. |
| `validation[]` | Implemented | Required validators resolve at compile time; optional misses become warnings. |
| `semanticParsers` | Implemented | Only enabled parser kinds are attached to results. |
| `quality.minimumHeuristicQuality` | Rejected | No defensible quality signal exists; compiler returns `invalid_configuration`. |
| `output.includeRawBytes` | Implemented | Includes only decoder-provided bytes. |
| `output.includeDebugTrace` | Implemented | Exposes bounded stage-only trace events. |
| `output.includeAttempts` | Implemented | Exposes bounded, payload-free public attempt records. |
| `ablation.localization` | Implemented | Disables localization. |
| `ablation.multiScale` | Implemented | Restricts scale plan to 1.0. |
| `ablation.enhancement` | Implemented | Restricts preprocessing to original pixels. |
| `ablation.rotations` | Implemented | Restricts rotation to 0. |
| `ablation.zxingFallback` | Implemented | When false, only the first configured decoder executes (retained legacy field name). |
| `ablation.splitImageFallback` | Implemented | Controls split-image candidates. |

Unknown fields are rejected. Plugin engine ids are open-ended portable strings so adding a future engine does not require changing the core Router or schema enum.
