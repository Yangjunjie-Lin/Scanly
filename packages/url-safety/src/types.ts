export type UrlRiskLevel = "safe" | "low" | "medium" | "high" | "critical" | "unknown";
export type Confidence = "low" | "medium" | "high";
export type UrlSafetyPrivacyMode = "local-only" | "reputation-only" | "remote" | "ai-assisted";
export type UrlSafetyStatus = "idle" | "queued" | "analyzing" | "complete" | "partial" | "failed" | "cancelled";
export type UrlSafetyRecommendation = "open" | "open_with_caution" | "do_not_open" | "do_not_enter_credentials" | "verify_domain" | "contact_organization_directly" | "recheck_later";
export interface LocalUrlRiskSignal {
  id: string;
  severity: "info" | "low" | "medium" | "high";
  description: string;
  /** Sanitized evidence only. Never include query values or embedded credentials. */
  evidence: string;
}
export interface NormalizedUrl {
  normalizedUrl: string;
  asciiHostname: string;
  unicodeHostname: string;
}
export interface LocalUrlRiskAnalysis extends NormalizedUrl {
  signals: LocalUrlRiskSignal[];
  remoteAllowed: boolean;
}
export interface UrlRiskReason {
  id: string;
  source: "local" | "reputation" | "remote" | "ai" | "policy";
  authority: 1 | 2 | 3 | 4 | 5;
  description: string;
}
export type ThreatType = "MALWARE" | "SOCIAL_ENGINEERING" | "UNWANTED_SOFTWARE";
export interface UrlReputationResult {
  provider: string;
  status: "match" | "no_match" | "unavailable" | "not_configured";
  threats: ThreatType[];
  operation: "lookup" | "submission";
}
export interface ReputationAnalysis {
  status: "complete" | "partial" | "unavailable" | "not_configured";
  results: UrlReputationResult[];
}
export interface RemotePageMetadata {
  title: string;
  description: string;
  canonicalHostname?: string;
  visibleTextSample: string;
  formCount: number;
  passwordInput: boolean;
  externalFormActions: string[];
  iframeCount: number;
  scriptSourceDomains: string[];
  linkTargetDomains: string[];
  faviconHostname?: string;
  language?: string;
}
export interface RemoteInspectionResult {
  status: "complete" | "blocked" | "unavailable";
  /** Error identifiers only; transport errors may contain credentials or URLs. */
  reason?: string;
  finalUrl?: string;
  redirectChain: string[];
  statusCode?: number;
  contentType?: string;
  bytesRead: number;
  /** Whether at least one destination request was attempted (DNS-only blocks are false). */
  requestMade?: boolean;
  page?: RemotePageMetadata;
}
export interface AiRiskAnalysis {
  classification: "benign" | "suspicious" | "phishing" | "malware" | "scam" | "credential-theft" | "unknown";
  /** Advisory contribution, 0–20 points, never the final score. */
  riskContribution: number;
  confidence: Confidence;
  reasons: string[];
  brandImpersonation?: { suspected: boolean; claimedBrand?: string; observedDomain?: string };
  provider?: string;
  model?: string;
  latencyMs?: number;
}
export interface UrlRiskEvidence {
  urlFeatures: { url: string; asciiHostname: string; unicodeHostname: string; signals: LocalUrlRiskSignal[] };
  reputationSignals: UrlReputationResult[];
  remotePageMetadata?: Omit<RemotePageMetadata, "visibleTextSample">;
  visibleTextExcerpt: string;
}
export interface LlmSafetyProvider {
  analyze(evidence: UrlRiskEvidence, options?: { signal?: AbortSignal }): Promise<AiRiskAnalysis>;
}
export interface UrlReputationProvider {
  id: string;
  /** False avoids even invoking an unconfigured adapter. */
  readonly configured?: boolean;
  /** Both supplied adapters require the full fragment-free URL; explicit opt-in is mandatory. */
  fullUrlRequired?: boolean;
  lookup(url: URL, options?: { signal?: AbortSignal }): Promise<UrlReputationResult>;
}
export interface UrlSafetyAnalysis {
  /** Display URLs are redacted. Cache identity uses the private normalized input. */
  url: string;
  normalizedUrl: string;
  riskLevel: UrlRiskLevel;
  /** Heuristic/composite risk score, NOT a probability. */
  riskScore: number;
  verdictReason: string;
  confidence: Confidence;
  status: "complete" | "partial";
  checkedAt: string;
  local: LocalUrlRiskAnalysis;
  reputation?: ReputationAnalysis;
  remote?: RemoteInspectionResult;
  ai?: AiRiskAnalysis;
  aiStatus?: "complete" | "unavailable" | "not_configured";
  reasons: UrlRiskReason[];
  recommendations: UrlSafetyRecommendation[];
  privacy: { remoteAnalysisUsed: boolean; fullUrlShared: boolean; pageContentSharedWithLlm: boolean };
}
export interface AnalyzeOptions {
  /** Omitted means local-only. Each network mode is an explicit opt-in. */
  mode?: UrlSafetyPrivacyMode;
  signal?: AbortSignal;
}
export interface UrlSafetyAnalyzer {
  analyze(url: string, options?: AnalyzeOptions): Promise<UrlSafetyAnalysis>;
}
