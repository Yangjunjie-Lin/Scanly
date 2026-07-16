import { validateScenario } from "@scanly/scenario-schema";
import { SdkException, sdkError } from "../contracts/errors.js";
import { executeTaskGraph } from "../contracts/operator.js";
import { BUILTIN_OPERATOR_IDS } from "./builtin-operators.js";
const DEPENDENCIES = {
    "scanly.frame-normalization": [],
    "scanly.roi": ["scanly.frame-normalization"],
    "scanly.localization": ["scanly.roi"],
    "scanly.candidate-generation": ["scanly.localization"],
    "scanly.candidate-deduplication": ["scanly.candidate-generation"],
    "scanly.enhancement-plan": ["scanly.localization"],
    "scanly.geometry": ["scanly.candidate-deduplication", "scanly.enhancement-plan"],
    "scanly.decoder-execution": ["scanly.geometry"],
    "scanly.result-aggregation": ["scanly.decoder-execution"],
    "scanly.validation": ["scanly.result-aggregation"],
    "scanly.semantic-parsing": ["scanly.validation"],
};
export class CompiledScenarioGraph {
    scenario;
    nodes;
    configuration;
    constructor(scenario, nodes, configuration) {
        this.scenario = scenario;
        this.nodes = nodes;
        this.configuration = configuration;
    }
    execute(context) {
        return executeTaskGraph([...this.nodes], context, "parallel");
    }
    getConfiguration() { return this.configuration; }
}
export class ScenarioCompiler {
    operators;
    engines;
    validators;
    cache = new Map();
    maxCacheEntries;
    constructor(operators, engines, validators, options = {}) {
        this.operators = operators;
        this.engines = engines;
        this.validators = validators;
        this.maxCacheEntries = Math.max(1, Math.min(128, options.maxCacheEntries ?? 32));
    }
    compile(input) {
        const validated = validateScenario(input);
        if (!validated.ok) {
            throw new SdkException(sdkError("malformed_scenario", validated.message, { issueCount: validated.issues.length }));
        }
        const scenario = validated.value;
        this.validateCapabilities(scenario);
        const key = this.cacheKey(scenario);
        const cached = this.cache.get(key);
        if (cached) {
            this.cache.delete(key);
            this.cache.set(key, cached);
            return cached;
        }
        const configuration = { scenario, engines: this.engines, validators: this.validators };
        const nodes = BUILTIN_OPERATOR_IDS.map((id) => {
            const operator = this.operators.get(id);
            if (!operator) {
                throw new SdkException(sdkError("invalid_configuration", `Required operator '${id}' is not registered.`, { operatorId: id }));
            }
            return { id, dependencies: [...DEPENDENCIES[id]], run: (context) => operator.execute(undefined, configuration, context) };
        });
        this.validateGraph(nodes);
        const graph = new CompiledScenarioGraph(scenario, nodes, configuration);
        this.cache.set(key, graph);
        while (this.cache.size > this.maxCacheEntries)
            this.cache.delete(this.cache.keys().next().value);
        return graph;
    }
    clearCache() { this.cache.clear(); }
    get cacheSize() { return this.cache.size; }
    validateCapabilities(scenario) {
        const requested = scenario.decoders.order.map((id) => {
            const engine = this.engines.get(id);
            if (!engine)
                throw new SdkException(sdkError("invalid_configuration", `Scenario '${scenario.id}' requires decoder engine '${id}', but it is not registered.`, { scenarioId: scenario.id, engineId: id }));
            return engine;
        });
        const unsupported = scenario.acceptedFormats.filter((format) => !requested.some((engine) => engine.capabilities.formats.includes(format)));
        if (unsupported.length) {
            throw new SdkException(sdkError("unsupported_format", `No requested decoder engine supports: ${unsupported.join(", ")}.`, { scenarioId: scenario.id, formats: unsupported.join(",") }));
        }
        if (scenario.decoders.execution === "parallel" && requested.length > 1) {
            const unsafe = requested.filter((engine) => !engine.capabilities.threadSafe).map((engine) => engine.id);
            if (unsafe.length)
                throw new SdkException(sdkError("invalid_configuration", `Parallel decoder execution is incompatible with non-thread-safe engine(s): ${unsafe.join(", ")}.`, { engineIds: unsafe.join(",") }));
        }
        const missingValidators = scenario.validation.filter((entry) => entry.required && !this.validators.get(entry.id)).map((entry) => entry.id);
        if (missingValidators.length) {
            throw new SdkException(sdkError("invalid_configuration", `Required validator(s) are not registered: ${missingValidators.join(", ")}.`, { validatorIds: missingValidators.join(",") }));
        }
        if (scenario.quality.minimumHeuristicQuality !== undefined) {
            throw new SdkException(sdkError("invalid_configuration", "quality.minimumHeuristicQuality is unsupported because the installed pipeline does not provide a defensible quality signal."));
        }
    }
    validateGraph(nodes) {
        const ids = new Set(nodes.map((node) => node.id));
        for (const node of nodes) {
            const missing = node.dependencies.filter((id) => !ids.has(id));
            if (missing.length)
                throw new SdkException(sdkError("invalid_configuration", `Operator '${node.id}' has missing dependencies: ${missing.join(", ")}.`));
        }
        const pending = new Map(nodes.map((node) => [node.id, node.dependencies]));
        const complete = new Set();
        while (pending.size) {
            const ready = [...pending].filter(([, dependencies]) => dependencies.every((id) => complete.has(id)));
            if (!ready.length)
                throw new SdkException(sdkError("invalid_configuration", "Operator graph contains a dependency cycle."));
            for (const [id] of ready) {
                pending.delete(id);
                complete.add(id);
            }
        }
    }
    cacheKey(scenario) {
        return JSON.stringify({
            scenario,
            engines: this.engines.list().map((engine) => [engine.id, engine.version, engine.capabilities.threadSafe]),
            operators: this.operators.list().map((operator) => [operator.descriptor.id, operator.descriptor.version]),
            validators: this.validators.list().map((validator) => validator.id),
        });
    }
}
//# sourceMappingURL=scenario-compiler.js.map