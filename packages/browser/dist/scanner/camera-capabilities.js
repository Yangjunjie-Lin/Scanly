import { sdkError } from "@scanly/core";
export class CameraCapabilityController {
    track;
    autoZoom;
    lastAutoZoomAt = Number.NEGATIVE_INFINITY;
    manualZoomOverride = false;
    constructor(track, autoZoom = {}) {
        this.track = track;
        this.autoZoom = autoZoom;
    }
    getCapabilities() {
        const track = this.track();
        const capabilities = track?.getCapabilities?.();
        const settings = track?.getSettings?.();
        const min = capabilities?.zoom?.min;
        const max = capabilities?.zoom?.max;
        return {
            torch: Boolean(capabilities?.torch),
            ...(min !== undefined && max !== undefined ? { zoom: { min, max, ...(capabilities?.zoom?.step === undefined ? {} : { step: capabilities.zoom.step }), ...(settings?.zoom === undefined ? {} : { current: settings.zoom }) } } : {}),
            focusMode: Boolean(capabilities?.focusMode?.length),
            ...(settings?.width === undefined ? {} : { width: settings.width }),
            ...(settings?.height === undefined ? {} : { height: settings.height }),
            ...(settings?.deviceId === undefined ? {} : { deviceId: settings.deviceId }),
        };
    }
    async setTorch(enabled) {
        const track = this.track();
        if (!track || !this.getCapabilities().torch)
            return this.unsupported("Torch is not supported by the active camera track.");
        try {
            await track.applyConstraints({ advanced: [{ torch: enabled }] });
            return { ok: true, value: enabled };
        }
        catch (error) {
            return { ok: false, error: sdkError("source_disconnected", "Unable to update camera torch.", undefined, error) };
        }
    }
    async setZoom(value, manual = true) {
        const track = this.track();
        const zoom = this.getCapabilities().zoom;
        if (!track || !zoom)
            return this.unsupported("Zoom is not supported by the active camera track.");
        if (!Number.isFinite(value) || value < zoom.min || value > zoom.max)
            return { ok: false, error: sdkError("invalid_configuration", `Zoom must be between ${zoom.min} and ${zoom.max}.`) };
        try {
            await track.applyConstraints({ advanced: [{ zoom: value }] });
            if (manual)
                this.manualZoomOverride = true;
            return { ok: true, value };
        }
        catch (error) {
            return { ok: false, error: sdkError("source_disconnected", "Unable to update camera zoom.", undefined, error) };
        }
    }
    async requestFocus() {
        const track = this.track();
        if (!track || !this.getCapabilities().focusMode)
            return this.unsupported("Focus control is not supported by the active camera track.");
        try {
            await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
            return { ok: true, value: true };
        }
        catch (error) {
            return { ok: false, error: sdkError("source_disconnected", "Unable to request camera focus.", undefined, error) };
        }
    }
    async considerAutoZoom(geometry, frame, now = Date.now()) {
        if (this.autoZoom.enabled === false || this.manualZoomOverride || now - this.lastAutoZoomAt < (this.autoZoom.cooldownMs ?? 1_500))
            return undefined;
        const zoom = this.getCapabilities().zoom;
        if (!zoom)
            return undefined;
        const ratio = geometry.boundingBox.width * geometry.boundingBox.height / Math.max(1, frame.width * frame.height);
        if (ratio >= (this.autoZoom.minimumBarcodeAreaRatio ?? 0.04))
            return undefined;
        const next = Math.min(zoom.max, (zoom.current ?? zoom.min) + Math.max(0.05, this.autoZoom.maximumZoomDelta ?? 0.5));
        if (next <= (zoom.current ?? zoom.min))
            return undefined;
        this.lastAutoZoomAt = now;
        return this.setZoom(next, false);
    }
    clearManualZoomOverride() { this.manualZoomOverride = false; }
    unsupported(message) { return { ok: false, error: sdkError("unsupported_browser_capability", message) }; }
}
//# sourceMappingURL=camera-capabilities.js.map