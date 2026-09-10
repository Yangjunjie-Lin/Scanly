import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

async function main() {
  const root = process.cwd();
  const output = path.join(root, "benchmark-results/development/url-safety-security.json");
  const tests = path.join(root, "benchmark-results/development/url-safety-tests.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/url-safety", "--reporter=json", `--outputFile=${tests}`], { cwd: root, stdio: "inherit" });
  const testResult = JSON.parse(fs.readFileSync(tests, "utf8"));
  assert.equal(testResult.success, true); assert.equal(testResult.numFailedTests, 0); assert.ok(testResult.numPassedTests >= 145);
  const bundle = await build({ stdin: { contents: 'export * from "@scanly/url-safety";', resolveDir: root }, bundle: true, platform: "browser", format: "esm", write: false, metafile: true, minify: true });
  const inputs = Object.keys(bundle.metafile!.inputs);
  assert.ok(!inputs.some((name) => /url-safety[\\/]dist[\\/]server|ipaddr|parse5|node:dns|node:http/.test(name)), "server graph leaked into browser");
  assert.ok(!bundle.outputFiles![0].text.match(/SCANLY_.*API_KEY|webrisk\.googleapis|virustotal\.com|SafeRemoteFetcher/), "server implementation or credential names leaked");
  let blocked = false;
  try { await build({ stdin: { contents: 'import { SafeRemoteFetcher } from "@scanly/url-safety/server"; console.log(SafeRemoteFetcher);', resolveDir: root }, bundle: true, platform: "browser", write: false, logLevel: "silent" }); } catch { blocked = true; }
  assert.ok(blocked, "browser can import server subpath");
  const tiny = await build({ stdin: { contents: 'export { normalizeUrl } from "@scanly/url-safety";', resolveDir: root }, bundle: true, platform: "browser", format: "esm", write: false, metafile: true, minify: true });
  assert.ok(!tiny.outputFiles![0].text.includes("url_safety_endpoint_unavailable"), "client was not tree-shaken");
  // Include untracked new sources as well as tracked sources. No secret values
  // are printed if a rule detects an assignment.
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).trim().split(/\r?\n/);
  for (const file of files.filter((name) => /\.(ts|tsx|js|mjs|json|yml|yaml|md|txt)$/.test(name))) {
    const source = fs.readFileSync(file, "utf8");
    assert.ok(!/^\s*(?:SCANLY_(?:WEB_RISK|VIRUSTOTAL|LLM)_API_KEY|NEXT_PUBLIC_\w*API_KEY)\s*=\s*[^\s]+/m.test(source), `credential assignment: ${file}`);
    assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source), `private key: ${file}`);
  }
  const identity = (args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const report = { gate: "URL_SAFETY_SECURITY_GATE", result: "URL_SAFETY_SECURITY_GO", sourceCommit: identity(["rev-parse", "HEAD"]), sourceTree: identity(["rev-parse", "HEAD^{tree}"]), repositoryDirty: !!identity(["status", "--porcelain"]), testCount: testResult.numPassedTests, assertions: ["SSRF matrix", "redirect rebinding", "response size", "timeouts", "no cookies/auth", "no JS execution", "provider malformed output", "prompt injection data isolation", "LLM bound and authority", "rate limiting", "privacy modes and redaction", "single-flight and cancellation", "browser/server export isolation", "tree shaking", "secret scan"].map((name) => ({ name, status: "PASS" })), browserBundleBytes: bundle.outputFiles![0].contents.length, localOnlyTreeShakenBytes: tiny.outputFiles![0].contents.length, limitation: "Mocked transport/provider tests; not live-provider, external penetration-test, or Native qualification." };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
