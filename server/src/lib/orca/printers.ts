import fs from "node:fs/promises";
import path from "node:path";
import { orcaValue } from "./userProfiles";

export interface OrcaPrinter {
  /** The preset name exactly as OrcaSlicer stores it (spacing included). */
  name: string;
  inherits: string | null;
  nozzleDiameter: number | null;
}

/**
 * The user's printer presets (user/default/machine/*.json). Read from the
 * files' "name" field rather than file names, since that's what
 * compatible_printers must match.
 */
export async function listUserPrinters(userDir: string): Promise<OrcaPrinter[]> {
  const dir = path.join(userDir, "machine");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  const out: OrcaPrinter[] = [];
  for (const f of files) {
    try {
      const json = JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as Record<string, unknown>;
      const name = typeof json.name === "string" && json.name ? json.name : path.basename(f, ".json");
      const inherits = typeof json.inherits === "string" && json.inherits ? json.inherits : null;
      // A preset that doesn't override nozzle_diameter inherits it; the name ("… 0.4 nozzle") says which.
      const own = Number(orcaValue(json.nozzle_diameter));
      const fromName = `${name} ${inherits ?? ""}`.match(/(\d+(?:\.\d+)?)\s*(?:mm\s*)?nozzle/i);
      out.push({ name, inherits, nozzleDiameter: Number.isFinite(own) && own > 0 ? own : fromName ? Number(fromName[1]) : null });
    } catch {
      // Skip unreadable presets rather than failing the whole list.
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
