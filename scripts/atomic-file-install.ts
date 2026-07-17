import fs from "node:fs";
import path from "node:path";

export interface AtomicInstallHooks {
  beforeInstall?: (destination: string, index: number) => void;
}

export function installFilesAtomically(
  destinations: ReadonlyArray<readonly [string, Buffer | string]>,
  hooks: AtomicInstallHooks = {},
): void {
  const staged: Array<{ destination: string; temporary: string; backup: string; existed: boolean }> = [];
  try {
    for (const [destination, contents] of destinations) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const suffix = `${process.pid}.${staged.length}`;
      const temporary = `${destination}.${suffix}.tmp`;
      const backup = `${destination}.${suffix}.bak`;
      fs.writeFileSync(temporary, contents, { flag: "wx" });
      staged.push({ destination, temporary, backup, existed: fs.existsSync(destination) });
    }
  } catch (error) {
    for (const entry of staged) if (fs.existsSync(entry.temporary)) fs.rmSync(entry.temporary);
    throw error;
  }

  const installed: typeof staged = [];
  try {
    for (const [index, entry] of staged.entries()) {
      hooks.beforeInstall?.(entry.destination, index);
      if (entry.existed) fs.renameSync(entry.destination, entry.backup);
      try {
        fs.renameSync(entry.temporary, entry.destination);
      } catch (error) {
        if (entry.existed && fs.existsSync(entry.backup)) fs.renameSync(entry.backup, entry.destination);
        throw error;
      }
      installed.push(entry);
    }
    for (const entry of staged) if (entry.existed) fs.rmSync(entry.backup);
  } catch (error) {
    for (const entry of installed.reverse()) {
      if (fs.existsSync(entry.destination)) fs.rmSync(entry.destination);
      if (entry.existed && fs.existsSync(entry.backup)) fs.renameSync(entry.backup, entry.destination);
    }
    for (const entry of staged) {
      if (fs.existsSync(entry.temporary)) fs.rmSync(entry.temporary);
      if (fs.existsSync(entry.backup) && !fs.existsSync(entry.destination)) fs.renameSync(entry.backup, entry.destination);
    }
    throw error;
  }
}
