import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const directory = path.join(root, "device-evidence", "sessions");
const evidence = fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort().map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")));
const quantile = (values: number[], q: number): number | null => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * q) - 1)] : null;

const devices = evidence.map((session) => {
  const tested = session.scenarios.filter((scenario: any) => scenario.status !== "not-tested" && scenario.status !== "unavailable");
  const values = (key: string): number[] => tested.map((scenario: any) => scenario[key]).filter(Number.isFinite);
  return {
    evidenceId: session.evidenceId,
    evidenceType: session.evidenceType,
    device: session.device,
    browser: session.browser,
    scenarioCount: tested.length,
    passedScenarios: tested.filter((scenario: any) => scenario.status === "passed").length,
    failedScenarios: tested.filter((scenario: any) => scenario.status === "failed").length,
    falseConfirmedScans: tested.reduce((sum: number, scenario: any) => sum + scenario.falseConfirmedScans, 0),
    ttfd: { p50Ms: quantile(values("ttfdMs"), 0.5), p95Ms: quantile(values("ttfdMs"), 0.95) },
    ttfc: { p50Ms: quantile(values("ttfcMs"), 0.5), p95Ms: quantile(values("ttfcMs"), 0.95) },
    tracking: {
      identitySwitches: tested.reduce((sum: number, scenario: any) => sum + (scenario.identitySwitches ?? 0), 0),
      fragmentation: tested.reduce((sum: number, scenario: any) => sum + (scenario.fragmentation ?? 0), 0),
      falseTracks: tested.reduce((sum: number, scenario: any) => sum + (scenario.falseTracks ?? 0), 0),
    },
    batch: tested.filter((scenario: any) => scenario.scenarioId === "P12").map((scenario: any) => ({ expected: scenario.expectedCount, confirmed: scenario.confirmedCount, status: scenario.status })),
    cameraRecovery: tested.reduce((sum: number, scenario: any) => sum + (scenario.cameraRecoveryCount ?? 0), 0),
    longRun: session.longRun ?? null,
  };
});

const report = {
  schemaVersion: "beta4-device-benchmark-1",
  matrixStatus: devices.some((entry) => ["physical-mobile", "remote-physical-device"].includes(entry.evidenceType)) ? "PHYSICAL_VALIDATION_STARTED" : "PHYSICAL_DEVICE_VALIDATION_PENDING",
  counts: {
    devices: devices.length,
    browsers: new Set(devices.map((entry) => `${entry.browser.name} ${entry.browser.version}`)).size,
    scenarios: devices.reduce((sum, entry) => sum + entry.scenarioCount, 0),
  },
  aggregationPolicy: "per-device-only-no-cross-device-performance-average",
  devices,
};
const output = path.join(root, "benchmark-results", "device", "device-evidence-summary.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
