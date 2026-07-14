import type { BenchmarkFixture } from "../qr/benchmark-types";

export interface FixtureEvaluation {
  pass: boolean;
  missingPayloads: string[];
  unexpectedPayloads: string[];
}

export function expectedPayloads(fixture: BenchmarkFixture): string[] {
  return Array.isArray(fixture.expectedPayload)
    ? fixture.expectedPayload
    : [fixture.expectedPayload];
}

export function requiredPayloads(fixture: BenchmarkFixture): string[] {
  return fixture.requiredPayloads?.length
    ? fixture.requiredPayloads
    : expectedPayloads(fixture);
}

export function evaluateFixture(
  fixture: BenchmarkFixture,
  payloads: string[],
  decoded: boolean
): FixtureEvaluation {
  if (fixture.expectedOutcome === "fail") {
    return { pass: !decoded || payloads.length === 0, missingPayloads: [], unexpectedPayloads: [] };
  }

  const required = requiredPayloads(fixture);
  if (!decoded || payloads.length === 0) {
    return { pass: false, missingPayloads: required, unexpectedPayloads: [] };
  }

  if (fixture.requiredPayloads?.length) {
    const missing = required.filter((payload) => !payloads.includes(payload));
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
