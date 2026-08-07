import { createRgbaFrame } from "@scanly/core";
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
    constructor(options) {
        this.options = options;
    }
    static async listDevices() {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices)
            return [];
        return (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
    }
    async start(onFrame, onError, onEnded) {
        await this.stop();
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia)
            throw new Error("Camera capture is not supported by this browser.");
        this.onFrame = onFrame;
        this.onError = onError;
        this.onEnded = onEnded;
        this.stopped = false;
        this.paused = false;
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: this.options.deviceId ? { deviceId: { exact: this.options.deviceId } } : {
                    facingMode: { ideal: this.options.facingMode ?? "environment" },
                    ...(this.options.preferredWidth ? { width: { ideal: this.options.preferredWidth } } : {}),
                    ...(this.options.preferredHeight ? { height: { ideal: this.options.preferredHeight } } : {}),
                },
                audio: false,
            });
            if (this.stopped) {
                for (const track of this.stream.getTracks())
                    track.stop();
                return;
            }
            this.options.video.srcObject = this.stream;
            await this.options.video.play();
            this.canvas = document.createElement("canvas");
            const track = this.currentTrack();
            this.endedHandler = () => { this.onEnded?.(); void this.stop(); };
            track?.addEventListener?.("ended", this.endedHandler);
            if (this.options.stopWhenPageHidden !== false && typeof document !== "undefined") {
                this.visibilityHandler = () => { if (document.visibilityState === "hidden")
                    void this.stop(); };
                document.addEventListener("visibilitychange", this.visibilityHandler);
            }
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
        if (this.canvas) {
            this.canvas.width = 0;
            this.canvas.height = 0;
        }
        this.canvas = null;
        this.onFrame = null;
        this.onError = null;
        this.onEnded = null;
    }
    currentTrack() { return this.stream?.getVideoTracks()[0]; }
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