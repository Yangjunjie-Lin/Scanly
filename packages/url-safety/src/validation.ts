import Ajv from "ajv";
import type { AiRiskAnalysis, UrlSafetyAnalysis } from "./types.js";

const confidence = { type: "string", enum: ["low", "medium", "high"] };
const text = { type: "string", maxLength: 20_000 };
const shortText = { type: "string", maxLength: 512 };
const strings = { type: "array", items: shortText, maxItems: 64 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
export const AI_RISK_SCHEMA = object({
  classification: { enum: ["benign", "suspicious", "phishing", "malware", "scam", "credential-theft", "unknown"] },
  riskContribution: { type: "number", minimum: 0, maximum: 20 }, confidence,
  reasons: { type: "array", items: shortText, minItems: 1, maxItems: 8 },
  brandImpersonation: object({ suspected: { type: "boolean" }, claimedBrand: shortText, observedDomain: shortText }, ["suspected"]),
}, ["classification", "riskContribution", "confidence", "reasons"]);
const ajv = new Ajv({ allErrors: false, strict: true });
const aiValidator = ajv.compile<AiRiskAnalysis>(AI_RISK_SCHEMA);
export function validateAi(value: unknown): AiRiskAnalysis {
  if (!aiValidator(value)) throw new Error("ai_invalid_structured_output");
  return value as AiRiskAnalysis;
}
const signalSchema = object({ id: shortText, severity: { enum: ["info", "low", "medium", "high"] }, description: shortText, evidence: shortText });
const reputationResult = object({ provider: shortText, status: { enum: ["match", "no_match", "unavailable", "not_configured"] }, threats: { type: "array", maxItems: 3, uniqueItems: true, items: { enum: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"] } }, operation: { enum: ["lookup", "submission"] } });
const reputationValidator = ajv.compile<import("./types.js").UrlReputationResult>(reputationResult);
export function validateReputation(value: unknown) {
  if (!reputationValidator(value)) throw new Error("reputation_invalid_output");
  const result = value as import("./types.js").UrlReputationResult;
  if ((result.status === "match") !== (result.threats.length > 0)) throw new Error("reputation_inconsistent_output");
  return result;
}
const page = object({ title: shortText, description: shortText, canonicalHostname: shortText, visibleTextSample: text, formCount: { type: "integer", minimum: 0 }, passwordInput: { type: "boolean" }, externalFormActions: strings, iframeCount: { type: "integer", minimum: 0 }, scriptSourceDomains: strings, linkTargetDomains: strings, faviconHostname: shortText, language: shortText }, ["title", "description", "visibleTextSample", "formCount", "passwordInput", "externalFormActions", "iframeCount", "scriptSourceDomains", "linkTargetDomains"]);
const analysisValidator = ajv.compile<UrlSafetyAnalysis>(object({
  url: text, normalizedUrl: text, riskLevel: { enum: ["low", "medium", "high", "critical", "unknown"] }, riskScore: { type: "integer", minimum: 0, maximum: 100 }, verdictReason: shortText, confidence,
  status: { enum: ["complete", "partial"] }, checkedAt: shortText,
  local: object({ normalizedUrl: text, asciiHostname: shortText, unicodeHostname: shortText, signals: { type: "array", items: signalSchema, maxItems: 64 }, remoteAllowed: { type: "boolean" } }),
  reputation: object({ status: { enum: ["complete", "partial", "unavailable", "not_configured"] }, results: { type: "array", items: reputationResult, maxItems: 16 } }),
  remote: object({ status: { enum: ["complete", "blocked", "unavailable"] }, reason: shortText, finalUrl: text, redirectChain: { type: "array", items: text, maxItems: 4 }, statusCode: { type: "integer", minimum: 100, maximum: 599 }, contentType: shortText, bytesRead: { type: "integer", minimum: 0, maximum: 1_048_576 }, requestMade: { type: "boolean" }, page }, ["status", "redirectChain", "bytesRead"]),
  ai: { ...AI_RISK_SCHEMA, properties: { ...AI_RISK_SCHEMA.properties, provider: shortText, model: shortText, latencyMs: { type: "number", minimum: 0 } } },
  aiStatus: { enum: ["complete", "unavailable", "not_configured"] },
  reasons: { type: "array", maxItems: 128, items: object({ id: shortText, source: { enum: ["local", "reputation", "remote", "ai", "policy"] }, authority: { type: "integer", minimum: 1, maximum: 5 }, description: shortText }) },
  recommendations: { type: "array", maxItems: 8, items: { enum: ["open", "open_with_caution", "do_not_open", "do_not_enter_credentials", "verify_domain", "contact_organization_directly", "recheck_later"] } },
  privacy: object({ remoteAnalysisUsed: { type: "boolean" }, fullUrlShared: { type: "boolean" }, pageContentSharedWithLlm: { type: "boolean" } }),
}, ["url", "normalizedUrl", "riskLevel", "riskScore", "verdictReason", "confidence", "status", "checkedAt", "local", "reasons", "recommendations", "privacy"]));
export function validateAnalysis(value: unknown): UrlSafetyAnalysis {
  if (!analysisValidator(value)) throw new Error("url_safety_invalid_response");
  return value as UrlSafetyAnalysis;
}
export async function readJsonBounded(response: Response, maxBytes = 65_536, signal?: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty_response");
  const chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("response_size_limit");
      chunks.push(value);
    }
    if (signal?.aborted) throw new Error("response_cancelled");
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { signal?.removeEventListener("abort", cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
