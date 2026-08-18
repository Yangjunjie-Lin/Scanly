import { describe, expect, it } from "vitest";
import { RepeatSuppressor } from "../../packages/browser/src/scanner/repeat-suppressor";
describe("RepeatSuppressor contract", () => it("allows explicit allow mode", () => { const s = new RepeatSuppressor({ mode: "allow" }); const b = { text: "x", format: "qr_code" as const, formatClass: "matrix" as const, engineId: "jsqr" }; expect(s.evaluate(b, undefined, 0).emit).toBe(true); expect(s.evaluate(b, undefined, 1).emit).toBe(true); }));
