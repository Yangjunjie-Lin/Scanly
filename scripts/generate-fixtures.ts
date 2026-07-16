/**
 * Deterministic QR fixture generator (seed=20260625).
 * Preserves legacy docs/benchmark-fixtures (01–16) and adds generated cases.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import QRCode from "qrcode";
import sharp from "sharp";
import type { BenchmarkFixture } from "@scanly/benchmark";

const ROOT = path.resolve(__dirname, "..");
const FIXTURES_DIR = path.join(ROOT, "fixtures");
const LEGACY_DIR = path.join(ROOT, "docs", "benchmark-fixtures");
const SEED = 20260625;

function mulberry32(a: number) {
  return function rand() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);

async function qrPng(text: string, size = 320, dark = "#000000", light = "#ffffff"): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: "png",
    width: size,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark, light },
  });
}

async function ensureDir(dir: string) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function writeFixture(rel: string, buf: Buffer) {
  const full = path.join(FIXTURES_DIR, rel);
  await ensureDir(path.dirname(full));
  await fs.promises.writeFile(full, buf);
}

function noiseBuffer(width: number, height: number, strength: number): Buffer {
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(rand() * strength);
  }
  return data;
}

async function writeTextIfChanged(file: string, content: string): Promise<void> {
  if (fs.existsSync(file)) {
    const existing = await fs.promises.readFile(file, "utf8");
    if (existing.replace(/\r\n/g, "\n") === content.replace(/\r\n/g, "\n")) return;
  }
  await fs.promises.writeFile(file, content);
}

async function versionedQrPng(text: string, version: number, size = 720): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: "png", width: size, margin: 2, version, errorCorrectionLevel: "M" });
}

async function multiQrCanvas(payloads: string[], columns: number, cellSize = 180, background = "#ffffff"): Promise<{ image: Buffer; geometry: Array<{ payload: string; x: number; y: number; width: number; height: number }> }> {
  const rows = Math.ceil(payloads.length / columns);
  const gap = 24;
  const width = columns * cellSize + (columns + 1) * gap;
  const height = rows * cellSize + (rows + 1) * gap;
  const geometry = payloads.map((payload, index) => ({ payload, x: gap + (index % columns) * (cellSize + gap), y: gap + Math.floor(index / columns) * (cellSize + gap), width: cellSize, height: cellSize }));
  const inputs = await Promise.all(geometry.map(async (entry) => ({ input: await qrPng(entry.payload, cellSize), left: entry.x, top: entry.y })));
  const image = await sharp({ create: { width, height, channels: 3, background } }).composite(inputs).png().toBuffer();
  return { image, geometry };
}

function gridGeometry(payloads: string[], columns: number, cellSize: number) {
  const gap = 24;
  return payloads.map((payload, index) => ({ payload, x: gap + (index % columns) * (cellSize + gap), y: gap + Math.floor(index / columns) * (cellSize + gap), width: cellSize, height: cellSize }));
}

/** Host-font-independent pseudo text for deterministic adversarial fixtures. */
function glyphRunSvg(text: string, x: number, y: number, scale = 3): string {
  const rectangles: string[] = [];
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (text[index] === " ") continue;
    for (let row = 0; row < 7; row++) {
      for (let column = 0; column < 5; column++) {
        const mixed = Math.imul(code + row * 17 + column * 31, 0x45d9f3b) ^ (code << ((row + column) % 5));
        if (((mixed >>> ((row * 5 + column) % 23)) & 1) === 0) continue;
        rectangles.push(`<rect x="${x + index * scale * 6 + column * scale}" y="${y + row * scale}" width="${scale}" height="${scale}"/>`);
      }
    }
  }
  return `<g fill="#111">${rectangles.join("")}</g>`;
}

