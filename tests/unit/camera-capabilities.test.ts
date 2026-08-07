import { describe, expect, it } from "vitest";
import { CameraCapabilityController } from "../../packages/browser/src/scanner/camera-capabilities";
describe("CameraCapabilityController contract", () => it("returns typed unsupported capability", async () => { const controller = new CameraCapabilityController(() => undefined); const result = await controller.setTorch(true); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("unsupported_browser_capability"); }));
it("does not oscillate auto zoom during its cooldown", async () => {
  const applyConstraints = async () => undefined;
  const track = { getCapabilities: () => ({ zoom: { min: 1, max: 4, step: 0.1 } }), getSettings: () => ({ zoom: 1 }), applyConstraints } as unknown as MediaStreamTrack;
  const controller = new CameraCapabilityController(() => track, { enabled: true, cooldownMs: 1_000, maximumZoomDelta: 0.5 });
  const geometry = { cornerPoints: [], boundingBox: { x: 0, y: 0, width: 1, height: 1 } };
  expect((await controller.considerAutoZoom(geometry, { width: 100, height: 100 }, 0))?.ok).toBe(true);
  expect(await controller.considerAutoZoom(geometry, { width: 100, height: 100 }, 1)).toBeUndefined();
});
