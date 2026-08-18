/** Deterministic Fast-first escalation; Robust is always separated by a cooldown. */
export class BoundedDecodeEscalation {
    options;
    misses = 0;
    frame = 0;
    lastRobustFrame = Number.NEGATIVE_INFINITY;
    lastSuccessAt = 0;
    constructor(options = {}) {
        this.options = options;
    }
    select(quality, hasStableRoi, now = Date.now()) {
        this.frame += 1;
        const balancedEvery = Math.max(2, this.options.balancedEveryMisses ?? 4);
        const robustAfter = Math.max(balancedEvery + 1, this.options.robustAfterMisses ?? 8);
        const cooldown = Math.max(2, this.options.robustCooldownFrames ?? 12);
        // A stable ROI is preferred, but a bounded full-frame Robust probe is still
        // necessary when the first code has not been found yet. This avoids a
        // policy deadlock where Robust could never run because ROI only appears
        // after a successful decode.
        const robustEligible = quality.usable && (hasStableRoi || this.misses >= robustAfter + balancedEvery) && this.misses >= robustAfter && this.frame - this.lastRobustFrame >= cooldown && now - this.lastSuccessAt > 500;
        if (robustEligible) {
            this.lastRobustFrame = this.frame;
            return "robust";
        }
        if (quality.usable && this.misses > 0 && this.misses % balancedEvery === 0)
            return "balanced";
        return "fast";
    }
    observe(success, now = Date.now()) {
        if (success) {
            this.misses = 0;
            this.lastSuccessAt = now;
        }
        else
            this.misses = Math.min(10_000, this.misses + 1);
    }
    reset() { this.misses = 0; this.frame = 0; this.lastRobustFrame = Number.NEGATIVE_INFINITY; this.lastSuccessAt = 0; }
    get consecutiveMisses() { return this.misses; }
}
//# sourceMappingURL=decode-escalation.js.map