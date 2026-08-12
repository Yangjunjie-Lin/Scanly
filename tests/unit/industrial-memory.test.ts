import { describe, expect, it } from "vitest";
import { RecoveryMemoryAccountant } from "@scanly/core";

describe("RecoveryMemoryAccountant", () => {
  it("accounts route buffers and returns to zero", () => {
    const memory = new RecoveryMemoryAccountant(1_024);
    const grayscale = memory.reserve(256, "grayscale");
    const rectified = memory.reserve(512, "rectified");
    expect(memory.observation.currentBytes).toBe(768);
    expect(memory.observation.peakBuffers).toBe(2);
    grayscale.release(); rectified.release();
    expect(memory.observation.currentBytes).toBe(0);
    expect(memory.observation.activeBuffers).toBe(0);
  });

  it("fails closed when the bounded allocation would overflow", () => {
    const memory = new RecoveryMemoryAccountant(100);
    expect(() => memory.reserve(101, "candidate")).toThrow(/budget exceeded/);
    expect(memory.observation.currentBytes).toBe(0);
  });
});
