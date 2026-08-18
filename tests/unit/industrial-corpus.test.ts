import { describe, expect, it } from "vitest";
import { verifyIndustrialCorpus } from "../../scripts/verify-industrial-corpus.js";

describe("Beta 3 industrial corpus contract", () => {
  it("keeps generated, curated, and 100+ negative evidence separate", () => {
    const summary = verifyIndustrialCorpus();
    expect(summary).toMatchObject({ generated: 42, curated: 0, negative: 120 });
    expect(summary.formats).toHaveLength(5);
    expect(summary.difficulties).toContain("screen-artifacts");
  });
});
