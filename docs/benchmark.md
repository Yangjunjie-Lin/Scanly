# Scanly QR Benchmark

This benchmark records Scanly's upload-mode decoding quality across 16 representative QR images. It is intended to make decoder changes measurable instead of relying on README claims alone.

## Latest Run

| Field | Value |
| --- | --- |
| Date | 2026-06-25 |
| App version | `1.0.0` |
| Build | `npm run dev` on local Next.js server |
| Browser | Chrome headless via Playwright |
| Platform | Windows x64 |
| CPU | 20 logical cores |
| Fixture directory | `docs/benchmark-fixtures/` |

## Method

1. Start Scanly locally.
2. Open the app in Chrome and switch to Upload mode.
3. Upload each fixture once through the real file input.
4. Measure elapsed time from `setInputFiles` to either decoded text or the failure message.
5. Mark a case as successful only when the decoded value exactly matches the expected payload.

## Summary

| Metric | Value |
| --- | ---: |
| Total fixtures | 16 |
| Successful decodes | 12 |
| Failed decodes | 4 |
| Success rate | 75.0% |
| Average elapsed time | 79 ms |
| Median elapsed time | 60 ms |
| P95 elapsed time | 281 ms |

## Results

| ID | Fixture | Scenario | Expected payload | Result | Time (ms) | Notes |
| --- | --- | --- | --- | --- | ---: | --- |
| 01 | [01-clear-url.png](benchmark-fixtures/01-clear-url.png) | High-contrast generated QR | `https://scanly.example/clear` | Pass | 281 | Cold first upload; region detected |
| 02 | [02-clear-text.png](benchmark-fixtures/02-clear-text.png) | High-contrast text QR | `SCANLY_CLEAR_TEXT` | Pass | 62 | Region detected |
| 03 | [03-phone-photo.jpg](benchmark-fixtures/03-phone-photo.jpg) | Normal phone photo | `https://scanly.example/photo` | Pass | 102 | Perspective/noise tolerated |
| 04 | [04-screen-capture.png](benchmark-fixtures/04-screen-capture.png) | Screenshot from display | `https://scanly.example/screen` | Pass | 51 | Region detected |
| 05 | [05-low-contrast.png](benchmark-fixtures/05-low-contrast.png) | Gray QR on gray background | `https://scanly.example/low-contrast` | Pass | 71 | Decoded after contrast fallback |
| 06 | [06-dark-lighting.jpg](benchmark-fixtures/06-dark-lighting.jpg) | Underexposed photo | `https://scanly.example/dark` | Pass | 54 | Decoded from cropped original |
| 07 | [07-overexposed.jpg](benchmark-fixtures/07-overexposed.jpg) | Bright / washed-out photo | `https://scanly.example/bright` | Pass | 58 | Region detected |
| 08 | [08-blurry.jpg](benchmark-fixtures/08-blurry.jpg) | Mild blur | `https://scanly.example/blur` | Pass | 44 | Region detected |
| 09 | [09-glare.jpg](benchmark-fixtures/09-glare.jpg) | Glare crossing one side | `https://scanly.example/glare` | Pass | 48 | Region detected |
| 10 | [10-small-in-large.jpg](benchmark-fixtures/10-small-in-large.jpg) | Small QR in a large image | `https://scanly.example/small` | Pass | 76 | Decoded from cropped original |
| 11 | [11-complex-background.jpg](benchmark-fixtures/11-complex-background.jpg) | QR on busy background | `https://scanly.example/background` | Fail | 88 | Region crop missed enough QR context; ZXing fallback also failed |
| 12 | [12-rotated.png](benchmark-fixtures/12-rotated.png) | 15 degree rotation | `https://scanly.example/rotated` | Pass | 79 | Region detected |
| 13 | [13-perspective.jpg](benchmark-fixtures/13-perspective.jpg) | Angled perspective | `https://scanly.example/perspective` | Pass | 43 | Region detected |
| 14 | [14-damaged.png](benchmark-fixtures/14-damaged.png) | Missing / scratched modules | `https://scanly.example/damaged` | Fail | 54 | Damage exceeded current correction/fallback tolerance |
| 15 | [15-inverted.png](benchmark-fixtures/15-inverted.png) | Light modules on dark background | `https://scanly.example/inverted` | Fail | 43 | Inverted image was not recovered by current upload pipeline |
| 16 | [16-multiple-codes.jpg](benchmark-fixtures/16-multiple-codes.jpg) | Multiple QR codes in one image | `https://scanly.example/primary` | Fail | 106 | Region detection selected an ambiguous/misaligned crop; ZXing fallback failed |

## Failure Cases

| Fixture | Observed behavior | Suspected cause | Follow-up |
| --- | --- | --- | --- |
| [11-complex-background.jpg](benchmark-fixtures/11-complex-background.jpg) | Failed with the generic decode error | Edge-density region landed on a partial QR/background-heavy area | Expand crop padding or retry neighboring high-density regions |
| [14-damaged.png](benchmark-fixtures/14-damaged.png) | Failed with the generic decode error | Missing modules and scratch-like occlusion exceed current tolerance | Add stronger preprocessing or document as expected hard failure |
| [15-inverted.png](benchmark-fixtures/15-inverted.png) | Failed with the generic decode error | Current upload path does not recover this inverted fixture | Add explicit invert-image preprocessing before ZXing fallback |
| [16-multiple-codes.jpg](benchmark-fixtures/16-multiple-codes.jpg) | Failed with the generic decode error | Multiple high-density candidates make single-region selection brittle | Try top N candidate regions and report the first exact decode |

## Acceptance Targets

| Target | Threshold | Current |
| --- | ---: | ---: |
| Clear generated QR success rate | 100% | 100% |
| Full dataset success rate | >= 85% | 75% |
| Average upload decode time | <= 1000 ms | 79 ms |
| P95 upload decode time | <= 3000 ms | 281 ms |

