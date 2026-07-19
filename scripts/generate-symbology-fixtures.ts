import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";
import { barcodeFormatClass, compressUpcA } from "@scanly/core";
import type { BarcodeFormat } from "@scanly/scenario-schema";

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "fixtures", "alpha5");
const SEED = 0x5ca11a5;
const require = createRequire(import.meta.url);
const WRITER_ASSET = path.resolve(path.dirname(require.resolve("zxing-wasm/writer")), "../../writer/zxing_writer.wasm");

type NativeFormat = "QRCode" | "DataMatrix" | "PDF417" | "Code128" | "EAN13" | "EAN8" | "UPCA" | "UPCE";
type Difficulty = "clear" | "rotation" | "small" | "low_contrast" | "blur" | "inverted" | "perspective" | "underexposed" | "damaged" | "multiple" | "checksum_invalid" | "wrong_format_decoy" | "dense_background";

interface FixtureRecord {
  id: string;
  file: string;
  format?: BarcodeFormat;
  formatClass?: "matrix" | "stacked" | "linear";
  sourceType: "generated" | "project-photo";
  generator: string;
  expectedPayload: string;
  expectedRawBytes?: number[];
  expectedOutcome: "decode" | "no-symbol";
  expectedResultCount: number;
  requiredResults: Array<{ format: BarcodeFormat; payload: string }>;
  orientation: number;
  difficultyTags: Difficulty[];
  license: string;
  provenanceNote: string;
  expectedGs1?: boolean;
}

interface PositiveSpec {
  format: BarcodeFormat;
  nativeFormat: NativeFormat;
  payload: string;
  index: number;
  gs1?: boolean;
}

prepareZXingModule({ overrides: { locateFile: () => WRITER_ASSET, wasmBinary: fs.readFileSync(WRITER_ASSET) } });

