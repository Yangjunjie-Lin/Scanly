import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";

const root = path.resolve(__dirname, "..");
const truthPath = path.join(root, "device-lab", "test-targets", "ground-truth.json");
const verify = process.argv.includes("--verify");
const require = createRequire(import.meta.url);
const writerAsset = path.resolve(path.dirname(require.resolve("zxing-wasm/writer")), "../../writer/zxing_writer.wasm");
prepareZXingModule({ overrides: { locateFile: () => writerAsset, wasmBinary: fs.readFileSync(writerAsset) } });

type Format = "qr_code" | "data_matrix" | "pdf417" | "code_128" | "ean_13";
interface Target {
  targetId: string;
  format: Format;
  payload: string;
  medium: string;
  creationSource: string;
  file: string;
  publicFile?: string;
}
interface GroundTruth { schemaVersion: string; targets: Target[] }

const native: Record<Format, "QRCode" | "DataMatrix" | "PDF417" | "Code128" | "EAN13"> = {
  qr_code: "QRCode", data_matrix: "DataMatrix", pdf417: "PDF417", code_128: "Code128", ean_13: "EAN13",
};

async function symbol(target: Target): Promise<Buffer> {
  const scale = target.targetId === "qr-small" ? 2 : target.format === "pdf417" ? 3 : 5;
  const written = await writeBarcode(target.payload, { format: native[target.format], scale, addQuietZones: true });
  if (written.error || !written.image) throw new Error(`${target.targetId}: writer failed: ${written.error || "no image"}`);
  let bytes = Buffer.from(await written.image.arrayBuffer());
  if (target.targetId === "qr-low-contrast") bytes = await sharp(bytes).linear(0.42, 142).png().toBuffer();
  if (target.targetId === "qr-perspective") bytes = await sharp(bytes).affine([[1, 0.18], [-0.08, 1]], { background: "#ffffff" }).png().toBuffer();
  if (target.targetId === "qr-damaged") {
    const metadata = await sharp(bytes).metadata();
    const width = metadata.width ?? 256; const height = metadata.height ?? 256;
    const overlay = Buffer.from(`<svg width="${width}" height="${height}"><rect x="${Math.round(width * 0.48)}" y="${Math.round(height * 0.18)}" width="${Math.max(3, Math.round(width * 0.025))}" height="${Math.round(height * 0.64)}" fill="white"/></svg>`);
    bytes = await sharp(bytes).composite([{ input: overlay }]).png().toBuffer();
  }
  return sharp(bytes).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
}

async function expectedFiles(): Promise<Map<string, Buffer>> {
  const truth = JSON.parse(fs.readFileSync(truthPath, "utf8")) as GroundTruth;
  if (truth.schemaVersion !== "beta4-ground-truth-1" || truth.targets.length < 16) throw new Error("Ground Truth identity/count failed.");
  const files = new Map<string, Buffer>();
  for (const target of truth.targets) {
    const bytes = await symbol(target);
    files.set(path.join(root, ...target.file.split("/")), bytes);
    files.set(path.join(root, "apps", "web-demo", "public", "device-targets", `${target.targetId}.png`), bytes);
  }

  const pageWidth = 1_240; const pageHeight = 1_754;
  for (const [pageIndex, pageTargets] of [truth.targets.slice(0, 10), truth.targets.slice(10)].entries()) {
    const cells = await Promise.all(pageTargets.map(async (target) => {
      const bytes = await symbol(target); const fit = await sharp(bytes).resize({ width: 520, height: 260, fit: "inside" }).png().toBuffer();
      return { target, fit };
    }));
    const composites = cells.map(({ target, fit }, index) => {
      const column = index % 2; const row = Math.floor(index / 2); const left = 50 + column * 610; const top = 70 + row * 330;
      const label = Buffer.from(`<svg width="560" height="310"><style>text{font-family:Arial,sans-serif;fill:#111}.id{font-size:22px;font-weight:bold}.payload{font-size:13px}</style><text x="0" y="24" class="id">${target.targetId} · ${target.format}</text><text x="0" y="48" class="payload">${target.payload.replaceAll("&", "&amp;")}</text></svg>`);
      return [{ input: label, left, top }, { input: fit, left: left + 5, top: top + 58 }] as const;
    }).flat();
    const printable = await sharp({ create: { width: pageWidth, height: pageHeight, channels: 3, background: "#ffffff" } }).composite(composites).png({ compressionLevel: 9 }).toBuffer();
    const suffix = pageIndex === 0 ? "" : `-page-${pageIndex + 1}`;
    files.set(path.join(root, "device-lab", "test-targets", `printable-test-sheet${suffix}.png`), printable);
  }

  const hashes = Object.fromEntries([...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([file, bytes]) => [path.relative(root, file).replaceAll("\\", "/"), crypto.createHash("sha256").update(bytes).digest("hex")]));
  files.set(path.join(root, "device-lab", "test-targets", "sha256.json"), Buffer.from(`${JSON.stringify({ schemaVersion: "beta4-target-hashes-1", hashes }, null, 2)}\n`));
  return files;
}

async function main(): Promise<void> {
  const files = await expectedFiles();
  for (const [file, bytes] of files) {
    if (verify) {
      const actual = await fs.promises.readFile(file).catch(() => undefined);
      if (!actual?.equals(bytes)) throw new Error(`Generated device target mismatch: ${path.relative(root, file)}`);
    } else {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      const actual = await fs.promises.readFile(file).catch(() => undefined);
      if (!actual?.equals(bytes)) await fs.promises.writeFile(file, bytes);
    }
  }
  console.log(`${verify ? "Verified" : "Generated"} ${files.size - 1} deterministic target artifacts and SHA-256 manifest.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
