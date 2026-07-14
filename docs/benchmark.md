# Benchmark

This document is **auto-generated** from `benchmark-results/latest.json`. Do not edit results by hand.

## Summary

| Metric | Value |
| --- | ---: |
| Generated at | 2026-07-14T10:25:24.833Z |
| Mode | full |
| Total fixtures | 52 |
| Successful decodes | 51 |
| Failed decodes | 1 |
| Success rate | 98.1% |
| Average elapsed | 0.28s |
| Median elapsed | 0.15s |
| P95 elapsed | 0.71s |
| Average attempts | 11.5 |
| Median attempts | 10.0 |
| P95 attempts | 43.0 |
| Regressions vs baseline | 0 |

## Phase timing distribution

| Phase | Average | Median | P95 |
| --- | ---: | ---: | ---: |
| candidateGenerationMs | 42.6ms | 23.5ms | 206.0ms |
| jsqrMs | 178.3ms | 76.5ms | 488.0ms |
| zxingMs | 0.0ms | 0.0ms | 0.0ms |
| preprocessMs | 10.4ms | 3.0ms | 26.0ms |
| rotationMs | 0.0ms | 0.0ms | 0.0ms |

## Multiple QR completeness

| Metric | Value |
| --- | ---: |
| Multiple fixtures | 3 |
| Complete (all required payloads) | 3 |

## Worst fixtures (by elapsed time)

- `14-damaged`: 2.06s, 96 attempts, fail
- `50-multiple-three`: 1.42s, 43 attempts, pass
- `39-high-res`: 0.71s, 1 attempts, pass
- `16-multiple-codes`: 0.62s, 10 attempts, pass
- `40-moire`: 0.55s, 56 attempts, pass

## Per-category

