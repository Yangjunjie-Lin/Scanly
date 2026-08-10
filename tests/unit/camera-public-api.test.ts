import { describe, expect, it } from "vitest";
import {
  DeterministicFrameSequenceSource,
  FrameQualityAnalyzer,
  FrameScheduler,
  MediaStreamCameraFrameSource,
  ScannerSession,
  type CameraCapabilities,
  type CameraFrameSource,
  type CapabilityResult,
  type RepeatPolicy,
  type ScanEvent,
  type ScannerDiagnostic,
  type ScannerHint,
  type ScannerSessionOptions,
  type ScannerSessionState,
  type ScannerSessionStatistics,
} from "@scanly/browser";

type RequiredBrowserScannerTypes = {
  options: ScannerSessionOptions;
  statistics: ScannerSessionStatistics;
  state: ScannerSessionState;
  source: CameraFrameSource;
  repeatPolicy: RepeatPolicy;
  event: ScanEvent;
  diagnostic: ScannerDiagnostic;
  hint: ScannerHint;
  capabilities: CameraCapabilities;
  capabilityResult: CapabilityResult<boolean>;
};

describe("@scanly/browser real-time public API", () => {
  it("exports every required runtime value from the package root", () => {
    expect([
      ScannerSession,
      MediaStreamCameraFrameSource,
      DeterministicFrameSequenceSource,
      FrameScheduler,
      FrameQualityAnalyzer,
    ].every((value) => typeof value === "function")).toBe(true);
  });

  it("exports every required runtime contract from the package root", () => {
    const compileTimeContract: RequiredBrowserScannerTypes | undefined = undefined;
    expect(compileTimeContract).toBeUndefined();
  });
});
