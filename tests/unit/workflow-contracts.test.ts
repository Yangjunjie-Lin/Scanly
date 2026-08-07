import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), ".github", "workflows", file), "utf8");

describe("benchmark workflow contracts", () => {
  it("keeps stable full-benchmark checks and requires artifact assembly", () => {
    const workflow = read("benchmark.yml");
    expect(workflow).toContain("name: Full Benchmark");
    for (const name of ["Prepare", "Comparison", "Assemble", "Symbologies"]) {
      expect(workflow).toContain(`name: ${name}`);
    }
    expect(workflow).toContain("name: ${{ matrix.label }}");
    for (const name of ["Fast", "Balanced", "Robust"]) expect(workflow).toContain(`label: ${name}`);
    expect(workflow).not.toContain("--allow-dirty-development");
    expect(workflow).toContain("--warmup-iterations=1 --measured-iterations=3");
    expect(workflow).toContain("benchmark:assemble-canonical");
    for (const argument of ["--fast-csv=", "--balanced-csv=", "--robust-csv="]) expect(workflow).toContain(argument);
    expect(workflow).toContain("--gate");
    expect(workflow).toContain("--canonical-candidate");
    expect(workflow).toContain("--symbologies=");
    expect(workflow).toContain("needs: [prepare, symbologies, profile, comparison]");
    expect(workflow).toContain("path: benchmark-artifacts/${{ needs.prepare.outputs.workflow-mode }}");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("- develop/sdk-v2");
    expect(workflow).not.toContain("    paths:");
    expect(workflow).toContain("npx tsx scripts/select-benchmark-gate-mode.ts --runtime-family=node24-win32-x64 --registry=benchmark-results/baselines/registry.json");
    expect(workflow).toContain("--github-output=\"$env:GITHUB_OUTPUT\"");
    expect(workflow).toContain("--gate-mode=${{ needs.prepare.outputs.gate-mode }}");
    expect(workflow).toContain("--gate-mode=${{ needs.prepare.outputs.workflow-mode }}");
    expect(workflow).toContain("Full Benchmark gate mode: $env:SELECTED_MODE");
    expect(workflow).toContain("Active baseline: $env:SELECTED_BASELINE_ID");
    expect(workflow).toContain("Selection reason: $env:SELECTION_REASON");
    expect(workflow).toContain("Evidence lifecycle: $env:EVIDENCE_LIFECYCLE");
    expect(workflow).not.toContain("$alpha3");
    expect(workflow).not.toContain("v2-alpha3-r*");
    for (const script of ["verify-benchmark-evidence.ts", "freeze-baseline.ts", "activate-baseline.ts"]) {
      const source = fs.readFileSync(path.join(process.cwd(), "scripts", script), "utf8");
      expect(source).not.toContain("v2-alpha(?:3|4)");
      expect(source).not.toContain("v2-alpha4-r");
    }
    for (const script of ["freeze-baseline.ts", "activate-baseline.ts"]) {
      expect(fs.readFileSync(path.join(process.cwd(), "scripts", script), "utf8")).toContain("isValidBaselineId");
    }
    const selector = fs.readFileSync(path.join(process.cwd(), "scripts", "select-benchmark-gate-mode.ts"), "utf8");
    expect(selector).toContain('"active-baseline"');
    expect(selector).toContain('"baseline-candidate"');
    expect(workflow.match(/ref: \$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/g)?.length).toBe(5);
  });

  it("routes all primary SDK workflows to develop and Beta 1 without deleted Alpha branches", () => {
    const primary = ["ci.yml", "benchmark.yml", "browser-benchmark.yml", "public-api.yml"];
    for (const file of primary) {
      const workflow = read(file);
      expect(workflow).toContain("workflow_dispatch:");
      expect(workflow).toContain("pull_request:");
      expect(workflow).toContain("- develop/sdk-v2");
      expect(workflow).toContain("- architecture/sdk-v2-beta1-**");
      for (const deleted of [
        "architecture/sdk-v2-alpha3-industrial-validation",
        "architecture/sdk-v2-alpha4-zxing-cpp-wasm",
        "architecture/sdk-v2-alpha5-multisymbology-foundation",
      ]) expect(workflow).not.toContain(deleted);
    }
  });

  it("checks out the exact pull-request head in every primary workflow job", () => {
    const exactHeadRef = "ref: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}";
    for (const file of ["ci.yml", "benchmark.yml", "browser-benchmark.yml", "public-api.yml"]) {
      const workflow = read(file);
      const checkoutCount = workflow.match(/uses: actions\/checkout@v4/g)?.length ?? 0;
      const exactHeadCount = workflow.split(exactHeadRef).length - 1;
      expect(checkoutCount).toBeGreaterThan(0);
      expect(exactHeadCount).toBe(checkoutCount);
    }
  });

  it("keeps ordinary development in integration mode and manual release explicit", () => {
    const ci = read("ci.yml");
    const full = read("benchmark.yml");
    expect(ci).toContain("--gate-mode=integration");
    expect(ci).not.toContain("--gate-mode=release");
    expect(full).toContain("gate_mode:");
    expect(full).toContain("default: integration");
    expect(full).toContain("options: [integration, release]");
    expect(full).toContain("MANUAL_GATE_MODE: ${{ inputs.gate_mode }}");
    expect(full).toContain("--manual-gate-mode=$env:MANUAL_GATE_MODE");
  });

  it("provides an isolated manual bootstrap with every schema 2.1 artifact", () => {
    const workflow = read("alpha3-baseline-candidate.yml");
    expect(workflow).toContain("name: Baseline Candidate");
    expect(workflow).toContain("workflow_dispatch");
    for (const job of ["fast:", "balanced:", "robust:", "comparison:", "symbologies:", "assemble:"]) expect(workflow).toContain(job);
    expect(workflow).toContain("needs: [fast, balanced, robust, comparison, symbologies]");
    expect(workflow).not.toContain("--allow-dirty-development");
    expect(workflow).toContain("retention-days: 21");
    expect(workflow).toContain("benchmark:summary");
    expect(workflow).toContain("quality:evidence:bootstrap");
    expect(workflow).toContain("--symbologies=candidate/symbologies.json");
    expect(workflow).not.toMatch(/permissions:[\s\S]*contents:\s*write/);
    const profile = read("baseline-candidate-profile.yml");
    expect(profile).toContain("actions/checkout@v4");
    expect(profile).toContain("ref: ${{ github.sha }}");
    expect(profile).toContain("--gate-mode=baseline-candidate");
    expect(profile).toContain("Verify clean profile checkout");
    for (const argument of ["--fast-csv=", "--balanced-csv=", "--robust-csv="]) expect(workflow).toContain(argument);
  });

  it("selects an explicit evidence lifecycle instead of treating historical evidence as release evidence", () => {
    const workflow = read("ci.yml");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("npm run quality:evidence");
    expect(workflow).not.toContain("quality:evidence:release");
    expect(workflow).not.toContain("strict release evidence will become mandatory");
    expect(workflow).toContain("npm run benchmark:symbologies -- --gate");
    expect(workflow).toContain("Browser Multi-Symbology Integration");
    expect(workflow).toContain("browser: Chromium");
    expect(workflow).toContain("browser: Firefox");
    expect(workflow).toContain("browser: WebKit");
  });

  it("uses setup-node v7 across v2 workflows", () => {
    for (const file of ["ci.yml", "benchmark.yml", "browser-benchmark.yml", "public-api.yml", "baseline-candidate-profile.yml", "alpha3-baseline-candidate.yml"]) {
      const workflow = read(file);
      expect(workflow).not.toContain("actions/setup-node@v4");
      expect(workflow).toContain("actions/setup-node@v7");
    }
  });

  it("assembles all three browser reports", () => {
    const workflow = read("browser-benchmark.yml");
    const assembler = fs.readFileSync(path.join(process.cwd(), "scripts", "assemble-browser-benchmarks.ts"), "utf8");
    for (const browser of ["Chromium", "Firefox", "WebKit"]) expect(workflow).toContain(browser);
    expect(workflow).toContain("assemble-browser-benchmarks.ts");
    expect(workflow).toContain("needs: browser-benchmark");
    expect(assembler).toContain('report.benchmarkKind === "full"');
    expect(assembler).toContain('failedFixtures[0] === "14-damaged"');
    expect(assembler).toContain("failedFixtures.length === 1");
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
