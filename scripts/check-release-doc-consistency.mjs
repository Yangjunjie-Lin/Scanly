import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = ["README.md", "SECURITY.md", "CONTRIBUTING.md"];
const recursiveRoots = ["docs/sdk", "docs/native", "docs/migration"];
const directFiles = [
  "docs/platform-compatibility.md",
  "docs/maintenance.md",
  "device-evidence/README.md",
  "device-evidence/sessions/README.md",
  "docs/physical-device-validation.md",
];

for (const relativeRoot of recursiveRoots) {
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path.relative(root, absolute).replaceAll("\\", "/"));
    }
  };
  visit(path.join(root, relativeRoot));
}
files.push(...directFiles);

const forbidden = [
  { pattern: /v2 packages are preview/i, label: "v2 packages are preview" },
  { pattern: /Beta 5 is\b/i, label: "Beta 5 is" },
  { pattern: /SDK v2 is an alpha foundation/i, label: "SDK v2 is an alpha foundation" },
  { pattern: /not yet published/i, label: "not yet published" },
  { pattern: /before v2 stable/i, label: "before v2 stable" },
  { pattern: /DEFERRED_TO_RC/i, label: "DEFERRED_TO_RC" },
  { pattern: /BETA4_RELEASE_NO_GO/i, label: "BETA4_RELEASE_NO_GO" },
  { pattern: /final RC campaign/i, label: "final RC campaign" },
  { pattern: /future WASM engines?/i, label: "future WASM engine" },
];

const failures = [];
for (const relative of [...new Set(files)].sort()) {
  const text = fs.readFileSync(path.join(root, relative), "utf8");
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    for (const rule of forbidden) {
      if (rule.pattern.test(lines[index])) failures.push(`${relative}:${index + 1}: forbidden current-state language '${rule.label}'`);
    }
  }
}

if (failures.length) throw new Error(`Stable documentation consistency failed:\n${failures.join("\n")}`);
console.log(`Verified Stable release language across ${new Set(files).size} user-facing documentation files.`);
