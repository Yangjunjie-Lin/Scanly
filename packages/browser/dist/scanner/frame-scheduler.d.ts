import type { NormalizedFrame } from "@scanly/core";
import type { FrameQuality } from "./types.js";
export interface FrameSchedulerOptions {
    initialDecodeFps?: number;
    minimumDecodeFps?: number;
    maximumDecodeFps?: number;
    now?: () => number;
    onAdmitted?: () => void;
    onDropped?: () => void;
    onState?: (state: {
        active: number;
        pending: number;
        peakPending: number;
        effectiveDecodeFps: number;
    }) => void;
}
export interface FrameProcessFeedback {
    decodeMs?: number;
    success?: boolean;
    quality?: FrameQuality;
}
/** One-active-decode scheduler with latest-frame replacement and adaptive sampling cadence. */
export declare class FrameScheduler {
    private readonly process;
    private readonly options;
    private running;
    private paused;
    private active;
    private pending;
    private timer;
    private activePromise;
    private idleWaiters;
    private targetFps;
    private peakPending;
    private completed;
    private startedAt;
    constructor(process: (frame: NormalizedFrame) => Promise<FrameProcessFeedback | void>, options?: FrameSchedulerOptions);
    start(): void;
    pause(): void;
    resume(): void;
    submit(frame: NormalizedFrame): "admitted" | "queued-latest" | "dropped";
    waitForIdle(): Promise<void>;
    stop(): Promise<void>;
    reset(): void;
    getStatistics(): {
        active: number;
        pending: number;
        peakPending: number;
        effectiveDecodeFps: number;
        targetDecodeFps: number;
    };
    private drain;
    private adapt;
    private boundFps;
    private release;
    private resolveIdle;
    private notify;
}
//# sourceMappingURL=frame-scheduler.d.ts.map