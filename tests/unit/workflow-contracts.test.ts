import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), ".github", "workflows", file), "utf8");

describe("benchmark workflow contracts", () => {
  it("keeps stable full-benchmark checks and requires artifact assembly", () => {
    const workflow = read("benchmark.yml");
    for (const name of ["Prepare", "Fast", "Balanced", "Robust", "Comparison", "Assemble"]) expect(workflow).toContain(name);
    expect(workflow).not.toContain("--allow-dirty-development");
    expect(workflow).toContain("--warmup-iterations=1 --measured-iterations=3");
    expect(workflow).toContain("benchmark:assemble-canonical");
    expect(workflow).toContain("needs: [profile, comparison]");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("- main");
    expect(workflow).not.toContain("    paths:");
    expect(workflow).toContain("baseline-candidate");
    expect(workflow).toContain("active-baseline");
    expect(workflow.match(/ref: \$\{\{ github\.sha \}\}/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("provides an isolated manual Alpha.3 bootstrap with all four artifacts", () => {
    const workflow = read("alpha3-baseline-candidate.yml");
    expect(workflow).toContain("name: Alpha.3 Baseline Candidate");
    expect(workflow).toContain("workflow_dispatch");
    for (const job of ["fast:", "balanced:", "robust:", "comparison:", "assemble:"]) expect(workflow).toContain(job);
    expect(workflow).toContain("needs: [fast, balanced, robust, comparison]");
    expect(workflow).not.toContain("--allow-dirty-development");
    expect(workflow).toContain("retention-days: 21");
    expect(workflow).toContain("benchmark:summary");
    expect(workflow).toContain("quality:evidence:bootstrap");
    expect(workflow).not.toMatch(/permissions:[\s\S]*contents:\s*write/);
    const profile = read("baseline-candidate-profile.yml");
    expect(profile).toContain("actions/checkout@v4");
    expect(profile).toContain("ref: ${{ github.sha }}");
    expect(profile).toContain("--gate-mode=baseline-candidate");
  });

  it("assembles all three browser reports", () => {
    const workflow = read("browser-benchmark.yml");
    for (const browser of ["Chromium", "Firefox", "WebKit"]) expect(workflow).toContain(browser);
    expect(workflow).toContain("assemble-browser-benchmarks.ts");
    expect(workflow).toContain("needs: browser-benchmark");
  });
});
