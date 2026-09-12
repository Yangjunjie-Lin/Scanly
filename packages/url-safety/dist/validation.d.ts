import type { AiRiskAnalysis, UrlSafetyAnalysis } from "./types.js";
export declare const AI_RISK_SCHEMA: {
    type: string;
    additionalProperties: boolean;
    properties: Record<string, unknown>;
    required: string[];
};
export declare function validateAi(value: unknown): AiRiskAnalysis;
export declare function validateReputation(value: unknown): import("./types.js").UrlReputationResult;
export declare function validateAnalysis(value: unknown): UrlSafetyAnalysis;
export declare function readJsonBounded(response: Response, maxBytes?: number, signal?: AbortSignal): Promise<unknown>;
//# sourceMappingURL=validation.d.ts.map