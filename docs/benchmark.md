# Benchmark

This document is **auto-generated** from `benchmark-results/latest.json`. Do not edit results by hand.

## Summary

| Metric | Value |
| --- | ---: |
| Generated at | 2026-07-16T04:37:18.922Z |
| Mode | full |
| Total fixtures | 63 |
| Successful decodes | 62 |
| Failed decodes | 1 |
| Success rate | 98.4% |
| Average elapsed | 0.68s |
| Median elapsed | 0.43s |
| P95 elapsed | 1.61s |
| P99 elapsed | insufficient sample (<100) |
| Decode recall | 98.1% (51/52) |
| False positives | 0/11 (0.0%) |
| Average attempts | 41.9 |
| Median attempts | 33.0 |
| P95 attempts | 96.0 |
| Regressions vs baseline | 0 |

## Phase timing distribution

| Phase | Average | Median | P95 |
| --- | ---: | ---: | ---: |
| candidateGenerationMs | 24.0ms | 12.2ms | 67.7ms |
| preprocessMs | 47.9ms | 24.5ms | 142.8ms |
| rotationMs | 0.0ms | 0.0ms | 0.0ms |
| frameNormalizationMs | 0.0ms | 0.0ms | 0.1ms |
| roiMs | 0.0ms | 0.0ms | 0.0ms |
| localizationMs | 0.0ms | 0.0ms | 0.0ms |
| candidateDeduplicationMs | 0.0ms | 0.0ms | 0.1ms |
| validationMs | 0.0ms | 0.0ms | 0.0ms |
| semanticParsingMs | 0.2ms | 0.2ms | 0.5ms |
| engine:jsqr | 494.2ms | 306.1ms | 1288.9ms |

## Multiple QR completeness

| Metric | Value |
| --- | ---: |
| Multiple fixtures | 3 |
| Complete (all required payloads) | 3 |

## Worst fixtures (by elapsed time)

- `55-negative-checker`: 3.40s, 96 attempts, pass
- `61-negative-screenshot`: 3.38s, 96 attempts, pass
- `62-negative-linear-barcode-like`: 2.25s, 96 attempts, pass
- `14-damaged`: 1.61s, 96 attempts, fail
- `57-negative-text-blocks`: 1.61s, 96 attempts, pass

## Per-category

| Category | Images | Success | Rate | Avg time |
| --- | ---: | ---: | ---: | ---: |
| adversarial | 7 | 7/7 | 100% | 1.54s |
| blur | 2 | 2/2 | 100% | 0.50s |
| clear | 1 | 1/1 | 100% | 0.26s |
| colored_background | 2 | 2/2 | 100% | 0.39s |
| complex_background | 2 | 2/2 | 100% | 0.72s |
| damaged | 2 | 1/2 | 50% | 0.95s |
| glare | 2 | 2/2 | 100% | 0.47s |
| high_resolution | 1 | 1/1 | 100% | 1.20s |
| inverted | 4 | 4/4 | 100% | 0.36s |
| low_contrast | 3 | 3/3 | 100% | 0.29s |
| motion_blur | 1 | 1/1 | 100% | 0.31s |
| multiple | 3 | 3/3 | 100% | 0.70s |
| near_edge | 2 | 2/2 | 100% | 0.42s |
| negative | 3 | 3/3 | 100% | 1.27s |
| noise | 2 | 2/2 | 100% | 0.26s |
| occlusion | 1 | 1/1 | 100% | 0.28s |
| overexposed | 2 | 2/2 | 100% | 0.44s |
| perspective | 2 | 2/2 | 100% | 0.56s |
| phone_photo | 1 | 1/1 | 100% | 0.66s |
| rotation | 5 | 5/5 | 100% | 0.43s |
| screen_capture | 3 | 3/3 | 100% | 1.47s |
| small_in_large | 2 | 2/2 | 100% | 0.82s |
| text | 3 | 3/3 | 100% | 0.36s |
| underexposed | 2 | 2/2 | 100% | 0.38s |
| unusual_aspect | 1 | 1/1 | 100% | 0.43s |
| url | 2 | 2/2 | 100% | 0.38s |
| wifi | 2 | 2/2 | 100% | 0.30s |

