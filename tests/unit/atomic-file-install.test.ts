import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installFilesAtomically } from "../../scripts/atomic-file-install.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("atomic canonical evidence installation", () => {
  it("rolls every destination back when an install fails", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-atomic-"));
    roots.push(root);
    const first = path.join(root, "first.json");
    const second = path.join(root, "second.csv");
    fs.writeFileSync(first, "old-first");
    fs.writeFileSync(second, "old-second");

    expect(() => installFilesAtomically(
      [[first, "new-first"], [second, "new-second"]],
      { beforeInstall: (_destination, index) => { if (index === 1) throw new Error("simulated failure"); } },
    )).toThrow("simulated failure");

    expect(fs.readFileSync(first, "utf8")).toBe("old-first");
    expect(fs.readFileSync(second, "utf8")).toBe("old-second");
    expect(fs.readdirSync(root).sort()).toEqual(["first.json", "second.csv"]);
  });
});