const legacyFixtures: BenchmarkFixture[] = [
  {
    id: "01-clear-url",
    file: "fixtures/01-clear-url.png",
    category: "url",
    expectedPayload: "https://scanly.example/clear",
    expectedOutcome: "decode",
    sourceType: "generated",
    license: "project-generated",
  },
  {
    id: "02-clear-text",
    file: "fixtures/02-clear-text.png",
    category: "text",
    expectedPayload: "SCANLY_CLEAR_TEXT",
    expectedOutcome: "decode",
    sourceType: "generated",
    license: "project-generated",
  },
  {
    id: "03-phone-photo",
    file: "fixtures/03-phone-photo.jpg",
    category: "phone_photo",
    expectedPayload: "https://scanly.example/photo",
    expectedOutcome: "decode",
    sourceType: "project-photo",
    license: "project-owned",
  },
  {
    id: "04-screen-capture",
    file: "fixtures/04-screen-capture.png",
    category: "screen_capture",
    expectedPayload: "https://scanly.example/screen",
    expectedOutcome: "decode",
    sourceType: "generated",
    license: "project-generated",
  },
  {
    id: "05-low-contrast",
    file: "fixtures/05-low-contrast.png",
    category: "low_contrast",
    expectedPayload: "https://scanly.example/low-contrast",
    expectedOutcome: "decode",
    sourceType: "generated",
    license: "project-generated",
  },
  {
    id: "06-dark-lighting",
    file: "fixtures/06-dark-lighting.jpg",
    category: "underexposed",
    expectedPayload: "https://scanly.example/dark",
    expectedOutcome: "decode",
    sourceType: "project-photo",
    license: "project-owned",
  },
  {
    id: "07-overexposed",
    file: "fixtures/07-overexposed.jpg",
    category: "overexposed",
    expectedPayload: "https://scanly.example/bright",
    expectedOutcome: "decode",
    sourceType: "project-photo",
    license: "project-owned",
  },
  {
    id: "08-blurry",
    file: "fixtures/08-blurry.jpg",
    category: "blur",
    expectedPayload: "https://scanly.example/blur",
    expectedOutcome: "decode",
    sourceType: "project-photo",
    license: "project-owned",
  },
  {
    id: "09-glare",
    file: "fixtures/09-glare.jpg",
    category: "glare",
    expectedPayload: "https://scanly.example/glare",
    expectedOutcome: "decode",
    sourceType: "project-photo",
    license: "project-owned",
  },
  {
    id: "10-small-in-large",
    file: "fixtures/10-small-in-large.jpg",
    category: "small_in_large",
    expectedPayload: "https://scanly.example/small",
    expectedOutcome: "decode",
    sourceType: "project-photo",
    license: "project-owned",
  },
  {
    id: "11-complex-background",
    file: "fixtures/11-complex-background.jpg",
    category: "complex_background",
    expectedPayload: "https://scanly.example/background",
    expectedOutcome: "decode",
    sourceType: "project-photo",
    license: "project-owned",
  },
  {
    id: "12-rotated",
    file: "fixtures/12-rotated.png",
    category: "rotation",
    expectedPayload: "https://scanly.example/rotated",
    expectedOutcome: "decode",
    sourceType: "generated",
    license: "project-generated",
  },
  {
    id: "13-perspective",
    file: "fixtures/13-perspective.jpg",
    category: "perspective",
    expectedPayload: "https://scanly.example/perspective",
    expectedOutcome: "decode",
    sourceType: "project-photo",
    license: "project-owned",
  },
  {
    id: "14-damaged",
    file: "fixtures/14-damaged.png",
    category: "damaged",
    expectedPayload: "https://scanly.example/damaged",
    expectedOutcome: "decode",
    sourceType: "generated",
    license: "project-generated",
  },
  {
    id: "15-inverted",
    file: "fixtures/15-inverted.png",
    category: "inverted",
    expectedPayload: "https://scanly.example/inverted",
    expectedOutcome: "decode",
    sourceType: "generated",
    license: "project-generated",
  },
  {
    id: "16-multiple-codes",
    file: "fixtures/16-multiple-codes.jpg",
    category: "multiple",
    expectedPayload: "https://scanly.example/primary",
    primaryPayload: "https://scanly.example/primary",
    requiredPayloads: [
      "https://scanly.example/primary",
      "https://scanly.example/secondary",
    ],
    expectedResultCount: 2,
    allowExtraPayloads: true,
    expectedOutcome: "decode",
    sourceType: "project-photo",
    license: "project-owned",
    notes: "Both primary and secondary payloads must appear in decoded results",
  },
];

async function copyLegacy() {
  const files = await fs.promises.readdir(LEGACY_DIR);
  for (const f of files) {
    await fs.promises.copyFile(path.join(LEGACY_DIR, f), path.join(FIXTURES_DIR, f));
  }
}

