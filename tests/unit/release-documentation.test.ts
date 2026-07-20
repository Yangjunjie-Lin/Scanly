import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const canonicalManifest = path.join(process.cwd(), "benchmark-results", "canonical", "canonical-evidence-manifest.json");

describe("Alpha.4 release documentation policy", () => {
  it("keeps the README evidence claim synchronized with canonical installation", () => {
    const readme = read("README.md");
    expect(readme).toContain("Reproducible canonical benchmark, immutable baseline, regression-gate");
    expect(readme).not.toContain("- Canonical benchmark reports");
    if (fs.existsSync(canonicalManifest)) {
      expect(readme).toContain("Alpha.5 canonical evidence");
      expect(readme).not.toContain("canonical regeneration pending");
    } else {
      expect(readme).toContain("canonical regeneration pending");
    }
  });

  it("generates an active evidence summary without pending wording", () => {
    const updater = read("scripts/update-canonical-evidence.ts");
    expect(updater).toContain("Alpha.4 canonical evidence");
    expect(updater).toContain("Canonical CSV");
    expect(updater).not.toContain("regeneration pending");
    if (fs.existsSync(canonicalManifest)) {
      const readme = read("README.md");
      expect(readme).toContain("Alpha.5 canonical evidence");
      expect(readme).not.toContain("canonical regeneration pending");
    }
  });

  it("documents JSON and CSV as one hashed canonical policy", () => {
    const lifecycle = read("docs/benchmarking/evidence-lifecycle.md");
    expect(lifecycle).toContain("Canonical CSV policy");
    expect(lifecycle).toContain("manifest hashes all seven files");
    expect(lifecycle).toContain("normalizing text line endings to LF");
    expect(lifecycle).toContain("release verification rejects any stale JSON or CSV alias");
  });
});
