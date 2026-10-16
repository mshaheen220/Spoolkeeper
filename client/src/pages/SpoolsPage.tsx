import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { fetchSpools } from "../api/inventory";
import { Swatch } from "../components/Swatch";
import { useAsync } from "../hooks/useAsync";
import { colorFamilies, colorSortKey, FAMILIES, FAMILY_SWATCH, type ColorFamily } from "../lib/colorFamily";
import { finishForLine } from "../lib/productFields";
import type { Spool } from "../types";

type SortKey = "color" | "brand" | "material" | "finish" | "id";

const STANDARD_DIAMETER = 1.75;

/**
 * "PLA", "PLA+", "PLA · High Speed". A line that just repeats the finish
 * ("Transparent" on a Translucent filament) is left to the Finish column -
 * but only when the finish is actually set, so it never disappears entirely.
 */
function materialLabel(s: Spool): string {
  const { material, line } = s.product;
  const lineFinish = finishForLine(line);
  if (!line || (lineFinish && finishesOf(s).includes(lineFinish))) return material;
  return line.toUpperCase().includes(material.toUpperCase()) ? line : `${material} · ${line}`;
}

const finishesOf = (s: Spool): string[] => s.product.finishes ?? [];
const finishLabel = (s: Spool) => finishesOf(s).join(", ") || null;

const COMPARE: Record<SortKey, (a: Spool, b: Spool) => number> = {
  color: (a, b) => colorSortKey(a.product) - colorSortKey(b.product),
  brand: (a, b) => a.product.vendor.name.localeCompare(b.product.vendor.name, undefined, { sensitivity: "base" }),
  material: (a, b) => materialLabel(a).localeCompare(materialLabel(b)),
  finish: (a, b) => (finishLabel(a) ?? "~").localeCompare(finishLabel(b) ?? "~"), // unset finishes sort last
  id: (a, b) => a.id - b.id,
};

