import type { NormalizedFrame } from "../contracts/frame.js";
/** Owns the exactly-once release boundary for a frame, including preflight failures. */
export declare class FrameLease {
    readonly frame: NormalizedFrame;
    private released;
    constructor(frame: NormalizedFrame);
    release(): void;
    get isReleased(): boolean;
}
//# sourceMappingURL=frame-lease.d.ts.map