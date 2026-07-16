# Benchmark

This document is **auto-generated** from `benchmark-results/latest.json`. Do not edit results by hand.

## Summary

| Metric | Value |
| --- | ---: |
| Generated at | 2026-07-16T07:19:23.568Z |
| Mode | full |
| Total fixtures | 74 |
| Successful decodes | 73 |
| Failed decodes | 1 |
| Success rate | 98.6% |
| Average elapsed | 0.91s |
| Median elapsed | 0.66s |
| P95 elapsed | 2.23s |
| P99 elapsed | insufficient sample (<100) |
| Decode recall | 98.4% (62/63) |
| False positives | 0/11 (0.0%) |
| Average attempts | 64.0 |
| Median attempts | 53.0 |
| P95 attempts | 96.0 |
| Regressions vs baseline | 0 |

## Phase timing distribution

| Phase | Average | Median | P95 |
| --- | ---: | ---: | ---: |
| candidateGenerationMs | 23.7ms | 13.4ms | 54.3ms |
| preprocessMs | 55.6ms | 39.1ms | 172.0ms |
| rotationMs | 0.0ms | 0.0ms | 0.0ms |
| frameNormalizationMs | 0.0ms | 0.0ms | 0.1ms |
| roiMs | 0.0ms | 0.0ms | 0.1ms |
| localizationMs | 0.0ms | 0.0ms | 0.1ms |
| candidateDeduplicationMs | 0.0ms | 0.0ms | 0.1ms |
| validationMs | 0.0ms | 0.0ms | 0.1ms |
| semanticParsingMs | 0.2ms | 0.2ms | 0.7ms |
| engine:jsqr | 639.4ms | 459.3ms | 1920.7ms |
| engine:zxing-js | 0.3ms | 0.0ms | 0.0ms |

## Multiple QR completeness

| Metric | Value |
| --- | ---: |
| Multiple fixtures | 9 |
| Complete (all required payloads) | 9 |

## Worst fixtures (by elapsed time)

- `39-high-res`: 3.59s, 51 attempts, pass
- `72-version-40`: 3.40s, 89 attempts, pass
- `71-version-30`: 2.52s, 89 attempts, pass
- `55-negative-checker`: 2.23s, 96 attempts, pass
- `61-negative-screenshot`: 2.02s, 96 attempts, pass

## Per-category

| Category | Images | Success | Rate | Avg time |
| --- | ---: | ---: | ---: | ---: |
| adversarial | 7 | 7/7 | 100% | 1.16s |
| blur | 3 | 3/3 | 100% | 0.64s |
| clear | 1 | 1/1 | 100% | 0.40s |
| colored_background | 2 | 2/2 | 100% | 0.58s |
| complex_background | 3 | 3/3 | 100% | 0.84s |
| damaged | 2 | 1/2 | 50% | 0.78s |
| glare | 2 | 2/2 | 100% | 0.77s |
| high_resolution | 4 | 4/4 | 100% | 2.76s |
| inverted | 4 | 4/4 | 100% | 0.62s |
| low_contrast | 3 | 3/3 | 100% | 0.76s |
| motion_blur | 1 | 1/1 | 100% | 0.50s |
| multiple | 9 | 9/9 | 100% | 0.81s |
| near_edge | 2 | 2/2 | 100% | 0.52s |
| negative | 3 | 3/3 | 100% | 0.91s |
| noise | 2 | 2/2 | 100% | 0.42s |
| occlusion | 1 | 1/1 | 100% | 0.42s |
| overexposed | 2 | 2/2 | 100% | 0.72s |
| perspective | 2 | 2/2 | 100% | 1.23s |
| phone_photo | 1 | 1/1 | 100% | 1.68s |
| rotation | 5 | 5/5 | 100% | 0.65s |
| screen_capture | 3 | 3/3 | 100% | 1.26s |
| small_in_large | 2 | 2/2 | 100% | 1.59s |
| text | 3 | 3/3 | 100% | 0.51s |
| underexposed | 2 | 2/2 | 100% | 0.75s |
| unusual_aspect | 1 | 1/1 | 100% | 0.76s |
| url | 2 | 2/2 | 100% | 0.56s |
| wifi | 2 | 2/2 | 100% | 0.44s |

## Decoder distribution

- `jsqr`: 61
- `zxing-js`: 1

## Preprocessing success distribution

- `original`: 59
- `contrast`: 2
- `threshold-140`: 1

## Remaining failures

- `14-damaged`

## Per-fixture results

