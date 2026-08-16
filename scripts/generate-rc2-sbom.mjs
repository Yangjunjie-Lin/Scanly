import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const verifyOnly = process.argv.includes("--verify");
const inventory = JSON.parse(fs.readFileSync(path.join(root, "release/rc2/license-inventory.json"), "utf8"));
const sourceCommit = process.env.RC2_SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? "LOCAL_UNCOMMITTED";
const components = inventory.components.map((component) => ({
  type: component.type === "npm" ? "library" : "framework",
  "bom-ref": `${component.type}:${component.name}@${component.version}`,
  name: component.name,
  version: component.version,
  purl: component.purl,
  licenses: [{ license: { id: component.license } }],
  properties: [{ name: "scanly:source", value: component.source }],
}));
const serial = crypto.createHash("sha256").update(`${sourceCommit}:2.0.0-rc.2`).digest("hex").slice(0, 32);
const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${serial}`,
  version: 1,
  metadata: { component: { type: "application", name: "scanly", version: "2.0.0-rc.2" }, properties: [{ name: "scanly:sourceCommit", value: sourceCommit }] },
  components,
};
const output = path.join(root, "release/rc2/sbom.cdx.json");
const serialized = `${JSON.stringify(bom, null, 2)}\n`;
if (verifyOnly) {
  if (!fs.existsSync(output) || !fs.readFileSync(output).equals(Buffer.from(serialized, "utf8"))) {
    throw new Error("Frozen RC2 SBOM does not match the regenerated Product Source identity and dependency inventory.");
  }
  console.log(`Verified frozen ${path.relative(root, output)} without rewriting historical evidence.`);
  process.exit(0);
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, serialized);
console.log(`Wrote ${path.relative(root, output)}.`);
