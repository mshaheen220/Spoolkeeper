import { useMemo, useState } from "react";
import { Link } from "react-router";
import { previewOrcaImport, runOrcaImport, type ImportChoice } from "../api/orcaImport";
import { Swatch } from "../components/Swatch";
import { useAsync } from "../hooks/useAsync";

interface Draft extends ImportChoice {
  selected: boolean;
}

const identityKey = (d: Pick<Draft, "vendor" | "material" | "line" | "colorName">) =>
  [d.vendor, d.material, d.line ?? "", d.colorName ?? ""].map((s) => s.trim().toLowerCase()).join("|");

/** "Sunlu PLA Wood Walnut", mirroring the server's productDisplayName closely enough for a preview. */
const previewName = (d: Draft) => [d.vendor, d.line?.toUpperCase().includes(d.material.toUpperCase()) ? "" : d.material, d.line, d.colorName].filter(Boolean).join(" ");

export function ImportPage() {
  const { data, error, isLoading } = useAsync(previewOrcaImport, []);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [result, setResult] = useState<Awaited<ReturnType<typeof runOrcaImport>> | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Editable copy of each proposed identity, created lazily from the preview.
  const draftFor = (fileName: string): Draft => {
    if (drafts[fileName]) return drafts[fileName];
    const r = data!.rows.find((x) => x.fileName === fileName)!;
    return {
      fileName,
      vendor: r.vendor,
      material: r.material,
      line: r.line,
      colorName: r.colorName,
      createSpool: true,
      selected: !r.alreadyImported && r.vendor !== "Unknown",
    };
  };
  const update = (fileName: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [fileName]: { ...draftFor(fileName), ...patch } }));

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const allDrafts = rows.map((r) => draftFor(r.fileName));
  const selected = allDrafts.filter((d) => d.selected);
  const groupSizes = new Map<string, number>();
  for (const d of selected) groupSizes.set(identityKey(d), (groupSizes.get(identityKey(d)) ?? 0) + 1);

  const doImport = async () => {
    setImporting(true);
    setImportError(null);
    try {
      setResult(await runOrcaImport(selected.map(({ selected: _s, ...choice }) => choice)));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  if (result)
    return (
      <div className="card space-y-3">
        <h1 className="text-lg font-semibold">Import done</h1>
        <p className="text-sm text-ink-300">
          Imported {result.files} profile{result.files === 1 ? "" : "s"}: {result.productsCreated} new filament
          {result.productsCreated === 1 ? "" : "s"}, {result.productsMatched} matched to filaments you already had, and {result.spools} spool
          {result.spools === 1 ? "" : "s"} created.
        </p>
        <p className="text-sm text-ink-400">
          Everything imported is marked “Orca” — treat those values as starting points, not tuned settings. Your OrcaSlicer files weren't touched.
        </p>
        <Link to="/" className="btn-primary">
          See spools
        </Link>
      </div>
    );

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-ink-400 hover:text-ink-100">
        ‹ All spools
      </Link>
      <div>
        <h1 className="text-lg font-semibold">Import from OrcaSlicer</h1>
        <p className="text-sm text-ink-400">
          Reads your user filament profiles once to seed the inventory. Nothing in OrcaSlicer is changed. Check each name below — it becomes the
          filament's identity here.
        </p>
        {data && <p className="mt-1 font-mono text-xs break-all text-ink-500">{data.dir}</p>}
      </div>

      {isLoading && <p className="text-sm text-ink-400">Reading profiles…</p>}
      {error && (
        <p role="alert" className="rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-300 day:text-rose-800">
          {error}
        </p>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => rows.forEach((r) => !r.alreadyImported && update(r.fileName, { selected: true }))}>
            Select all
          </button>
          <button type="button" className="btn" onClick={() => rows.forEach((r) => update(r.fileName, { selected: false }))}>
            Select none
          </button>
        </div>
      )}

      <ul className="space-y-3">
        {rows.map((r) => {
          const d = draftFor(r.fileName);
          const merged = d.selected ? (groupSizes.get(identityKey(d)) ?? 1) - 1 : 0;
          const field = (label: string, key: "vendor" | "material" | "line" | "colorName") => (
            <label className="block min-w-0">
              <span className="text-[11px] text-ink-400">{label}</span>
              <input
                className="field py-1.5"
                value={d[key] ?? ""}
                disabled={r.alreadyImported}
                onChange={(e) => update(r.fileName, { [key]: key === "material" ? e.target.value.toUpperCase() : e.target.value || null })}
              />
            </label>
          );
          return (
            <li key={r.fileName} className={`card space-y-2 ${d.selected ? "border-accent-500/50" : "opacity-80"}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  aria-label={`Import ${r.fileName}`}
                  checked={d.selected}
                  disabled={r.alreadyImported}
                  onChange={(e) => update(r.fileName, { selected: e.target.checked })}
                />
                <Swatch hex={r.colorHex} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{previewName(d)}</p>
                  <p className="text-xs break-all text-ink-400">
                    {r.fileName}
                    {r.inherits && ` · inherits ${r.inherits}`}
                  </p>
                </div>
              </div>
              {r.alreadyImported ? (
                <p className="text-xs text-ink-400">Already imported.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {field("Brand", "vendor")}
                    {field("Type", "material")}
                    {field("Line", "line")}
                    {field("Color", "colorName")}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={d.createSpool} onChange={(e) => update(r.fileName, { createSpool: e.target.checked })} />
                      I have a spool of this
                    </label>
                    {r.existingProduct && <span className="text-ink-400">Matches existing {r.existingProduct.displayName}</span>}
                    {merged > 0 && (
                      <span className="text-ink-400">
                        Merges with {merged} other file{merged === 1 ? "" : "s"} into one filament
                      </span>
                    )}
                  </div>
                </>
              )}
              {r.warnings.length > 0 && !r.alreadyImported && (
                <ul className="list-inside list-disc text-xs text-amber-400 day:text-amber-700">
                  {r.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {importError && (
        <p role="alert" className="text-sm text-rose-400">
          {importError}
        </p>
      )}

      {rows.length > 0 && (
        <div className="sticky bottom-0 -mx-4 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
          <button type="button" className="btn-primary w-full py-3 text-base" disabled={selected.length === 0 || importing} onClick={doImport}>
            {importing ? "Importing…" : `Import ${selected.length} profile${selected.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}
