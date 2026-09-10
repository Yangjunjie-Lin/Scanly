import type { AiRiskAnalysis, LocalUrlRiskAnalysis, RemoteInspectionResult, ReputationAnalysis, UrlSafetyAnalysis } from "./types.js";
export declare class UrlRiskEngine {
    aggregate(local: LocalUrlRiskAnalysis, evidence?: {
        reputation?: ReputationAnalysis;
        remote?: RemoteInspectionResult;
        ai?: AiRiskAnalysis;
        aiStatus?: UrlSafetyAnalysis["aiStatus"];
        partial?: boolean;
        networkRequested?: boolean;
        privacy?: UrlSafetyAnalysis["privacy"];
    }): UrlSafetyAnalysis;
}
//# sourceMappingURL=risk-engine.d.ts.map