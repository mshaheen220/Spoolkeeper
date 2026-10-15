import path from "node:path";

const root = path.resolve(__dirname, "..");

export const config = {
  port: Number(process.env.PORT ?? 3000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5175",
  // Where the SQLite database (and, later, profile backups) live. A volume
  // in Docker so inventory survives image rebuilds.
  dataDir: process.env.DATA_DIR ?? path.join(root, "..", "data"),
  // OrcaSlicer's user preset folder (the one holding filament/, machine/,
  // process/). Bind-mounted read-only into the container for the import.
  orcaUserDir:
    process.env.ORCA_USER_DIR ??
    path.join(process.env.HOME ?? "", "Library", "Application Support", "OrcaSlicer", "user", "default"),
  // Outbound enrichment fetches: be a polite, identifiable client.
  fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS ?? 15_000),
  userAgent: "Spoolkeeper (+https://github.com/mshaheen220/Spoolkeeper)",
  paths: {
    clientDist: path.join(root, "..", "client", "dist"),
  },
} as const;
