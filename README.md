# Spoolkeeper (developer guide)

New-filament intake, per-spool calibration, and non-destructive OrcaSlicer profile publishing. Spoolkeeper keeps its own spool inventory (SQLite) and is the source of truth for tuned values. It does **not** depend on a Spoolman server.

How to use the app: see [USER_GUIDE.md](USER_GUIDE.md).

## Quick start

```bash
# Docker, production build  → http://localhost:8003
docker compose up --build -d

# Docker, hot reload        → http://localhost:5175 (API on :8003)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Or natively (Node 24)     → http://localhost:5175
npm install
npm run dev
```

From a phone on the same Wi-Fi, open `http://<this-mac's-LAN-IP>:8003`.

| Script | What it does |
|---|---|
| `npm run dev` | Express (tsx watch, :3003) + Vite (:5175, proxies `/api`) |
| `npm run build` | Vite client build + `tsc` server build |
| `npm start` | Run the built server (serves `client/dist` too) |
| `npm run typecheck` / `npm run lint` | Both workspaces |
| `npm test` | vitest over `server/src/**/*.test.ts` and `client/src/**/*.test.ts` |

## Architecture

```
client/   React 19 + TypeScript + Tailwind 4 (Vite)
server/   Express + TypeScript, better-sqlite3
data/     spoolkeeper.db (git-ignored; mounted at /data in Docker)
```

- **Runs locally on the Mac** in Docker so it can reach OrcaSlicer's user folder (`~/Library/Application Support/OrcaSlicer/user/default`, mounted read-only at `/orca`).
- **Ports:** 8003 (prod) and 5175 (Vite dev), chosen to avoid the other workshop apps (3000, 8001, 8002, 8181, …).

## Conventions

Shared with the other workshop apps (GripTab, chocolate-mold-factory, svg-stacker):

- **Version.** `vite.config.ts` reads the **root** `package.json` and injects `__APP_VERSION__`, which the header shows. Bump the root version on every change: patch for fixes, minor for features.
- **Theme.** Day / night / system switcher (`client/src/hooks/useTheme.ts`), persisted under localStorage key `theme`. A pre-paint script in `index.html` prevents a flash. Colors come from a mirrored `ink-*` ramp in `index.css`, so components never need per-theme variants.
- **Commits.** Small and logical, with a clear message and a version bump.
