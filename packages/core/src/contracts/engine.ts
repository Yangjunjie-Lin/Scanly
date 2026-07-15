import type { BarcodeFormat } from "@scanly/scenario-schema";
import type { NormalizedFrame } from "./frame.js";
import type { CornerPoint } from "./result.js";

export interface EngineCapabilities {
  formats: BarcodeFormat[];
  supportsMultiple: boolean;
  returnsRawBytes: boolean;
  returnsCornerPoints: boolean;
  threadSafe: boolean;
}
export type EngineFailureCategory = "not-found" | "unsupported-format" | "invalid-input" | "initialization" | "execution" | "cancelled" | "timeout";
export interface EngineDecodeResult {
  text: string;
  rawBytes?: Uint8Array;
  format: BarcodeFormat;
  cornerPoints?: CornerPoint[];
  orientation?: number;
  symbologyIdentifier?: string;
  elapsedMs: number;
}
export type EngineOutcome =
  | { ok: true; results: [EngineDecodeResult, ...EngineDecodeResult[]] }
  | { ok: false; category: EngineFailureCategory; message: string; elapsedMs: number };
export interface EngineDecodeOptions { formats: BarcodeFormat[]; findMultiple: boolean; signal?: AbortSignal }
export interface DecoderEngine {
  readonly id: string;
  readonly version: string;
  readonly capabilities: EngineCapabilities;
  initialize?(): Promise<void>;
  decode(frame: NormalizedFrame, options: EngineDecodeOptions): Promise<EngineOutcome>;
  dispose?(): void | Promise<void>;
}
