import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const json = <T>(file: string): T => JSON.parse(read(file)) as T;

describe("Alpha.5 release documentation policy", () => {
  it("derives separate historical and integration README summaries from authoritative manifests", () => {
    const legacy = json<{ fixtures: Array<{ sourceType: string }> }>("fixtures/manifest.json");
    const alpha5 = json<{ fixtures: Array<{ sourceType: string; expectedOutcome: string; expectedResultCount: number; difficultyTags: string[]; expectedGs1?: boolean }> }>("fixtures/alpha5/manifest.json");
    const photos = json<{ fixtures: unknown[] }>("fixtures/alpha5/project-photos/manifest.json");
    const canonical = json<{ evidenceId: string; sdkVersion: string; fixtureCount: number; reports: { balancedJson: string }; sourceIdentity: { sourceCommitSha: string; sourceTreeSha: string } }>("benchmark-results/canonical/canonical-evidence-manifest.json");
    const registry = json<{ activeBaselines: Record<string, Record<"fast" | "balanced" | "robust", string>> }>("benchmark-results/baselines/registry.json");
    const active = registry.activeBaselines["node24-win32-x64"];
    const baselineId = active.balanced.replace(/-balanced-node24-windows-x64\.json$/, "");
    const balanced = json<{ passed: number; total: number; positiveCases: number; results: Array<{ expectedOutcome: string; pass: boolean }>; falsePositiveCount: number; negativeCases: number }>(path.join("benchmark-results", "canonical", canonical.reports.balancedJson));

    const generatedLegacy = legacy.fixtures.filter((fixture) => fixture.sourceType === "generated").length;
    const projectPhotosLegacy = legacy.fixtures.filter((fixture) => fixture.sourceType === "project-photo").length;
    const single = alpha5.fixtures.filter((fixture) => fixture.expectedOutcome === "decode" && fixture.expectedResultCount === 1);
    const mixed = alpha5.fixtures.filter((fixture) => fixture.expectedOutcome === "decode" && fixture.expectedResultCount > 1);
    const negative = alpha5.fixtures.filter((fixture) => fixture.expectedOutcome !== "decode");
    const clean = single.filter((fixture) => fixture.difficultyTags.length === 1 && fixture.difficultyTags[0] === "clear");
    const difficult = single.filter((fixture) => !(fixture.difficultyTags.length === 1 && fixture.difficultyTags[0] === "clear"));
    const positivePassed = balanced.results.filter((result) => result.expectedOutcome === "decode" && result.pass).length;

    const readme = read("README.md");
    const historical = readme.match(/<!-- HISTORICAL_BENCHMARK_SUMMARY_START -->([\s\S]*?)<!-- HISTORICAL_BENCHMARK_SUMMARY_END -->/)?.[1] ?? "";
    const integration = readme.match(/<!-- ALPHA5_INTEGRATION_SUMMARY_START -->([\s\S]*?)<!-- ALPHA5_INTEGRATION_SUMMARY_END -->/)?.[1] ?? "";
    expect(readme).toContain(`**Alpha.4 r4** (\`${baselineId}\`)`);
    expect(readme).toContain(canonical.evidenceId);
    expect(readme).toContain(canonical.sourceIdentity.sourceCommitSha);
    expect(readme).toContain(canonical.sourceIdentity.sourceTreeSha);
    expect(historical).toContain(`| Legacy QR fixtures | ${canonical.fixtureCount} |`);
    expect(historical).toContain(`| Generated fixtures | ${generatedLegacy} |`);
    expect(historical).toContain(`| Project-owned photographs | ${projectPhotosLegacy} |`);
    expect(historical).toContain(`**${balanced.passed}/${balanced.total}`);
    expect(historical).toContain(`**${positivePassed}/${balanced.positiveCases}`);
    expect(historical).toContain(`**${balanced.falsePositiveCount}/${balanced.negativeCases}`);

    expect(integration).toContain(`| Generated Alpha.5 fixtures | ${alpha5.fixtures.length} |`);
    expect(integration).toContain(`| Single-format positives | ${single.length} |`);
    expect(integration).toContain(`| Mixed positives | ${mixed.length} |`);
    expect(integration).toContain(`| Negative fixtures | ${negative.length} |`);
    expect(integration).toContain(`| Generated clean | **${clean.length}/${clean.length}** |`);
    expect(integration).toContain(`| Generated difficult | **75/${difficult.length}** |`);
    expect(integration).toContain(`| GS1 recognition | **${alpha5.fixtures.filter((fixture) => fixture.expectedGs1).length}/${alpha5.fixtures.filter((fixture) => fixture.expectedGs1).length}** |`);
    expect(integration).toContain(`| Project-owned Alpha.5 photographs | **${photos.fixtures.length}/12** |`);
    expect(integration).not.toContain("73/74");
    expect(historical).not.toContain("Generated Alpha.5 fixtures");
    expect(readme).toContain("Alpha.5 integration evidence is development evidence. It is not frozen canonical release evidence.");
  });

  it("records the merged result while retaining a clearly superseded pre-merge audit", () => {
    const assessment = read("docs/releases/alpha5-release-assessment.md");
    expect(assessment).toContain("Final Alpha.5 integration result");
    expect(assessment).toContain("Historical pre-merge audit — superseded by final integration closure");
    expect(assessment).toContain("0aa809bda007783d0858b08d07f9a36902dd3471");
    expect(assessment).toContain("b0fd251996690fef80909cf972dc28a18e5e2207");
    expect(assessment).toContain("5b7f023a7f8efb4ad85f60a8affb076ba24dfd41");
    expect(assessment).toContain("**merged**, not Draft, source branch deleted");
    expect(assessment).toContain("Alpha.5 will not be retroactively released");
    expect(assessment).toContain("historical abandoned release plan");
    expect(assessment).toContain("v2-beta1-r1");
  });

  it("documents JSON and CSV as one hashed canonical policy", () => {
    const lifecycle = read("docs/benchmarking/evidence-lifecycle.md");
    expect(lifecycle).toContain("Canonical CSV policy");
    expect(lifecycle).toContain("manifest hashes all eight files");
    expect(lifecycle).toContain("normalizing text line endings to LF");
    expect(lifecycle).toContain("release verification rejects any stale JSON, CSV, or Symbologies alias");
  });
});
