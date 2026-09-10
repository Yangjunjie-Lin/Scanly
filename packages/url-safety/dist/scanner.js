import { parseSemanticPayload } from "@scanly/parsers";
import { structuredUrl } from "./local.js";
/** Optional observer, never a decoder/Worker dependency. Disabled until configured. */
export class UrlSafetyController {
    analyzer;
    onState;
    generation = 0;
    controller;
    currentUrl;
    mode;
    disposed = false;
    detach;
    constructor(analyzer, onState) {
        this.analyzer = analyzer;
        this.onState = onState;
    }
    configure(mode) { this.cancel(); this.mode = mode; this.emit({ status: "idle" }); }
    emit(state) { if (!this.disposed) {
        try {
            this.onState(state);
        }
        catch { /* consumer errors must never fail scanning */ }
    } }
    accept(payload) {
        if (this.disposed || !this.mode)
            return;
        const url = structuredUrl(payload);
        if (!url) {
            this.cancel();
            this.emit({ status: "idle" });
            return;
        }
        if (url === this.currentUrl)
            return;
        this.cancel();
        const generation = this.generation;
        const controller = new AbortController();
        this.controller = controller;
        this.currentUrl = url;
        this.emit({ status: "queued" });
        // Publish the barcode synchronously; safety starts on a separate microtask.
        void Promise.resolve().then(async () => {
            if (controller.signal.aborted)
                return;
            this.emit({ status: "analyzing" });
            try {
                const analysis = await this.analyzer.analyze(url, { mode: this.mode, signal: controller.signal });
                if (generation === this.generation && !controller.signal.aborted) {
                    this.currentUrl = undefined;
                    this.emit({ status: analysis.status, analysis });
                }
            }
            catch {
                if (generation === this.generation && !controller.signal.aborted) {
                    this.currentUrl = undefined;
                    this.emit({ status: "failed" });
                }
            }
        });
    }
    acceptEvent(event) {
        if (!this.mode || this.disposed || (event.type !== "emitted" && event.type !== "confirmed"))
            return;
        this.accept(parseSemanticPayload(event.barcode.text).structured);
    }
    attach(session) {
        this.detach?.();
        const offResult = session.onResult((event) => this.acceptEvent(event));
        const offState = session.onStateChange((state) => { if (["stopping", "stopped", "failed", "paused"].includes(state))
            this.cancel(); });
        this.detach = () => { offResult(); offState(); this.cancel(); };
        return this.detach;
    }
    cancel() { this.generation++; this.controller?.abort(); this.controller = undefined; this.currentUrl = undefined; this.emit({ status: "cancelled" }); }
    dispose() { this.disposed = true; this.detach?.(); this.cancel(); }
}
//# sourceMappingURL=scanner.js.map