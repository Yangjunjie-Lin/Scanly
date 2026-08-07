import type { NormalizedFrame } from "@scanly/core";
import type { FrameQuality } from "./types.js";

export interface FrameSchedulerOptions {
  initialDecodeFps?: number;
  minimumDecodeFps?: number;
  maximumDecodeFps?: number;
  now?: () => number;
  onAdmitted?: () => void;
  onDropped?: () => void;
  onState?: (state: { active: number; pending: number; peakPending: number; effectiveDecodeFps: number }) => void;
}

export interface FrameProcessFeedback { decodeMs?: number; success?: boolean; quality?: FrameQuality }

/** One-active-decode scheduler with latest-frame replacement and adaptive sampling cadence. */
export class FrameScheduler {
  private running = false;
  private paused = false;
  private active = false;
  private pending: NormalizedFrame | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activePromise: Promise<void> | null = null;
  private idleWaiters = new Set<() => void>();
  private targetFps: number;
  private peakPending = 0;
  private completed = 0;
  private startedAt = 0;

  constructor(
    private readonly process: (frame: NormalizedFrame) => Promise<FrameProcessFeedback | void>,
    private readonly options: FrameSchedulerOptions = {},
  ) {
    this.targetFps = this.boundFps(options.initialDecodeFps ?? 10);
  }

  start(): void {
    this.running = true;
    this.paused = false;
    this.startedAt = this.options.now?.() ?? Date.now();
    this.drain();
  }

  pause(): void {
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.pending) {
      this.release(this.pending);
      this.pending = null;
      this.options.onDropped?.();
    }
    this.resolveIdle();
    this.notify();
  }
  resume(): void { if (!this.running) return; this.paused = false; this.drain(); }

  submit(frame: NormalizedFrame): "admitted" | "queued-latest" | "dropped" {
    if (!this.running || this.paused) {
      this.release(frame);
      this.options.onDropped?.();
      this.notify();
      return "dropped";
    }
    if (this.active || this.timer) {
      if (this.pending) { this.release(this.pending); this.options.onDropped?.(); }
      this.pending = frame;
      this.peakPending = Math.max(this.peakPending, 1);
      this.notify();
      return "queued-latest";
    }
    this.pending = frame;
    this.drain();
    return "admitted";
  }

  async waitForIdle(): Promise<void> {
    if (!this.active && !this.pending && !this.timer) return;
    await new Promise<void>((resolve) => this.idleWaiters.add(resolve));
  }

  async stop(): Promise<void> {
    this.running = false;
    this.paused = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.pending) this.release(this.pending);
    this.pending = null;
    await this.activePromise;
    this.resolveIdle();
    this.notify();
  }

  reset(): void {
    this.targetFps = this.boundFps(this.options.initialDecodeFps ?? 10);
    this.peakPending = 0;
    this.completed = 0;
    this.startedAt = this.options.now?.() ?? Date.now();
  }

  getStatistics(): { active: number; pending: number; peakPending: number; effectiveDecodeFps: number; targetDecodeFps: number } {
    const elapsed = Math.max(1, (this.options.now?.() ?? Date.now()) - this.startedAt);
    return { active: this.active ? 1 : 0, pending: this.pending ? 1 : 0, peakPending: this.peakPending, effectiveDecodeFps: this.completed * 1_000 / elapsed, targetDecodeFps: this.targetFps };
  }

  private drain(): void {
    if (!this.running || this.paused || this.active || this.timer || !this.pending) { this.resolveIdle(); return; }
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
      } finally {
        this.active = false;
        this.activePromise = null;
        const delay = Math.max(0, Math.round(1_000 / this.targetFps));
        if (this.running && !this.paused && this.pending && delay > 0) {
          this.timer = setTimeout(() => { this.timer = null; this.drain(); }, delay);
        } else this.drain();
        this.notify();
      }
    })();
  }

  private adapt(decodeMs: number, quality?: FrameQuality, success?: boolean): void {
    const maximum = this.options.maximumDecodeFps ?? 15;
    const minimum = this.options.minimumDecodeFps ?? 5;
    const latencyBound = decodeMs >= 180 ? minimum : decodeMs >= 85 ? Math.min(10, maximum) : maximum;
    const qualityBound = quality && !quality.usable ? minimum : success === false ? Math.min(10, maximum) : maximum;
    this.targetFps = this.boundFps(Math.min(latencyBound, qualityBound));
  }

  private boundFps(value: number): number {
    const minimum = Math.max(0.1, this.options.minimumDecodeFps ?? 5);
    const maximum = Math.max(minimum, this.options.maximumDecodeFps ?? 15);
    return Math.max(minimum, Math.min(maximum, value));
  }

  private release(frame: NormalizedFrame): void { if (frame.ownership !== "borrowed") frame.dispose?.(); }
  private resolveIdle(): void {
    if (this.active || this.pending || this.timer) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }
  private notify(): void {
    const stats = this.getStatistics();
    this.options.onState?.({ active: stats.active, pending: stats.pending, peakPending: stats.peakPending, effectiveDecodeFps: stats.effectiveDecodeFps });
  }
}
