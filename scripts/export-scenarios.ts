import fs from "node:fs";
import path from "node:path";
import { getBuiltinScenario } from "@scanly/scenario-schema";

const root = path.resolve(__dirname, "..");
const output = path.join(root, "scenarios", "generic");

async function writeTextIfChanged(file: string, content: string): Promise<void> {
  if (fs.existsSync(file)) {
    const existing = await fs.promises.readFile(file, "utf8");
    if (existing.replace(/\r\n/g, "\n") === content.replace(/\r\n/g, "\n")) return;
  }
  await fs.promises.writeFile(file, content);
}

async function main(): Promise<void> {
  await fs.promises.mkdir(output, { recursive: true });
  for (const id of ["fast", "balanced", "robust"] as const) {
    await writeTextIfChanged(path.join(output, `${id}.json`), `${JSON.stringify(getBuiltinScenario(id), null, 2)}\n`);
  }
  console.log(`Wrote versioned built-in scenarios to ${output}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
