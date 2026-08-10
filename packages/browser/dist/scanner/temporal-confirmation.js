function qualityConfidence(quality) {
    return Math.max(0, Math.min(1, quality.blurScore * 0.3 + quality.contrast * 0.25 + quality.edgeDensity * 0.2
        + (1 - Math.abs(quality.brightness - 0.5) * 2) * 0.15 + (1 - quality.glareRatio) * 0.1));
}
export class TemporalCandidateStore {
    options;
    candidates = new Map();
    constructor(options = {}) {
        this.options = options;
    }
    observe(barcode, geometry, quality, now = Date.now()) {
        this.prune(now);
        const key = `${barcode.format}\u001f${barcode.text}`;
        const existing = this.candidates.get(key);
        const observations = [...(existing?.observations ?? []), now].filter((at) => now - at <= (this.options.windowMs ?? 600)).slice(-3);
        const stable = existing && this.geometryStable(existing.latestGeometry, geometry) ? existing.stableCount + 1 : 1;
        const candidate = {
            key, payload: barcode.text, format: barcode.format,
            firstSeenAt: existing?.firstSeenAt ?? now,
            lastSeenAt: now,
            observationCount: (existing?.observationCount ?? 0) + 1,
            stableCount: stable,
            ...(geometry ? { latestGeometry: geometry } : {}),
            observations,
            confirmed: existing?.confirmed ?? false,
            barcode,
        };
        const required = this.requiredObservations(barcode, quality);
        const newlyConfirmed = !candidate.confirmed && observations.length >= required && (required === 1 || stable >= 2);
        candidate.confirmed ||= newlyConfirmed;
        this.candidates.delete(key);
        this.candidates.set(key, candidate);
        while (this.candidates.size > Math.max(1, this.options.maximumCandidates ?? 32))
            this.candidates.delete(this.candidates.keys().next().value);
        return { candidate, confirmed: candidate.confirmed, newlyConfirmed };
    }
    lost(now = Date.now()) {
        const lost = [];
        const threshold = this.options.lostAfterMs ?? 1_500;
        for (const [key, candidate] of this.candidates) {
            if (now - candidate.lastSeenAt < threshold)
                continue;
            lost.push({ candidate, barcode: candidate.barcode });
            this.candidates.delete(key);
        }
        return lost;
    }
    reset() { this.candidates.clear(); }
    get size() { return this.candidates.size; }
    prune(now) { this.lost(now); }
    requiredObservations(barcode, quality) {
        const mode = this.options.mode ?? "adaptive";
        if (mode === "immediate")
            return 1;
        if (mode === "confirm-two")
            return 2;
        const trustedEngine = barcode.engineId === "zxing-cpp-wasm" || barcode.engineId === "jsqr";
        return trustedEngine && quality.usable && qualityConfidence(quality) >= (this.options.immediateQualityThreshold ?? 0.92) ? 1 : 2;
    }
    geometryStable(a, b) {
        if (!a || !b)
            return true;
        const acx = a.boundingBox.x + a.boundingBox.width / 2;
        const acy = a.boundingBox.y + a.boundingBox.height / 2;
        const bcx = b.boundingBox.x + b.boundingBox.width / 2;
        const bcy = b.boundingBox.y + b.boundingBox.height / 2;
        const scale = Math.max(1, Math.max(a.boundingBox.width, a.boundingBox.height, b.boundingBox.width, b.boundingBox.height));
        return Math.hypot(acx - bcx, acy - bcy) / scale <= 0.75;
    }
}
//# sourceMappingURL=temporal-confirmation.js.map