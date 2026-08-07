/** One-active-decode scheduler with latest-frame replacement and adaptive sampling cadence. */
export class FrameScheduler {
    process;
    options;
    running = false;
    paused = false;
    active = false;
    pending = null;
    timer = null;
    activePromise = null;
    idleWaiters = new Set();
    targetFps;
    peakPending = 0;
    completed = 0;
    startedAt = 0;
    constructor(process, options = {}) {
        this.process = process;
        this.options = options;
        this.targetFps = this.boundFps(options.initialDecodeFps ?? 10);
    }
    start() {
        this.running = true;
        this.paused = false;
        this.startedAt = this.options.now?.() ?? Date.now();
        this.drain();
    }
    pause() {
        this.paused = true;
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
        if (this.pending) {
            this.release(this.pending);
            this.pending = null;
            this.options.onDropped?.();
        }
        this.resolveIdle();
        this.notify();
    }
    resume() { if (!this.running)
        return; this.paused = false; this.drain(); }
    submit(frame) {
        if (!this.running || this.paused) {
            this.release(frame);
            this.options.onDropped?.();
            this.notify();
            return "dropped";
        }
        if (this.active || this.timer) {
            if (this.pending) {
                this.release(this.pending);
                this.options.onDropped?.();
            }
            this.pending = frame;
            this.peakPending = Math.max(this.peakPending, 1);
            this.notify();
            return "queued-latest";
        }
        this.pending = frame;
        this.drain();
        return "admitted";
    }
    async waitForIdle() {
        if (!this.active && !this.pending && !this.timer)
            return;
        await new Promise((resolve) => this.idleWaiters.add(resolve));
    }
    async stop() {
        this.running = false;
        this.paused = false;
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
        if (this.pending)
            this.release(this.pending);
        this.pending = null;
        await this.activePromise;
        this.resolveIdle();
        this.notify();
    }
    reset() {
        this.targetFps = this.boundFps(this.options.initialDecodeFps ?? 10);
        this.peakPending = 0;
        this.completed = 0;
        this.startedAt = this.options.now?.() ?? Date.now();
    }
    getStatistics() {
        const elapsed = Math.max(1, (this.options.now?.() ?? Date.now()) - this.startedAt);
        return { active: this.active ? 1 : 0, pending: this.pending ? 1 : 0, peakPending: this.peakPending, effectiveDecodeFps: this.completed * 1_000 / elapsed, targetDecodeFps: this.targetFps };
    }
    drain() {
        if (!this.running || this.paused || this.active || this.timer || !this.pending) {
            this.resolveIdle();
            return;
        }
        const frame = this.pending;
        this.pending = null;
        this.active = true;
        this.options.onAdmitted?.();
        const started = this.options.now?.() ?? Date.now();
        this.notify();
        this.activePromise = (async () => {
            try {
                const feedback = await this.process(frame);
                this.completed += 1;
                const elapsed = feedback?.decodeMs ?? Math.max(0, (this.options.now?.() ?? Date.now()) - started);
                this.adapt(elapsed, feedback?.quality, feedback?.success);
            }
            finally {
                this.active = false;
                this.activePromise = null;
                const delay = Math.max(0, Math.round(1_000 / this.targetFps));
                if (this.running && !this.paused && this.pending && delay > 0) {
                    this.timer = setTimeout(() => { this.timer = null; this.drain(); }, delay);
                }
                else
                    this.drain();
                this.notify();
            }
        })();
    }
    adapt(decodeMs, quality, success) {
        const maximum = this.options.maximumDecodeFps ?? 15;
        const minimum = this.options.minimumDecodeFps ?? 5;
        const latencyBound = decodeMs >= 180 ? minimum : decodeMs >= 85 ? Math.min(10, maximum) : maximum;
        const qualityBound = quality && !quality.usable ? minimum : success === false ? Math.min(10, maximum) : maximum;
        this.targetFps = this.boundFps(Math.min(latencyBound, qualityBound));
    }
    boundFps(value) {
        const minimum = Math.max(0.1, this.options.minimumDecodeFps ?? 5);
        const maximum = Math.max(minimum, this.options.maximumDecodeFps ?? 15);
        return Math.max(minimum, Math.min(maximum, value));
    }
    release(frame) { if (frame.ownership !== "borrowed")
        frame.dispose?.(); }
    resolveIdle() {
        if (this.active || this.pending || this.timer)
            return;
        for (const resolve of this.idleWaiters)
            resolve();
        this.idleWaiters.clear();
    }
    notify() {
        const stats = this.getStatistics();
        this.options.onState?.({ active: stats.active, pending: stats.pending, peakPending: stats.peakPending, effectiveDecodeFps: stats.effectiveDecodeFps });
    }
}
//# sourceMappingURL=frame-scheduler.js.map