# Scenario configuration

Scenario schema `2.0` is runtime validated. Unknown versions are rejected; they are not silently coerced. Generated canonical profiles are in `scenarios/generic/` and are synchronized with `@scanly/scenario-schema` by `npm run scenarios:generate`.

Profiles deliberately trade work for latency:

| Profile | Candidates | Attempts | Deadline | Multi-code | Intended use |
| --- | ---: | ---: | ---: | --- | --- |
| fast | 2 | 18 | 2 s | no | clear, single-code input |
| balanced | 5 | 96 | 12 s | up to 8 | reference app default |
| robust | 8 | 160 | 20 s | up to 12 | bounded difficult-image investigation |

Configuration covers accepted formats, input format/ROI, localization, padding/scales, enhancement/rotations, engine order and execution mode, multi-code, duplicate window, resource budgets, validators, semantic parsers, output fields, and ablation switches.

Parallel execution is supported by the task-graph executor for dependency-ready independent operators. The migrated default QR graph currently has one pipeline operator, so declaring parallel decoder execution does not create duplicate work or an unsupported accuracy claim.

To add a scenario: clone a built-in, change its ID/revision and budgets, validate it, add a canonical JSON file, create scenario-specific fixtures/validators, and record benchmark/compatibility evidence. An industry name without its evidence is not a supported scenario pack.
