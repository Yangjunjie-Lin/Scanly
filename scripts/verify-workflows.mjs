import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const workflowDirectory = path.resolve(".github", "workflows");
const workflowFiles = fs.readdirSync(workflowDirectory)
  .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
  .sort();

for (const file of workflowFiles) {
  const filePath = path.join(workflowDirectory, file);
  try {
    const document = yaml.load(fs.readFileSync(filePath, "utf8"));
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      throw new Error("workflow root must be a mapping");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid GitHub Actions workflow '${file}': ${detail}`);
  }
}

console.log(`Verified YAML syntax for ${workflowFiles.length} GitHub Actions workflows.`);
