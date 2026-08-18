# @scanly/benchmark

Machine-readable benchmark contracts, conformance evaluation, and regression gates for Scanly SDK v2.0.0.

```bash
npm install @scanly/benchmark
```

```ts
import { BENCHMARK_SCHEMA_VERSION } from "@scanly/benchmark";

console.log(BENCHMARK_SCHEMA_VERSION); // 2.0
```

Node pipeline timing, browser timing, and physical-device timing are separate measurement domains and must retain their labels. This advanced/internal-facing public package is for tooling and evidence integrations, not barcode decoding.

Version: 2.0.0 · [Benchmark methodology](https://github.com/Yangjunjie-Lin/Scanly/blob/main/docs/benchmarking/methodology.md)