/** A toggleable filter chip; aria-pressed carries its state. */
function Chip({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs capitalize ${
        active ? "border-accent-500 bg-accent-500/15 text-ink-50" : "border-ink-700 text-ink-300 hover:border-ink-500"
      }`}
    >
      {children}
    </button>
  );
}

function SortHeader({
  k,
  sort,
  desc,
  onSort,
  children,
  className = "",
}: {
  k: SortKey;
  sort: SortKey;
  desc: boolean;
  onSort: (k: SortKey) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <th scope="col" aria-sort={sort === k ? (desc ? "descending" : "ascending") : "none"} className={`px-2 py-2 text-left font-medium ${className}`}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-ink-100">
        {children}
        <span aria-hidden className={sort === k ? "text-accent-400" : "text-ink-600"}>
          {sort === k ? (desc ? "▾" : "▴") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function SpoolsPage() {
  const [params, setParams] = useSearchParams();
  const showArchived = params.get("archived") === "1";
  const { data: spools, error, isLoading } = useAsync(() => fetchSpools(showArchived), [showArchived]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filters and sort live in the URL so the back button and refresh keep them.
  const q = params.get("q") ?? "";
  const material = params.get("material") ?? "";
  const finish = params.get("finish") ?? "";
  const color = (params.get("color") ?? "") as ColorFamily | "";
  const brand = params.get("brand") ?? "";
  const sort = (params.get("sort") as SortKey) || "brand";
  const desc = params.get("dir") === "desc";

  const update = (fn: (p: URLSearchParams) => void) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        fn(next);
        return next;
      },
      { replace: true },
    );
  const setParam = (key: string, value: string) => update((p) => (value ? p.set(key, value) : p.delete(key)));
  const toggle = (key: string, value: string, current: string) => setParam(key, current === value ? "" : value);
  const sortBy = (key: SortKey) =>
    update((p) => {
      const same = (p.get("sort") || "brand") === key;
      p.set("sort", key);
      if (same && p.get("dir") !== "desc") p.set("dir", "desc");
      else p.delete("dir");
    });
  const clearAll = () => update((p) => ["q", "material", "finish", "color", "brand"].forEach((k) => p.delete(k)));

  const all = useMemo(() => spools ?? [], [spools]);
  const options = useMemo(
    () => ({
      materials: [...new Set(all.map((s) => s.product.material))].sort(),
      finishes: [...new Set(all.flatMap(finishesOf))].sort(),
      colors: FAMILIES.filter((f) => all.some((s) => colorFamilies(s.product).includes(f))),
      brands: [...new Set(all.map((s) => s.product.vendor.name))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    }),
    [all],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = all.filter(
      (s) =>
        (!material || s.product.material === material) &&
        (!finish || finishesOf(s).includes(finish)) &&
        (!color || colorFamilies(s.product).includes(color)) &&
        (!brand || s.product.vendor.name === brand) &&
        (!needle || `${s.product.displayName} #${s.id} ${s.store ?? ""} ${finishesOf(s).join(" ")}`.toLowerCase().includes(needle)),
    );
    // Stable tie-breaks: brand, then material, then color, so equal keys still read in a sensible order.
    const tie = (a: Spool, b: Spool) => COMPARE.brand(a, b) || COMPARE.material(a, b) || COMPARE.color(a, b) || a.id - b.id;
    return list.sort((a, b) => (desc ? -1 : 1) * COMPARE[sort](a, b) || tie(a, b));
  }, [all, q, material, finish, color, brand, sort, desc]);

  const activeCount = [material, finish, color, brand].filter(Boolean).length;
  const headerProps = { sort, desc, onSort: sortBy };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Spools</h1>
        <div className="flex gap-2">
          <Link to="/import" className="btn" title="Import from OrcaSlicer">
            <span aria-hidden>⇣</span> Import
          </Link>
          <Link to="/spools/new" className="btn-primary">
            <span aria-hidden>＋</span> Add spool
          </Link>
        </div>
      </div>

      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search spools</span>
          <input type="search" className="field" placeholder="Search brand, color, #ID…" value={q} onChange={(e) => setParam("q", e.target.value)} />
        </label>
        <button type="button" className="btn shrink-0" aria-expanded={filtersOpen} aria-controls="spool-filters" onClick={() => setFiltersOpen((o) => !o)}>
          Filters{activeCount ? ` (${activeCount})` : ""}
        </button>
      </div>

      {filtersOpen && (
        <div id="spool-filters" className="card space-y-3 p-3">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold tracking-wide text-ink-400 uppercase">Material</p>
            <div className="flex flex-wrap gap-1.5">
              {options.materials.map((m) => (
                <Chip key={m} active={material === m} onClick={() => toggle("material", m, material)}>
                  <span className="normal-case">{m}</span>
                </Chip>
              ))}
            </div>
          </div>
          {options.finishes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold tracking-wide text-ink-400 uppercase">Finish</p>
              <div className="flex flex-wrap gap-1.5">
                {options.finishes.map((f) => (
                  <Chip key={f} active={finish === f} onClick={() => toggle("finish", f, finish)}>
                    <span className="normal-case">{f}</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold tracking-wide text-ink-400 uppercase">Color</p>
            <div className="flex flex-wrap gap-1.5">
              {options.colors.map((c) => (
                <Chip key={c} active={color === c} onClick={() => toggle("color", c, color)} label={`${c} filaments`}>
                  <span aria-hidden className="h-3.5 w-3.5 rounded-full border border-ink-600" style={{ background: FAMILY_SWATCH[c] }} />
                  {c}
                </Chip>
              ))}
            </div>
          </div>
          <label className="block space-y-1.5">
            <span className="block text-xs font-semibold tracking-wide text-ink-400 uppercase">Brand</span>
            <select className="field" value={brand} onChange={(e) => setParam("brand", e.target.value)}>
              <option value="">All brands</option>
              {options.brands.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-400">
              <input type="checkbox" checked={showArchived} onChange={(e) => setParam("archived", e.target.checked ? "1" : "")} />
              Include archived (empty) spools
            </label>
            {activeCount > 0 && (
              <button type="button" className="text-sm text-accent-400 underline" onClick={clearAll}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

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

      {all.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-ink-400" aria-live="polite">
              {shown.length === all.length ? `${all.length} spools` : `${shown.length} of ${all.length} spools`}
            </p>
            {shown.length > 0 && (
              <Link to={`/labels?ids=${shown.map((s) => s.id).join(",")}`} className="text-xs text-accent-400 underline">
                🏷 Print {shown.length === 1 ? "label" : `${shown.length} labels`}
              </Link>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border border-ink-800">
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">Spools, sortable by column</caption>
              <thead className="bg-ink-900 text-xs text-ink-400">
                <tr>
                  <SortHeader k="color" {...headerProps} className="w-[44%] pl-3 sm:w-[34%]">
                    Color
                  </SortHeader>
                  <SortHeader k="brand" {...headerProps} className="w-[28%] sm:w-[20%]">
                    Brand
                  </SortHeader>
                  <SortHeader k="material" {...headerProps} className="w-[28%] sm:w-[20%]">
                    Material
                  </SortHeader>
                  <SortHeader k="finish" {...headerProps} className="hidden sm:table-cell sm:w-[16%]">
                    Finish
                  </SortHeader>
                  <SortHeader k="id" {...headerProps} className="hidden pr-3 sm:table-cell sm:w-[10%]">
                    #
                  </SortHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {shown.map((s) => {
                  const p = s.product;
                  const odd = p.diameterMm != null && p.diameterMm !== STANDARD_DIAMETER;
                  return (
                    <tr key={s.id} className="bg-ink-900/40 hover:bg-ink-900">
                      <td className="py-2.5 pr-2 pl-3">
                        <Link to={`/spools/${s.id}`} className="flex min-w-0 items-center gap-2.5">
                          <Swatch hex={p.colorHex} hexes={p.colorHexes} direction={p.multiColorDirection} size={30} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{p.colorName ?? "—"}</span>
                            {/* On phones, finish and #ID move under the color instead of their own columns. */}
                            <span className="block truncate text-xs text-ink-400 sm:hidden">
                              {[finishLabel(s), `#${s.id}`, odd ? `${p.diameterMm} mm` : null, s.archived ? "archived" : null].filter(Boolean).join(" · ")}
                            </span>
                            {(odd || s.archived) && (
                              <span className="hidden truncate text-xs text-ink-400 sm:block">
                                {[odd ? `${p.diameterMm} mm` : null, s.archived ? "archived" : null].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </span>
                        </Link>
                      </td>
                      <td className="truncate px-2 py-2.5 text-ink-200">{p.vendor.name}</td>
                      <td className="truncate px-2 py-2.5 text-ink-200">{materialLabel(s)}</td>
                      <td className="hidden truncate px-2 py-2.5 text-ink-300 sm:table-cell" title={finishLabel(s) ?? undefined}>{finishLabel(s) ?? ""}</td>
                      <td className="hidden py-2.5 pr-3 pl-2 font-mono text-xs text-ink-400 sm:table-cell">#{s.id}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && (
              <p className="p-4 text-sm text-ink-400">
                No spools match.{" "}
                <button type="button" className="text-accent-400 underline" onClick={clearAll}>
                  Clear filters
                </button>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