## Decoder distribution

- `jsqr`: 51

## Preprocessing success distribution

- `original`: 48
- `contrast`: 2
- `threshold-140`: 1

## Remaining failures

- `14-damaged`

## Per-fixture results

| ID | Category | Expected | Actual | Pass | Time | Decoder | Preprocess | Attempts | Failure |
| --- | --- | --- | --- | --- | ---: | --- | --- | ---: | --- |
| 01-clear-url | url | `https://scanly.example/clear` | `https://scanly.example/clear` | Pass | 0.47s | jsqr | original | 33 |  |
| 02-clear-text | text | `SCANLY_CLEAR_TEXT` | `SCANLY_CLEAR_TEXT` | Pass | 0.45s | jsqr | original | 33 |  |
| 03-phone-photo | phone_photo | `https://scanly.example/photo` | `https://scanly.example/photo` | Pass | 0.66s | jsqr | original | 33 |  |
| 04-screen-capture | screen_capture | `https://scanly.example/screen` | `https://scanly.example/screen` | Pass | 0.37s | jsqr | original | 33 |  |
| 05-low-contrast | low_contrast | `https://scanly.example/low-contrast` | `https://scanly.example/low-contrast` | Pass | 0.38s | jsqr | contrast | 33 |  |
| 06-dark-lighting | underexposed | `https://scanly.example/dark` | `https://scanly.example/dark` | Pass | 0.47s | jsqr | original | 33 |  |
| 07-overexposed | overexposed | `https://scanly.example/bright` | `https://scanly.example/bright` | Pass | 0.58s | jsqr | original | 33 |  |
| 08-blurry | blur | `https://scanly.example/blur` | `https://scanly.example/blur` | Pass | 0.76s | jsqr | original | 33 |  |
| 09-glare | glare | `https://scanly.example/glare` | `https://scanly.example/glare` | Pass | 0.64s | jsqr | original | 33 |  |
| 10-small-in-large | small_in_large | `https://scanly.example/small` | `https://scanly.example/small` | Pass | 0.66s | jsqr | original | 15 |  |
| 11-complex-background | complex_background | `https://scanly.example/background` | `https://scanly.example/background` | Pass | 0.93s | jsqr | original | 33 |  |
| 12-rotated | rotation | `https://scanly.example/rotated` | `https://scanly.example/rotated` | Pass | 1.00s | jsqr | original | 33 |  |
| 13-perspective | perspective | `https://scanly.example/perspective` | `https://scanly.example/perspective` | Pass | 0.79s | jsqr | original | 33 |  |
| 14-damaged | damaged | `https://scanly.example/damaged` | `` | Fail | 1.61s | - | - | 96 | no_symbol_found |
| 15-inverted | inverted | `https://scanly.example/inverted` | `https://scanly.example/inverted` | Pass | 0.62s | jsqr | original | 33 |  |
| 16-multiple-codes | multiple | `https://scanly.example/primary` | `https://scanly.example/primary` | Pass | 0.86s | jsqr | original | 29 |  |
| 17-clear-url-02 | url | `https://scanly.example/clear-02` | `https://scanly.example/clear-02` | Pass | 0.29s | jsqr | original | 33 |  |
| 18-clear-text-02 | text | `SCANLY_CLEAR_TEXT_02` | `SCANLY_CLEAR_TEXT_02` | Pass | 0.28s | jsqr | original | 33 |  |
| 19-wifi-payload | wifi | `WIFI:T:WPA;S:ScanlyLab;P:test-pass-01;;` | `WIFI:T:WPA;S:ScanlyLab;P:test-pass-01;;` | Pass | 0.29s | jsqr | original | 33 |  |
| 20-low-contrast-02 | low_contrast | `SCANLY_LOW_CONTRAST_02` | `SCANLY_LOW_CONTRAST_02` | Pass | 0.26s | jsqr | contrast | 15 |  |
| 21-underexposed-gen | underexposed | `SCANLY_UNDEREXPOSED_01` | `SCANLY_UNDEREXPOSED_01` | Pass | 0.28s | jsqr | original | 33 |  |
| 22-overexposed-gen | overexposed | `SCANLY_OVEREXPOSED_01` | `SCANLY_OVEREXPOSED_01` | Pass | 0.31s | jsqr | original | 33 |  |
| 23-blur-gen | blur | `SCANLY_BLUR_01` | `SCANLY_BLUR_01` | Pass | 0.25s | jsqr | original | 15 |  |
| 24-motion-blur | motion_blur | `SCANLY_MOTION_BLUR_01` | `SCANLY_MOTION_BLUR_01` | Pass | 0.31s | jsqr | original | 33 |  |
| 25-noise | noise | `SCANLY_NOISE_01` | `SCANLY_NOISE_01` | Pass | 0.26s | jsqr | original | 33 |  |
| 26-glare-gen | glare | `SCANLY_GLARE_01` | `SCANLY_GLARE_01` | Pass | 0.30s | jsqr | original | 33 |  |
| 27-inverted-01 | inverted | `SCANLY_INVERTED_01` | `SCANLY_INVERTED_01` | Pass | 0.26s | jsqr | original | 33 |  |
| 28-inverted-02 | inverted | `SCANLY_INVERTED_02` | `SCANLY_INVERTED_02` | Pass | 0.27s | jsqr | original | 33 |  |
| 29-rot-90 | rotation | `SCANLY_ROT_90` | `SCANLY_ROT_90` | Pass | 0.28s | jsqr | original | 33 |  |
| 30-rot-180 | rotation | `SCANLY_ROT_180` | `SCANLY_ROT_180` | Pass | 0.28s | jsqr | original | 33 |  |
| 31-rot-270 | rotation | `SCANLY_ROT_270` | `SCANLY_ROT_270` | Pass | 0.23s | jsqr | original | 33 |  |
| 32-rot-15 | rotation | `SCANLY_ROT_15` | `SCANLY_ROT_15` | Pass | 0.34s | jsqr | original | 33 |  |
| 33-small-in-large-gen | small_in_large | `SCANLY_SMALL_01` | `SCANLY_SMALL_01` | Pass | 0.99s | jsqr | original | 15 |  |
| 34-near-edge | near_edge | `SCANLY_NEAR_EDGE_01` | `SCANLY_NEAR_EDGE_01` | Pass | 0.39s | jsqr | original | 15 |  |
| 35-complex-bg-gen | complex_background | `SCANLY_COMPLEX_BG_01` | `SCANLY_COMPLEX_BG_01` | Pass | 0.51s | jsqr | original | 15 |  |
| 36-multiple-gen | multiple | `SCANLY_MULTI_PRIMARY` | `SCANLY_MULTI_PRIMARY` | Pass | 0.39s | jsqr | original | 29 |  |
| 37-occlusion | occlusion | `SCANLY_OCCLUSION_01` | `SCANLY_OCCLUSION_01` | Pass | 0.28s | jsqr | original | 33 |  |
| 38-damaged-gen | damaged | `SCANLY_DAMAGED_01` | `SCANLY_DAMAGED_01` | Pass | 0.30s | jsqr | original | 33 |  |
| 39-high-res | high_resolution | `SCANLY_HIRES_01` | `SCANLY_HIRES_01` | Pass | 1.20s | jsqr | original | 15 |  |
| 40-moire | screen_capture | `SCANLY_MOIRE_01` | `SCANLY_MOIRE_01` | Pass | 0.66s | jsqr | threshold-140 | 96 |  |
| 41-unusual-aspect | unusual_aspect | `SCANLY_ASPECT_01` | `SCANLY_ASPECT_01` | Pass | 0.43s | jsqr | original | 33 |  |
| 42-colored-bg | colored_background | `SCANLY_COLOR_BG_01` | `SCANLY_COLOR_BG_01` | Pass | 0.43s | jsqr | original | 15 |  |
| 43-transparent-bg | colored_background | `SCANLY_TRANSPARENT_01` | `SCANLY_TRANSPARENT_01` | Pass | 0.34s | jsqr | original | 33 |  |
| 44-clear-url-03 | clear | `https://scanly.example/clear-03` | `https://scanly.example/clear-03` | Pass | 0.26s | jsqr | original | 33 |  |
| 45-text-long | text | `SCANLY_LONG_TEXT_PAYLOAD_ABCDEF_0123456789` | `SCANLY_LONG_TEXT_PAYLOAD_ABCDEF_0123456789` | Pass | 0.35s | jsqr | original | 33 |  |
| 46-invert-url | inverted | `https://scanly.example/inverted-url` | `https://scanly.example/inverted-url` | Pass | 0.29s | jsqr | original | 33 |  |
| 47-near-edge-bottom | near_edge | `SCANLY_NEAR_EDGE_02` | `SCANLY_NEAR_EDGE_02` | Pass | 0.45s | jsqr | original | 15 |  |
| 48-perspective-mild | perspective | `SCANLY_PERSPECTIVE_01` | `SCANLY_PERSPECTIVE_01` | Pass | 0.33s | jsqr | original | 33 |  |
| 49-noise-dark | noise | `SCANLY_NOISE_DARK_01` | `SCANLY_NOISE_DARK_01` | Pass | 0.27s | jsqr | original | 33 |  |
| 50-multiple-three | multiple | `SCANLY_TRI_A` | `SCANLY_TRI_A` | Pass | 0.86s | jsqr | original | 55 |  |
| 51-gamma-ish | low_contrast | `SCANLY_GAMMA_01` | `SCANLY_GAMMA_01` | Pass | 0.22s | jsqr | original | 15 |  |
| 52-wifi-02 | wifi | `WIFI:T:nopass;S:GuestScanly;P:;;` | `WIFI:T:nopass;S:GuestScanly;P:;;` | Pass | 0.30s | jsqr | original | 33 |  |
| 53-negative-blank | negative | `` | `` | Pass | 1.24s | - | - | 96 | no_symbol_found |
| 54-negative-pattern | adversarial | `` | `` | Pass | 1.31s | - | - | 96 | no_symbol_found |
| 55-negative-checker | adversarial | `` | `` | Pass | 3.40s | - | - | 96 | no_symbol_found |
| 56-negative-random-noise | adversarial | `` | `` | Pass | 0.38s | - | - | 1 | no_symbol_found |
| 57-negative-text-blocks | negative | `` | `` | Pass | 1.61s | - | - | 96 | no_symbol_found |
| 58-negative-datamatrix-like | adversarial | `` | `` | Pass | 1.43s | - | - | 96 | no_symbol_found |
| 59-negative-logo | negative | `` | `` | Pass | 0.96s | - | - | 96 | no_symbol_found |
| 60-negative-grid | adversarial | `` | `` | Pass | 0.81s | - | - | 96 | no_symbol_found |
| 61-negative-screenshot | screen_capture | `` | `` | Pass | 3.38s | - | - | 96 | no_symbol_found |
| 62-negative-linear-barcode-like | adversarial | `` | `` | Pass | 2.25s | - | - | 96 | no_symbol_found |
| 63-negative-truncated | adversarial | `` | `` | Pass | 1.21s | - | - | 96 | no_symbol_found |

## Notes

- Results measure the shared `@scanly/core` QR pipeline (same logic used by Upload mode).
- These numbers are not a claim that Scanly is faster than third-party scanners.
- Hard-case fixtures are retained even when they fail.
