import { createRgbaFrame } from "@scanly/core";
import { diagnosticsForTrack, negotiateCameraStream, } from "./camera-platform.js";
/** CI camera simulator source. It awaits consumer backpressure and never touches mediaDevices. */
export class DeterministicFrameSequenceSource {
    frames;
    options;
    stopped = true;
    paused = false;
    pauseWaiters = new Set();
    finishedPromise = Promise.resolve();
    finish;
    constructor(frames, options = {}) {
        this.frames = frames;
        this.options = options;
    }
    async start(onFrame, onError, onEnded) {
        await this.stop();
        this.stopped = false;
        this.paused = false;
        this.finishedPromise = new Promise((resolve) => { this.finish = resolve; });
        queueMicrotask(() => { void this.pump(onFrame, onError, onEnded); });
    }
    pause() { if (!this.stopped)
        this.paused = true; }
    resume() { this.paused = false; for (const resolve of this.pauseWaiters)
        resolve(); this.pauseWaiters.clear(); }
    async stop() { this.stopped = true; this.resume(); await this.finishedPromise; }
    async finished() { await this.finishedPromise; }
    async pump(onFrame, onError, onEnded) {
        const inFlight = [];
        try {
            const sequence = this.frames();
            if (this.options.respectBackpressure === false && Symbol.iterator in sequence) {
                for (const frame of sequence) {
                    if (this.stopped) {
                        if (frame.ownership !== "borrowed")
                            frame.dispose?.();
                        break;
                    }
                    inFlight.push(Promise.resolve(onFrame(frame)));
                }
            }
            else {
                for await (const frame of sequence) {
                    if (this.stopped) {
                        if (frame.ownership !== "borrowed")
                            frame.dispose?.();
                        break;
                    }
                    if (this.paused)
                        await new Promise((resolve) => this.pauseWaiters.add(resolve));
                    if (this.stopped) {
                        if (frame.ownership !== "borrowed")
                            frame.dispose?.();
                        break;
                    }
                    await onFrame(frame);
                }
            }
            await Promise.all(inFlight);
            if (!this.stopped)
                onEnded();
        }
        catch (error) {
            if (!this.stopped)
                onError(error);
        }
        finally {
            this.stopped = true;
            this.finish?.();
        }
    }
}
/** Browser media adapter only: camera acquisition and RGBA sampling, with no scanner policy state. */
export class MediaStreamCameraFrameSource {
    options;
    stream = null;
    canvas = null;
    timer = null;
    callbackId = null;
    sequence = 0;
    stopped = true;
    paused = false;
    onFrame = null;
    onError = null;
    onEnded = null;
    endedHandler = null;
    visibilityHandler = null;
    orientationHandler = null;
    onLifecycle = null;
    diagnostics;
    lastFrameSize;
    constructor(options) {
        this.options = options;
    }
    static async listDevices() {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices)
            return [];
        return (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
    }
    async start(onFrame, onError, onEnded, onLifecycle) {
        await this.stop();
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia)
            throw new Error("Camera capture is not supported by this browser.");
        this.onFrame = onFrame;
        this.onError = onError;
        this.onEnded = onEnded;
        this.onLifecycle = onLifecycle ?? null;
        this.stopped = false;
        this.paused = false;
        try {
            const negotiated = await negotiateCameraStream(this.constraintPolicy());
            this.stream = negotiated.stream;
            this.diagnostics = negotiated.diagnostics;
            if (this.stopped) {
                for (const track of this.stream.getTracks())
                    track.stop();
                return;
            }
            this.options.video.srcObject = this.stream;
            await this.options.video.play();
            this.canvas = document.createElement("canvas");
            const track = this.currentTrack();
            this.endedHandler = () => {
                const retained = { onFrame: this.onFrame, onError: this.onError, onEnded: this.onEnded, onLifecycle: this.onLifecycle };
                void this.stop();
                // Track-ended cleanup is immediate, while ScannerSession may use the
                // retained callbacks for a bounded restart on the next microtask.
                this.onFrame = retained.onFrame;
                this.onError = retained.onError;
                this.onEnded = retained.onEnded;
                this.onLifecycle = retained.onLifecycle;
                retained.onEnded?.();
            };
            track?.addEventListener?.("ended", this.endedHandler);
            if (typeof document !== "undefined") {
                this.visibilityHandler = () => {
                    this.onLifecycle?.({
                        reason: document.visibilityState === "hidden" ? "background-suspended" : "foreground-resumed",
                        timestamp: Date.now(),
                        detail: `visibilityState=${document.visibilityState}`,
                    });
                };
                document.addEventListener("visibilitychange", this.visibilityHandler);
            }
            if (typeof window !== "undefined") {
                this.orientationHandler = () => this.onLifecycle?.({ reason: "orientation-change", timestamp: Date.now() });
                window.addEventListener("orientationchange", this.orientationHandler);
            }
            this.onLifecycle?.({ reason: "constraints-renegotiated", timestamp: Date.now(), detail: `attempts=${this.diagnostics.attempts.length}` });
            this.schedule();
        }
        catch (error) {
            await this.stop();
            throw error;
        }
    }
    pause() { this.paused = true; }
    resume() { if (this.stopped)
        return; this.paused = false; this.schedule(); }
    async restart() {
        const onFrame = this.onFrame;
        const onError = this.onError;
        const onEnded = this.onEnded;
        const onLifecycle = this.onLifecycle;
        if (!onFrame || !onError || !onEnded)
            throw new Error("Camera source has no active callbacks to restart.");
        await this.start(onFrame, onError, onEnded, onLifecycle ?? undefined);
    }
    async stop() {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
        const video = this.options.video;
        if (this.callbackId !== null)
            video.cancelVideoFrameCallback?.(this.callbackId);
        this.callbackId = null;
        this.stopped = true;
        const track = this.currentTrack();
        if (track && this.endedHandler)
            track.removeEventListener?.("ended", this.endedHandler);
        this.endedHandler = null;
        for (const streamTrack of this.stream?.getTracks() ?? [])
            streamTrack.stop();
        this.stream = null;
        this.options.video.srcObject = null;
        if (this.visibilityHandler && typeof document !== "undefined")
            document.removeEventListener("visibilitychange", this.visibilityHandler);
        this.visibilityHandler = null;
        if (this.orientationHandler && typeof window !== "undefined")
            window.removeEventListener("orientationchange", this.orientationHandler);
        this.orientationHandler = null;
        if (this.canvas) {
            this.canvas.width = 0;
            this.canvas.height = 0;
        }
        this.canvas = null;
        this.onFrame = null;
        this.onError = null;
        this.onEnded = null;
        this.onLifecycle = null;
        this.lastFrameSize = undefined;
    }
    currentTrack() { return this.stream?.getVideoTracks()[0]; }
    getDeviceDiagnostics() {
        return this.diagnostics ?? diagnosticsForTrack(this.constraintPolicy(), this.currentTrack());
    }
    constraintPolicy() {
        return {
            ...(this.options.deviceId ? { deviceId: this.options.deviceId } : {}),
            facingMode: this.options.facingMode ?? "environment",
            ...(this.options.preferredWidth ? { preferredWidth: this.options.preferredWidth } : {}),
            ...(this.options.preferredHeight ? { preferredHeight: this.options.preferredHeight } : {}),
            ...(this.options.preferredFrameRate ? { preferredFrameRate: this.options.preferredFrameRate } : {}),
            exactDevice: this.options.exactDevice ?? true,
            maximumAttempts: this.options.maximumConstraintAttempts ?? 3,
        };
    }
    schedule() {
        if (this.stopped || this.paused || this.callbackId !== null || this.timer)
            return;
        const video = this.options.video;
        if (video.requestVideoFrameCallback) {
            this.callbackId = video.requestVideoFrameCallback(() => { this.callbackId = null; this.capture(); this.schedule(); });
        }
        else
            this.timer = setTimeout(() => { this.timer = null; this.capture(); this.schedule(); }, Math.max(16, this.options.fallbackCadenceMs ?? 33));
    }
    capture() {
        if (this.stopped || this.paused)
            return;
        const video = this.options.video;
        const canvas = this.canvas;
        if (!canvas || video.videoWidth < 1 || video.videoHeight < 1)
            return;
        try {
            if (this.lastFrameSize && (this.lastFrameSize.width !== video.videoWidth || this.lastFrameSize.height !== video.videoHeight)) {
                this.onLifecycle?.({ reason: "resolution-change", timestamp: Date.now(), detail: `${this.lastFrameSize.width}x${this.lastFrameSize.height}->${video.videoWidth}x${video.videoHeight}` });
            }
            this.lastFrameSize = { width: video.videoWidth, height: video.videoHeight };
            const maxSide = Math.max(320, Math.min(2_048, this.options.sampleMaxSide ?? 960));
            const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
            canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
            canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context)
                throw new Error("Canvas 2D frame adapter is unavailable.");
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            const settings = this.currentTrack()?.getSettings();
            const now = Date.now();
            const frame = createRgbaFrame(image.data, image.width, image.height, {
                id: `camera-frame-${++this.sequence}-${now}`, timestampMs: now, sourceType: "camera", ownership: "owned", orientation: 0,
                device: { deviceId: settings?.deviceId, facingMode: settings?.facingMode },
            });
            void this.onFrame?.(frame);
        }
        catch (error) {
            this.onError?.(error);
        }
    }
}
//# sourceMappingURL=frame-source.js.map