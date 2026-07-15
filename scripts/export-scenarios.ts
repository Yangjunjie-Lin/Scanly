import fs from "node:fs";
import path from "node:path";
import { getBuiltinScenario } from "@scanly/scenario-schema";

const root = path.resolve(__dirname, "..");
const output = path.join(root, "scenarios", "generic");

async function main(): Promise<void> {
  await fs.promises.mkdir(output, { recursive: true });
  for (const id of ["fast", "balanced", "robust"] as const) {
    await fs.promises.writeFile(path.join(output, `${id}.json`), `${JSON.stringify(getBuiltinScenario(id), null, 2)}\n`);
  }
  console.log(`Wrote versioned built-in scenarios to ${output}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
