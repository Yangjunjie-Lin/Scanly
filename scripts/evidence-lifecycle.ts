export type EvidenceLifecycleState =
  | "source-development"
  | "baseline-candidate"
  | "evidence-bootstrap"
  | "active-baseline"
  | "release";

export interface EvidenceLifecycleContext {
  sdkVersion: string;
  canonical?: {
    sdkVersion: string;
    evidenceId: string;
    manifestHash: string;
    sourceCompatible: boolean;
  };
  activeEvidence?: {
    evidenceId?: string;
    canonicalManifestHash?: string;
  };
}

const TRANSITIONS: Record<EvidenceLifecycleState, readonly EvidenceLifecycleState[]> = {
  "source-development": ["source-development", "baseline-candidate"],
  "baseline-candidate": ["baseline-candidate", "evidence-bootstrap", "source-development"],
  "evidence-bootstrap": ["evidence-bootstrap", "active-baseline", "source-development"],
  "active-baseline": ["active-baseline", "release", "source-development"],
  release: ["release", "source-development"],
};

export function canTransitionEvidenceLifecycle(from: EvidenceLifecycleState, to: EvidenceLifecycleState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertEvidenceLifecycleTransition(from: EvidenceLifecycleState, to: EvidenceLifecycleState): void {
  if (!canTransitionEvidenceLifecycle(from, to)) throw new Error(`Invalid evidence lifecycle transition: ${from} -> ${to}.`);
}

export function selectEvidenceLifecycle(context: EvidenceLifecycleContext): EvidenceLifecycleState {
  const canonical = context.canonical;
  if (!canonical || canonical.sdkVersion !== context.sdkVersion) return "source-development";

  const activeClaimsCanonical = context.activeEvidence?.evidenceId === canonical.evidenceId;
  if (activeClaimsCanonical) return "active-baseline";
  if (!canonical.sourceCompatible) return "source-development";
  return "evidence-bootstrap";
}

export function benchmarkLifecycleState(state: EvidenceLifecycleState): "baseline-candidate" | "active-baseline" {
  return state === "active-baseline" || state === "release" ? "active-baseline" : "baseline-candidate";
}
