# Extending Scanly

## Decoder engine

Implement `DecoderEngine`, declare exact capabilities/version/thread safety, return typed failure categories, add initialization/disposal tests, and compare on identical inputs. Do not list a format until exact-payload and negative tests pass. Optional engine packages must not force their dependencies into core consumers.

## Operator

Implement `Operator<I,O,C>` with a descriptor covering accepted/produced types, schema ID, cost, cancellation, determinism/state, and thread safety. Use the frame artifact store for reusable intermediate data and respect retained allocation/byte budgets. Add graph ordering, cancellation, and invariant tests.

## Scenario

Add versioned JSON plus validation, relevant parsers/validators, bounded budgets, ablation coverage, datasets, benchmark evidence, and compatibility notes. Regenerate canonical profiles when changing built-ins.

## Benchmark category

Add deterministic provenance or project-owned licensing, an expected decode/fail contract, exact payload or required multi-payload set, and a category definition. Never remove or relabel a hard case merely to improve a number. Blind labels must remain separated from tuning.
