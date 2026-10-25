import { useState } from "react";
import { Link } from "react-router";
import type { ProfileScope } from "../api/profile";
import { fetchLegacy, fetchPublishList, publish, removeLegacy, type PlanState, type PublishListItem, type PublishResult } from "../api/publish";
import { PublishChanges, StateChip } from "../components/PublishChanges";
import { STATE_LABEL } from "../lib/publishState";
import { Swatch } from "../components/Swatch";
import { useAsync } from "../hooks/useAsync";

const SCOPES: { value: ProfileScope; label: string; help: string }[] = [
  { value: "spool", label: "One per spool", help: "Each spool gets its own preset, named with its Spool #ID." },
  { value: "product", label: "One per filament", help: "Spools of the same filament share one preset." },
];

const ACTION_TEXT: Record<PublishResult["action"], string> = {
  created: "added",
  updated: "updated",
  renamed: "renamed",
  unchanged: "already up to date",
  blocked: "not published",
};

/**
 * Which items start ticked: anything new or changed - but not one whose only
 * differences are values edited in OrcaSlicer, since those are kept anyway.
 */
const preselect = (items: PublishListItem[]) =>
  new Set(
    items
      .filter((i) => i.state === "new" || (i.state === "changes" && (i.changes.some((c) => !c.handTuned) || i.existingFile !== i.fileName)))
      .map((i) => i.owner),
  );

/**
 * Publish every spool's preset into OrcaSlicer at once: what's new, what
 * changed (key by key), and what was edited in OrcaSlicer and will be kept.
 * Below, the spoolman2slicer presets these replace, for cleanup.
 */
