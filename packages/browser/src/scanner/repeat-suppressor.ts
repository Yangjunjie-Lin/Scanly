import type { DecodedBarcode } from "@scanly/core";
import type { BarcodeGeometry, RepeatPolicy } from "./types.js";

interface InstanceRecord { id: string; payloadKey: string; geometry?: BarcodeGeometry; firstSeenAt: number; lastSeenAt: number; lastEmittedAt: number }
export interface RepeatDecision { emit: boolean; physicalInstanceId: string; reason?: string }

export class RepeatSuppressor {
  private records: InstanceRecord[] = [];
  private sequence = 0;
  private oncePayloads = new Set<string>();
  constructor(private policy: RepeatPolicy = { mode: "cooldown", cooldownMs: 1_500 }) {}

  evaluate(barcode: DecodedBarcode, geometry: BarcodeGeometry | undefined, now = Date.now()): RepeatDecision {
    const key = `${barcode.format}\u001f${barcode.text}`;
    this.prune(now);
    if (this.policy.mode === "allow") return { emit: true, physicalInstanceId: this.create(key, geometry, now).id };
    if (this.policy.mode === "once-per-session") {
      if (this.oncePayloads.has(key)) return { emit: false, physicalInstanceId: `payload:${key}`, reason: "once-per-session" };
      this.oncePayloads.add(key);
      return { emit: true, physicalInstanceId: `payload:${key}` };
    }

    let record = this.closest(key, geometry);
    const disappearance = Math.max(1, this.policy.disappearanceMs ?? 1_000);
    if (!record || now - record.lastSeenAt >= disappearance) record = this.create(key, geometry, now);
    else { record.geometry = geometry ?? record.geometry; record.lastSeenAt = now; }
    const cooldown = Math.max(0, this.policy.cooldownMs ?? 1_500);
    if (this.policy.mode === "cooldown" || this.policy.mode === "physical-instance") {
      if (now - record.lastEmittedAt < cooldown) return { emit: false, physicalInstanceId: record.id, reason: this.policy.mode === "physical-instance" ? "same-physical-instance" : "cooldown" };
      record.lastEmittedAt = now;
      return { emit: true, physicalInstanceId: record.id };
    }
    return { emit: true, physicalInstanceId: record.id };
  }

  updatePolicy(policy: RepeatPolicy): void { this.policy = policy; this.reset(); }
  reset(): void { this.records = []; this.oncePayloads.clear(); }
  get size(): number { return this.records.length + this.oncePayloads.size; }

  private create(payloadKey: string, geometry: BarcodeGeometry | undefined, now: number): InstanceRecord {
    const record = { id: `physical-${++this.sequence}`, payloadKey, ...(geometry ? { geometry } : {}), firstSeenAt: now, lastSeenAt: now, lastEmittedAt: Number.NEGATIVE_INFINITY };
    this.records.push(record);
    return record;
  }
  private closest(payloadKey: string, geometry?: BarcodeGeometry): InstanceRecord | undefined {
    const candidates = this.records.filter((record) => record.payloadKey === payloadKey);
    if (!geometry) return candidates.at(-1);
    const threshold = Math.max(0.1, this.policy.spatialSeparationRatio ?? 1.25);
    return candidates
      .map((record) => ({ record, distance: this.distance(record.geometry, geometry) }))
      .filter((entry) => entry.distance <= threshold)
      .sort((a, b) => a.distance - b.distance)[0]?.record;
  }
  private distance(a?: BarcodeGeometry, b?: BarcodeGeometry): number {
    if (!a || !b) return 0;
    const acx = a.boundingBox.x + a.boundingBox.width / 2; const acy = a.boundingBox.y + a.boundingBox.height / 2;
    const bcx = b.boundingBox.x + b.boundingBox.width / 2; const bcy = b.boundingBox.y + b.boundingBox.height / 2;
    return Math.hypot(acx - bcx, acy - bcy) / Math.max(1, Math.max(a.boundingBox.width, a.boundingBox.height, b.boundingBox.width, b.boundingBox.height));
  }
  private prune(now: number): void {
    const retention = Math.max(5_000, (this.policy.disappearanceMs ?? 1_000) * 4, (this.policy.cooldownMs ?? 1_500) * 2);
    this.records = this.records.filter((record) => now - record.lastSeenAt <= retention).slice(-128);
  }
}
