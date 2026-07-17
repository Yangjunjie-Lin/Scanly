import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("Alpha.3 release documentation policy", () => {
  it("uses a truthful infrastructure claim before canonical evidence is installed", () => {
    const readme = read("README.md");
    expect(readme).toContain("Reproducible canonical benchmark, immutable baseline, regression-gate");
    expect(readme).not.toContain("- Canonical benchmark reports");
    expect(readme).toContain("canonical regeneration pending");
  });

  it("generates an active evidence summary without pending wording", () => {
    const updater = read("scripts/update-canonical-evidence.ts");
    expect(updater).toContain("Alpha.3 canonical evidence");
    expect(updater).toContain("Canonical CSV");
    expect(updater).not.toContain("regeneration pending");
  });

  it("documents JSON and CSV as one hashed canonical policy", () => {
    const lifecycle = read("docs/benchmarking/evidence-lifecycle.md");
    expect(lifecycle).toContain("Canonical CSV policy");
    expect(lifecycle).toContain("manifest hashes all seven files");
    expect(lifecycle).toContain("release verification rejects any stale JSON or CSV alias");
  });
});
