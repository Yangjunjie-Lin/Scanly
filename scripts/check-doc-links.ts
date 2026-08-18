import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const markdown: string[] = [];

function walk(directory: string): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "coverage", "test-results", "playwright-report"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.name.endsWith(".md")) markdown.push(absolute);
  }
}

walk(root);
const failures: string[] = [];
for (const file of markdown) {
  const content = fs.readFileSync(file, "utf8");
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, "");
    if (!target || /^(?:https?:|mailto:|#)/i.test(target)) continue;
    const pathname = decodeURIComponent(target.split("#", 1)[0].split("?", 1)[0]);
    if (!pathname) continue;
    const resolved = path.resolve(path.dirname(file), pathname);
    if (!fs.existsSync(resolved)) failures.push(`${path.relative(root, file)} -> ${target}`);
  }
}
if (failures.length) throw new Error(`Broken local Markdown links:\n${failures.join("\n")}`);
console.log(`Documentation link check passed (${markdown.length} Markdown files).`);
