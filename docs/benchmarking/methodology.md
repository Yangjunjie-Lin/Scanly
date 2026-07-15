# Benchmark methodology

The canonical internal suite has three visible partitions: deterministic generated transformations, project-owned real images, and deterministic negative/adversarial images. `benchmark/datasets/blind/` defines an intentionally empty separation boundary for a future blind set that must not be used for tuning.

`npm run benchmark` measures the Node pipeline domain. It records report/runtime schema versions, case pass rate, positive decode recall, exact-payload accuracy, multi-code completeness, false positives, category/format recall, average/median/P95 latency, P99 only when at least 100 samples exist, time to first result, attempts, engine/preprocess/candidate distributions, timeouts, and phase timings. Reliable per-case retained memory is not available in CI and is reported as a limitation.

`npm run benchmark:compare` sends the same decoded RGBA buffer for each fixture to raw jsQR, raw ZXing JavaScript, and Scanly fast/balanced/robust. It records success, exact payload, multiple completeness, latency, failure, unsupported format, and false positive. These Node numbers must not be mixed with browser-device timing.

The suite is internal regression evidence. It is not a universal accuracy figure, an ML evaluation, or a commercial competitor comparison. The retained `14-damaged` failure remains in the denominator. Commercial results require licensing and methodology approval described in `benchmark/competitors/README.md`.
