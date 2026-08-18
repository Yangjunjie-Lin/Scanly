import { describe, expect, it } from "vitest";
import { ExecutionBudget } from "../../packages/core/src/runtime/execution-budget.js";

describe("global execution attempt budget", () => {
  it("atomically caps concurrent branch consumption at the global maximum", async () => {
    const budget = new ExecutionBudget({ deadlineMs: Number.POSITIVE_INFINITY, totalAttempts: 17 });
    const consumed = await Promise.all(Array.from({ length: 4 }, async () => {
      let count = 0;
      while (budget.tryConsumeAttempt()) { count += 1; await Promise.resolve(); }
      return count;
    }));
    expect(consumed.reduce((sum, count) => sum + count, 0)).toBe(17);
    expect(budget.remainingAttempts()).toBe(0);
  });
});
