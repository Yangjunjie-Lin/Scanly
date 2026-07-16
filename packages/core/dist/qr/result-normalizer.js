import { iou } from "./region-detection.js";
function bounds(result) {
    if (!result.cornerPoints?.length)
        return null;
    const xs = result.cornerPoints.map((point) => point.x);
    const ys = result.cornerPoints.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
}
function samePhysicalInstance(left, right) {
    const a = bounds(left);
    const b = bounds(right);
    if (!a || !b)
        return true;
    if (iou(a, b) >= 0.3)
        return true;
    const ax = a.x + a.width / 2;
    const ay = a.y + a.height / 2;
    const bx = b.x + b.width / 2;
    const by = b.y + b.height / 2;
    const distance = Math.hypot(ax - bx, ay - by);
    return distance <= Math.min(Math.hypot(a.width, a.height), Math.hypot(b.width, b.height)) * 0.25;
}
/** Deduplicate semantic results while preserving geometry-proven physical instances. */
export function dedupeResults(results, policy = "payload-format-spatial") {
    const out = [];
    for (const r of results) {
        const duplicate = out.some((prior) => {
            if (prior.payload !== r.payload)
                return false;
            if (policy !== "payload" && (prior.format ?? "qr_code") !== (r.format ?? "qr_code"))
                return false;
            return policy === "payload-format-spatial" || policy === "tracked-instance" ? samePhysicalInstance(prior, r) : true;
        });
        if (duplicate)
            continue;
        out.push(r);
    }
    return out.sort((a, b) => {
        const ab = bounds(a);
        const bb = bounds(b);
        if (ab && bb)
            return (ab.y - bb.y) || (ab.x - bb.x) || (a.attemptIndex - b.attemptIndex);
        if (ab)
            return -1;
        if (bb)
            return 1;
        return a.attemptIndex - b.attemptIndex;
    });
}
/** True if string looks like http(s) URL. */
export function looksLikeUrl(s) {
    try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
    }
    catch {
        return false;
    }
}
/** Normalize whitespace-only payloads to empty failure candidates. */
export function normalizePayload(payload) {
    return payload.replace(/\u0000/g, "").trimEnd();
}
//# sourceMappingURL=result-normalizer.js.map