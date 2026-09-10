# @scanly/scenario-schema

Versioned, runtime-validated capture scenarios for Scanly SDK v2.1.0. Schema `2.1` is current; valid `2.0` input is migrated deterministically and mixed old/new fields or unknown versions are rejected.

```bash
npm install @scanly/scenario-schema
```

```ts
import { getBuiltinScenario, validateScenario } from "@scanly/scenario-schema";

const scenario = getBuiltinScenario("multiformat-balanced");
const checked = validateScenario(scenario);
if (!checked.ok) throw new Error(checked.message);
```

This is an advanced public configuration package. Browser, Node, and Core already declare it as a dependency.

Version: 2.1.0 · [Scenario documentation](https://github.com/Yangjunjie-Lin/Scanly/blob/main/docs/scenarios/configuration.md)
