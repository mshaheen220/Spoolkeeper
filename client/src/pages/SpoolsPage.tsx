import { useMemo, useState } from "react";
import { Link } from "react-router";
import { fetchSpools } from "../api/inventory";
import { Swatch } from "../components/Swatch";
import { useAsync } from "../hooks/useAsync";
import { range } from "../lib/format";

export function SpoolsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: spools, error, isLoading } = useAsync(() => fetchSpools(showArchived), [showArchived]);
  const [query, setQuery] = useState("");
  const [material, setMaterial] = useState("");

  const materials = useMemo(() => [...new Set((spools ?? []).map((s) => s.product.material))].sort(), [spools]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (spools ?? []).filter(
      (s) =>
        (!material || s.product.material === material) &&
        (!q || `${s.product.displayName} #${s.id} ${s.store ?? ""}`.toLowerCase().includes(q)),
    );
  }, [spools, query, material]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Spools</h1>
        <Link to="/spools/new" className="btn-primary">
          <span aria-hidden>＋</span> Add spool
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="min-w-0 flex-1 basis-48">
          <span className="sr-only">Search spools</span>
          <input
            type="search"
            className="field"
            placeholder="Search brand, color, #ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Filter by material</span>
          <select className="field w-auto" value={material} onChange={(e) => setMaterial(e.target.value)}>
            <option value="">All materials</option>
            {materials.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-300 day:text-rose-800">
          {error}
        </p>
      )}
      {isLoading && <p className="text-sm text-ink-400">Loading…</p>}

      {spools && spools.length === 0 && !showArchived && (
        <div className="card space-y-2 text-sm text-ink-300">
          <p>No spools yet.</p>
          <p>
            <Link to="/spools/new" className="text-accent-400 underline">
              Add your first spool
            </Link>{" "}
            or{" "}
            <Link to="/import" className="text-accent-400 underline">
              import your existing OrcaSlicer filament profiles
            </Link>
            .
          </p>
        </div>
      )}

      <ul className="divide-y divide-ink-800 overflow-hidden rounded-lg border border-ink-800" aria-label="Spools">
        {filtered.map((s) => {
          const p = s.product;
          return (
            <li key={s.id}>
              <Link to={`/spools/${s.id}`} className="flex items-center gap-3 bg-ink-900/40 px-3 py-3 hover:bg-ink-900">
                <Swatch hex={p.colorHex} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.displayName}</p>
                  <p className="truncate text-xs text-ink-400">
                    {[range(p.nozzleMin, p.nozzleMax, "°C"), p.diameterMm ? `${p.diameterMm} mm` : null, s.store]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs text-ink-300">#{s.id}</span>
                {s.archived && <span className="text-[11px] text-ink-500">archived</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      <label className="flex items-center gap-2 text-sm text-ink-400">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Show archived (empty) spools
      </label>
    </div>
  );
}
