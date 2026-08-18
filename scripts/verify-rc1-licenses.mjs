import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, "release/rc1/license-inventory.json");
if (!fs.existsSync(file)) throw new Error("RC1 license inventory is missing.");
const inventory = JSON.parse(fs.readFileSync(file, "utf8"));
if (inventory.schemaVersion !== "rc1-license-inventory-1") throw new Error("Unsupported RC1 license inventory schema.");
if (!Array.isArray(inventory.components) || inventory.components.length === 0) throw new Error("RC1 license inventory is empty.");
const unknown = inventory.components.filter((component) => !component.license || /unknown|noassertion/i.test(component.license));
if (unknown.length) throw new Error(`Unknown licenses: ${unknown.map((component) => component.name).join(", ")}`);
for (const component of inventory.components) {
  if (!component.version || !component.source || !component.redistributionObligations) throw new Error(`Incomplete license record: ${component.name}`);
}
console.log(`RC1 license inventory passed (${inventory.components.length} components).`);
