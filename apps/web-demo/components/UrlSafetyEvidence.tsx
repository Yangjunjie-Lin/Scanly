"use client";
import type { UrlSafetyPrivacyMode, UrlSafetyState } from "@scanly/url-safety";

export function UrlSafetyEvidence({ mode, onMode, state }: { mode: "disabled" | UrlSafetyPrivacyMode; onMode: (mode: "disabled" | UrlSafetyPrivacyMode) => void; state: UrlSafetyState }) {
  const analysis = state.analysis;
  const highRisk = analysis?.riskLevel === "high" || analysis?.riskLevel === "critical";
  return <section aria-label="URL Safety Analysis" style={{ marginTop: 16 }} data-testid="url-safety-panel">
    <label htmlFor="url-safety-mode">URL Safety Analysis (optional)</label>{" "}
    <select id="url-safety-mode" value={mode} onChange={(event) => onMode(event.target.value as typeof mode)}>
      <option value="disabled">Disabled — scanning stays local</option>
      <option value="local-only">Local URL checks — no network</option>
      <option value="reputation-only">Threat intelligence — share URL with providers</option>
      <option value="remote">Remote inspection + threat intelligence — share URL</option>
      <option value="ai-assisted">AI-assisted — also share sanitized page evidence</option>
    </select>
    <p className="small">Barcode images and camera frames never leave this device. Network modes require a configured self-hosted server. URL queries may contain secrets; enabling a network mode shares the decoded URL with the indicated services.</p>
    {mode !== "disabled" && <div role={highRisk ? "alert" : "status"} aria-live="polite" data-testid="url-safety-status" style={highRisk ? { border: "2px solid #e57373", padding: 12, borderRadius: 8, background: "#6e202044" } : undefined}>
      <strong>{analysis ? `${analysis.riskLevel.toUpperCase()} — ${analysis.riskScore}/100` : state.status.toUpperCase()}</strong>
      {highRisk && <p>High-risk indicators detected. Do not open this destination or enter credentials; contact the organization directly.</p>}
      <p className="small">{analysis?.verdictReason ?? (state.status === "failed" ? "Safety analysis unavailable. The barcode result is unaffected." : "URL intelligence is independent of barcode decoding.")} Heuristic risk score, not a probability. No verdict guarantees a URL is safe.</p>
    </div>}
    {analysis && mode !== "disabled" && <>
      <p className="mono" style={{ overflowWrap: "anywhere" }}>{analysis.normalizedUrl}</p>
      <p>Domain: {analysis.local.unicodeHostname} {analysis.local.unicodeHostname !== analysis.local.asciiHostname && `(${analysis.local.asciiHostname})`}</p>
      <ul className="small">
        <li>Local URL checks: {analysis.local.signals.length} signals</li>
        <li>Threat intelligence: {analysis.reputation?.status ?? "not requested"} (no match does not mean known safe)</li>
        <li>Remote page inspection: {analysis.remote?.status ?? "not requested"}</li>
        <li>AI analysis: {analysis.aiStatus ?? "not requested"} — advisory only</li>
      </ul>
      {analysis.reasons.map((reason, index) => <p className="small" key={`${reason.id}-${index}`}>{reason.description}</p>)}
      <p className="small">Guidance: {analysis.recommendations.map((item) => item.replaceAll("_", " ")).join("; ")}</p>
    </>}
  </section>;
}
