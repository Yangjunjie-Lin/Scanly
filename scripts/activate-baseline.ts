import fs from "node:fs";
import path from "node:path";
import { loadBaselineRegistry } from "./baseline-registry.js";

const root = path.resolve(__dirname, "..");
const registryPath = path.join(root, "benchmark-results", "baselines", "registry.json");
const value = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split("=")[1];
const family = value("family"); const profile = value("profile"); const file = value("file");
if (!process.argv.includes("--approve-activation") || !family || !profile || !file) throw new Error("Activation requires --approve-activation, --family, --profile, and --file.");
if (!/^node\d+-(win32|linux|darwin)-(x64|arm64)$/.test(family) || !["fast", "balanced", "robust"].includes(profile) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]+\.json$/.test(file)) throw new Error("Baseline activation arguments are invalid.");
if (!fs.existsSync(path.join(path.dirname(registryPath), file))) throw new Error(`Cannot activate missing baseline '${file}'.`);
const registry = await loadBaselineRegistry(registryPath);
registry.activeBaselines[family] ??= {} as never;
registry.activeBaselines[family][profile as "fast" | "balanced" | "robust"] = file;
await fs.promises.writeFile(registryPath, JSON.stringify(registry, null, 2) + "\n");
console.log(`Activated ${file} for ${family}/${profile}.`);
