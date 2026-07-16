import type { NormalizedFrame } from "../contracts/frame.js";

/** Owns the exactly-once release boundary for a frame, including preflight failures. */
export class FrameLease {
  private released = false;
  constructor(readonly frame: NormalizedFrame) {}

  release(): void {
    if (this.released) return;
    this.released = true;
    if (this.frame?.ownership !== "borrowed") this.frame?.dispose?.();
  }

  get isReleased(): boolean { return this.released; }
}