function checkDigit(body: string): string {
  let sum = 0;
  for (let index = body.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    sum += Number(body[index]) * (position % 2 === 0 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}

function upcE(body: string): string {
  if (!/^[01]\d{6}$/.test(body)) throw new Error(`Invalid UPC-E body '${body}'.`);
  const numberSystem = body[0];
  const data = body.slice(1);
  const last = data[5];
  let manufacturer: string;
  let product: string;
  if ("012".includes(last)) {
    manufacturer = `${data.slice(0, 2)}${last}00`;
    product = `00${data.slice(2, 5)}`;
  } else if (last === "3") {
    manufacturer = `${data.slice(0, 3)}00`;
    product = `000${data.slice(3, 5)}`;
  } else if (last === "4") {
    manufacturer = `${data.slice(0, 4)}0`;
    product = `0000${data[4]}`;
  } else {
    manufacturer = data.slice(0, 5);
    product = `0000${last}`;
  }
  const upcABody = `${numberSystem}${manufacturer}${product}`;
  const value = `${body}${checkDigit(upcABody)}`;
  const expanded = `${upcABody}${value[7]}`;
  if (compressUpcA(expanded) !== value) throw new Error(`UPC-E round trip failed for '${value}'.`);
  return value;
}

async function symbol(spec: Omit<PositiveSpec, "index">, scale = 4): Promise<Buffer> {
  const result = await writeBarcode(spec.payload, {
    format: spec.nativeFormat, scale, addQuietZones: true, options: spec.gs1 ? "gs1" : "",
  }).catch((cause: unknown) => {
    throw new Error(`Writer aborted for ${spec.format} payload '${spec.payload}'.`, { cause });
  });
  if (result.error || !result.image) throw new Error(`Unable to create ${spec.nativeFormat}: ${result.error || "no image"}`);
  return Buffer.from(await result.image.arrayBuffer());
}

const TAGS: readonly Difficulty[][] = [
  ["clear"], ["rotation"], ["rotation"], ["inverted"], ["low_contrast"], ["blur"],
  ["small", "dense_background"], ["perspective"], ["underexposed"], ["damaged"],
  ["rotation", "small"], ["clear"],
];

async function transform(input: Buffer, variant: number): Promise<Buffer> {
  const mode = variant % TAGS.length;
  if (mode === 0) return sharp(input).png().toBuffer();
  if (mode === 1) return sharp(input).rotate(90, { background: "#ffffff" }).png().toBuffer();
  if (mode === 2) return sharp(input).rotate(180, { background: "#ffffff" }).png().toBuffer();
  if (mode === 3) return sharp(input).negate({ alpha: false }).png().toBuffer();
  if (mode === 4) return sharp(input).linear(0.52, 116).png().toBuffer();
  if (mode === 5) return sharp(input).blur(0.65).png().toBuffer();
  if (mode === 6) {
    const resized = await sharp(input).resize({ width: 360, fit: "inside" }).png().toBuffer();
    return sharp({ create: { width: 1_000, height: 760, channels: 3, background: "#d8dde5" } })
      .composite([{ input: resized, left: 575, top: 300 }]).png().toBuffer();
  }
  if (mode === 7) return sharp(input).affine([[1, 0.12], [-0.06, 1]], { background: "#ffffff" }).png().toBuffer();
  if (mode === 8) return sharp(input).modulate({ brightness: 0.55 }).png().toBuffer();
  if (mode === 9) {
    const metadata = await sharp(input).metadata();
    const cover = Buffer.from(`<svg width="${metadata.width}" height="${metadata.height}"><rect x="${Math.floor((metadata.width ?? 100) * 0.47)}" y="${Math.floor((metadata.height ?? 100) * 0.1)}" width="4" height="${Math.floor((metadata.height ?? 100) * 0.8)}" fill="white"/></svg>`);
    return sharp(input).composite([{ input: cover }]).png().toBuffer();
  }
  if (mode === 10) return sharp(input).rotate(270, { background: "#ffffff" }).resize({ width: 320, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return sharp(input).sharpen({ sigma: 0.8 }).png().toBuffer();
}

async function writeIfChanged(file: string, bytes: Buffer): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const prior = await fs.promises.readFile(file).catch(() => null);
  if (!prior?.equals(bytes)) await fs.promises.writeFile(file, bytes);
}

function positiveSpecs(): PositiveSpec[] {
  const specs: PositiveSpec[] = [];
  for (let index = 0; index < 24; index += 1) {
    const gs1 = [0, 5, 11, 17].includes(index);
    const suffix = gs1 ? `(01)09506000134352(17)271231(10)DM${String(index + 1).padStart(2, "0")}` : index % 6 === 5 ? `UTF8-\u4ed3\u5e93-${index + 1}` : index % 6 === 4 ? `RECT-${String(index + 1).padStart(2, "0")}` : `SCANLY-DM-${String(index + 1).padStart(2, "0")}`;
    specs.push({ format: "data_matrix", nativeFormat: "DataMatrix", payload: suffix, index, gs1 });
  }
  for (let index = 0; index < 20; index += 1) {
    const payload = index % 5 === 4 ? `SCANLY-PDF417-UTF8-\u6587\u6863-${index + 1}` : `SCANLY-PDF417-DOCUMENT-${String(index + 1).padStart(2, "0")}-${"DATA".repeat((index % 4) + 1)}`;
    specs.push({ format: "pdf417", nativeFormat: "PDF417", payload, index });
  }
  for (let index = 0; index < 24; index += 1) {
    const gs1 = [0, 5, 11, 17].includes(index);
    const payload = gs1 ? `(01)09506000134352(17)271231(10)C${String(index + 1).padStart(2, "0")}` : index % 3 === 0 ? `${String(index + 1).padStart(2, "0")}12345678901234` : `SCANLY-C128-${String(index + 1).padStart(2, "0")}`;
    specs.push({ format: "code_128", nativeFormat: "Code128", payload, index, gs1 });
  }
  const retail: Array<[BarcodeFormat, NativeFormat, string[]]> = [
    ["ean_13", "EAN13", Array.from({ length: 8 }, (_, index) => { const body = `5901234${String(10000 + index).slice(-5)}`; return body + checkDigit(body); })],
    ["ean_8", "EAN8", Array.from({ length: 8 }, (_, index) => { const body = `9638${String(500 + index).slice(-3)}`; return body + checkDigit(body); })],
    ["upc_a", "UPCA", Array.from({ length: 8 }, (_, index) => { const body = `03600029${String(140 + index).slice(-3)}`; return body + checkDigit(body); })],
    ["upc_e", "UPCE", ["0425261", "0123456", "0654321", "1234534", "1543215", "1765436", "1987657", "1321098"].map(upcE)],
  ];
  for (const [format, nativeFormat, payloads] of retail) payloads.forEach((payload, index) => specs.push({ format, nativeFormat, payload, index }));
  return specs;
}

function svgNegative(family: string, index: number): Buffer {
  const width = family === "pdf417" || family === "code128" || family === "retail" ? 760 : 480;
  const height = family === "pdf417" ? 360 : 420;
  const bars = Array.from({ length: family === "data-matrix" ? 22 : 90 }, (_, position) => {
    const x = 30 + position * (family === "data-matrix" ? 18 : 7);
    const y = family === "pdf417" ? 50 + ((position * 17 + index * 11) % 220) : 55;
    const barWidth = 1 + ((position * 13 + index * 7) % 5);
    const barHeight = family === "data-matrix" ? 12 + ((position * 19) % 22) : family === "pdf417" ? 4 + ((position * 5) % 11) : 245 - ((position + index) % 4) * 13;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}"/>`;
  }).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><g fill="#111">${bars}</g><text x="40" y="${height - 35}" font-family="monospace" font-size="24">INVALID ${family.toUpperCase()} ${index + 1}</text></svg>`);
}

async function main(): Promise<void> {
  const fixtures: FixtureRecord[] = [];
  const specs = positiveSpecs();
  for (const spec of specs) {
    const family = spec.format.replace("_", "-");
    const id = `${family}-${String(spec.index + 1).padStart(2, "0")}`;
    const relative = `fixtures/alpha5/generated/${id}.png`;
    const bytes = await transform(await symbol(spec, spec.format === "pdf417" ? 3 : 4), spec.index);
    await writeIfChanged(path.join(ROOT, relative), bytes);
    fixtures.push({
      id, file: relative, format: spec.format, formatClass: barcodeFormatClass(spec.format), sourceType: "generated",
      generator: "zxing-wasm 3.1.1 writer + deterministic Sharp transforms", expectedPayload: spec.payload,
      expectedRawBytes: [...new TextEncoder().encode(spec.payload)], expectedOutcome: "decode", expectedResultCount: 1,
      requiredResults: [{ format: spec.format, payload: spec.payload }], orientation: [0, 90, 180, 0, 0, 0, 0, 0, 0, 0, 270, 0][spec.index % 12],
      difficultyTags: [...TAGS[spec.index % TAGS.length]], license: "project-generated",
      provenanceNote: `Deterministic seed ${SEED}; transform ${spec.index % TAGS.length}; no user image or network asset.`,
      ...(spec.gs1 ? { expectedGs1: true } : {}),
    });
  }

  const qr = (index: number): PositiveSpec => ({ format: "qr_code", nativeFormat: "QRCode", payload: `SCANLY-MIXED-QR-${index + 1}`, index });
  const mixedPairs: PositiveSpec[][] = [
    [qr(0), specs[44]],
    [specs[0], specs[44]],
    [specs[68], qr(1)],
    [specs[24], qr(2)],
    [specs[68], specs[76]],
    [specs[45], { ...specs[45] }],
    [specs[4], specs[52]],
    [specs[25], specs[0]],
    [specs[45], specs[84]],
    [specs[30], specs[70]],
    [specs[60], specs[93]],
    [qr(3), specs[10]],
  ];
  for (let index = 0; index < mixedPairs.length; index += 1) {
    const pair = mixedPairs[index];
    const images = await Promise.all(pair.map((spec) => symbol(spec, spec.format === "pdf417" ? 2 : 3)));
    const id = `mixed-${String(index + 1).padStart(2, "0")}`;
    const relative = `fixtures/alpha5/generated/${id}.png`;
    const bytes = await sharp({ create: { width: 1_300, height: 820, channels: 3, background: "#f4f5f7" } }).composite([
      { input: images[0], left: 60, top: 70 }, { input: images[1], left: 560, top: 430 },
    ]).png().toBuffer();
    await writeIfChanged(path.join(ROOT, relative), bytes);
    fixtures.push({
      id, file: relative, sourceType: "generated", generator: "zxing-wasm 3.1.1 writer + deterministic Sharp composition",
      expectedPayload: pair[0].payload, expectedOutcome: "decode", expectedResultCount: 2,
      requiredResults: pair.map((spec) => ({ format: spec.format, payload: spec.payload })), orientation: 0,
      difficultyTags: ["multiple"], license: "project-generated",
      provenanceNote: `Deterministic seed ${SEED}; two-format composition; no user image or network asset.`,
    });
  }

  const negativeCounts = [["data-matrix", 8], ["pdf417", 8], ["code128", 8], ["retail", 10]] as const;
  for (const [family, count] of negativeCounts) {
    for (let index = 0; index < count; index += 1) {
      const id = `negative-${family}-${String(index + 1).padStart(2, "0")}`;
      const relative = `fixtures/alpha5/negative/${id}.png`;
      await writeIfChanged(path.join(ROOT, relative), await sharp(svgNegative(family, index)).png().toBuffer());
      fixtures.push({
        id, file: relative, sourceType: "generated", generator: "deterministic adversarial SVG renderer",
        expectedPayload: "", expectedOutcome: "no-symbol", expectedResultCount: 0, requiredResults: [], orientation: 0,
        difficultyTags: family === "retail" && index < 4 ? ["checksum_invalid"] : ["wrong_format_decoy"],
        license: "project-generated", provenanceNote: `Deterministic seed ${SEED}; ${family} decoy; no encoded barcode.`,
      });
    }
  }

  const manifest = {
    schemaVersion: "2.0-alpha5", seed: SEED, generatorVersion: 1,
    notes: "Generated Alpha.5 corpus. Project-owned real-photo fixtures are a separate outstanding release gate and are not represented here.",
    fixtures,
  };
  await writeIfChanged(path.join(OUTPUT, "manifest.json"), Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  console.log(`Generated ${fixtures.length} Alpha.5 fixtures: ${specs.length} single positive, ${mixedPairs.length} mixed, ${fixtures.filter((fixture) => fixture.expectedOutcome === "no-symbol").length} negative.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
