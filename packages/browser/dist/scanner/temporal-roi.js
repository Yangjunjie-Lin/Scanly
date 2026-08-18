export class TemporalROI {
    options;
    state = null;
    constructor(options = {}) {
        this.options = options;
    }
    update(result, frame, now = Date.now()) {
        if (!result.cornerPoints?.length)
            return;
        const xs = result.cornerPoints.map((point) => point.x);
        const ys = result.cornerPoints.map((point) => point.y);
        const x = Math.max(0, Math.min(...xs));
        const y = Math.max(0, Math.min(...ys));
        const right = Math.min(frame.width, Math.max(...xs));
        const bottom = Math.min(frame.height, Math.max(...ys));
        if (right <= x || bottom <= y)
            return;
        this.state = { box: { x, y, width: right - x, height: bottom - y }, at: now, misses: 0, frameWidth: frame.width, frameHeight: frame.height, orientation: frame.orientation };
    }
    hint(frame, now = Date.now()) {
        const state = this.state;
        if (!state)
            return undefined;
        if (now - state.at > (this.options.timeoutMs ?? 2_500)
            || state.misses >= (this.options.maximumMisses ?? 4)
            || state.orientation !== frame.orientation
            || Math.abs(state.frameWidth - frame.width) / state.frameWidth > 0.1
            || Math.abs(state.frameHeight - frame.height) / state.frameHeight > 0.1) {
            this.reset();
            return undefined;
        }
        const expansion = Math.max(0, Math.min(2, (this.options.expansion ?? 0.35) * (1 + state.misses * 0.5)));
        const dx = state.box.width * expansion;
        const dy = state.box.height * expansion;
        const left = Math.max(0, state.box.x - dx);
        const top = Math.max(0, state.box.y - dy);
        const right = Math.min(frame.width, state.box.x + state.box.width + dx);
        const bottom = Math.min(frame.height, state.box.y + state.box.height + dy);
        return { x: left / frame.width, y: top / frame.height, width: (right - left) / frame.width, height: (bottom - top) / frame.height, ageMs: now - state.at, missCount: state.misses };
    }
    miss() { if (this.state) {
        this.state.misses += 1;
        if (this.state.misses >= (this.options.maximumMisses ?? 4))
            this.reset();
    } }
    reset() { this.state = null; }
    get active() { return Boolean(this.state); }
    get missCount() { return this.state?.misses ?? 0; }
}
//# sourceMappingURL=temporal-roi.js.map