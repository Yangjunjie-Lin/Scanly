import { createUrlSafetyAnalyzer, createUrlSafetyHandler, GoogleWebRiskProvider, VirusTotalProvider } from "@scanly/url-safety/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// No NEXT_PUBLIC secrets. LLM integration is a server-owned transport extension;
// see docs/url-safety.md. No hosted Scanly service is required.
const analyzer = createUrlSafetyAnalyzer({
  reputationProviders: [
    ...(process.env.SCANLY_WEB_RISK_API_KEY ? [new GoogleWebRiskProvider(process.env.SCANLY_WEB_RISK_API_KEY)] : []),
    ...(process.env.SCANLY_VIRUSTOTAL_API_KEY ? [new VirusTotalProvider(process.env.SCANLY_VIRUSTOTAL_API_KEY)] : []),
  ],
});
export const POST = createUrlSafetyHandler({
  analyzer,
  ...(process.env.SCANLY_URL_SAFETY_ORIGIN ? { allowedOrigins: [process.env.SCANLY_URL_SAFETY_ORIGIN] } : {}),
  allowedModes: process.env.SCANLY_URL_SAFETY_ENABLED === "true" ? ["local-only", "reputation-only", "remote", "ai-assisted"] : ["local-only"],
});
