import { type DecodeOutcome, type DecodePipelineOptions } from "@scanly/core/qr";
export declare function decodeUploadedFile(file: File, options?: DecodePipelineOptions): Promise<DecodeOutcome>;
/** Cancel any in-flight worker decode (browser upload mode). */
export declare function cancelUploadedDecode(): Promise<void>;
/** Terminate the singleton worker when the upload UI unmounts. */
export declare function disposeUploadedDecodeWorker(): Promise<void>;
//# sourceMappingURL=decode-upload.d.ts.map