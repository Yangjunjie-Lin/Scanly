import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));

describe("Beta 4 device evidence contracts", () => {
  it("keeps Ground Truth fixed before scan and covers every physical protocol target", () => {
    const truth = read("device-lab/test-targets/ground-truth.json");
    const protocol = read("device-lab/manifest.json");
    expect(truth).toMatchObject({ schemaVersion: "beta4-ground-truth-1", createdBeforeScanning: true, decoderGeneratedGroundTruth: false });
    expect(truth.targets).toHaveLength(16); expect(new Set(truth.targets.map((target: any) => target.targetId)).size).toBe(16);
    expect(protocol.scenarios.map((scenario: any) => scenario.id)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "N1"]);
    expect(protocol.scenarios.find((scenario: any) => scenario.id === "P9").expectedPhysicalTargetCount).toBe(4);
    expect(protocol.scenarios.find((scenario: any) => scenario.id === "P10").requiredResultFields).toContain("physicalInstanceId");
  });

  it("rejects a fabricated physical-mobile record without hardware metadata", () => {
    const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv); const validate = ajv.compile(read("device-evidence/schema.json"));
    const fabricated = {
      schemaVersion: "beta4-physical-device-evidence-1", sourceCommit: "0".repeat(40), sourceTree: "0".repeat(40), sdkVersion: "2.0.0-beta.4", evidenceId: "fabricated-physical",
      evidenceType: "physical-mobile", repositoryDirty: false, sensitiveDataReviewed: false, rightsReviewed: false,
      session: { sessionId: "fake-session", startedAt: new Date(0).toISOString(), endedAt: new Date(1).toISOString(), testerId: "ci", hardwareAccess: "simulated" },
      device: { operatingSystem: "spoofed" }, browser: { name: "spoofed", version: "1", userAgent: "spoofed user agent" },
      camera: { settings: {}, capabilities: {}, constraints: {} }, scenarios: [], fieldSources: {},
      networkIsolation: { tested: false, scannerContinuedAfterNetworkDisabled: "not-tested", barcodePixelsUploaded: false, barcodePayloadUploaded: false },
    };
    expect(validate(fabricated)).toBe(false);
  });

  it("verifies the current honest empty matrix and deterministic target bytes", () => {
    expect(() => execFileSync(process.execPath, ["--import", "tsx", "scripts/verify-device-evidence.ts"], { cwd: root, stdio: "pipe" })).not.toThrow();
    expect(() => execFileSync(process.execPath, ["--import", "tsx", "scripts/generate-device-test-targets.ts", "--verify"], { cwd: root, stdio: "pipe" })).not.toThrow();
    expect(read("device-evidence/status.json")).toMatchObject({ matrixStatus: "DEVICE_MATRIX_PARTIAL", physicalValidationStatus: "PHYSICAL_DEVICE_VALIDATION_PENDING", physicalMobileSessionCount: 0 });
  }, 30_000);

  it("keeps Device Lab free of network decode and analytics code paths", () => {
    const source = fs.readFileSync(path.join(root, "apps/web-demo/components/DeviceLab.tsx"), "utf8");
    for (const forbidden of ["fetch(", "XMLHttpRequest", "sendBeacon", "external decode API", "barcode cloud service"]) expect(source).not.toContain(forbidden);
    expect(source).toContain("barcodePixelsUploaded: false"); expect(source).toContain("barcodePayloadUploaded: false");
  });
});
