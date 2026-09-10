import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
// Compare against the immutable published baseline, not an assumed source SHA.
const before = JSON.parse(git("show", "v2.0.1:api-snapshots/public-api.json"));
const after = JSON.parse(fs.readFileSync("api-snapshots/public-api.json", "utf8"));
for (const previous of before.packages) {
  const current = after.packages.find((entry: { packageName: string }) => entry.packageName === previous.packageName);
  assert.ok(current, `${previous.packageName} removed`);
  assert.deepEqual(current.exports, previous.exports); assert.equal(current.types, previous.types);
  for (const [declaration, hash] of Object.entries(previous.declarationHashes)) {
    if (current.declarationHashes[declaration] === hash) continue;
    const root = previous.packageName === "@scanly/core" ? "packages/core" : previous.packageName === "@scanly/browser" ? "packages/browser" : undefined;
    assert.ok(root && declaration === "index.d.ts", `${previous.packageName}/${declaration} changed`);
    const oldText = git("show", `v2.0.1:${root}/dist/index.d.ts`).replaceAll('"2.0.1"', '"2.1.0"');
    assert.equal(fs.readFileSync(`${root}/dist/index.d.ts`, "utf8").replaceAll("\r\n", "\n").trim(), oldText);
  }
}
assert.ok(after.packages.some((entry: { packageName: string }) => entry.packageName === "@scanly/url-safety"));
for (const file of ["native-api.json", "native-abi.json"]) {
  const previous = JSON.parse(git("show", `v2.0.1:api-snapshots/${file}`));
  const current = JSON.parse(fs.readFileSync(`api-snapshots/${file}`, "utf8"));
  previous.sdkVersion = current.sdkVersion;
  assert.deepEqual(current, previous);
}
console.log("PUBLIC_API_2_1_GO: additive package; existing declarations and Native API/ABI unchanged except SDK version literals.");
