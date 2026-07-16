import { getBuiltinScenario } from "@scanly/scenario-schema";
export class CameraEscalationController {
    options;
    misses = 0;
    escalationRemaining = 0;
    track = null;
    sequence = 0;
    constructor(options = {}) {
        this.options = options;
    }
    nextScenario(base, frame, now = Date.now()) {
        if (this.track && now - this.track.lastSeenMs > (this.options.resetTimeoutMs ?? 2_500))
            this.track = null;
        const scenario = this.escalationRemaining > 0 ? getBuiltinScenario("balanced") : JSON.parse(JSON.stringify(base ?? getBuiltinScenario("fast")));
        if (this.track?.corners.length && frame) {
            const xs = this.track.corners.map((point) => point.x);
            const ys = this.track.corners.map((point) => point.y);
            const expansion = Math.max(0, Math.min(1, this.options.roiExpansion ?? 0.35));
            const left = Math.max(0, Math.min(...xs));
            const right = Math.min(frame.width, Math.max(...xs));
            const top = Math.max(0, Math.min(...ys));
            const bottom = Math.min(frame.height, Math.max(...ys));
            const dx = (right - left) * expansion;
            const dy = (bottom - top) * expansion;
            const x = Math.max(0, left - dx) / frame.width;
            const y = Math.max(0, top - dy) / frame.height;
            const width = (Math.min(frame.width, right + dx) - Math.max(0, left - dx)) / frame.width;
            const height = (Math.min(frame.height, bottom + dy) - Math.max(0, top - dy)) / frame.height;
            scenario.input.roi = { mode: "relative", x, y, width, height };
        }
        return scenario;
    }
    observe(outcome, now = Date.now()) {
        if (outcome.ok) {
            const result = outcome.primary;
            this.misses = 0;
            this.escalationRemaining = 0;
            if (result.cornerPoints?.length) {
                if (this.track && this.track.payload === result.rawText && this.track.format === result.format) {
                    this.track = { ...this.track, corners: result.cornerPoints, lastSeenMs: now, consecutiveFrames: this.track.consecutiveFrames + 1, missedFrames: 0 };
                }
                else {
                    this.track = { id: `internal-track-${++this.sequence}`, payload: result.rawText, format: result.format, corners: result.cornerPoints, firstSeenMs: now, lastSeenMs: now, consecutiveFrames: 1, missedFrames: 0 };
                }
            }
            return;
        }
        this.misses += 1;
        if (this.track)
            this.track = { ...this.track, missedFrames: this.track.missedFrames + 1 };
        if (this.escalationRemaining > 0)
            this.escalationRemaining -= 1;
        if (this.misses >= Math.max(1, this.options.fastMissThreshold ?? 4)) {
            this.escalationRemaining = Math.max(1, this.options.maximumEscalationAttempts ?? 3);
            this.misses = 0;
        }
    }
    reset() { this.misses = 0; this.escalationRemaining = 0; this.track = null; }
    get activeTrack() { return this.track; }
    get escalated() { return this.escalationRemaining > 0; }
}
//# sourceMappingURL=camera-strategy.js.map