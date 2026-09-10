import { redactUrl } from "./local.js";
import type { AiRiskAnalysis, LocalUrlRiskAnalysis, RemoteInspectionResult, ReputationAnalysis, UrlRiskReason, UrlSafetyAnalysis } from "./types.js";

export class UrlRiskEngine {
  aggregate(local: LocalUrlRiskAnalysis, evidence: {
    reputation?: ReputationAnalysis; remote?: RemoteInspectionResult; ai?: AiRiskAnalysis;
    aiStatus?: UrlSafetyAnalysis["aiStatus"]; partial?: boolean; networkRequested?: boolean;
    privacy?: UrlSafetyAnalysis["privacy"];
  } = {}): UrlSafetyAnalysis {
    const reasons: UrlRiskReason[] = local.signals.map((signal) => ({ id: signal.id, source: "local", authority: signal.id === "private_network_target" || signal.id === "embedded_credentials" ? 2 : 4, description: signal.description }));
    const weights = { info: 0, low: 4, medium: 12, high: 25 };
    let score = Math.min(45, local.signals.reduce((sum, signal) => sum + weights[signal.severity], 0));
    let floor = 0;
    for (const result of evidence.reputation?.results ?? []) {
      if (result.status !== "match") continue;
      for (const threat of result.threats) {
        floor = Math.max(floor, threat === "MALWARE" ? 85 : threat === "SOCIAL_ENGINEERING" ? 70 : 40);
        reasons.push({ id: `reputation_${threat.toLowerCase()}`, source: "reputation", authority: 1, description: `Threat intelligence reports ${threat.toLowerCase().replaceAll("_", " ")}.` });
      }
    }
    const page = evidence.remote?.page;
    if (page?.passwordInput) { score += 12; reasons.push({ id: "password_form", source: "remote", authority: 3, description: "Page contains a password input; verify the site's identity before entering credentials." }); }
    if (page?.externalFormActions.length) { score += 12; reasons.push({ id: "external_form_action", source: "remote", authority: 3, description: "A form submits to a different hostname." }); }
    if (evidence.remote?.status === "blocked") { reasons.push({ id: evidence.remote.reason ?? "remote_blocked", source: "policy", authority: 2, description: "Remote inspection was blocked by the network safety policy." }); }
    if (evidence.ai) {
      score += Number.isFinite(evidence.ai.riskContribution) ? Math.min(20, Math.max(0, evidence.ai.riskContribution)) : 0;
      reasons.push({ id: "ai_advisory", source: "ai", authority: 5, description: `AI advisory classification: ${evidence.ai.classification}. AI is not a safety authority.` });
    }
    score = Math.round(Math.min(100, Math.max(floor, score)));
    const corroborated = evidence.reputation?.results.some((result) => result.status === "match" || result.status === "no_match") || evidence.remote?.status === "complete";
    const unknown = score === 0 && (!corroborated || evidence.partial);
    const level = unknown ? "unknown" : score >= 70 ? "critical" : score >= 40 ? "high" : score >= 20 ? "medium" : "low";
    return {
      url: redactUrl(local.normalizedUrl), normalizedUrl: redactUrl(local.normalizedUrl),
      riskLevel: level, riskScore: score,
      verdictReason: unknown ? "Insufficient evidence to assess the destination." : score < 20 ? "Low observed risk; no verdict guarantees safety." : "Observed risk indicators require caution; this score is not a probability.",
      confidence: floor ? "high" : corroborated ? "medium" : "low", status: evidence.partial ? "partial" : "complete",
      checkedAt: new Date().toISOString(), local: { ...local, normalizedUrl: redactUrl(local.normalizedUrl) },
      reputation: evidence.reputation, remote: evidence.remote, ai: evidence.ai, aiStatus: evidence.aiStatus, reasons,
      recommendations: level === "high" || level === "critical" ? ["do_not_open", "do_not_enter_credentials", "contact_organization_directly"] : level === "unknown" ? ["verify_domain", "recheck_later"] : ["open_with_caution", "verify_domain"],
      privacy: evidence.privacy ?? { remoteAnalysisUsed: false, fullUrlShared: false, pageContentSharedWithLlm: false },
    };
  }
}
