export class RepeatSuppressor {
    policy;
    records = [];
    sequence = 0;
    oncePayloads = new Set();
    constructor(policy = { mode: "cooldown", cooldownMs: 1_500 }) {
        this.policy = policy;
    }
    evaluate(barcode, geometry, now = Date.now()) {
        const key = `${barcode.format}\u001f${barcode.text}`;
        this.prune(now);
        if (this.policy.mode === "allow")
            return { emit: true, physicalInstanceId: this.create(key, geometry, now).id };
        if (this.policy.mode === "once-per-session") {
            if (this.oncePayloads.has(key))
                return { emit: false, physicalInstanceId: `payload:${key}`, reason: "once-per-session" };
            this.oncePayloads.add(key);
            return { emit: true, physicalInstanceId: `payload:${key}` };
        }
        let record = this.closest(key, geometry);
        const disappearance = Math.max(1, this.policy.disappearanceMs ?? 1_000);
        if (!record || now - record.lastSeenAt >= disappearance)
            record = this.create(key, geometry, now);
        else {
            record.geometry = geometry ?? record.geometry;
            record.lastSeenAt = now;
        }
        const cooldown = Math.max(0, this.policy.cooldownMs ?? 1_500);
        if (this.policy.mode === "cooldown" || this.policy.mode === "physical-instance") {
            if (now - record.lastEmittedAt < cooldown)
                return { emit: false, physicalInstanceId: record.id, reason: this.policy.mode === "physical-instance" ? "same-physical-instance" : "cooldown" };
            record.lastEmittedAt = now;
            return { emit: true, physicalInstanceId: record.id };
        }
        return { emit: true, physicalInstanceId: record.id };
    }
    updatePolicy(policy) { this.policy = policy; this.reset(); }
    reset() { this.records = []; this.oncePayloads.clear(); }
    get size() { return this.records.length + this.oncePayloads.size; }
    create(payloadKey, geometry, now) {
        const record = { id: `physical-${++this.sequence}`, payloadKey, ...(geometry ? { geometry } : {}), firstSeenAt: now, lastSeenAt: now, lastEmittedAt: Number.NEGATIVE_INFINITY };
        this.records.push(record);
        return record;
    }
    closest(payloadKey, geometry) {
        const candidates = this.records.filter((record) => record.payloadKey === payloadKey);
        if (!geometry)
            return candidates.at(-1);
        const threshold = Math.max(0.1, this.policy.spatialSeparationRatio ?? 1.25);
        return candidates
            .map((record) => ({ record, distance: this.distance(record.geometry, geometry) }))
            .filter((entry) => entry.distance <= threshold)
            .sort((a, b) => a.distance - b.distance)[0]?.record;
    }
    distance(a, b) {
        if (!a || !b)
            return 0;
        const acx = a.boundingBox.x + a.boundingBox.width / 2;
        const acy = a.boundingBox.y + a.boundingBox.height / 2;
        const bcx = b.boundingBox.x + b.boundingBox.width / 2;
        const bcy = b.boundingBox.y + b.boundingBox.height / 2;
        return Math.hypot(acx - bcx, acy - bcy) / Math.max(1, Math.max(a.boundingBox.width, a.boundingBox.height, b.boundingBox.width, b.boundingBox.height));
    }
    prune(now) {
        const retention = Math.max(5_000, (this.policy.disappearanceMs ?? 1_000) * 4, (this.policy.cooldownMs ?? 1_500) * 2);
        this.records = this.records.filter((record) => now - record.lastSeenAt <= retention).slice(-128);
    }
}
//# sourceMappingURL=repeat-suppressor.js.map