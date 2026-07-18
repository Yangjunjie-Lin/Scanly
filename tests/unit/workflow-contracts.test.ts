import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), ".github", "workflows", file), "utf8");

describe("benchmark workflow contracts", () => {
  it("keeps stable full-benchmark checks and requires artifact assembly", () => {
    const workflow = read("benchmark.yml");
    expect(workflow).toContain("name: Full Benchmark");
    for (const name of ["Prepare", "Comparison", "Assemble"]) {
      expect(workflow).toContain(`name: ${name}`);
    }
    expect(workflow).toContain("name: ${{ matrix.label }}");
    for (const name of ["Fast", "Balanced", "Robust"]) expect(workflow).toContain(`label: ${name}`);
    expect(workflow).not.toContain("--allow-dirty-development");
    expect(workflow).toContain("--warmup-iterations=1 --measured-iterations=3");
    expect(workflow).toContain("benchmark:assemble-canonical");
    for (const argument of ["--fast-csv=", "--balanced-csv=", "--robust-csv="]) expect(workflow).toContain(argument);
    expect(workflow).toContain("needs: [profile, comparison]");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("- main");
    expect(workflow).not.toContain("    paths:");
    expect(workflow).toContain("npx tsx scripts/select-benchmark-gate-mode.ts --runtime-family=node24-win32-x64 --registry=benchmark-results/baselines/registry.json");
    expect(workflow).toContain("--github-output=\"$env:GITHUB_OUTPUT\"");
    expect(workflow).toContain("--gate-mode=${{ needs.prepare.outputs.gate-mode }}");
    expect(workflow).toContain("Full Benchmark gate mode: $env:SELECTED_MODE");
    expect(workflow).toContain("Active baseline: $env:SELECTED_BASELINE_ID");
    expect(workflow).toContain("Selection reason: $env:SELECTION_REASON");
    expect(workflow).not.toContain("$alpha3");
    expect(workflow).not.toContain("v2-alpha3-r*");
    const selector = fs.readFileSync(path.join(process.cwd(), "scripts", "select-benchmark-gate-mode.ts"), "utf8");
    expect(selector).toContain('"active-baseline"');
    expect(selector).toContain('"baseline-candidate"');
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
    expect(profile).toContain("Verify clean profile checkout");
    for (const argument of ["--fast-csv=", "--balanced-csv=", "--robust-csv="]) expect(workflow).toContain(argument);
  });

  it("enforces release evidence when a manifest exists without automatic bootstrap fallback", () => {
    const workflow = read("ci.yml");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("if [[ -f benchmark-results/canonical/canonical-evidence-manifest.json ]]");
    expect(workflow).toContain("npm run quality:evidence:release");
    expect(workflow).not.toContain("npm run quality:evidence:bootstrap");
    expect(workflow).not.toMatch(/quality:evidence:release\s*\|\|/);
  });

  it("assembles all three browser reports", () => {
    const workflow = read("browser-benchmark.yml");
    for (const browser of ["Chromium", "Firefox", "WebKit"]) expect(workflow).toContain(browser);
    expect(workflow).toContain("assemble-browser-benchmarks.ts");
    expect(workflow).toContain("needs: browser-benchmark");
  });

  it("requires browser and worker integration to observe the standard ZXing-C++ WASM engine", () => {
    const benchmark = fs.readFileSync(path.join(process.cwd(), "tests", "browser-benchmark", "benchmark.spec.ts"), "utf8");
    const integration = fs.readFileSync(path.join(process.cwd(), "tests", "e2e", "upload.spec.ts"), "utf8");
    for (const source of [benchmark, integration]) {
      expect(source).toContain("zxing-cpp-wasm");
      expect(source).toContain("standard");
      expect(source).toContain("worker");
    }
  });
});
