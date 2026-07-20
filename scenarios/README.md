# Scenario packs

`generic/` contains the generated, versioned fast/balanced/robust profiles shipped by `@scanly/scenario-schema`. Run `npm run scenarios:generate` after changing built-ins; repository quality gates validate every generated profile.

The Alpha.5 presets are routing foundations, not claims of industry-grade coverage. Retail, warehouse, logistics, healthcare, manufacturing, ticketing, and document-batch support still require dedicated validators, datasets, budgets, and benchmark evidence.
# Scenario format selection

`acceptedFormats` is explicit. Existing `fast`, `balanced`, and `robust` scenarios remain QR-only. Alpha.5 also ships `multiformat-balanced`, `retail-fast`, `logistics-balanced`, and `document-robust`; these presets opt into only the listed public formats. Deferred ZXing formats are rejected by schema validation.
