import { describe, expect, it } from "vitest";
import { FrameScheduler } from "../../packages/browser/src/scanner/frame-scheduler";
import { createRgbaFrame } from "@scanly/core";
const f = (id: string) => createRgbaFrame(new Uint8ClampedArray(4 * 4 * 4), 4, 4, { id, ownership: "owned" });
describe("FrameScheduler contract", () => it("reports bounded queue state", async () => { const s = new FrameScheduler(async () => ({ decodeMs: 1 }), { initialDecodeFps: 15 }); s.start(); s.submit(f("one")); await s.waitForIdle(); expect(s.getStatistics().active).toBe(0); await s.stop(); }));
