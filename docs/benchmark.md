# Scanly QR Benchmark

This benchmark gives Scanly a repeatable way to track decoding quality before and after changes. The fixture set contains 16 representative QR images; run each image through upload mode and record whether it decoded, how long it took, and why failures happened.

## Environment

| Field | Value |
| --- | --- |
| Date | 2026-06-25 |
| App version | `1.0.0` |
| Browser | To be recorded |
| Device / CPU | To be recorded |
| Network | Not required; decoding runs in-browser |
| Build | `npm run build` |

## Method

1. Use `npm install` and `npm run build` before benchmarking.
2. Start Scanly with `npm run dev` or `npm start`.
3. Use upload mode for every image.
4. Measure elapsed time from file selection to the final `Decoded` or `Failed to decode image` status.
5. Record the first successful payload exactly as shown in the result box.
6. For failed images, keep the image in the fixture set and describe the visible issue.

## Dataset

Fixtures are committed under `docs/benchmark-fixtures/`. Keep expected payloads stable so regressions are easy to spot.

| ID | Fixture | Scenario | Expected payload | Result | Time (ms) | Decoder path / notes | Failure case |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| 01 | [01-clear-url.png](benchmark-fixtures/01-clear-url.png) | High-contrast generated QR | `https://scanly.example/clear` | Pending | - | Baseline clear image | - |
| 02 | [02-clear-text.png](benchmark-fixtures/02-clear-text.png) | High-contrast text QR | `SCANLY_CLEAR_TEXT` | Pending | - | Baseline text payload | - |
| 03 | [03-phone-photo.jpg](benchmark-fixtures/03-phone-photo.jpg) | Normal phone photo | `https://scanly.example/photo` | Pending | - | Tests perspective and camera noise | - |
| 04 | [04-screen-capture.png](benchmark-fixtures/04-screen-capture.png) | Screenshot from display | `https://scanly.example/screen` | Pending | - | Tests screen-rendered edges | - |
| 05 | [05-low-contrast.png](benchmark-fixtures/05-low-contrast.png) | Gray QR on gray background | `https://scanly.example/low-contrast` | Pending | - | Should exercise contrast fallback | - |
| 06 | [06-dark-lighting.jpg](benchmark-fixtures/06-dark-lighting.jpg) | Underexposed photo | `https://scanly.example/dark` | Pending | - | Tests poor lighting | - |
| 07 | [07-overexposed.jpg](benchmark-fixtures/07-overexposed.jpg) | Bright / washed-out photo | `https://scanly.example/bright` | Pending | - | Tests lost dark modules | - |
| 08 | [08-blurry.jpg](benchmark-fixtures/08-blurry.jpg) | Mild blur | `https://scanly.example/blur` | Pending | - | Tests tolerance to focus issues | - |
| 09 | [09-glare.jpg](benchmark-fixtures/09-glare.jpg) | Glare crossing one side | `https://scanly.example/glare` | Pending | - | Useful failure sample if finder pattern is covered | - |
| 10 | [10-small-in-large.jpg](benchmark-fixtures/10-small-in-large.jpg) | Small QR in a large image | `https://scanly.example/small` | Pending | - | Should exercise region detection | - |
| 11 | [11-complex-background.jpg](benchmark-fixtures/11-complex-background.jpg) | QR on busy background | `https://scanly.example/background` | Pending | - | Tests false-positive region detection | - |
| 12 | [12-rotated.png](benchmark-fixtures/12-rotated.png) | 15 degree rotation | `https://scanly.example/rotated` | Pending | - | Tests rotation tolerance | - |
| 13 | [13-perspective.jpg](benchmark-fixtures/13-perspective.jpg) | Angled perspective | `https://scanly.example/perspective` | Pending | - | Tests phone-shot geometry | - |
| 14 | [14-damaged.png](benchmark-fixtures/14-damaged.png) | Missing / scratched modules | `https://scanly.example/damaged` | Pending | - | Validates error correction limits | Candidate failure case |
| 15 | [15-inverted.png](benchmark-fixtures/15-inverted.png) | Light modules on dark background | `https://scanly.example/inverted` | Pending | - | Should exercise inversion attempts | Candidate failure case |
| 16 | [16-multiple-codes.jpg](benchmark-fixtures/16-multiple-codes.jpg) | Multiple QR codes in one image | `https://scanly.example/primary` | Pending | - | Record which code Scanly chooses | Ambiguous target |

## Summary

| Metric | Value |
| --- | ---: |
| Total fixtures | 16 |
| Successful decodes | Pending |
| Failed decodes | Pending |
| Success rate | Pending |
| Median decode time | Pending |
| P95 decode time | Pending |

## Fixture Sanity Check

The generated images were smoke-checked with OpenCV QR detection to catch corrupt fixtures. This is not the Scanly benchmark result; Scanly scores should be filled in the dataset table above after running the app.

| Check | Result |
| --- | --- |
| Direct or multi-code OpenCV decode | 13 / 16 fixtures |
| Expected hard cases | `14-damaged.png`, `15-inverted.png` |
| Needs Scanly-specific evaluation | `11-complex-background.jpg` |

## Failure Log

| Fixture | Observed behavior | Suspected cause | Follow-up |
| --- | --- | --- | --- |
| Pending | No failures recorded yet | - | Run the fixture set and update this table |

## Acceptance Targets

| Target | Threshold |
| --- | ---: |
| Clear generated QR success rate | 100% |
| Full dataset success rate | >= 85% |
| Median upload decode time | <= 1000 ms |
| P95 upload decode time | <= 3000 ms |
