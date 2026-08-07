import { describe, expect, it } from "vitest";
import { REALTIME_SEQUENCE_SCENARIOS } from "../../benchmark/realtime/sequence-fixtures";
describe("Realtime benchmark contract", () => it("requires deterministic sequence scenarios", () => { expect(REALTIME_SEQUENCE_SCENARIOS.length).toBeGreaterThanOrEqual(20); }));
it("contains the required twenty named scenarios", () => { expect(REALTIME_SEQUENCE_SCENARIOS).toHaveLength(20); expect(new Set(REALTIME_SEQUENCE_SCENARIOS.map((scenario) => scenario.id)).size).toBe(20); });
