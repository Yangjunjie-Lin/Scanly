# Benchmark

This document is **auto-generated** from `benchmark-results/latest.json`. Do not edit results by hand.

## Summary

| Metric | Value |
| --- | ---: |
| Generated at | 2026-07-14T07:21:17.372Z |
| Mode | full |
| Total fixtures | 52 |
| Successful decodes | 51 |
| Failed decodes | 1 |
| Success rate | 98.1% |
| Average elapsed | 0.94s |
| Median elapsed | 0.24s |
| P95 elapsed | 4.22s |
| Average attempts | 23.8 |
| Regressions vs baseline | 0 |

## Per-category

| Category | Images | Success | Rate | Avg time |
| --- | ---: | ---: | ---: | ---: |
| blur | 2 | 2/2 | 100% | 0.28s |
| clear | 1 | 1/1 | 100% | 0.10s |
| colored_background | 2 | 2/2 | 100% | 0.19s |
| complex_background | 2 | 2/2 | 100% | 0.65s |
| damaged | 2 | 1/2 | 50% | 6.65s |
| glare | 2 | 2/2 | 100% | 0.36s |
| high_resolution | 1 | 1/1 | 100% | 1.65s |
| inverted | 4 | 4/4 | 100% | 0.25s |
| low_contrast | 3 | 3/3 | 100% | 0.30s |
| motion_blur | 1 | 1/1 | 100% | 0.19s |
| multiple | 3 | 3/3 | 100% | 5.54s |
| near_edge | 2 | 2/2 | 100% | 0.28s |
| noise | 2 | 2/2 | 100% | 0.11s |
| occlusion | 1 | 1/1 | 100% | 0.10s |
| overexposed | 2 | 2/2 | 100% | 0.46s |
| perspective | 2 | 2/2 | 100% | 0.74s |
| phone_photo | 1 | 1/1 | 100% | 0.69s |
| rotation | 5 | 5/5 | 100% | 0.31s |
| screen_capture | 2 | 2/2 | 100% | 1.30s |
| small_in_large | 2 | 2/2 | 100% | 0.90s |
| text | 3 | 3/3 | 100% | 0.19s |
| underexposed | 2 | 2/2 | 100% | 0.35s |
| unusual_aspect | 1 | 1/1 | 100% | 0.31s |
| url | 2 | 2/2 | 100% | 0.26s |
| wifi | 2 | 2/2 | 100% | 0.13s |

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
| 01-clear-url | url | `https://scanly.example/clear` | `https://scanly.example/clear` | Pass | 0.35s | jsqr | original | 16 |  |
| 02-clear-text | text | `SCANLY_CLEAR_TEXT` | `SCANLY_CLEAR_TEXT` | Pass | 0.28s | jsqr | original | 16 |  |
| 03-phone-photo | phone_photo | `https://scanly.example/photo` | `https://scanly.example/photo` | Pass | 0.69s | jsqr | original | 16 |  |
| 04-screen-capture | screen_capture | `https://scanly.example/screen` | `https://scanly.example/screen` | Pass | 0.42s | jsqr | original | 16 |  |
| 05-low-contrast | low_contrast | `https://scanly.example/low-contrast` | `https://scanly.example/low-contrast` | Pass | 0.65s | jsqr | contrast | 18 |  |
| 06-dark-lighting | underexposed | `https://scanly.example/dark` | `https://scanly.example/dark` | Pass | 0.59s | jsqr | original | 16 |  |
| 07-overexposed | overexposed | `https://scanly.example/bright` | `https://scanly.example/bright` | Pass | 0.72s | jsqr | original | 16 |  |
| 08-blurry | blur | `https://scanly.example/blur` | `https://scanly.example/blur` | Pass | 0.45s | jsqr | original | 16 |  |
| 09-glare | glare | `https://scanly.example/glare` | `https://scanly.example/glare` | Pass | 0.55s | jsqr | original | 16 |  |
| 10-small-in-large | small_in_large | `https://scanly.example/small` | `https://scanly.example/small` | Pass | 0.85s | jsqr | original | 1 |  |
| 11-complex-background | complex_background | `https://scanly.example/background` | `https://scanly.example/background` | Pass | 0.97s | jsqr | original | 16 |  |
| 12-rotated | rotation | `https://scanly.example/rotated` | `https://scanly.example/rotated` | Pass | 0.83s | jsqr | original | 16 |  |
| 13-perspective | perspective | `https://scanly.example/perspective` | `https://scanly.example/perspective` | Pass | 1.28s | jsqr | original | 16 |  |
| 14-damaged | damaged | `https://scanly.example/damaged` | `` | Fail | 13.20s | - | - | 140 | no_qr_found |
| 15-inverted | inverted | `https://scanly.example/inverted` | `https://scanly.example/inverted` | Pass | 0.63s | jsqr | original | 16 |  |
| 16-multiple-codes | multiple | `https://scanly.example/primary` | `https://scanly.example/primary` | Pass | 9.00s | jsqr | original | 122 |  |
| 17-clear-url-02 | url | `https://scanly.example/clear-02` | `https://scanly.example/clear-02` | Pass | 0.16s | jsqr | original | 16 |  |
| 18-clear-text-02 | text | `SCANLY_CLEAR_TEXT_02` | `SCANLY_CLEAR_TEXT_02` | Pass | 0.12s | jsqr | original | 16 |  |
| 19-wifi-payload | wifi | `WIFI:T:WPA;S:ScanlyLab;P:test-pass-01;;` | `WIFI:T:WPA;S:ScanlyLab;P:test-pass-01;;` | Pass | 0.13s | jsqr | original | 16 |  |
| 20-low-contrast-02 | low_contrast | `SCANLY_LOW_CONTRAST_02` | `SCANLY_LOW_CONTRAST_02` | Pass | 0.15s | jsqr | contrast | 3 |  |
| 21-underexposed-gen | underexposed | `SCANLY_UNDEREXPOSED_01` | `SCANLY_UNDEREXPOSED_01` | Pass | 0.12s | jsqr | original | 16 |  |
| 22-overexposed-gen | overexposed | `SCANLY_OVEREXPOSED_01` | `SCANLY_OVEREXPOSED_01` | Pass | 0.20s | jsqr | original | 16 |  |
| 23-blur-gen | blur | `SCANLY_BLUR_01` | `SCANLY_BLUR_01` | Pass | 0.10s | jsqr | original | 1 |  |
| 24-motion-blur | motion_blur | `SCANLY_MOTION_BLUR_01` | `SCANLY_MOTION_BLUR_01` | Pass | 0.19s | jsqr | original | 16 |  |
| 25-noise | noise | `SCANLY_NOISE_01` | `SCANLY_NOISE_01` | Pass | 0.10s | jsqr | original | 16 |  |
| 26-glare-gen | glare | `SCANLY_GLARE_01` | `SCANLY_GLARE_01` | Pass | 0.17s | jsqr | original | 16 |  |
| 27-inverted-01 | inverted | `SCANLY_INVERTED_01` | `SCANLY_INVERTED_01` | Pass | 0.14s | jsqr | original | 16 |  |
| 28-inverted-02 | inverted | `SCANLY_INVERTED_02` | `SCANLY_INVERTED_02` | Pass | 0.10s | jsqr | original | 16 |  |
| 29-rot-90 | rotation | `SCANLY_ROT_90` | `SCANLY_ROT_90` | Pass | 0.12s | jsqr | original | 16 |  |
| 30-rot-180 | rotation | `SCANLY_ROT_180` | `SCANLY_ROT_180` | Pass | 0.13s | jsqr | original | 16 |  |
| 31-rot-270 | rotation | `SCANLY_ROT_270` | `SCANLY_ROT_270` | Pass | 0.20s | jsqr | original | 16 |  |
| 32-rot-15 | rotation | `SCANLY_ROT_15` | `SCANLY_ROT_15` | Pass | 0.27s | jsqr | original | 16 |  |
| 33-small-in-large-gen | small_in_large | `SCANLY_SMALL_01` | `SCANLY_SMALL_01` | Pass | 0.94s | jsqr | original | 1 |  |
| 34-near-edge | near_edge | `SCANLY_NEAR_EDGE_01` | `SCANLY_NEAR_EDGE_01` | Pass | 0.28s | jsqr | original | 1 |  |
| 35-complex-bg-gen | complex_background | `SCANLY_COMPLEX_BG_01` | `SCANLY_COMPLEX_BG_01` | Pass | 0.33s | jsqr | original | 1 |  |
| 36-multiple-gen | multiple | `SCANLY_MULTI_PRIMARY` | `SCANLY_MULTI_PRIMARY` | Pass | 3.39s | jsqr | original | 106 |  |
| 37-occlusion | occlusion | `SCANLY_OCCLUSION_01` | `SCANLY_OCCLUSION_01` | Pass | 0.10s | jsqr | original | 16 |  |
| 38-damaged-gen | damaged | `SCANLY_DAMAGED_01` | `SCANLY_DAMAGED_01` | Pass | 0.09s | jsqr | original | 16 |  |
| 39-high-res | high_resolution | `SCANLY_HIRES_01` | `SCANLY_HIRES_01` | Pass | 1.65s | jsqr | original | 1 |  |
| 40-moire | screen_capture | `SCANLY_MOIRE_01` | `SCANLY_MOIRE_01` | Pass | 2.18s | jsqr | threshold-140 | 140 |  |
| 41-unusual-aspect | unusual_aspect | `SCANLY_ASPECT_01` | `SCANLY_ASPECT_01` | Pass | 0.31s | jsqr | original | 16 |  |
| 42-colored-bg | colored_background | `SCANLY_COLOR_BG_01` | `SCANLY_COLOR_BG_01` | Pass | 0.20s | jsqr | original | 1 |  |
| 43-transparent-bg | colored_background | `SCANLY_TRANSPARENT_01` | `SCANLY_TRANSPARENT_01` | Pass | 0.18s | jsqr | original | 16 |  |
| 44-clear-url-03 | clear | `https://scanly.example/clear-03` | `https://scanly.example/clear-03` | Pass | 0.10s | jsqr | original | 16 |  |
| 45-text-long | text | `SCANLY_LONG_TEXT_PAYLOAD_ABCDEF_0123456789` | `SCANLY_LONG_TEXT_PAYLOAD_ABCDEF_0123456789` | Pass | 0.16s | jsqr | original | 16 |  |
| 46-invert-url | inverted | `https://scanly.example/inverted-url` | `https://scanly.example/inverted-url` | Pass | 0.13s | jsqr | original | 16 |  |
| 47-near-edge-bottom | near_edge | `SCANLY_NEAR_EDGE_02` | `SCANLY_NEAR_EDGE_02` | Pass | 0.27s | jsqr | original | 1 |  |
| 48-perspective-mild | perspective | `SCANLY_PERSPECTIVE_01` | `SCANLY_PERSPECTIVE_01` | Pass | 0.21s | jsqr | original | 16 |  |
| 49-noise-dark | noise | `SCANLY_NOISE_DARK_01` | `SCANLY_NOISE_DARK_01` | Pass | 0.12s | jsqr | original | 16 |  |
| 50-multiple-three | multiple | `SCANLY_TRI_A` | `SCANLY_TRI_B` | Pass | 4.22s | jsqr | original | 124 |  |
| 51-gamma-ish | low_contrast | `SCANLY_GAMMA_01` | `SCANLY_GAMMA_01` | Pass | 0.09s | jsqr | original | 1 |  |
| 52-wifi-02 | wifi | `WIFI:T:nopass;S:GuestScanly;P:;;` | `WIFI:T:nopass;S:GuestScanly;P:;;` | Pass | 0.13s | jsqr | original | 16 |  |

## Notes

- Results measure the shared `lib/qr` decode pipeline (same logic used by Upload mode).
- These numbers are not a claim that Scanly is faster than third-party scanners.
- Hard-case fixtures are retained even when they fail.
