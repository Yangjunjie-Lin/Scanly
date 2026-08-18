import type { DecodedCode } from "./types.js";
import { iou } from "./region-detection.js";

export type ResultDeduplicationPolicy = "payload" | "payload-format" | "payload-format-spatial" | "tracked-instance";

function bounds(result: DecodedCode) {
  if (!result.cornerPoints?.length) return null;
  const xs = result.cornerPoints.map((point) => point.x);
  const ys = result.cornerPoints.map((point) => point.y);
  const x = Math.min(...xs); const y = Math.min(...ys);
  return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
}

function samePhysicalInstance(left: DecodedCode, right: DecodedCode): boolean {
  const a = bounds(left); const b = bounds(right);
  if (!a || !b) return true;
  const overlap = iou(a, b);
  if (overlap >= 0.55) return true;
  const ax = a.x + a.width / 2; const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2; const by = b.y + b.height / 2;
  const areaRatio = Math.min(a.width * a.height, b.width * b.height) / Math.max(a.width * a.height, b.width * b.height);
  const distance = Math.hypot(ax - bx, ay - by);
  return overlap >= 0.25 && areaRatio >= 0.5 && distance <= Math.min(Math.hypot(a.width, a.height), Math.hypot(b.width, b.height)) * 0.35;
}

/** Deduplicate semantic results while preserving geometry-proven physical instances. */
export function dedupeResults(results: DecodedCode[], policy: ResultDeduplicationPolicy = "payload-format-spatial"): DecodedCode[] {
  if (policy === "tracked-instance") throw new Error("tracked-instance requires a temporal tracking operator.");
  const out: DecodedCode[] = [];
  for (const r of results) {
    const duplicate = out.some((prior) => {
      if (prior.payload !== r.payload) return false;
      if (policy !== "payload" && (prior.format ?? "qr_code") !== (r.format ?? "qr_code")) return false;
      return policy === "payload-format-spatial" ? samePhysicalInstance(prior, r) : true;
    });
    if (duplicate) continue;
    out.push(r);
  }
  return out.sort((a, b) => {
    const ab = bounds(a); const bb = bounds(b);
    if (ab && bb) return (ab.y - bb.y) || (ab.x - bb.x) || (a.attemptIndex - b.attemptIndex);
    if (ab) return -1;
    if (bb) return 1;
    return a.attemptIndex - b.attemptIndex;
  });
}

/** True if string looks like http(s) URL. */
export function looksLikeUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Normalize whitespace-only payloads to empty failure candidates. */
export function normalizePayload(payload: string): string {
  return payload.replace(/\u0000/g, "").trimEnd();
}
