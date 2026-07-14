import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { BenchmarkRunSummary } from "../lib/qr/benchmark-types";

const ROOT = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const fail = (message: string): never => { throw new Error(message); };

const pkg = JSON.parse(read("package.json")) as { license?: string };
if (pkg.license !== "MIT") fail("package.json license must be MIT");

const license = read("LICENSE").replace(/\r\n/g, "\n");
if (!license.startsWith("MIT License\n") || !license.includes("Copyright (c) 2026 Yangjunjie Lin")) {
  fail("LICENSE is missing the canonical MIT heading or copyright line");
}
if (!license.includes("Permission is hereby granted, free of charge")) {
  fail("LICENSE does not contain the standard MIT grant");
}

const manifest = JSON.parse(read("fixtures/manifest.json")) as {
  fixtures: Array<{
    id: string;
    category: string;
    requiredPayloads?: string[];
    expectedResultCount?: number;
    sourceType: "generated" | "project-photo";
  }>;
};
for (const fixture of manifest.fixtures.filter((item) => item.category === "multiple")) {
  if (!fixture.requiredPayloads?.length) fail(`${fixture.id} has no requiredPayloads contract`);
  if (fixture.expectedResultCount !== fixture.requiredPayloads.length) {
    fail(`${fixture.id} expectedResultCount must equal requiredPayloads length`);
  }
}

const canonical = JSON.parse(read("benchmark-results/latest.json")) as BenchmarkRunSummary;
const readme = read("README.md");
const rate = `${(canonical.successRate * 100).toFixed(1)}%`;
const generatedCount = manifest.fixtures.filter((fixture) => fixture.sourceType === "generated").length;
const photoCount = manifest.fixtures.filter((fixture) => fixture.sourceType === "project-photo").length;
for (const expected of [
  `${canonical.passed}/${canonical.total} (${rate})`,
  `Benchmark date | ${canonical.generatedAt.slice(0, 10)}`,
  `Generated fixtures | ${generatedCount}`,
  `Project-owned photos | ${photoCount}`,
]) {
  if (!readme.includes(expected)) fail(`README benchmark summary is stale: missing '${expected}'`);
}
if (canonical.multipleCompleteness.complete !== canonical.multipleCompleteness.total) {
  fail(`Multiple completeness is ${canonical.multipleCompleteness.complete}/${canonical.multipleCompleteness.total}`);
}

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
const forbiddenPaths = tracked.filter((file) =>
  /(^|\/)\.vercel(\/|$)|(^|\/)\.env(\.|$)|fixtures\/(?:_tmp-|_e2e-)/.test(file)
);
if (forbiddenPaths.length) fail(`Forbidden tracked paths: ${forbiddenPaths.join(", ")}`);

const textExtensions = new Set([".ts", ".tsx", ".js", ".json", ".md", ".yml", ".yaml", ".txt"]);
for (const file of tracked) {
  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  const content = read(file);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
    fail(`Possible private key found in tracked file: ${file}`);
  }
  if (/^(?:VERCEL_TOKEN|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|GITHUB_TOKEN)\s*=\s*\S+/m.test(content)) {
    fail(`Possible secret assignment found in tracked file: ${file}`);
  }
}

console.log("Quality gates passed: license, benchmark summary, multiple contracts, tracked files, secret scan.");