| ID | Category | Expected | Actual | Pass | Time | Decoder | Preprocess | Attempts | Failure |
| --- | --- | --- | --- | --- | ---: | --- | --- | ---: | --- |
| 01-clear-url | url | `https://scanly.example/clear` | `https://scanly.example/clear` | Pass | 0.71s | jsqr | original | 80 |  |
| 02-clear-text | text | `SCANLY_CLEAR_TEXT` | `SCANLY_CLEAR_TEXT` | Pass | 0.67s | jsqr | original | 80 |  |
| 03-phone-photo | phone_photo | `https://scanly.example/photo` | `https://scanly.example/photo` | Pass | 1.68s | jsqr | original | 89 |  |
| 04-screen-capture | screen_capture | `https://scanly.example/screen` | `https://scanly.example/screen` | Pass | 1.06s | jsqr | original | 80 |  |
| 05-low-contrast | low_contrast | `https://scanly.example/low-contrast` | `https://scanly.example/low-contrast` | Pass | 1.01s | jsqr | contrast | 80 |  |
| 06-dark-lighting | underexposed | `https://scanly.example/dark` | `https://scanly.example/dark` | Pass | 1.08s | jsqr | original | 80 |  |
| 07-overexposed | overexposed | `https://scanly.example/bright` | `https://scanly.example/bright` | Pass | 1.03s | jsqr | original | 80 |  |
| 08-blurry | blur | `https://scanly.example/blur` | `https://scanly.example/blur` | Pass | 1.12s | jsqr | original | 80 |  |
| 09-glare | glare | `https://scanly.example/glare` | `https://scanly.example/glare` | Pass | 1.06s | jsqr | original | 80 |  |
| 10-small-in-large | small_in_large | `https://scanly.example/small` | `https://scanly.example/small` | Pass | 1.35s | jsqr | original | 35 |  |
| 11-complex-background | complex_background | `https://scanly.example/background` | `https://scanly.example/background` | Pass | 1.66s | jsqr | original | 89 |  |
| 12-rotated | rotation | `https://scanly.example/rotated` | `https://scanly.example/rotated` | Pass | 1.54s | jsqr | original | 89 |  |
| 13-perspective | perspective | `https://scanly.example/perspective` | `https://scanly.example/perspective` | Pass | 1.94s | jsqr | original | 88 |  |
| 14-damaged | damaged | `https://scanly.example/damaged` | `` | Fail | 1.17s | - | - | 96 | no_symbol_found |
| 15-inverted | inverted | `https://scanly.example/inverted` | `https://scanly.example/inverted` | Pass | 1.03s | jsqr | original | 80 |  |
| 16-multiple-codes | multiple | `https://scanly.example/primary` | `https://scanly.example/primary` | Pass | 1.18s | jsqr | original | 49 |  |
| 17-clear-url-02 | url | `https://scanly.example/clear-02` | `https://scanly.example/clear-02` | Pass | 0.42s | jsqr | original | 53 |  |
| 18-clear-text-02 | text | `SCANLY_CLEAR_TEXT_02` | `SCANLY_CLEAR_TEXT_02` | Pass | 0.35s | jsqr | original | 53 |  |
| 19-wifi-payload | wifi | `WIFI:T:WPA;S:ScanlyLab;P:test-pass-01;;` | `WIFI:T:WPA;S:ScanlyLab;P:test-pass-01;;` | Pass | 0.50s | jsqr | original | 65 |  |
| 20-low-contrast-02 | low_contrast | `SCANLY_LOW_CONTRAST_02` | `SCANLY_LOW_CONTRAST_02` | Pass | 0.65s | jsqr | contrast | 47 |  |
| 21-underexposed-gen | underexposed | `SCANLY_UNDEREXPOSED_01` | `SCANLY_UNDEREXPOSED_01` | Pass | 0.42s | jsqr | original | 53 |  |
| 22-overexposed-gen | overexposed | `SCANLY_OVEREXPOSED_01` | `SCANLY_OVEREXPOSED_01` | Pass | 0.42s | jsqr | original | 53 |  |
| 23-blur-gen | blur | `SCANLY_BLUR_01` | `SCANLY_BLUR_01` | Pass | 0.75s | jsqr | original | 47 |  |
| 24-motion-blur | motion_blur | `SCANLY_MOTION_BLUR_01` | `SCANLY_MOTION_BLUR_01` | Pass | 0.50s | jsqr | original | 53 |  |
| 25-noise | noise | `SCANLY_NOISE_01` | `SCANLY_NOISE_01` | Pass | 0.43s | jsqr | original | 53 |  |
| 26-glare-gen | glare | `SCANLY_GLARE_01` | `SCANLY_GLARE_01` | Pass | 0.47s | jsqr | original | 53 |  |
| 27-inverted-01 | inverted | `SCANLY_INVERTED_01` | `SCANLY_INVERTED_01` | Pass | 0.46s | jsqr | original | 53 |  |
| 28-inverted-02 | inverted | `SCANLY_INVERTED_02` | `SCANLY_INVERTED_02` | Pass | 0.44s | jsqr | original | 53 |  |
| 29-rot-90 | rotation | `SCANLY_ROT_90` | `SCANLY_ROT_90` | Pass | 0.37s | jsqr | original | 53 |  |
| 30-rot-180 | rotation | `SCANLY_ROT_180` | `SCANLY_ROT_180` | Pass | 0.43s | jsqr | original | 53 |  |
| 31-rot-270 | rotation | `SCANLY_ROT_270` | `SCANLY_ROT_270` | Pass | 0.45s | jsqr | original | 53 |  |
| 32-rot-15 | rotation | `SCANLY_ROT_15` | `SCANLY_ROT_15` | Pass | 0.45s | jsqr | original | 53 |  |
| 33-small-in-large-gen | small_in_large | `SCANLY_SMALL_01` | `SCANLY_SMALL_01` | Pass | 1.82s | jsqr | original | 35 |  |
| 34-near-edge | near_edge | `SCANLY_NEAR_EDGE_01` | `SCANLY_NEAR_EDGE_01` | Pass | 0.48s | jsqr | original | 35 |  |
| 35-complex-bg-gen | complex_background | `SCANLY_COMPLEX_BG_01` | `SCANLY_COMPLEX_BG_01` | Pass | 0.62s | jsqr | original | 35 |  |
| 36-multiple-gen | multiple | `SCANLY_MULTI_PRIMARY` | `SCANLY_MULTI_PRIMARY` | Pass | 0.54s | jsqr | original | 49 |  |
| 37-occlusion | occlusion | `SCANLY_OCCLUSION_01` | `SCANLY_OCCLUSION_01` | Pass | 0.42s | jsqr | original | 53 |  |
| 38-damaged-gen | damaged | `SCANLY_DAMAGED_01` | `SCANLY_DAMAGED_01` | Pass | 0.39s | jsqr | original | 53 |  |
| 39-high-res | high_resolution | `SCANLY_HIRES_01` | `SCANLY_HIRES_01` | Pass | 3.59s | jsqr | original | 51 |  |
| 40-moire | screen_capture | `SCANLY_MOIRE_01` | `SCANLY_MOIRE_01` | Pass | 0.70s | jsqr | threshold-140 | 96 |  |
| 41-unusual-aspect | unusual_aspect | `SCANLY_ASPECT_01` | `SCANLY_ASPECT_01` | Pass | 0.76s | jsqr | original | 77 |  |
| 42-colored-bg | colored_background | `SCANLY_COLOR_BG_01` | `SCANLY_COLOR_BG_01` | Pass | 0.63s | jsqr | original | 35 |  |
| 43-transparent-bg | colored_background | `SCANLY_TRANSPARENT_01` | `SCANLY_TRANSPARENT_01` | Pass | 0.53s | jsqr | original | 65 |  |
| 44-clear-url-03 | clear | `https://scanly.example/clear-03` | `https://scanly.example/clear-03` | Pass | 0.40s | jsqr | original | 53 |  |
| 45-text-long | text | `SCANLY_LONG_TEXT_PAYLOAD_ABCDEF_0123456789` | `SCANLY_LONG_TEXT_PAYLOAD_ABCDEF_0123456789` | Pass | 0.51s | jsqr | original | 53 |  |
| 46-invert-url | inverted | `https://scanly.example/inverted-url` | `https://scanly.example/inverted-url` | Pass | 0.55s | jsqr | original | 65 |  |
| 47-near-edge-bottom | near_edge | `SCANLY_NEAR_EDGE_02` | `SCANLY_NEAR_EDGE_02` | Pass | 0.57s | jsqr | original | 35 |  |
| 48-perspective-mild | perspective | `SCANLY_PERSPECTIVE_01` | `SCANLY_PERSPECTIVE_01` | Pass | 0.52s | jsqr | original | 53 |  |
| 49-noise-dark | noise | `SCANLY_NOISE_DARK_01` | `SCANLY_NOISE_DARK_01` | Pass | 0.41s | jsqr | original | 53 |  |
| 50-multiple-three | multiple | `SCANLY_TRI_A` | `SCANLY_TRI_A` | Pass | 0.74s | jsqr | original | 59 |  |
| 51-gamma-ish | low_contrast | `SCANLY_GAMMA_01` | `SCANLY_GAMMA_01` | Pass | 0.62s | jsqr | original | 47 |  |
| 52-wifi-02 | wifi | `WIFI:T:nopass;S:GuestScanly;P:;;` | `WIFI:T:nopass;S:GuestScanly;P:;;` | Pass | 0.38s | jsqr | original | 53 |  |
| 53-negative-blank | negative | `` | `` | Pass | 0.75s | - | - | 96 | no_symbol_found |
| 54-negative-pattern | adversarial | `` | `` | Pass | 0.78s | - | - | 96 | no_symbol_found |
| 55-negative-checker | adversarial | `` | `` | Pass | 2.23s | - | - | 96 | no_symbol_found |
| 56-negative-random-noise | adversarial | `` | `` | Pass | 0.65s | - | - | 4 | no_symbol_found |
| 57-negative-text-blocks | negative | `` | `` | Pass | 0.88s | - | - | 96 | no_symbol_found |
| 58-negative-datamatrix-like | adversarial | `` | `` | Pass | 1.04s | - | - | 96 | no_symbol_found |
| 59-negative-logo | negative | `` | `` | Pass | 1.11s | - | - | 96 | no_symbol_found |
| 60-negative-grid | adversarial | `` | `` | Pass | 0.65s | - | - | 96 | no_symbol_found |
| 61-negative-screenshot | screen_capture | `` | `` | Pass | 2.02s | - | - | 96 | no_symbol_found |
| 62-negative-linear-barcode-like | adversarial | `` | `` | Pass | 1.50s | - | - | 96 | no_symbol_found |
| 63-negative-truncated | adversarial | `` | `` | Pass | 1.29s | - | - | 96 | no_symbol_found |
| 64-multiple-five | multiple | `SCANLY_MULTI5_01` | `SCANLY_MULTI5_01` | Pass | 1.69s | jsqr | original | 96 |  |
| 65-multiple-eight | multiple | `SCANLY_MULTI8_01` | `SCANLY_MULTI8_01` | Pass | 0.51s | jsqr | original | 34 |  |
| 66-multiple-twelve | multiple | `SCANLY_MULTI12_01` | `SCANLY_MULTI12_01` | Pass | 0.61s | jsqr | original | 34 |  |
| 67-multiple-same-two | multiple | `SCANLY_SAME_INSTANCE` | `SCANLY_SAME_INSTANCE` | Pass | 0.42s | jsqr | original | 49 |  |
| 68-multiple-same-three | multiple | `SCANLY_SAME_TRIPLE` | `SCANLY_SAME_TRIPLE` | Pass | 0.79s | jsqr | original | 69 |  |
| 69-multiple-mixed-size | multiple | `SCANLY_MIXED_LARGE` | `SCANLY_MIXED_LARGE` | Pass | 0.84s | jsqr | original | 59 |  |
| 70-version-20 | high_resolution | `SCANLY_VERSION_20_DENSE_VALID_PAYLOAD` | `SCANLY_VERSION_20_DENSE_VALID_PAYLOAD` | Pass | 1.51s | jsqr | original | 89 |  |
| 71-version-30 | high_resolution | `SCANLY_VERSION_30_DENSE_VALID_PAYLOAD` | `SCANLY_VERSION_30_DENSE_VALID_PAYLOAD` | Pass | 2.52s | jsqr | original | 89 |  |
| 72-version-40 | high_resolution | `SCANLY_VERSION_40_DENSE_VALID_PAYLOAD` | `SCANLY_VERSION_40_DENSE_VALID_PAYLOAD` | Pass | 3.40s | jsqr | original | 89 |  |
| 73-dense-checker-background | complex_background | `SCANLY_DENSE_CHECKER_POSITIVE` | `SCANLY_DENSE_CHECKER_POSITIVE` | Pass | 0.23s | jsqr | original | 3 |  |
| 74-zxing-contribution-blur | blur | `ZXING_UNIQUE_3_2_L` | `ZXING_UNIQUE_3_2_L` | Pass | 0.04s | zxing-js | original | 4 |  |

## Notes

- Results measure the shared `@scanly/core` QR pipeline (same logic used by Upload mode).
- These numbers are not a claim that Scanly is faster than third-party scanners.
- Hard-case fixtures are retained even when they fail.