export function PublishPage() {
  const [scope, setScope] = useState<ProfileScope>("spool");
  const list = useAsync(() => fetchPublishList(scope), [scope]);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [overwrite, setOverwrite] = useState<Record<string, Set<string>>>({});
  const [filter, setFilter] = useState<PlanState | "all">("all");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ results: PublishResult[]; restartNote: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A fresh list (first load, scope change, after publishing) resets the ticks.
  const [loadedFor, setLoadedFor] = useState<unknown>(null);
  if (list.data && list.data !== loadedFor) {
    setLoadedFor(list.data);
    setSelected(preselect(list.data.items));
    setOverwrite({});
  }

  const items = list.data?.items ?? [];
  const chosen = items.filter((i) => selected?.has(i.owner) && i.state !== "blocked");
  const counts = items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.state]: (acc[i.state] ?? 0) + 1 }), {});
  const shown = filter === "all" ? items : items.filter((i) => i.state === filter);
  const writable = list.data?.writable;

  const toggle = (owner: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(owner)) next.delete(owner);
      else next.add(owner);
      return next;
    });
  const toggleOverwrite = (owner: string, key: string) =>
    setOverwrite((o) => {
      const next = new Set(o[owner]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...o, [owner]: next };
    });

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await publish(chosen.map((i) => ({ spoolId: i.spoolIds[0], scope, overwrite: [...(overwrite[i.owner] ?? [])] })));
      setResults(r);
      list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-ink-400 hover:text-ink-100">
        ‹ All spools
      </Link>
      <div>
        <h1 className="text-lg font-semibold">Publish to OrcaSlicer</h1>
        <p className="text-sm text-ink-400">
          Writes each spool's preset into OrcaSlicer's filament folder. Values you've changed in OrcaSlicer are kept unless you choose to overwrite them, and
          every file that's replaced is backed up first.
        </p>
      </div>

      {writable && !writable.ok && (
        <p role="alert" className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300 day:text-rose-800">
          {writable.reason}
        </p>
      )}

      {results && (
        <section role="status" className="card space-y-2 border-emerald-500/40">
          <h2 className="font-semibold">Published</h2>
          <ul className="space-y-0.5 text-sm">
            {results.results.map((r) => (
              <li key={r.owner || r.name}>
                <span className="font-medium">{r.name}</span> — {ACTION_TEXT[r.action]}
                {r.kept.length > 0 && <span className="text-ink-400"> (kept your OrcaSlicer values for {r.kept.join(", ")})</span>}
                {r.error && <span className="text-rose-400"> — {r.error}</span>}
              </li>
            ))}
          </ul>
          <p className="rounded-md bg-accent-500/10 px-2 py-1.5 text-sm font-medium text-accent-300">{results.restartNote}</p>
          {results.results.some((r) => r.backupDir) && (
            <p className="text-xs text-ink-400">
              Replaced files were backed up to <span className="font-mono break-all">{results.results.find((r) => r.backupDir)!.backupDir}</span>
            </p>
          )}
          <button type="button" className="btn" onClick={() => setResults(null)}>
            Dismiss
          </button>
        </section>
      )}

      <fieldset>
        <legend className="mb-1 text-sm text-ink-300">Presets</legend>
        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <label key={s.value} className={`flex-1 basis-40 cursor-pointer rounded-md border px-3 py-2 text-sm ${scope === s.value ? "border-accent-500 bg-accent-500/10" : "border-ink-700"}`}>
              <input type="radio" name="publish-scope" className="sr-only" checked={scope === s.value} onChange={() => setScope(s.value)} />
              <span className="font-medium">{s.label}</span>
              <span className="mt-0.5 block text-xs text-ink-400">{s.help}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {list.error && (
        <p role="alert" className="text-sm text-rose-400">
          {list.error}
        </p>
      )}
      {!list.data && !list.error && <p className="text-sm text-ink-400">Comparing with OrcaSlicer…</p>}

      {list.data && (
        <section className="space-y-2" aria-label="Presets to publish">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
            {(["all", "new", "changes", "current", "blocked"] as const)
              .filter((f) => f === "all" || counts[f])
              .map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${filter === f ? "border-accent-500 bg-accent-500/10 text-ink-50" : "border-ink-700 text-ink-400"}`}
                >
                  {f === "all" ? `All ${items.length}` : `${STATE_LABEL[f].text} ${counts[f]}`}
                </button>
              ))}
            <span className="ml-auto flex gap-1.5">
              <button type="button" className="text-xs text-accent-400 underline" onClick={() => setSelected(preselect(items))}>
                Select new &amp; changed
              </button>
              <button type="button" className="text-xs text-ink-400 underline" onClick={() => setSelected(new Set())}>
                None
              </button>
            </span>
          </div>

          <ul className="space-y-2">
            {shown.map((i) => {
              const handTuned = i.changes.filter((c) => c.handTuned).length;
              const blocked = i.state === "blocked";
              return (
                <li key={i.owner} className="card p-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Publish ${i.name}`}
                      disabled={blocked || i.state === "current"}
                      checked={!blocked && i.state !== "current" && !!selected?.has(i.owner)}
                      onChange={() => toggle(i.owner)}
                    />
                    <Swatch hex={i.colorHex} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-words">{i.name}</p>
                      <p className="text-xs text-ink-400">
                        {i.spoolIds.length > 1 ? `Spools #${i.spoolIds.join(", #")}` : <Link to={`/spools/${i.spoolIds[0]}`} className="underline">Spool #{i.spoolIds[0]}</Link>}
                        {i.state === "changes" && ` · ${i.changes.length} change${i.changes.length === 1 ? "" : "s"}`}
                        {i.existingFile && i.existingFile !== i.fileName && " · renamed"}
                        {handTuned > 0 && <span className="text-amber-400"> · {handTuned} edited in OrcaSlicer</span>}
                      </p>
                    </div>
                    <StateChip state={i.state} />
                  </div>
                  {blocked && <p className="mt-2 text-xs text-rose-400">{i.blockedReason}</p>}
                  {i.state === "changes" && (
                    <details className="mt-2" open={handTuned > 0}>
                      <summary className="cursor-pointer text-xs text-ink-300">Show changes</summary>
                      <div className="mt-1">
                        <PublishChanges changes={i.changes} overwrite={overwrite[i.owner] ?? new Set()} onToggle={(k) => toggleOverwrite(i.owner, k)} />
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="sticky bottom-0 -mx-4 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
            {error && (
              <p role="alert" className="mb-2 text-sm text-rose-400">
                {error}
              </p>
            )}
            <button type="button" className="btn-primary w-full" disabled={busy || !chosen.length || !writable?.ok} onClick={() => void run()}>
              {busy ? "Publishing…" : chosen.length ? `Publish ${chosen.length} preset${chosen.length === 1 ? "" : "s"}` : "Nothing selected"}
            </button>
            <p className="mt-1 text-center text-xs text-ink-400">{list.data.restartNote}</p>
          </div>
        </section>
      )}

      {/* Re-checked after each publish: that's what makes an old preset safe to remove. */}
      <LegacySection refresh={results} />
    </div>
  );
}

/** spoolman2slicer's generated presets: back them up and remove them once Spoolkeeper's replace them. */
function LegacySection({ refresh }: { refresh: unknown }) {
  const legacy = useAsync(fetchLegacy, [refresh]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [loadedFor, setLoadedFor] = useState<unknown>(null);
  const [done, setDone] = useState<{ removed: string[]; backupDir: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (legacy.data && legacy.data !== loadedFor) {
    setLoadedFor(legacy.data);
    setPicked(new Set(legacy.data.legacy.filter((f) => f.replaced).map((f) => f.fileName)));
  }
  const files = legacy.data?.legacy ?? [];
  if (!files.length && !done) return null;

  const remove = async () => {
    const list = [...(picked ?? [])];
    if (!window.confirm(`Back up and remove ${list.length} spoolman2slicer preset${list.length === 1 ? "" : "s"} from OrcaSlicer?`)) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await removeLegacy(list));
      legacy.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-3" aria-labelledby="legacy-heading">
      <div>
        <h2 id="legacy-heading" className="font-semibold">
          Old spoolman2slicer presets
        </h2>
        <p className="text-sm text-ink-400">
          These are the generated presets that kept overwriting your tuning. Remove each one once its Spoolkeeper preset is published. Removed files are
          backed up first.
        </p>
      </div>
      {done && (
        <p role="status" className="text-sm text-emerald-300 day:text-emerald-800">
          Removed {done.removed.length}. Backed up to <span className="font-mono break-all">{done.backupDir}</span>. Restart OrcaSlicer to drop them from its list.
        </p>
      )}
      {files.length > 0 && (
        <>
          <ul className="divide-y divide-ink-800">
            {files.map((f) => (
              <li key={f.fileName} className="flex items-center gap-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  aria-label={`Remove ${f.name}`}
                  checked={!!picked?.has(f.fileName)}
                  onChange={() =>
                    setPicked((s) => {
                      const next = new Set(s);
                      if (next.has(f.fileName)) next.delete(f.fileName);
                      else next.add(f.fileName);
                      return next;
                    })
                  }
                />
                <span className="min-w-0 flex-1 break-words">{f.fileName.replace(/\.json$/, "")}</span>
                <span className={`text-xs ${f.replaced ? "text-emerald-400" : "text-amber-400"}`}>
                  {f.replaced ? "replaced ✓" : f.spoolIds.length ? `publish #${f.spoolIds.join(", #")} first` : "not imported"}
                </span>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="text-sm text-rose-400">
              {error}
            </p>
          )}
          <button type="button" className="btn w-full" disabled={busy || !picked?.size || !legacy.data?.writable.ok} onClick={() => void remove()}>
            {busy ? "Removing…" : `Back up and remove ${picked?.size ?? 0}`}
          </button>
        </>
      )}
    </section>
  );
}
