import { describe, expect, it } from "vitest";
import { TemporalROI } from "../../packages/browser/src/scanner/temporal-roi";
describe("TemporalROI contract", () => it("recovers after expiration", () => { const r = new TemporalROI({ timeoutMs: 10 }); const result = { cornerPoints: [{ x: 1, y: 1 }, { x: 5, y: 5 }] } as any; r.update(result, { width: 10, height: 10, orientation: 0 }, 0); expect(r.hint({ width: 10, height: 10, orientation: 0 }, 20)).toBeUndefined(); }));
