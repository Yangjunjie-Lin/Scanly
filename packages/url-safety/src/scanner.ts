import { parseSemanticPayload, type StructuredPayload } from "@scanly/parsers";
import { structuredUrl } from "./local.js";
import type { UrlSafetyAnalysis, UrlSafetyAnalyzer, UrlSafetyPrivacyMode, UrlSafetyStatus } from "./types.js";

export interface UrlSafetyState { status: UrlSafetyStatus; analysis?: UrlSafetyAnalysis }
export interface UrlSafetyScanEvent {
  type: string;
  barcode: { text: string };
}
export interface UrlSafetyScannerSession {
  onResult(listener: (event: UrlSafetyScanEvent) => void): () => void;
  onStateChange(listener: (state: string) => void): () => void;
}
/** Optional observer, never a decoder/Worker dependency. Disabled until configured. */
export class UrlSafetyController {
  private generation = 0;
  private controller?: AbortController;
  private currentUrl?: string;
  private mode?: UrlSafetyPrivacyMode;
  private disposed = false;
  private detach?: () => void;
  constructor(private readonly analyzer: UrlSafetyAnalyzer, private readonly onState: (state: UrlSafetyState) => void) {}
  configure(mode?: UrlSafetyPrivacyMode): void { this.cancel(); this.mode = mode; this.emit({ status: "idle" }); }
  private emit(state: UrlSafetyState): void { if (!this.disposed) { try { this.onState(state); } catch { /* consumer errors must never fail scanning */ } } }
  accept(payload: StructuredPayload | null | undefined): void {
    if (this.disposed || !this.mode) return;
    const url = structuredUrl(payload);
    if (!url) { this.cancel(); this.emit({ status: "idle" }); return; }
    if (url === this.currentUrl) return;
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller; this.currentUrl = url;
    this.emit({ status: "queued" });
    // Publish the barcode synchronously; safety starts on a separate microtask.
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      this.emit({ status: "analyzing" });
      try {
        const analysis = await this.analyzer.analyze(url, { mode: this.mode, signal: controller.signal });
        if (generation === this.generation && !controller.signal.aborted) { this.currentUrl = undefined; this.emit({ status: analysis.status, analysis }); }
      } catch {
        if (generation === this.generation && !controller.signal.aborted) { this.currentUrl = undefined; this.emit({ status: "failed" }); }
      }
    });
  }
  acceptEvent(event: UrlSafetyScanEvent): void {
    if (!this.mode || this.disposed || (event.type !== "emitted" && event.type !== "confirmed")) return;
    this.accept(parseSemanticPayload(event.barcode.text).structured);
  }
  attach(session: UrlSafetyScannerSession): () => void {
    this.detach?.();
    const offResult = session.onResult((event) => this.acceptEvent(event));
    const offState = session.onStateChange((state) => { if (["stopping", "stopped", "failed", "paused"].includes(state)) this.cancel(); });
    this.detach = () => { offResult(); offState(); this.cancel(); };
    return this.detach;
  }
  cancel(): void { this.generation++; this.controller?.abort(); this.controller = undefined; this.currentUrl = undefined; this.emit({ status: "cancelled" }); }
  dispose(): void { this.disposed = true; this.detach?.(); this.cancel(); }
}
