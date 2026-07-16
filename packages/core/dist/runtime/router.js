import { getBuiltinScenario, validateScenario } from "@scanly/scenario-schema";
import { SdkException, sdkError } from "../contracts/errors.js";
import { validateFrame } from "../contracts/frame.js";
import { BoundedFrameArtifactStore } from "./artifacts.js";
import { createDefaultOperatorRegistry } from "./builtin-operators.js";
import { EngineRegistry } from "./engine-registry.js";
import { FrameLease } from "./frame-lease.js";
import { OperatorRegistry } from "./operator-registry.js";
import { ScenarioCompiler } from "./scenario-compiler.js";
import { scenarioToPipelineConfig } from "./scenario-runtime.js";
import { ValidatorRegistry } from "./validator-registry.js";
import { ExecutionBudget, monotonicNow } from "./execution-budget.js";
import { FrameMemoryBudget } from "./memory-budget.js";
const MAX_TRACE_EVENTS = 256;
const MAX_TRACE_DETAIL_LENGTH = 512;
function failure(frameId, scenarioId, code, message, totalMs, trace, cause) {
    return {
        ok: false,
        error: sdkError(code, message.slice(0, 2_048), undefined, cause),
        frameId,
        scenarioId,
        attemptCount: 0,
        timing: { totalMs },
        ...(trace ? { trace } : {}),
    };
}
function errorCode(error, signal, timedOut) {
    if (timedOut)
        return "timeout";
    if (signal?.aborted)
        return "cancelled";
    if (error instanceof SdkException)
        return error.error.code;
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "resource_limit_exceeded" || code === "unsupported_format" || code === "invalid_configuration" || code === "internal_invariant_failure")
        return code;
    return "engine_execution_failure";
}
export class CaptureRouter {
    scenario;
    now;
    engines;
    operators;
    validators;
    compiler;
    activeFrames = 0;
    state = "active";
    activeOperations = new Map();
    disposePromise;
    constructor(options = {}) {
        this.scenario = options.scenario ?? getBuiltinScenario("balanced");
        this.now = options.now ?? monotonicNow;
        this.engines = options.engines ?? new EngineRegistry();
        this.operators = options.operators ?? createDefaultOperatorRegistry();
        this.validators = options.validators ?? new ValidatorRegistry();
        this.compiler = options.compiler ?? new ScenarioCompiler(this.operators, this.engines, this.validators);
    }
    updateScenario(scenario) {
        this.assertUsable();
        const validated = validateScenario(scenario);
        if (!validated.ok)
            throw new SdkException(sdkError("malformed_scenario", validated.message, { issueCount: validated.issues.length }));
        this.compiler.compile(validated.value);
        this.scenario = validated.value;
    }
    getScenario() { return JSON.parse(JSON.stringify(this.scenario)); }
    async scan(frame, options = {}) {
        const lease = new FrameLease(frame);
        const scenario = options.scenario ?? this.scenario;
        const frameId = frame && typeof frame === "object" && typeof frame.id === "string" && frame.id ? frame.id : "invalid-frame";
        const scenarioId = scenario && typeof scenario === "object" && typeof scenario.id === "string" ? scenario.id : "invalid";
        const started = this.now();
        const operationController = new AbortController();
        let settleOperation;
        const settledOperation = new Promise((resolve) => { settleOperation = resolve; });
        this.activeOperations.set(operationController, settledOperation);
        const trace = [];
        const record = (stage, detail) => {
            if (trace.length >= MAX_TRACE_EVENTS)
                return;
            trace.push({
                atMs: Math.max(0, this.now() - started),
                stage: stage.slice(0, 96),
                ...(detail ? { detail: detail.slice(0, MAX_TRACE_DETAIL_LENGTH) } : {}),
            });
        };
        const traceOutput = () => scenario?.output?.includeDebugTrace ? trace : undefined;
        let active = false;
        let artifacts;
        let timeoutId;
        let timedOut = false;
        let onAbort;
        const phaseTimings = {};
        try {
            if (this.state !== "active")
                return failure(frameId, scenarioId, "session_disposed", "Capture router is disposing or has been disposed.", this.now() - started, traceOutput());
            const scenarioValidation = validateScenario(scenario);
            if (!scenarioValidation.ok)
                return failure(frameId, scenarioId, "malformed_scenario", scenarioValidation.message, this.now() - started, traceOutput());
            const validatedScenario = scenarioValidation.value;
            const frameIssues = validateFrame(frame);
            if (frameIssues.length)
                return failure(frameId, validatedScenario.id, "invalid_image", frameIssues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"), this.now() - started, traceOutput());
            if (!validatedScenario.input.preferredPixelFormats.includes(frame.pixelFormat)) {
                return failure(frameId, validatedScenario.id, "unsupported_format", `Frame pixel format '${frame.pixelFormat}' is not enabled by input.preferredPixelFormats.`, this.now() - started, traceOutput());
            }
            if (frame.width * frame.height > validatedScenario.budgets.maxPixels) {
                return failure(frameId, validatedScenario.id, "resource_limit_exceeded", `Frame has ${frame.width * frame.height} pixels; scenario limit is ${validatedScenario.budgets.maxPixels}.`, this.now() - started, traceOutput());
            }
            if (this.activeFrames >= validatedScenario.budgets.maxConcurrentFrames) {
                return failure(frameId, validatedScenario.id, "concurrent_call_rejected", `Router concurrency limit is ${validatedScenario.budgets.maxConcurrentFrames} frame(s).`, this.now() - started, traceOutput());
            }
            const graph = this.compiler.compile(validatedScenario);
            this.activeFrames += 1;
            active = true;
            const memoryBudget = new FrameMemoryBudget(validatedScenario.budgets.maxIntermediateBytes);
            artifacts = new BoundedFrameArtifactStore(validatedScenario.budgets.maxIntermediateAllocations, validatedScenario.budgets.maxIntermediateBytes, memoryBudget);
            artifacts.set("input.frame", frame);
            onAbort = () => operationController.abort();
            options.signal?.addEventListener("abort", onAbort, { once: true });
            if (options.signal?.aborted)
                operationController.abort();
            const deadlineMs = started + validatedScenario.budgets.maxExecutionMs;
            timeoutId = setTimeout(() => { timedOut = true; operationController.abort(); }, validatedScenario.budgets.maxExecutionMs);
            record("frame.accepted", `${frame.pixelFormat} ${frame.width}x${frame.height}`);
            const budget = new ExecutionBudget({ signal: operationController.signal, deadlineMs, now: this.now, memory: memoryBudget });
            const context = { signal: operationController.signal, artifacts, budget, phaseTimings, trace: record };
            await graph.execute(context);
            const outcome = artifacts.get("scan.final");
            if (!outcome)
                return failure(frameId, validatedScenario.id, "internal_invariant_failure", "Capture graph completed without a final outcome.", this.now() - started, traceOutput());
            const result = { ...outcome, timing: {
                    ...outcome.timing,
                    totalMs: this.now() - started,
                    frameNormalizationMs: phaseTimings["scanly.frame-normalization"],
                    roiMs: phaseTimings["scanly.roi"],
                    localizationMs: phaseTimings["scanly.localization"],
                    candidateGenerationMs: phaseTimings["scanly.candidate-generation"],
                    candidateDeduplicationMs: phaseTimings["scanly.candidate-deduplication"],
                    validationMs: phaseTimings["scanly.validation"],
                    semanticParsingMs: phaseTimings["scanly.semantic-parsing"],
                } };
            return validatedScenario.output.includeDebugTrace ? { ...result, trace } : result;
        }
        catch (error) {
            const code = errorCode(error, operationController.signal, timedOut);
            const message = error instanceof SdkException ? error.error.message : error instanceof Error ? error.message : String(error);
            return failure(frameId, scenarioId, code, message, this.now() - started, traceOutput(), error);
        }
        finally {
            if (timeoutId !== undefined)
                clearTimeout(timeoutId);
            if (onAbort)
                options.signal?.removeEventListener("abort", onAbort);
            artifacts?.dispose();
            if (active)
                this.activeFrames -= 1;
            lease.release();
            this.activeOperations.delete(operationController);
            settleOperation();
        }
    }
    async dispose() {
        if (this.disposePromise)
            return this.disposePromise;
        this.state = "disposing";
        this.disposePromise = (async () => {
            for (const controller of this.activeOperations.keys())
                controller.abort();
            await Promise.allSettled([...this.activeOperations.values()]);
            this.compiler.clearCache();
            await this.engines.disposeAll();
            this.state = "disposed";
        })();
        return this.disposePromise;
    }
    assertUsable() {
        if (this.state !== "active")
            throw new SdkException(sdkError("session_disposed", "Capture router is disposing or has been disposed."));
    }
}
export { scenarioToPipelineConfig };
//# sourceMappingURL=router.js.map