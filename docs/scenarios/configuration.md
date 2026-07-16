# Scenario configuration

Scenario schema `2.0` is runtime validated. Unknown versions and unknown fields are rejected; they are never silently coerced. Generated canonical profiles live in `scenarios/generic/` and are synchronized with `@scanly/scenario-schema` by `npm run scenarios:generate`.

| Profile | Candidates | Attempts | Deadline | Multi-code | Intended use |
| --- | ---: | ---: | ---: | --- | --- |
| fast | 2 | 18 | 2 s | no | clear, single-code input |
| balanced | 5 | 96 | 12 s | up to 8 | reference app default |
| robust | 8 | 160 | 20 s | up to 12 | bounded difficult-image investigation |

Each scenario compiles into eleven logical operators: frame normalization, ROI, localization, candidate generation and deduplication, enhancement and geometry planning, decoder execution, result aggregation, validation, and semantic parsing. Dependency-ready graph nodes execute in parallel.

`decoders.execution` controls real engine branches. `sequential` preserves ordered fallback. `parallel` requires thread-safe engines and aggregates in declared engine order. For single-code scans, a successful higher-priority branch cancels lower-priority branches; multi-code scans retain all branches so completeness is not traded away.

See the [field-by-field enforcement matrix](support-matrix.md). `quality.minimumHeuristicQuality` is deliberately rejected by the compiler because the installed engines do not expose a defensible quality signal. Missing engines/operators, unsupported formats, unsafe parallel combinations, and unavailable required validators fail before decoding.

To add a scenario: clone a built-in, change its ID/revision and budgets, validate it, add canonical JSON, create scenario-specific fixtures/validators, and record benchmark/compatibility evidence. An industry name without that evidence is not a supported scenario pack.
