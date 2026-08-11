import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), ".github", "workflows", file), "utf8");

describe("benchmark workflow contracts", () => {
  it("keeps stable full-benchmark checks and requires artifact assembly", () => {
    const workflow = read("benchmark.yml");
    expect(workflow).toContain("name: Full Benchmark");
    for (const name of ["Prepare", "Comparison", "Symbologies"]) {
      expect(workflow).toContain(`name: ${name}`);
    }
    expect(workflow).toContain("name: Full Benchmark / Assemble");
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

  it("routes all primary SDK workflows to develop and Beta 2 without deleted Alpha branches", () => {
    const primary = ["ci.yml", "benchmark.yml", "browser-benchmark.yml", "public-api.yml", "tracking-benchmark.yml"];
    for (const file of primary) {
      const workflow = read(file);
      expect(workflow).toContain("workflow_dispatch:");
      expect(workflow).toContain("pull_request:");
      expect(workflow).toContain("- develop/sdk-v2");
      expect(workflow).toContain("- architecture/sdk-v2-beta3-**");
      for (const deleted of [
        "architecture/sdk-v2-alpha3-industrial-validation",
        "architecture/sdk-v2-alpha4-zxing-cpp-wasm",
        "architecture/sdk-v2-alpha5-multisymbology-foundation",
      ]) expect(workflow).not.toContain(deleted);
    }
  });

  it("checks out the exact pull-request head in every primary workflow job", () => {
    const exactHeadRef = "ref: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}";
    for (const file of ["ci.yml", "benchmark.yml", "browser-benchmark.yml", "public-api.yml", "tracking-benchmark.yml"]) {
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
    expect(workflow).toContain("name: Browser Benchmark / Assemble");
    expect(workflow).toContain("tracking-${{ matrix.browser }}.json");
    expect(assembler).toContain("2.3-beta2-browser-tracking");
    expect(assembler).toContain("trackingReports");
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

  it("runs the Beta 1 realtime unit, integration, two-layer soak, benchmark, and cross-browser simulator gates", () => {
    const ci = read("ci.yml");
    for (const job of ["Real-Time Scanner Unit", "Real-Time Scanner Integration", "Scanner Core Soak", "Scanner Worker/WASM Soak", "Real-Time Benchmark"]) expect(ci).toContain(`name: ${job}`);
    expect(ci).toContain("npm run benchmark:realtime");
    expect(ci).toContain("npm run benchmark:realtime -- --allow-missing-worker-wasm");
    expect(ci).toContain("npm run test:scanner:core-soak");
    expect(ci).toContain("npm run test:scanner:worker-wasm-soak -- --iterations=1000");
    expect(ci).toContain("npm run benchmark:realtime -- --require-worker-wasm");
    expect(ci).toContain("needs: [realtime-scanner-integration, scanner-core-soak, scanner-worker-wasm-soak]");
    expect(ci).toContain("!r.aggregateGates.pass");
    expect(ci).toContain("workerCreatedCount!==1");
    expect(ci).toContain("workerEvidence!=='not-applicable'");
    const extended = read("scanner-extended-soak.yml");
    expect(extended).toContain("schedule:");
    expect(extended).toContain("workflow_dispatch:");
    expect(extended).toContain("types: [labeled]");
    expect(extended).toContain("scanner-extended-soak");
    expect(extended).toContain("inputs.ref || 'develop/sdk-v2'");
    expect(extended).toContain("npm run test:scanner:worker-wasm-soak:extended");
    expect(extended).toContain("r.observed.iterations!==10000");
    const simulator = fs.readFileSync(path.join(process.cwd(), "tests", "browser-benchmark", "scanner-runtime.spec.ts"), "utf8");
    expect(simulator).toContain("ScannerSession simulator");
    expect(simulator).toContain("staleEvents");
    expect(simulator).toContain("finalControlledMemory");
    const browserWorkflow = read("browser-benchmark.yml");
    expect(browserWorkflow).toContain("playwright.benchmark.config.ts");
    for (const spec of ["lifecycle", "repeat", "backpressure"]) {
      const source = fs.readFileSync(
        path.join(process.cwd(), "tests", "browser-benchmark", `scanner-runtime-${spec}.spec.ts`),
        "utf8",
      );
      expect(source).toContain(`scenario).toBe("${spec}")`);
    }
  });

  it("runs Beta 2 tracking, batch, soak, and exact-head benchmark gates", () => {
    const ci = read("ci.yml");
    for (const job of ["Barcode Tracking Unit", "Barcode Tracking Integration", "Batch Scan Integration", "Tracking Soak", "Tracking Worker/WASM Soak"]) {
      expect(ci).toContain(`name: ${job}`);
    }
    expect(ci).toContain("npm run benchmark:tracking");
    expect(ci).toContain("npm run test:tracking:soak");
    expect(ci).toContain("npm run test:tracking:worker-wasm-soak");
    expect(ci).toContain("m.falseTrackCount!==0");
    expect(ci).toContain("m.falseBatchCompletionCount!==0");
    expect(ci).toContain("o.finalControlledMemory!==0");
    expect(ci).toContain("r.workerEvidence!=='actual-browser-worker'");
    expect(ci).toContain("r.sourceTree!==tree");
    expect(ci).toContain("r.schemaVersion!=='2.3-beta2-development'");
    expect(ci).toContain("r.kind!=='tracking-core-soak'");
    expect(ci).toContain("r.kind!=='tracking-worker-wasm-soak'");
    expect(ci).toContain("!r.assertions.every(a=>a.pass)");
    expect(ci).toContain("471f015df54522edafd4a6b80d15e3d8a165ffc14bb974aef41cca978472ee15");
    expect(ci).toContain("320537c5a3bd759d267ec8be36188e64ace3276a9d4c7ba7104a6bfbfea9d679");
    expect(ci).toContain("m.samePayloadScenarioCount!==6");
    expect(ci).toContain("m.batchScenarioCount!==8");
    expect(ci).toContain("git status --porcelain --untracked-files=all -- packages engines");
    expect(ci).not.toContain("git diff --exit-code -- packages engines");
    expect(ci).toContain("r.sourceCommit!==head || r.repositoryDirty");

    const tracking = read("tracking-benchmark.yml");
    expect(tracking).toContain("name: Tracking Benchmark");
    expect(tracking).toContain("Verify exact-head tracking evidence");
    expect(tracking).toContain("r.sourceCommit!==head");
    expect(tracking).toContain("r.sourceTree!==tree");
    expect(tracking).toContain("r.repositoryDirty");
    expect(tracking).toContain("c.requiredScenarioIds?.length!==34");
    expect(tracking).toContain("c.samePayloadScenarioIds?.length!==6");
    expect(tracking).toContain("r.scaleBaselines.length!==4");
  });
});
