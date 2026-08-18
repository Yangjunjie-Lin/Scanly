/** Owns the exactly-once release boundary for a frame, including preflight failures. */
export class FrameLease {
    frame;
    released = false;
    constructor(frame) {
        this.frame = frame;
    }
    release() {
        if (this.released)
            return;
        this.released = true;
        if (this.frame?.ownership !== "borrowed")
            this.frame?.dispose?.();
    }
    get isReleased() { return this.released; }
}
//# sourceMappingURL=frame-lease.js.map