| Category | Images | Success | Rate | Avg time |
| --- | ---: | ---: | ---: | ---: |
| blur | 2 | 2/2 | 100% | 0.21s |
| clear | 1 | 1/1 | 100% | 0.12s |
| colored_background | 2 | 2/2 | 100% | 0.14s |
| complex_background | 2 | 2/2 | 100% | 0.33s |
| damaged | 2 | 1/2 | 50% | 1.07s |
| glare | 2 | 2/2 | 100% | 0.21s |
| high_resolution | 1 | 1/1 | 100% | 0.71s |
| inverted | 4 | 4/4 | 100% | 0.16s |
| low_contrast | 3 | 3/3 | 100% | 0.15s |
| motion_blur | 1 | 1/1 | 100% | 0.18s |
| multiple | 3 | 3/3 | 100% | 0.75s |
| near_edge | 2 | 2/2 | 100% | 0.12s |
| noise | 2 | 2/2 | 100% | 0.11s |
| occlusion | 1 | 1/1 | 100% | 0.10s |
| overexposed | 2 | 2/2 | 100% | 0.19s |
| perspective | 2 | 2/2 | 100% | 0.28s |
| phone_photo | 1 | 1/1 | 100% | 0.53s |
| rotation | 5 | 5/5 | 100% | 0.16s |
| screen_capture | 2 | 2/2 | 100% | 0.39s |
| small_in_large | 2 | 2/2 | 100% | 0.43s |
| text | 3 | 3/3 | 100% | 0.16s |
| underexposed | 2 | 2/2 | 100% | 0.21s |
| unusual_aspect | 1 | 1/1 | 100% | 0.21s |
| url | 2 | 2/2 | 100% | 0.22s |
| wifi | 2 | 2/2 | 100% | 0.10s |

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
| 01-clear-url | url | `https://scanly.example/clear` | `https://scanly.example/clear` | Pass | 0.33s | jsqr | original | 10 |  |
| 02-clear-text | text | `SCANLY_CLEAR_TEXT` | `SCANLY_CLEAR_TEXT` | Pass | 0.23s | jsqr | original | 10 |  |
| 03-phone-photo | phone_photo | `https://scanly.example/photo` | `https://scanly.example/photo` | Pass | 0.53s | jsqr | original | 10 |  |
| 04-screen-capture | screen_capture | `https://scanly.example/screen` | `https://scanly.example/screen` | Pass | 0.23s | jsqr | original | 10 |  |
| 05-low-contrast | low_contrast | `https://scanly.example/low-contrast` | `https://scanly.example/low-contrast` | Pass | 0.30s | jsqr | contrast | 11 |  |
| 06-dark-lighting | underexposed | `https://scanly.example/dark` | `https://scanly.example/dark` | Pass | 0.29s | jsqr | original | 10 |  |
| 07-overexposed | overexposed | `https://scanly.example/bright` | `https://scanly.example/bright` | Pass | 0.29s | jsqr | original | 10 |  |
| 08-blurry | blur | `https://scanly.example/blur` | `https://scanly.example/blur` | Pass | 0.33s | jsqr | original | 10 |  |
| 09-glare | glare | `https://scanly.example/glare` | `https://scanly.example/glare` | Pass | 0.31s | jsqr | original | 10 |  |
| 10-small-in-large | small_in_large | `https://scanly.example/small` | `https://scanly.example/small` | Pass | 0.36s | jsqr | original | 1 |  |
| 11-complex-background | complex_background | `https://scanly.example/background` | `https://scanly.example/background` | Pass | 0.52s | jsqr | original | 10 |  |
| 12-rotated | rotation | `https://scanly.example/rotated` | `https://scanly.example/rotated` | Pass | 0.45s | jsqr | original | 10 |  |
| 13-perspective | perspective | `https://scanly.example/perspective` | `https://scanly.example/perspective` | Pass | 0.38s | jsqr | original | 10 |  |
| 14-damaged | damaged | `https://scanly.example/damaged` | `` | Fail | 2.06s | - | - | 96 | no_qr_found |
| 15-inverted | inverted | `https://scanly.example/inverted` | `https://scanly.example/inverted` | Pass | 0.30s | jsqr | original | 10 |  |
| 16-multiple-codes | multiple | `https://scanly.example/primary` | `https://scanly.example/primary` | Pass | 0.62s | jsqr | original | 10 |  |
| 17-clear-url-02 | url | `https://scanly.example/clear-02` | `https://scanly.example/clear-02` | Pass | 0.11s | jsqr | original | 10 |  |
| 18-clear-text-02 | text | `SCANLY_CLEAR_TEXT_02` | `SCANLY_CLEAR_TEXT_02` | Pass | 0.11s | jsqr | original | 10 |  |
| 19-wifi-payload | wifi | `WIFI:T:WPA;S:ScanlyLab;P:test-pass-01;;` | `WIFI:T:WPA;S:ScanlyLab;P:test-pass-01;;` | Pass | 0.09s | jsqr | original | 10 |  |
| 20-low-contrast-02 | low_contrast | `SCANLY_LOW_CONTRAST_02` | `SCANLY_LOW_CONTRAST_02` | Pass | 0.10s | jsqr | contrast | 2 |  |
| 21-underexposed-gen | underexposed | `SCANLY_UNDEREXPOSED_01` | `SCANLY_UNDEREXPOSED_01` | Pass | 0.13s | jsqr | original | 10 |  |
| 22-overexposed-gen | overexposed | `SCANLY_OVEREXPOSED_01` | `SCANLY_OVEREXPOSED_01` | Pass | 0.10s | jsqr | original | 10 |  |
| 23-blur-gen | blur | `SCANLY_BLUR_01` | `SCANLY_BLUR_01` | Pass | 0.08s | jsqr | original | 1 |  |
| 24-motion-blur | motion_blur | `SCANLY_MOTION_BLUR_01` | `SCANLY_MOTION_BLUR_01` | Pass | 0.18s | jsqr | original | 10 |  |
| 25-noise | noise | `SCANLY_NOISE_01` | `SCANLY_NOISE_01` | Pass | 0.11s | jsqr | original | 10 |  |
| 26-glare-gen | glare | `SCANLY_GLARE_01` | `SCANLY_GLARE_01` | Pass | 0.12s | jsqr | original | 10 |  |
| 27-inverted-01 | inverted | `SCANLY_INVERTED_01` | `SCANLY_INVERTED_01` | Pass | 0.11s | jsqr | original | 10 |  |
| 28-inverted-02 | inverted | `SCANLY_INVERTED_02` | `SCANLY_INVERTED_02` | Pass | 0.10s | jsqr | original | 10 |  |
| 29-rot-90 | rotation | `SCANLY_ROT_90` | `SCANLY_ROT_90` | Pass | 0.09s | jsqr | original | 10 |  |
| 30-rot-180 | rotation | `SCANLY_ROT_180` | `SCANLY_ROT_180` | Pass | 0.09s | jsqr | original | 10 |  |
| 31-rot-270 | rotation | `SCANLY_ROT_270` | `SCANLY_ROT_270` | Pass | 0.08s | jsqr | original | 10 |  |
| 32-rot-15 | rotation | `SCANLY_ROT_15` | `SCANLY_ROT_15` | Pass | 0.11s | jsqr | original | 10 |  |
| 33-small-in-large-gen | small_in_large | `SCANLY_SMALL_01` | `SCANLY_SMALL_01` | Pass | 0.50s | jsqr | original | 1 |  |
| 34-near-edge | near_edge | `SCANLY_NEAR_EDGE_01` | `SCANLY_NEAR_EDGE_01` | Pass | 0.09s | jsqr | original | 1 |  |
| 35-complex-bg-gen | complex_background | `SCANLY_COMPLEX_BG_01` | `SCANLY_COMPLEX_BG_01` | Pass | 0.13s | jsqr | original | 1 |  |
| 36-multiple-gen | multiple | `SCANLY_MULTI_PRIMARY` | `SCANLY_MULTI_PRIMARY` | Pass | 0.22s | jsqr | original | 10 |  |
| 37-occlusion | occlusion | `SCANLY_OCCLUSION_01` | `SCANLY_OCCLUSION_01` | Pass | 0.10s | jsqr | original | 10 |  |
| 38-damaged-gen | damaged | `SCANLY_DAMAGED_01` | `SCANLY_DAMAGED_01` | Pass | 0.09s | jsqr | original | 10 |  |
| 39-high-res | high_resolution | `SCANLY_HIRES_01` | `SCANLY_HIRES_01` | Pass | 0.71s | jsqr | original | 1 |  |
| 40-moire | screen_capture | `SCANLY_MOIRE_01` | `SCANLY_MOIRE_01` | Pass | 0.55s | jsqr | threshold-140 | 56 |  |
| 41-unusual-aspect | unusual_aspect | `SCANLY_ASPECT_01` | `SCANLY_ASPECT_01` | Pass | 0.21s | jsqr | original | 10 |  |
| 42-colored-bg | colored_background | `SCANLY_COLOR_BG_01` | `SCANLY_COLOR_BG_01` | Pass | 0.14s | jsqr | original | 1 |  |
| 43-transparent-bg | colored_background | `SCANLY_TRANSPARENT_01` | `SCANLY_TRANSPARENT_01` | Pass | 0.15s | jsqr | original | 10 |  |
| 44-clear-url-03 | clear | `https://scanly.example/clear-03` | `https://scanly.example/clear-03` | Pass | 0.12s | jsqr | original | 10 |  |
| 45-text-long | text | `SCANLY_LONG_TEXT_PAYLOAD_ABCDEF_0123456789` | `SCANLY_LONG_TEXT_PAYLOAD_ABCDEF_0123456789` | Pass | 0.15s | jsqr | original | 10 |  |
| 46-invert-url | inverted | `https://scanly.example/inverted-url` | `https://scanly.example/inverted-url` | Pass | 0.11s | jsqr | original | 10 |  |
| 47-near-edge-bottom | near_edge | `SCANLY_NEAR_EDGE_02` | `SCANLY_NEAR_EDGE_02` | Pass | 0.15s | jsqr | original | 1 |  |
| 48-perspective-mild | perspective | `SCANLY_PERSPECTIVE_01` | `SCANLY_PERSPECTIVE_01` | Pass | 0.19s | jsqr | original | 10 |  |
| 49-noise-dark | noise | `SCANLY_NOISE_DARK_01` | `SCANLY_NOISE_DARK_01` | Pass | 0.12s | jsqr | original | 10 |  |
| 50-multiple-three | multiple | `SCANLY_TRI_A` | `SCANLY_TRI_B` | Pass | 1.42s | jsqr | original | 43 |  |
| 51-gamma-ish | low_contrast | `SCANLY_GAMMA_01` | `SCANLY_GAMMA_01` | Pass | 0.06s | jsqr | original | 1 |  |
| 52-wifi-02 | wifi | `WIFI:T:nopass;S:GuestScanly;P:;;` | `WIFI:T:nopass;S:GuestScanly;P:;;` | Pass | 0.10s | jsqr | original | 10 |  |

## Notes

- Results measure the shared `lib/qr` decode pipeline (same logic used by Upload mode).
- These numbers are not a claim that Scanly is faster than third-party scanners.
- Hard-case fixtures are retained even when they fail.
