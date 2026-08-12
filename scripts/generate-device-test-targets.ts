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

const glyphs: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00001", "00001", "00001", "00001", "10001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};

function bitmapText(text: string, x: number, y: number, scale: number): string {
  return [...text.toUpperCase()].flatMap((character, characterIndex) => {
    const glyph = glyphs[character] ?? glyphs["?"];
    return glyph.flatMap((row, rowIndex) => [...row].map((bit, columnIndex) => bit === "1"
      ? `<rect x="${x + characterIndex * 6 * scale + columnIndex * scale}" y="${y + rowIndex * scale}" width="${scale}" height="${scale}"/>`
      : ""));
  }).join("");
}

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
      const bytes = await symbol(target); const fit = await sharp(bytes).resize({ width: 520, height: 220, fit: "inside" }).png().toBuffer();
      return { target, fit };
    }));
    const composites = cells.map(({ target, fit }, index) => {
      const column = index % 2; const row = Math.floor(index / 2); const left = 50 + column * 610; const top = 70 + row * 330;
      // Host fonts rasterize differently on Windows and Linux. The embedded
      // bitmap glyphs keep printable labels readable and byte-deterministic.
      const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="560" height="76"><g fill="#111">${bitmapText(`ID ${target.targetId}`, 0, 0, 3)}${bitmapText(`FORMAT ${target.format}`, 0, 26, 2)}${bitmapText(`PAYLOAD ${target.payload}`, 0, 48, 2)}</g></svg>`);
      return [{ input: label, left, top }, { input: fit, left: left + 5, top: top + 82 }] as const;
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
