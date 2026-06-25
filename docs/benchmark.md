# Benchmark

This benchmark records Scanly's upload-mode decoding behavior on the committed fixture set. It uses real file uploads through the app UI, so the numbers cover image loading, region detection, preprocessing, jsQR attempts, and ZXing fallback where applicable.

## Test Setup

- Device: Windows x64 workstation, 20 logical CPU cores
- Browser: Chrome headless via Playwright
- App version: `1.0.0`
- Run date: 2026-06-25
- App mode: Upload mode
- Image count: 16
- Fixture path: `docs/benchmark-fixtures/`
- Image categories:
  - Clear QR codes
  - Low-contrast / difficult lighting QR codes
  - Screen-captured and phone-photo QR codes
  - Large images with a small QR region
  - Blurry, distorted, damaged, or difficult images

## Method

1. Start Scanly locally with `npm run dev`.
2. Open the app in Chrome and switch to Upload mode.
3. Upload each fixture once through the real file input.
4. Measure elapsed time from file selection to either decoded text or the failure message.
5. Count a case as successful only when the decoded value exactly matches the expected payload.

## Results

| Category | Images | Success | Average Time | Notes |
|---|---:|---:|---:|---|
| Clear QR | 2 | 2/2 | 0.17s | Baseline generated QR images; first cold upload was the slowest case |
| Screen photos / captures | 2 | 2/2 | 0.08s | Phone-photo perspective and screen-line artifacts decoded successfully |
| Low contrast / lighting | 3 | 3/3 | 0.06s | Contrast stretch helped the low-contrast fixture |
| Small QR / complex layout | 3 | 1/3 | 0.09s | Small QR decoded; complex background and multiple-code image failed |
| Blurry / difficult | 6 | 4/6 | 0.05s | Blur, glare, rotation, and perspective passed; damaged and inverted fixtures failed |

## Summary

| Metric | Value |
| --- | ---: |
| Total fixtures | 16 |
| Successful decodes | 12 |
| Failed decodes | 4 |
| Success rate | 75.0% |
| Average elapsed time | 0.08s |
| Median elapsed time | 0.06s |
| P95 elapsed time | 0.28s |

## Per-Image Results

| ID | Fixture | Scenario | Expected payload | Result | Time | Notes |
| --- | --- | --- | --- | --- | ---: | --- |
| 01 | [01-clear-url.png](benchmark-fixtures/01-clear-url.png) | High-contrast generated QR | `https://scanly.example/clear` | Pass | 0.28s | Cold first upload; region detected |
| 02 | [02-clear-text.png](benchmark-fixtures/02-clear-text.png) | High-contrast text QR | `SCANLY_CLEAR_TEXT` | Pass | 0.06s | Region detected |
| 03 | [03-phone-photo.jpg](benchmark-fixtures/03-phone-photo.jpg) | Normal phone photo | `https://scanly.example/photo` | Pass | 0.10s | Perspective and noise tolerated |
| 04 | [04-screen-capture.png](benchmark-fixtures/04-screen-capture.png) | Screenshot from display | `https://scanly.example/screen` | Pass | 0.05s | Region detected |
| 05 | [05-low-contrast.png](benchmark-fixtures/05-low-contrast.png) | Gray QR on gray background | `https://scanly.example/low-contrast` | Pass | 0.07s | Decoded after contrast fallback |
| 06 | [06-dark-lighting.jpg](benchmark-fixtures/06-dark-lighting.jpg) | Underexposed photo | `https://scanly.example/dark` | Pass | 0.05s | Decoded from cropped original |
| 07 | [07-overexposed.jpg](benchmark-fixtures/07-overexposed.jpg) | Bright / washed-out photo | `https://scanly.example/bright` | Pass | 0.06s | Region detected |
| 08 | [08-blurry.jpg](benchmark-fixtures/08-blurry.jpg) | Mild blur | `https://scanly.example/blur` | Pass | 0.04s | Region detected |
| 09 | [09-glare.jpg](benchmark-fixtures/09-glare.jpg) | Glare crossing one side | `https://scanly.example/glare` | Pass | 0.05s | Region detected |
| 10 | [10-small-in-large.jpg](benchmark-fixtures/10-small-in-large.jpg) | Small QR in a large image | `https://scanly.example/small` | Pass | 0.08s | Decoded from cropped original |
| 11 | [11-complex-background.jpg](benchmark-fixtures/11-complex-background.jpg) | QR on busy background | `https://scanly.example/background` | Fail | 0.09s | Region crop missed enough QR context; ZXing fallback also failed |
| 12 | [12-rotated.png](benchmark-fixtures/12-rotated.png) | 15 degree rotation | `https://scanly.example/rotated` | Pass | 0.08s | Region detected |
| 13 | [13-perspective.jpg](benchmark-fixtures/13-perspective.jpg) | Angled perspective | `https://scanly.example/perspective` | Pass | 0.04s | Region detected |
| 14 | [14-damaged.png](benchmark-fixtures/14-damaged.png) | Missing / scratched modules | `https://scanly.example/damaged` | Fail | 0.05s | Damage exceeded current correction/fallback tolerance |
| 15 | [15-inverted.png](benchmark-fixtures/15-inverted.png) | Light modules on dark background | `https://scanly.example/inverted` | Fail | 0.04s | Inverted image was not recovered by current upload pipeline |
| 16 | [16-multiple-codes.jpg](benchmark-fixtures/16-multiple-codes.jpg) | Multiple QR codes in one image | `https://scanly.example/primary` | Fail | 0.11s | Region detection selected an ambiguous/misaligned crop; ZXing fallback failed |

## Failure Cases

| Fixture | Observed behavior | Suspected cause | Follow-up |
| --- | --- | --- | --- |
| [11-complex-background.jpg](benchmark-fixtures/11-complex-background.jpg) | Failed with the generic decode error | Edge-density region landed on a partial QR/background-heavy area | Expand crop padding or retry neighboring high-density regions |
| [14-damaged.png](benchmark-fixtures/14-damaged.png) | Failed with the generic decode error | Missing modules and scratch-like occlusion exceed current tolerance | Add stronger preprocessing or document as expected hard failure |
| [15-inverted.png](benchmark-fixtures/15-inverted.png) | Failed with the generic decode error | Current upload path does not recover this inverted fixture | Add explicit invert-image preprocessing before ZXing fallback |
| [16-multiple-codes.jpg](benchmark-fixtures/16-multiple-codes.jpg) | Failed with the generic decode error | Multiple high-density candidates make single-region selection brittle | Try top N candidate regions and report the first exact decode |

## Notes

- These results are not a claim that Scanly is faster than another scanner. They are a repeatable local baseline for this repository.
- The current fixture set is intentionally small and difficult enough to expose failure modes. More fixtures should be added before making broad performance claims.
- Previous performance estimates should be treated as design motivation unless backed by future benchmark runs.
