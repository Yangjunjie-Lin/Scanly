import type { DecodedCode } from "./types.js";

/** Deduplicate decoded results by payload (first occurrence wins). */
export function dedupeResults(results: DecodedCode[]): DecodedCode[] {
  const seen = new Set<string>();
  const out: DecodedCode[] = [];
  for (const r of results) {
    const key = r.payload;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
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
