import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

interface SourceFixture {
  id: string;
  file: string;
  format: string;
  expectedPayload: string;
  expectedResultCount?: number;
  requiredResults?: Array<{ format: string; payload: string }>;
}

interface SelectedFixture extends SourceFixture {
  sourceManifest: string;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const outputDirectory = path.join(root, "fixtures", "native");
  const alpha5Manifest = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "alpha5", "manifest.json"), "utf8")) as { fixtures: SourceFixture[] };
  const requested = ["data-matrix-01", "pdf417-01", "code-128-01", "ean-13-01", "ean-8-01", "upc-a-01", "upc-e-01", "mixed-01"];
  const selected: SelectedFixture[] = requested.map((id) => {
    const fixture = alpha5Manifest.fixtures.find((entry) => entry.id === id);
    if (!fixture) throw new Error(`Missing native parity source fixture ${id}.`);
    return { ...fixture, sourceManifest: "fixtures/alpha5/manifest.json" };
  });
  selected.push({ id: "qr-code-01", file: "fixtures/02-clear-text.png", format: "qr_code", expectedPayload: "SCANLY_CLEAR_TEXT", sourceManifest: "fixtures/manifest.json" });

  fs.mkdirSync(outputDirectory, { recursive: true });
  const entries = [];
  for (const fixture of selected) {
    const image = sharp(path.join(root, fixture.file)).greyscale();
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    const file = `${fixture.id}.y8`;
    fs.writeFileSync(path.join(outputDirectory, file), data);
    entries.push({
      id: fixture.id,
      file: `fixtures/native/${file}`,
      sourceFile: fixture.file,
      sourceManifest: fixture.sourceManifest,
      format: fixture.format,
      payload: fixture.expectedPayload,
      expectedResultCount: fixture.expectedResultCount ?? 1,
      requiredResults: fixture.requiredResults ?? [{ format: fixture.format, payload: fixture.expectedPayload }],
      width: info.width,
      height: info.height,
      rowStride: info.width,
      pixelStride: 1,
      coordinateSpace: "original-input-top-left-origin",
    });
  }

  fs.writeFileSync(path.join(outputDirectory, "manifest.json"), `${JSON.stringify({
    schemaVersion: "beta5-native-fixtures-1",
    generatedFrom: "fixtures/alpha5/manifest.json",
    cornerOrder: "top-left-top-right-bottom-right-bottom-left",
    geometryTolerancePixels: 2,
    fixtures: entries,
  }, null, 2)}\n`);
  console.log(`Generated ${entries.length} deterministic native Y8 fixtures.`);
}

void main();
