import { validateScenario } from "@scanly/scenario-schema";
import { SdkException, sdkError } from "../contracts/errors.js";
import { CaptureRouter } from "./router.js";
export class CaptureSession {
    state = "idle";
    router;
    concurrentPolicy;
    activeController = null;
    ownership = 0;
    source = null;
    constructor(options = {}) {
        this.router = options.router ?? new CaptureRouter({ scenario: options.scenario });
        this.concurrentPolicy = options.concurrentCallPolicy ?? "replace";
    }
    getState() { return this.state; }
    getSource() { return this.source; }
    initialize() {
        this.assertNotDisposed();
        if (this.state === "idle" || this.state === "stopped" || this.state === "error")
            this.state = "initialized";
    }
    start(source) {
        this.assertNotDisposed();
        if (this.state === "idle")
            this.initialize();
        this.source = source ?? this.source;
        this.state = "running";
    }
    stop() {
        if (this.state === "disposed")
            return;
        this.cancel();
        this.state = "stopped";
    }
    cancel() {
        this.ownership += 1;
        this.activeController?.abort();
        this.activeController = null;
    }
    updateConfiguration(scenario) {
        this.assertNotDisposed();
        const validated = validateScenario(scenario);
        if (!validated.ok)
            throw new SdkException(sdkError("malformed_scenario", validated.message));
        this.cancel();
        this.router.updateScenario(validated.value);
    }
    switchSource(source) {
        this.assertNotDisposed();
        this.cancel();
        this.source = source;
        if (this.state === "idle")
            this.state = "initialized";
    }
    async scan(frame, options = {}) {
        this.assertNotDisposed();
        if (this.state !== "running")
            return this.lifecycleFailure(frame.id, "session_not_running", "Capture session must be started before scan().");
        if (this.activeController && this.concurrentPolicy === "reject")
            return this.lifecycleFailure(frame.id, "concurrent_call_rejected", "This session allows only one active scan.");
        if (this.activeController)
            this.cancel();
        const owner = ++this.ownership;
        const controller = new AbortController();
        this.activeController = controller;
        const onAbort = () => controller.abort();
        options.signal?.addEventListener("abort", onAbort, { once: true });
        try {
            const outcome = await this.router.scan(frame, { signal: controller.signal });
            if (owner !== this.ownership)
                return this.lifecycleFailure(frame.id, "cancelled", "Result belongs to a superseded session job.");
            return outcome;
        }
        catch (error) {
            this.state = "error";
            return this.lifecycleFailure(frame.id, "internal_invariant_failure", error instanceof Error ? error.message : String(error));
        }
        finally {
            options.signal?.removeEventListener("abort", onAbort);
            if (this.activeController === controller)
                this.activeController = null;
        }
    }
    dispose() {
        if (this.state === "disposed")
            return;
        this.cancel();
        this.source = null;
        this.state = "disposed";
    }
    assertNotDisposed() {
        if (this.state === "disposed")
            throw new SdkException(sdkError("session_disposed", "Capture session has been disposed."));
    }
    lifecycleFailure(frameId, code, message) {
        return { ok: false, error: sdkError(code, message), frameId, scenarioId: this.router.getScenario().id, attemptCount: 0, timing: { totalMs: 0 } };
    }
}
//# sourceMappingURL=session.js.map