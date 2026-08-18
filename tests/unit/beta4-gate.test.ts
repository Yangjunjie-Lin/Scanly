import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const statusPath = path.join(root, "device-evidence", "status.json");

const runGate = (mode: "integration" | "release"): string =>
  execFileSync(process.execPath, ["--import", "tsx", "scripts/verify-beta4-gate.ts", `--mode=${mode}`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

describe.sequential("Beta 4 integration and release gates", () => {
  it("accepts honest RC deferral for the Device Evidence integration component", () => {
    expect(runGate("integration")).toContain("BETA4_DEVICE_INTEGRATION_GO");
  });

  it("keeps release fail-closed while physical evidence and matrix rows are absent", () => {
    expect(() => runGate("release")).toThrow(/BETA4_RELEASE_NO_GO/);
  });

  it("rejects tampered derived counts before either gate is evaluated", () => {
    const original = fs.readFileSync(statusPath, "utf8");
    try {
      const status = JSON.parse(original);
      status.physicalMobileDeviceCount = 1;
      fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
      expect(() => runGate("integration")).toThrow();
      expect(() => runGate("release")).toThrow();
    } finally {
      fs.writeFileSync(statusPath, original);
    }
  });
});
