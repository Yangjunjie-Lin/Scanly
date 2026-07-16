import type { BenchmarkFixture } from "./types.js";

export interface FixtureEvaluation {
  pass: boolean;
  missingPayloads: string[];
  unexpectedPayloads: string[];
}

export function expectedPayloads(fixture: BenchmarkFixture): string[] {
  return (Array.isArray(fixture.expectedPayload)
    ? fixture.expectedPayload
    : [fixture.expectedPayload]).filter((payload) => payload.length > 0);
}

export function requiredPayloads(fixture: BenchmarkFixture): string[] {
  if (fixture.requiredInstances?.length) return fixture.requiredInstances.flatMap((entry) => Array.from({ length: entry.count }, () => entry.payload));
  return fixture.requiredPayloads?.length
    ? fixture.requiredPayloads
    : expectedPayloads(fixture);
}

export function requiredPayloadsForProfile(fixture: BenchmarkFixture, profile: "fast" | "balanced" | "robust"): string[] {
  const required = requiredPayloads(fixture);
  const count = fixture.profileExpectedResultCount?.[profile];
  if (count === undefined) return required;
  if (!Number.isInteger(count) || count < 1 || count > required.length) {
    throw new RangeError(`Fixture '${fixture.id}' has invalid ${profile} profileExpectedResultCount ${String(count)} for ${required.length} required payload(s).`);
  }
  return required.slice(0, count);
}

export function evaluateFixture(
  fixture: BenchmarkFixture,
  payloads: string[],
  actual: boolean | { ok: boolean; errorCode?: string }
): FixtureEvaluation {
  const decoded = typeof actual === "boolean" ? actual : actual.ok;
  const errorCode = typeof actual === "boolean" ? undefined : actual.errorCode;
  if (fixture.expectedOutcome !== "decode") {
    const allowed = fixture.allowedFailureCodes?.length
      ? fixture.allowedFailureCodes
      : fixture.expectedOutcome === "no-symbol" ? ["no_symbol_found"] : ["invalid_image"];
    return { pass: !decoded && payloads.length === 0 && errorCode !== undefined && allowed.includes(errorCode as never), missingPayloads: [], unexpectedPayloads: [] };
  }

  const required = requiredPayloads(fixture);
  if (!decoded || payloads.length === 0) {
    return { pass: false, missingPayloads: required, unexpectedPayloads: [] };
  }

  if (fixture.requiredPayloads?.length || fixture.requiredInstances?.length) {
    const remaining = [...payloads];
    const missing = required.filter((payload) => {
      const index = remaining.indexOf(payload);
      if (index < 0) return true;
      remaining.splice(index, 1);
      return false;
    });
    const allowed = new Set([...required, ...expectedPayloads(fixture)]);
    const unexpected = fixture.allowExtraPayloads === false
      ? payloads.filter((payload) => !allowed.has(payload))
      : [];
    return {
      pass: missing.length === 0 && unexpected.length === 0,
      missingPayloads: missing,
      unexpectedPayloads: unexpected,
    };
  }

  const expected = expectedPayloads(fixture);
  const exact = payloads.length === 1 && expected.includes(payloads[0]);
  return {
    pass: exact,
    missingPayloads: exact ? [] : expected.filter((payload) => !payloads.includes(payload)),
    unexpectedPayloads: payloads.filter((payload) => !expected.includes(payload)),
  };
}
