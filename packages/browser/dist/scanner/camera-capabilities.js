import { sdkError } from "@scanly/core";
const controllerStates = new WeakMap();
function resolveTrack(owner, provider, onSourceChanged) {
    const track = provider();
    const state = controllerStates.get(owner);
    if (!state) {
        controllerStates.set(owner, { activeTrack: track });
    }
    else if (state.activeTrack !== track) {
        state.activeTrack = track;
        state.lastAppliedZoom = undefined;
        onSourceChanged();
    }
    return track;
}
function stateFor(owner) {
    const state = controllerStates.get(owner);
    if (!state)
        throw new Error("Camera capability state was not initialized.");
    return state;
}
function capabilitiesFor(track) {
    const capabilities = track?.getCapabilities?.();
    const settings = track?.getSettings?.();
    const min = capabilities?.zoom?.min;
    const max = capabilities?.zoom?.max;
    return {
        torch: Boolean(capabilities?.torch),
        ...(min !== undefined && max !== undefined
            ? {
                zoom: {
                    min,
                    max,
                    ...(capabilities?.zoom?.step === undefined ? {} : { step: capabilities.zoom.step }),
                    ...(settings?.zoom === undefined ? {} : { current: settings.zoom }),
                },
            }
            : {}),
        // The public boolean means requestFocus() can make the exact request it
        // promises. Other modes (for example "manual") do not imply that the
        // continuous-focus constraint is supported.
        focusMode: capabilities?.focusMode?.includes("continuous") ?? false,
        ...(settings?.width === undefined ? {} : { width: settings.width }),
        ...(settings?.height === undefined ? {} : { height: settings.height }),
        ...(settings?.deviceId === undefined ? {} : { deviceId: settings.deviceId }),
    };
}
export class CameraCapabilityController {
    track;
    autoZoom;
    lastAutoZoomAt = Number.NEGATIVE_INFINITY;
    manualZoomOverride = false;
    autoZoomOperation;
    constructor(track, autoZoom = {}) {
        this.track = track;
        this.autoZoom = autoZoom;
    }
    getCapabilities() {
        const track = resolveTrack(this, this.track, () => {
            this.lastAutoZoomAt = Number.NEGATIVE_INFINITY;
            this.manualZoomOverride = false;
            this.autoZoomOperation = undefined;
        });
        return capabilitiesFor(track);
    }
    async setTorch(enabled) {
        const track = resolveTrack(this, this.track, () => {
            this.lastAutoZoomAt = Number.NEGATIVE_INFINITY;
            this.manualZoomOverride = false;
            this.autoZoomOperation = undefined;
        });
        if (!track || !capabilitiesFor(track).torch) {
            return this.unsupported("Torch is not supported by the active camera track.");
        }
        try {
            await track.applyConstraints({ advanced: [{ torch: enabled }] });
            return { ok: true, value: enabled };
        }
        catch (error) {
            return { ok: false, error: sdkError("source_disconnected", "Unable to update camera torch.", undefined, error) };
        }
    }
    async setZoom(value, manual = true) {
        const track = resolveTrack(this, this.track, () => {
            this.lastAutoZoomAt = Number.NEGATIVE_INFINITY;
            this.manualZoomOverride = false;
            this.autoZoomOperation = undefined;
        });
        const zoom = capabilitiesFor(track).zoom;
        if (!track || !zoom) {
            return this.unsupported("Zoom is not supported by the active camera track.");
        }
        if (!Number.isFinite(value) || value < zoom.min || value > zoom.max) {
            return { ok: false, error: sdkError("invalid_configuration", `Zoom must be between ${zoom.min} and ${zoom.max}.`) };
        }
        try {
            await track.applyConstraints({ advanced: [{ zoom: value }] });
            // A track can be switched while applyConstraints() is pending. Do not
            // carry an old track's zoom state or manual override into the new source.
            if (stateFor(this).activeTrack === track) {
                stateFor(this).lastAppliedZoom = value;
                if (manual)
                    this.manualZoomOverride = true;
            }
            return { ok: true, value };
        }
        catch (error) {
            return { ok: false, error: sdkError("source_disconnected", "Unable to update camera zoom.", undefined, error) };
        }
    }
    async requestFocus() {
        const track = resolveTrack(this, this.track, () => {
            this.lastAutoZoomAt = Number.NEGATIVE_INFINITY;
            this.manualZoomOverride = false;
            this.autoZoomOperation = undefined;
        });
        if (!track || !capabilitiesFor(track).focusMode) {
            return this.unsupported("Focus control is not supported by the active camera track.");
        }
        try {
            await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
            return { ok: true, value: true };
        }
        catch (error) {
            return { ok: false, error: sdkError("source_disconnected", "Unable to request camera focus.", undefined, error) };
        }
    }
    async considerAutoZoom(geometry, frame, now = Date.now()) {
        const track = resolveTrack(this, this.track, () => {
            this.lastAutoZoomAt = Number.NEGATIVE_INFINITY;
            this.manualZoomOverride = false;
            this.autoZoomOperation = undefined;
        });
        const cooldownMs = Math.max(0, this.autoZoom.cooldownMs ?? 1_500);
        if (this.autoZoom.enabled === false
            || this.manualZoomOverride
            || this.autoZoomOperation !== undefined
            || now - this.lastAutoZoomAt < cooldownMs)
            return undefined;
        const zoom = capabilitiesFor(track).zoom;
        if (!track || !zoom)
            return undefined;
        const frameArea = Math.max(1, frame.width * frame.height);
        const barcodeArea = Math.max(0, geometry.boundingBox.width) * Math.max(0, geometry.boundingBox.height);
        if (barcodeArea / frameArea >= (this.autoZoom.minimumBarcodeAreaRatio ?? 0.04))
            return undefined;
        // Some browsers update getSettings().zoom asynchronously. Remembering the
        // last successful constraint prevents repeated requests for the same value.
        const current = Math.min(zoom.max, Math.max(zoom.min, stateFor(this).lastAppliedZoom ?? zoom.current ?? zoom.min));
        const configuredDelta = this.autoZoom.maximumZoomDelta ?? 0.5;
        const delta = Number.isFinite(configuredDelta) ? Math.max(0, configuredDelta) : 0;
        const next = Math.min(zoom.max, current + delta);
        if (next <= current)
            return undefined;
        // Reserve the cooldown before awaiting applyConstraints so concurrent frame
        // observations cannot issue duplicate zoom requests.
        const previousAutoZoomAt = this.lastAutoZoomAt;
        const operation = {};
        this.lastAutoZoomAt = now;
        this.autoZoomOperation = operation;
        try {
            const result = await this.setZoom(next, false);
            if (!result.ok && this.autoZoomOperation === operation)
                this.lastAutoZoomAt = previousAutoZoomAt;
            return result;
        }
        finally {
            if (this.autoZoomOperation === operation)
                this.autoZoomOperation = undefined;
        }
    }
    clearManualZoomOverride() {
        this.manualZoomOverride = false;
    }
    unsupported(message) {
        return { ok: false, error: sdkError("unsupported_browser_capability", message) };
    }
}
//# sourceMappingURL=camera-capabilities.js.map