async function main() {
  await ensureDir(FIXTURES_DIR);
  await fs.promises.rm(path.join(FIXTURES_DIR, "73-dense-noise-background.png"), { force: true });
  await copyLegacy();

  const manifest: BenchmarkFixture[] = [...legacyFixtures];

  // --- Generated clear / payloads ---
  const generated: Array<{
    id: string;
    file: string;
    category: BenchmarkFixture["category"];
    payload: string;
    build: () => Promise<Buffer>;
    expectedOutcome?: "decode" | "no-symbol" | "invalid-input";
    requiredPayloads?: string[];
    requiredInstances?: Array<{ payload: string; count: number }>;
    expectedResultCount?: number;
    profileExpectedResultCount?: Partial<Record<"fast" | "balanced" | "robust", number>>;
    primaryPayload?: string;
    geometryMetadata?: Array<{ payload: string; x: number; y: number; width: number; height: number }>;
  }> = [
    {
      id: "17-clear-url-02",
      file: "fixtures/17-clear-url-02.png",
      category: "url",
      payload: "https://scanly.example/clear-02",
      build: () => qrPng("https://scanly.example/clear-02"),
    },
    {
      id: "18-clear-text-02",
      file: "fixtures/18-clear-text-02.png",
      category: "text",
      payload: "SCANLY_CLEAR_TEXT_02",
      build: () => qrPng("SCANLY_CLEAR_TEXT_02"),
    },
    {
      id: "19-wifi-payload",
      file: "fixtures/19-wifi-payload.png",
      category: "wifi",
      payload: "WIFI:T:WPA;S:ScanlyLab;P:test-pass-01;;",
      build: () => qrPng("WIFI:T:WPA;S:ScanlyLab;P:test-pass-01;;"),
    },
    {
      id: "20-low-contrast-02",
      file: "fixtures/20-low-contrast-02.png",
      category: "low_contrast",
      payload: "SCANLY_LOW_CONTRAST_02",
      build: async () => {
        const qr = await qrPng("SCANLY_LOW_CONTRAST_02", 360, "#9a9a9a", "#c8c8c8");
        return sharp(qr).png().toBuffer();
      },
    },
    {
      id: "21-underexposed-gen",
      file: "fixtures/21-underexposed-gen.png",
      category: "underexposed",
      payload: "SCANLY_UNDEREXPOSED_01",
      build: async () => {
        const qr = await qrPng("SCANLY_UNDEREXPOSED_01", 360);
        return sharp(qr).modulate({ brightness: 0.45 }).png().toBuffer();
      },
    },
    {
      id: "22-overexposed-gen",
      file: "fixtures/22-overexposed-gen.png",
      category: "overexposed",
      payload: "SCANLY_OVEREXPOSED_01",
      build: async () => {
        const qr = await qrPng("SCANLY_OVEREXPOSED_01", 360);
        return sharp(qr).modulate({ brightness: 1.85 }).linear(1.2, 40).png().toBuffer();
      },
    },
    {
      id: "23-blur-gen",
      file: "fixtures/23-blur-gen.png",
      category: "blur",
      payload: "SCANLY_BLUR_01",
      build: async () => {
        const qr = await qrPng("SCANLY_BLUR_01", 400);
        return sharp(qr).blur(1.6).png().toBuffer();
      },
    },
    {
      id: "24-motion-blur",
      file: "fixtures/24-motion-blur.png",
      category: "motion_blur",
      payload: "SCANLY_MOTION_BLUR_01",
      build: async () => {
        const qr = await qrPng("SCANLY_MOTION_BLUR_01", 400);
        // Approximate motion blur: slight stretch + blur
        return sharp(qr)
          .resize(460, 400, { fit: "fill" })
          .blur(1.2)
          .png()
          .toBuffer();
      },
    },
    {
      id: "25-noise",
      file: "fixtures/25-noise.png",
      category: "noise",
      payload: "SCANLY_NOISE_01",
      build: async () => {
        const qr = await qrPng("SCANLY_NOISE_01", 360);
        const meta = await sharp(qr).metadata();
        const w = meta.width ?? 360;
        const h = meta.height ?? 360;
        const noise = noiseBuffer(w, h, 55);
        const noisePng = await sharp(noise, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
        return sharp(qr)
          .composite([{ input: noisePng, blend: "overlay" }])
          .png()
          .toBuffer();
      },
    },
    {
      id: "26-glare-gen",
      file: "fixtures/26-glare-gen.png",
      category: "glare",
      payload: "SCANLY_GLARE_01",
      build: async () => {
        const qr = await qrPng("SCANLY_GLARE_01", 400);
        const glare = await sharp({
          create: {
            width: 400,
            height: 400,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite([
            {
              input: await sharp({
                create: {
                  width: 120,
                  height: 40,
                  channels: 4,
                  background: { r: 255, g: 255, b: 255, alpha: 180 },
                },
              })
                .png()
                .toBuffer(),
              left: 140,
              top: 80,
            },
          ])
          .png()
          .toBuffer();
        return sharp(qr).composite([{ input: glare, blend: "screen" }]).png().toBuffer();
      },
    },
    {
      id: "27-inverted-01",
      file: "fixtures/27-inverted-01.png",
      category: "inverted",
      payload: "SCANLY_INVERTED_01",
      build: () => qrPng("SCANLY_INVERTED_01", 320, "#ffffff", "#000000"),
    },
    {
      id: "28-inverted-02",
      file: "fixtures/28-inverted-02.png",
      category: "inverted",
      payload: "SCANLY_INVERTED_02",
      build: () => qrPng("SCANLY_INVERTED_02", 280, "#f0f0f0", "#111111"),
    },
    {
      id: "29-rot-90",
      file: "fixtures/29-rot-90.png",
      category: "rotation",
      payload: "SCANLY_ROT_90",
      build: async () => sharp(await qrPng("SCANLY_ROT_90", 320)).rotate(90).png().toBuffer(),
    },
    {
      id: "30-rot-180",
      file: "fixtures/30-rot-180.png",
      category: "rotation",
      payload: "SCANLY_ROT_180",
      build: async () => sharp(await qrPng("SCANLY_ROT_180", 320)).rotate(180).png().toBuffer(),
    },
    {
      id: "31-rot-270",
      file: "fixtures/31-rot-270.png",
      category: "rotation",
      payload: "SCANLY_ROT_270",
      build: async () => sharp(await qrPng("SCANLY_ROT_270", 320)).rotate(270).png().toBuffer(),
    },
    {
      id: "32-rot-15",
      file: "fixtures/32-rot-15.png",
      category: "rotation",
      payload: "SCANLY_ROT_15",
      build: async () =>
        sharp(await qrPng("SCANLY_ROT_15", 320))
          .rotate(15, { background: "#ffffff" })
          .png()
          .toBuffer(),
    },
    {
      id: "33-small-in-large-gen",
      file: "fixtures/33-small-in-large-gen.png",
      category: "small_in_large",
      payload: "SCANLY_SMALL_01",
      build: async () => {
        const qr = await qrPng("SCANLY_SMALL_01", 120);
        return sharp({
          create: { width: 1800, height: 1400, channels: 3, background: "#dfe6f2" },
        })
          .composite([{ input: qr, left: 820, top: 620 }])
          .png()
          .toBuffer();
      },
    },
    {
      id: "34-near-edge",
      file: "fixtures/34-near-edge.png",
      category: "near_edge",
      payload: "SCANLY_NEAR_EDGE_01",
      build: async () => {
        const qr = await qrPng("SCANLY_NEAR_EDGE_01", 180);
        return sharp({
          create: { width: 900, height: 700, channels: 3, background: "#ffffff" },
        })
          .composite([{ input: qr, left: 4, top: 4 }])
          .png()
          .toBuffer();
      },
    },
    {
      id: "35-complex-bg-gen",
      file: "fixtures/35-complex-bg-gen.png",
      category: "complex_background",
      payload: "SCANLY_COMPLEX_BG_01",
      build: async () => {
        const qr = await qrPng("SCANLY_COMPLEX_BG_01", 220);
        const tiles: Array<{ input: Buffer; left: number; top: number }> = [];
        for (let i = 0; i < 40; i++) {
          const c = Math.floor(rand() * 200);
          const w = 40 + Math.floor(rand() * 80);
          const h = 40 + Math.floor(rand() * 80);
          const patch = await sharp({
            create: {
              width: w,
              height: h,
              channels: 3,
              background: { r: c, g: (c * 2) % 255, b: (c * 3) % 255 },
            },
          })
            .png()
            .toBuffer();
          tiles.push({
            input: patch,
            left: Math.floor(rand() * 900),
            top: Math.floor(rand() * 700),
          });
        }
        tiles.push({ input: qr, left: 420, top: 280 });
        return sharp({
          create: { width: 1000, height: 800, channels: 3, background: "#8899aa" },
        })
          .composite(tiles)
          .png()
          .toBuffer();
      },
    },
    {
      id: "36-multiple-gen",
      file: "fixtures/36-multiple-gen.png",
      category: "multiple",
      payload: "SCANLY_MULTI_PRIMARY",
      build: async () => {
        const a = await qrPng("SCANLY_MULTI_PRIMARY", 200);
        const b = await qrPng("SCANLY_MULTI_SECONDARY", 200);
        return sharp({
          create: { width: 700, height: 360, channels: 3, background: "#ffffff" },
        })
          .composite([
            { input: a, left: 40, top: 80 },
            { input: b, left: 420, top: 80 },
          ])
          .png()
          .toBuffer();
      },
    },
    {
      id: "37-occlusion",
      file: "fixtures/37-occlusion.png",
      category: "occlusion",
      payload: "SCANLY_OCCLUSION_01",
      build: async () => {
        const qr = await qrPng("SCANLY_OCCLUSION_01", 360);
        const bar = await sharp({
          create: {
            width: 140,
            height: 28,
            channels: 4,
            background: { r: 200, g: 40, b: 40, alpha: 255 },
          },
        })
          .png()
          .toBuffer();
        return sharp(qr).composite([{ input: bar, left: 110, top: 160 }]).png().toBuffer();
      },
    },
    {
      id: "38-damaged-gen",
      file: "fixtures/38-damaged-gen.png",
      category: "damaged",
      payload: "SCANLY_DAMAGED_01",
      build: async () => {
        const qr = await qrPng("SCANLY_DAMAGED_01", 360);
        const scratches: Array<{ input: Buffer; left: number; top: number }> = [];
        for (let i = 0; i < 8; i++) {
          const scratch = await sharp({
            create: {
              width: 12,
              height: 60 + Math.floor(rand() * 40),
              channels: 4,
              background: { r: 255, g: 255, b: 255, alpha: 255 },
            },
          })
            .png()
            .toBuffer();
          scratches.push({
            input: scratch,
            left: 40 + Math.floor(rand() * 280),
            top: 40 + Math.floor(rand() * 240),
          });
        }
        return sharp(qr).composite(scratches).png().toBuffer();
      },
    },
    {
      id: "39-high-res",
      file: "fixtures/39-high-res.png",
      category: "high_resolution",
      payload: "SCANLY_HIRES_01",
      build: async () => {
        const qr = await qrPng("SCANLY_HIRES_01", 480);
        return sharp({
          create: { width: 3200, height: 2400, channels: 3, background: "#f4f4f4" },
        })
          .composite([{ input: qr, left: 1360, top: 960 }])
          .png()
          .toBuffer();
      },
    },
    {
      id: "40-moire",
      file: "fixtures/40-moire.png",
      category: "screen_capture",
      payload: "SCANLY_MOIRE_01",
      build: async () => {
        const qr = await qrPng("SCANLY_MOIRE_01", 360);
        const lines = Buffer.alloc(360 * 360 * 4);
        for (let y = 0; y < 360; y++) {
          for (let x = 0; x < 360; x++) {
            const i = (y * 360 + x) * 4;
            const v = y % 3 === 0 ? 40 : 0;
            lines[i] = lines[i + 1] = lines[i + 2] = v;
            lines[i + 3] = v ? 90 : 0;
          }
        }
        const overlay = await sharp(lines, { raw: { width: 360, height: 360, channels: 4 } }).png().toBuffer();
        return sharp(qr).composite([{ input: overlay, blend: "over" }]).png().toBuffer();
      },
    },
    {
      id: "41-unusual-aspect",
      file: "fixtures/41-unusual-aspect.png",
      category: "unusual_aspect",
      payload: "SCANLY_ASPECT_01",
      build: async () => {
        const qr = await qrPng("SCANLY_ASPECT_01", 200);
        return sharp({
          create: { width: 1400, height: 320, channels: 3, background: "#ffffff" },
        })
          .composite([{ input: qr, left: 600, top: 60 }])
          .png()
          .toBuffer();
      },
    },
    {
      id: "42-colored-bg",
      file: "fixtures/42-colored-bg.png",
      category: "colored_background",
      payload: "SCANLY_COLOR_BG_01",
      build: async () => {
        const qr = await qrPng("SCANLY_COLOR_BG_01", 280, "#1a1a1a", "#ffcc66");
        return sharp({
          create: { width: 600, height: 600, channels: 3, background: "#ffcc66" },
        })
          .composite([{ input: qr, left: 160, top: 160 }])
          .png()
          .toBuffer();
      },
    },
    {
      id: "43-transparent-bg",
      file: "fixtures/43-transparent-bg.png",
      category: "colored_background",
      payload: "SCANLY_TRANSPARENT_01",
      build: async () => {
        // QR with alpha light modules composited on checkerboard substitute (white canvas)
        const qr = await QRCode.toBuffer("SCANLY_TRANSPARENT_01", {
          type: "png",
          width: 280,
          margin: 2,
          errorCorrectionLevel: "H",
          color: { dark: "#000000", light: "#00000000" },
        });
        return sharp({
          create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
        })
          .composite([{ input: qr, left: 60, top: 60 }])
          .png()
          .toBuffer();
      },
    },
    {
      id: "44-clear-url-03",
      file: "fixtures/44-clear-url-03.png",
      category: "clear",
      payload: "https://scanly.example/clear-03",
      build: () => qrPng("https://scanly.example/clear-03", 300),
    },
    {
      id: "45-text-long",
      file: "fixtures/45-text-long.png",
      category: "text",
      payload: "SCANLY_LONG_TEXT_PAYLOAD_ABCDEF_0123456789",
      build: () => qrPng("SCANLY_LONG_TEXT_PAYLOAD_ABCDEF_0123456789", 400),
    },
    {
      id: "46-invert-url",
      file: "fixtures/46-invert-url.png",
      category: "inverted",
      payload: "https://scanly.example/inverted-url",
      build: () => qrPng("https://scanly.example/inverted-url", 320, "#ffffff", "#000000"),
    },
    {
      id: "47-near-edge-bottom",
      file: "fixtures/47-near-edge-bottom.png",
      category: "near_edge",
      payload: "SCANLY_NEAR_EDGE_02",
      build: async () => {
        const qr = await qrPng("SCANLY_NEAR_EDGE_02", 160);
        return sharp({
          create: { width: 800, height: 600, channels: 3, background: "#eef2ff" },
        })
          .composite([{ input: qr, left: 620, top: 430 }])
          .png()
          .toBuffer();
      },
    },
    {
      id: "48-perspective-mild",
      file: "fixtures/48-perspective-mild.png",
      category: "perspective",
      payload: "SCANLY_PERSPECTIVE_01",
      build: async () => {
        // Mild affine skew approximation via resize stretch
        const qr = await qrPng("SCANLY_PERSPECTIVE_01", 320);
        return sharp(qr)
          .resize(380, 300, { fit: "fill" })
          .rotate(8, { background: "#ffffff" })
          .png()
          .toBuffer();
      },
    },
    {
      id: "49-noise-dark",
      file: "fixtures/49-noise-dark.png",
      category: "noise",
      payload: "SCANLY_NOISE_DARK_01",
      build: async () => {
        const qr = await qrPng("SCANLY_NOISE_DARK_01", 340);
        return sharp(qr).modulate({ brightness: 0.7 }).blur(0.5).png().toBuffer();
      },
    },
    {
      id: "50-multiple-three",
      file: "fixtures/50-multiple-three.png",
      category: "multiple",
      payload: "SCANLY_TRI_A",
      build: async () => {
        const a = await qrPng("SCANLY_TRI_A", 150);
        const b = await qrPng("SCANLY_TRI_B", 150);
        const c = await qrPng("SCANLY_TRI_C", 150);
        return sharp({
          create: { width: 700, height: 700, channels: 3, background: "#ffffff" },
        })
          .composite([
            { input: a, left: 40, top: 40 },
            { input: b, left: 480, top: 40 },
            { input: c, left: 260, top: 460 },
          ])
          .png()
          .toBuffer();
      },
    },
    {
      id: "51-gamma-ish",
      file: "fixtures/51-gamma-ish.png",
      category: "low_contrast",
      payload: "SCANLY_GAMMA_01",
      build: async () => {
        const qr = await qrPng("SCANLY_GAMMA_01", 340, "#555555", "#9f9f9f");
        return sharp(qr).gamma(1.8).png().toBuffer();
      },
    },
    {
      id: "52-wifi-02",
      file: "fixtures/52-wifi-02.png",
      category: "wifi",
      payload: "WIFI:T:nopass;S:GuestScanly;P:;;",
      build: () => qrPng("WIFI:T:nopass;S:GuestScanly;P:;;", 320),
    },
    {
      id: "53-negative-blank",
      file: "fixtures/53-negative-blank.png",
      category: "negative",
      payload: "",
      expectedOutcome: "no-symbol",
      build: () => sharp({ create: { width: 480, height: 320, channels: 3, background: "#f7f7f7" } }).png().toBuffer(),
    },
    {
      id: "54-negative-pattern",
      file: "fixtures/54-negative-pattern.png",
      category: "adversarial",
      payload: "",
      expectedOutcome: "no-symbol",
      build: () => sharp(Buffer.from(`<svg width="480" height="320" xmlns="http://www.w3.org/2000/svg"><rect width="480" height="320" fill="white"/><g fill="#111"><rect x="30" y="30" width="70" height="70"/><rect x="45" y="45" width="40" height="40" fill="white"/><rect x="380" y="30" width="70" height="70"/><rect x="395" y="45" width="40" height="40" fill="white"/><path d="M30 150h420v12H30zm0 35h420v8H30zm0 30h420v15H30zm0 45h420v7H30z"/></g></svg>`)).png().toBuffer(),
    },
    {
      id: "55-negative-checker",
      file: "fixtures/55-negative-checker.png",
      category: "adversarial",
      payload: "",
      expectedOutcome: "no-symbol",
      build: () => sharp(Buffer.from(`<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="c" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="8"/><rect x="8" y="8" width="8" height="8"/></pattern></defs><rect width="480" height="480" fill="white"/><rect width="480" height="480" fill="url(#c)"/></svg>`)).png().toBuffer(),
    },
    {
      id: "56-negative-random-noise",
      file: "fixtures/56-negative-random-noise.png",
      category: "adversarial",
      payload: "",
      expectedOutcome: "no-symbol",
      build: () => sharp(noiseBuffer(480, 360, 256), { raw: { width: 480, height: 360, channels: 3 } }).png().toBuffer(),
    },
    {
      id: "57-negative-text-blocks",
      file: "fixtures/57-negative-text-blocks.png",
      category: "negative",
      payload: "",
      expectedOutcome: "no-symbol",
      build: () => sharp(Buffer.from(`<svg width="640" height="420" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="420" fill="white"/>${glyphRunSvg("SCANLY LOCAL ONLY BARCODE CAPTURE", 24, 30)}${glyphRunSvg("0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ", 24, 75)}${glyphRunSvg("HTTPS EXAMPLE INVALID NOT A CODE", 24, 120)}${glyphRunSvg("|||| ||| || ||||| || ||||", 24, 165)}<g fill="#333">${Array.from({ length: 7 }, (_, index) => `<rect x="24" y="${220 + index * 24}" width="${560 - index * 37}" height="9"/>`).join("")}</g></svg>`)).png().toBuffer(),
    },
    {
      id: "58-negative-datamatrix-like",
      file: "fixtures/58-negative-datamatrix-like.png",
      category: "adversarial",
      payload: "",
      expectedOutcome: "no-symbol",
      build: () => sharp(Buffer.from(`<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="400" fill="white"/><g transform="translate(70 70)" fill="#111"><rect width="18" height="270"/><rect y="252" width="270" height="18"/>${Array.from({ length: 13 }, (_, y) => Array.from({ length: 13 }, (_, x) => ((x * 7 + y * 11 + x * y) % 5 < 2 ? `<rect x="${24 + x * 18}" y="${y * 18}" width="14" height="14"/>` : "")).join("")).join("")}</g></svg>`)).png().toBuffer(),
    },
    {
      id: "59-negative-logo",
      file: "fixtures/59-negative-logo.png",
      category: "negative",
      payload: "",
      expectedOutcome: "no-symbol",
      build: () => sharp(Buffer.from(`<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="400" fill="#f6f8ff"/><g transform="translate(170 70)"><circle cx="130" cy="130" r="120" fill="#315efb"/><circle cx="130" cy="130" r="70" fill="#f6f8ff"/><path d="M130 25L230 205H30Z" fill="#111" opacity=".75"/></g>${glyphRunSvg("SCANLY", 228, 330, 4)}</svg>`)).png().toBuffer(),
    },
    {
      id: "60-negative-grid",
      file: "fixtures/60-negative-grid.png",
      category: "adversarial",
      payload: "",
      expectedOutcome: "no-symbol",
      build: () => sharp(Buffer.from(`<svg width="600" height="420" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="420" fill="white"/><g stroke="#111" stroke-width="3">${Array.from({ length: 20 }, (_, index) => `<path d="M${index * 30} 0V420"/><path d="M0 ${index * 22}H600"/>`).join("")}</g></svg>`)).png().toBuffer(),
    },
    {
      id: "61-negative-screenshot",
      file: "fixtures/61-negative-screenshot.png",
      category: "screen_capture",
      payload: "",
      expectedOutcome: "no-symbol",
      build: () => sharp(Buffer.from(`<svg width="900" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="900" height="600" fill="#101522"/><rect x="25" y="25" width="850" height="64" rx="12" fill="#252d40"/><circle cx="60" cy="57" r="12" fill="#ff5f57"/><circle cx="95" cy="57" r="12" fill="#febc2e"/><rect x="45" y="125" width="260" height="430" rx="18" fill="#1d2535"/><rect x="340" y="125" width="515" height="190" rx="18" fill="#1d2535"/><rect x="340" y="345" width="245" height="210" rx="18" fill="#1d2535"/><rect x="610" y="345" width="245" height="210" rx="18" fill="#1d2535"/><g fill="#7f8aa3">${Array.from({ length: 11 }, (_, index) => `<rect x="70" y="${155 + index * 32}" width="${120 + (index % 4) * 24}" height="10" rx="5"/>`).join("")}</g></svg>`)).png().toBuffer(),
    },
    {
      id: "62-negative-linear-barcode-like",
      file: "fixtures/62-negative-linear-barcode-like.png",
      category: "adversarial",
      payload: "",
      expectedOutcome: "no-symbol",
      build: () => sharp(Buffer.from(`<svg width="720" height="360" xmlns="http://www.w3.org/2000/svg"><rect width="720" height="360" fill="white"/><g fill="#111">${Array.from({ length: 80 }, (_, index) => `<rect x="${60 + index * 7}" y="60" width="${1 + ((index * 13) % 5)}" height="220"/>`).join("")}</g>${glyphRunSvg("0123456789012", 250, 300, 3)}</svg>`)).png().toBuffer(),
    },
    {
      id: "63-negative-truncated",
      file: "fixtures/63-negative-truncated.png",
      category: "adversarial",
      payload: "",
      expectedOutcome: "no-symbol",
      build: async () => sharp(await qrPng("SHOULD_NOT_DECODE_TRUNCATED", 360)).extract({ left: 0, top: 0, width: 135, height: 360 }).extend({ right: 225, background: "#ffffff" }).png().toBuffer(),
    },
    {
      id: "64-multiple-five",
      file: "fixtures/64-multiple-five.png",
      category: "multiple",
      payload: "SCANLY_MULTI5_01",
      requiredPayloads: Array.from({ length: 5 }, (_, index) => `SCANLY_MULTI5_${String(index + 1).padStart(2, "0")}`),
      expectedResultCount: 5,
      primaryPayload: "SCANLY_MULTI5_01",
      geometryMetadata: gridGeometry(Array.from({ length: 5 }, (_, index) => `SCANLY_MULTI5_${String(index + 1).padStart(2, "0")}`), 3, 170),
      build: async () => (await multiQrCanvas(Array.from({ length: 5 }, (_, index) => `SCANLY_MULTI5_${String(index + 1).padStart(2, "0")}`), 3, 170)).image,
    },
    {
      id: "65-multiple-eight",
      file: "fixtures/65-multiple-eight.png",
      category: "multiple",
      payload: "SCANLY_MULTI8_01",
      requiredPayloads: Array.from({ length: 8 }, (_, index) => `SCANLY_MULTI8_${String(index + 1).padStart(2, "0")}`),
      expectedResultCount: 8,
      primaryPayload: "SCANLY_MULTI8_01",
      geometryMetadata: gridGeometry(Array.from({ length: 8 }, (_, index) => `SCANLY_MULTI8_${String(index + 1).padStart(2, "0")}`), 4, 160),
      build: async () => (await multiQrCanvas(Array.from({ length: 8 }, (_, index) => `SCANLY_MULTI8_${String(index + 1).padStart(2, "0")}`), 4, 160)).image,
    },
    {
      id: "66-multiple-twelve",
      file: "fixtures/66-multiple-twelve.png",
      category: "multiple",
      payload: "SCANLY_MULTI12_01",
      requiredPayloads: Array.from({ length: 12 }, (_, index) => `SCANLY_MULTI12_${String(index + 1).padStart(2, "0")}`),
      expectedResultCount: 12,
      profileExpectedResultCount: { balanced: 8, robust: 12 },
      primaryPayload: "SCANLY_MULTI12_01",
      geometryMetadata: gridGeometry(Array.from({ length: 12 }, (_, index) => `SCANLY_MULTI12_${String(index + 1).padStart(2, "0")}`), 4, 150),
      build: async () => (await multiQrCanvas(Array.from({ length: 12 }, (_, index) => `SCANLY_MULTI12_${String(index + 1).padStart(2, "0")}`), 4, 150)).image,
    },
    {
      id: "67-multiple-same-two",
      file: "fixtures/67-multiple-same-two.png",
      category: "multiple",
      payload: "SCANLY_SAME_INSTANCE",
      requiredInstances: [{ payload: "SCANLY_SAME_INSTANCE", count: 2 }],
      expectedResultCount: 2,
      primaryPayload: "SCANLY_SAME_INSTANCE",
      geometryMetadata: gridGeometry(["SCANLY_SAME_INSTANCE", "SCANLY_SAME_INSTANCE"], 2, 220),
      build: async () => (await multiQrCanvas(["SCANLY_SAME_INSTANCE", "SCANLY_SAME_INSTANCE"], 2, 220)).image,
    },
    {
      id: "68-multiple-same-three",
      file: "fixtures/68-multiple-same-three.png",
      category: "multiple",
      payload: "SCANLY_SAME_TRIPLE",
      requiredInstances: [{ payload: "SCANLY_SAME_TRIPLE", count: 3 }],
      expectedResultCount: 3,
      primaryPayload: "SCANLY_SAME_TRIPLE",
      geometryMetadata: gridGeometry(["SCANLY_SAME_TRIPLE", "SCANLY_SAME_TRIPLE", "SCANLY_SAME_TRIPLE"], 3, 180),
      build: async () => sharp((await multiQrCanvas(["SCANLY_SAME_TRIPLE", "SCANLY_SAME_TRIPLE", "SCANLY_SAME_TRIPLE"], 3, 180)).image).extend({ bottom: 204, background: "#ffffff" }).png().toBuffer(),
    },
    {
      id: "69-multiple-mixed-size",
      file: "fixtures/69-multiple-mixed-size.png",
      category: "multiple",
      payload: "SCANLY_MIXED_LARGE",
      requiredPayloads: ["SCANLY_MIXED_LARGE", "SCANLY_MIXED_MEDIUM", "SCANLY_MIXED_SMALL"],
      expectedResultCount: 3,
      primaryPayload: "SCANLY_MIXED_LARGE",
      build: async () => sharp({ create: { width: 900, height: 600, channels: 3, background: "#eef1f5" } }).composite([
        { input: await qrPng("SCANLY_MIXED_LARGE", 300), left: 30, top: 30 },
        { input: await qrPng("SCANLY_MIXED_MEDIUM", 210), left: 630, top: 40 },
        { input: await qrPng("SCANLY_MIXED_SMALL", 140), left: 390, top: 420 },
      ]).png().toBuffer(),
    },
    {
      id: "70-version-20",
      file: "fixtures/70-version-20.png",
      category: "high_resolution",
      payload: "SCANLY_VERSION_20_DENSE_VALID_PAYLOAD",
      build: () => versionedQrPng("SCANLY_VERSION_20_DENSE_VALID_PAYLOAD", 20),
    },
    {
      id: "71-version-30",
      file: "fixtures/71-version-30.png",
      category: "high_resolution",
      payload: "SCANLY_VERSION_30_DENSE_VALID_PAYLOAD",
      build: () => versionedQrPng("SCANLY_VERSION_30_DENSE_VALID_PAYLOAD", 30, 900),
    },
    {
      id: "72-version-40",
      file: "fixtures/72-version-40.png",
      category: "high_resolution",
      payload: "SCANLY_VERSION_40_DENSE_VALID_PAYLOAD",
      build: () => versionedQrPng("SCANLY_VERSION_40_DENSE_VALID_PAYLOAD", 40, 1080),
    },
    {
      id: "73-dense-checker-background",
      file: "fixtures/73-dense-checker-background.png",
      category: "complex_background",
      payload: "SCANLY_DENSE_CHECKER_POSITIVE",
      build: async () => sharp(Buffer.from(`<svg width="1000" height="700" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="c" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#20242c"/><rect x="6" y="6" width="6" height="6" fill="#20242c"/><rect x="6" width="6" height="6" fill="#dce2ec"/><rect y="6" width="6" height="6" fill="#dce2ec"/></pattern></defs><rect width="1000" height="700" fill="url(#c)"/></svg>`)).composite([{ input: await qrPng("SCANLY_DENSE_CHECKER_POSITIVE", 460), left: 270, top: 120 }]).png().toBuffer(),
    },
    {
      id: "74-zxing-contribution-blur",
      file: "fixtures/74-zxing-contribution-blur.png",
      category: "blur",
      payload: "ZXING_UNIQUE_3_2_L",
      build: async () => sharp(await QRCode.toBuffer("ZXING_UNIQUE_3_2_L", { type: "png", version: 3, margin: 2, errorCorrectionLevel: "L", width: 128 })).blur(1).png().toBuffer(),
    },
  ];

  for (const g of generated) {
    const buf = await g.build();
    await writeFixture(path.basename(g.file), buf);
    const entry: BenchmarkFixture = {
      id: g.id,
      file: g.file,
      category: g.category,
      expectedPayload: g.payload,
      expectedOutcome: g.expectedOutcome ?? "decode",
      sourceType: "generated",
      license: "project-generated",
    };
    if (g.requiredPayloads) entry.requiredPayloads = g.requiredPayloads;
    if (g.requiredInstances) entry.requiredInstances = g.requiredInstances;
    if (g.expectedResultCount) entry.expectedResultCount = g.expectedResultCount;
    if (g.profileExpectedResultCount) entry.profileExpectedResultCount = g.profileExpectedResultCount;
    if (g.primaryPayload) entry.primaryPayload = g.primaryPayload;
    if (g.geometryMetadata) entry.geometryMetadata = g.geometryMetadata;
    if (g.requiredPayloads || g.requiredInstances) {
      entry.allowExtraPayloads = false;
      entry.primaryResultRule = "top-to-bottom-left-to-right";
    }
    if (g.id === "36-multiple-gen") {
      entry.primaryPayload = "SCANLY_MULTI_PRIMARY";
      entry.requiredPayloads = ["SCANLY_MULTI_PRIMARY", "SCANLY_MULTI_SECONDARY"];
      entry.expectedResultCount = 2;
      entry.allowExtraPayloads = true;
      entry.notes = "Both SCANLY_MULTI_PRIMARY and SCANLY_MULTI_SECONDARY required";
    }
    if (g.id === "50-multiple-three") {
      entry.primaryPayload = "SCANLY_TRI_A";
      entry.requiredPayloads = ["SCANLY_TRI_A", "SCANLY_TRI_B", "SCANLY_TRI_C"];
      entry.expectedResultCount = 3;
      entry.allowExtraPayloads = true;
      entry.notes = "All three TRI payloads required";
    }
    manifest.push(entry);
  }

  for (const fixture of manifest) {
    if (fixture.sourceType === "generated") {
      fixture.generatedSeed = SEED;
      fixture.transformMetadata =
        `Deterministic ${fixture.category} transform defined in scripts/generate-fixtures.ts`;
    }
  }

  // checksum stamp
  const hash = crypto.createHash("sha256").update(SEED.toString()).digest("hex").slice(0, 12);
  const manifestPath = path.join(FIXTURES_DIR, "manifest.json");
  await writeTextIfChanged(
    manifestPath,
    JSON.stringify(
      {
        seed: SEED,
        generatorVersion: 3,
        stamp: hash,
        fixtures: manifest,
      },
      null,
      2
    )
  );

  console.log(`Generated ${manifest.length} fixtures (seed=${SEED}) → ${manifestPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
