import { type NormalizedFrame } from "@scanly/core";
import type { CameraFrameSource } from "./types.js";
export type DeterministicFrameFactory = () => Iterable<NormalizedFrame> | AsyncIterable<NormalizedFrame>;
export interface DeterministicFrameSequenceSourceOptions {
    respectBackpressure?: boolean;
}
/** CI camera simulator source. It awaits consumer backpressure and never touches mediaDevices. */
export declare class DeterministicFrameSequenceSource implements CameraFrameSource {
    private readonly frames;
    private readonly options;
    private stopped;
    private paused;
    private pauseWaiters;
    private finishedPromise;
    private finish;
    constructor(frames: DeterministicFrameFactory, options?: DeterministicFrameSequenceSourceOptions);
    start(onFrame: (frame: NormalizedFrame) => Promise<void> | void, onError: (error: unknown) => void, onEnded: () => void): Promise<void>;
    pause(): void;
    resume(): void;
    stop(): Promise<void>;
    finished(): Promise<void>;
    private pump;
}
export interface MediaStreamCameraFrameSourceOptions {
    video: HTMLVideoElement;
    deviceId?: string;
    facingMode?: "user" | "environment";
    preferredWidth?: number;
    preferredHeight?: number;
    sampleMaxSide?: number;
    fallbackCadenceMs?: number;
    stopWhenPageHidden?: boolean;
}
/** Browser media adapter only: camera acquisition and RGBA sampling, with no scanner policy state. */
export declare class MediaStreamCameraFrameSource implements CameraFrameSource {
    private readonly options;
    private stream;
    private canvas;
    private timer;
    private callbackId;
    private sequence;
    private stopped;
    private paused;
    private onFrame;
    private onError;
    private onEnded;
    private endedHandler;
    private visibilityHandler;
    constructor(options: MediaStreamCameraFrameSourceOptions);
    static listDevices(): Promise<MediaDeviceInfo[]>;
    start(onFrame: (frame: NormalizedFrame) => Promise<void> | void, onError: (error: unknown) => void, onEnded: () => void): Promise<void>;
    pause(): void;
    resume(): void;
    stop(): Promise<void>;
    currentTrack(): MediaStreamTrack | undefined;
    private schedule;
    private capture;
}
//# sourceMappingURL=frame-source.d.ts.map