import type { CandidateImage } from "./candidate-generation";

function quantize(value: number, bucket = 8): number {
  return Math.round(value / bucket) * bucket;
}

/** Lightweight geometry fingerprint (no pixel hash or full-buffer scan). */
export function candidateFingerprint(c: CandidateImage): string {
  const r = c.region;
  const regionKey = r
    ? `${quantize(r.x)},${quantize(r.y)},${quantize(r.width)},${quantize(r.height)}`
    : `full-${c.candidateIndex}`;
  // Padding/scale labels are intentionally omitted: distinct plans can collapse
  // to the same geometry after max-pixel/max-side capping.
  return `${c.candidateIndex}|${c.buffer.width}x${c.buffer.height}|${regionKey}`;
}

/** Drop near-duplicate candidates while preserving first (higher-priority) occurrence. */
export function dedupeCandidates(candidates: CandidateImage[]): CandidateImage[] {
  const seen = new Set<string>();
  const out: CandidateImage[] = [];
  for (const c of candidates) {
    const fp = candidateFingerprint(c);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(c);
  }
  return out;
}
