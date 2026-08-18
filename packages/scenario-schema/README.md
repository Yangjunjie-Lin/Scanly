# @scanly/scenario-schema

Versioned, runtime-validated capture scenarios for the Scanly SDK v2 preview. Schema `2.1` is current; valid `2.0` input is deterministically migrated from `ablation.zxingFallback` to `ablation.multiEngineFallback`. Mixed old/new fields and unknown versions are rejected.
