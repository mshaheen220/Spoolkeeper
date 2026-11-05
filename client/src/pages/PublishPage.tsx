import { useState } from "react";
import { Link } from "react-router";
import type { ProfileScope } from "../api/profile";
import {
  fetchPublishList,
  fetchStrays,
  publish,
  removeStrays,
  replacesNote,
  type PlanState,
  type PublishListItem,
  type PublishResult,
  type StrayFile,
  type StrayKind,
} from "../api/publish";
import { PublishChanges, StateChip } from "../components/PublishChanges";
import { STATE_LABEL } from "../lib/publishState";
import { Swatch } from "../components/Swatch";
import { useAsync } from "../hooks/useAsync";

const SCOPES: { value: ProfileScope; label: string; help: string }[] = [
  { value: "spool", label: "One per spool", help: "Each spool gets its own preset. Only a filament you have several spools of adds the Spool #ID." },
  { value: "product", label: "One per filament", help: "Spools of the same filament share one preset, named brand - color." },
];

const ACTION_TEXT: Record<PublishResult["action"], string> = {
  created: "added",
  updated: "updated",
  renamed: "renamed",
  replaced: "replaced the old preset",
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
 * Below, every other preset in OrcaSlicer, for cleanup.
 */
export function PublishPage() {
  const [scope, setScope] = useState<ProfileScope>("spool");
  const list = useAsync(() => fetchPublishList(scope), [scope]);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [overwrite, setOverwrite] = useState<Record<string, Set<string>>>({});
  // Blocked presets you've chosen to replace (your own same-named preset, backed up first).
  const [replace, setReplace] = useState<Set<string>>(new Set());
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
    setReplace(new Set());
  }

  const items = list.data?.items ?? [];
  const publishable = (i: PublishListItem) => i.state === "new" || i.state === "changes" || (i.state === "blocked" && replace.has(i.owner));
  const chosen = items.filter((i) => selected?.has(i.owner) && publishable(i));
  const replaceable = items.filter((i) => i.state === "blocked" && i.replaceable);
  const replaceAll = () => {
    setReplace(new Set(replaceable.map((i) => i.owner)));
    setSelected((sel) => new Set([...(sel ?? []), ...replaceable.map((i) => i.owner)]));
  };
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
      const r = await publish(chosen.map((i) => ({ spoolId: i.spoolIds[0], scope, overwrite: [...(overwrite[i.owner] ?? [])], replace: replace.has(i.owner) })));
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
            <span className="ml-auto flex flex-wrap gap-1.5">
              {replaceable.length > 0 && (
                <button type="button" className="text-xs text-accent-400 underline" onClick={replaceAll}>
                  Replace all {replaceable.length} of your same-named
                </button>
              )}
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
                      disabled={!publishable(i)}
                      checked={publishable(i) && !!selected?.has(i.owner)}
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
                  {blocked && i.replaceable && (
                    <label className="mt-1 flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={replace.has(i.owner)}
                        onChange={() => {
                          const on = !replace.has(i.owner);
                          setReplace((r) => {
                            const next = new Set(r);
                            if (on) next.add(i.owner);
                            else next.delete(i.owner);
                            return next;
                          });
                          // Choosing to replace it also picks it for publishing.
                          setSelected((sel) => {
                            const next = new Set(sel);
                            if (on) next.add(i.owner);
                            else next.delete(i.owner);
                            return next;
                          });
                        }}
                      />
                      Replace it (backed up first)
                    </label>
                  )}
                  {replacesNote(i) && <p className="mt-2 text-xs text-ink-400">{replacesNote(i)}</p>}
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
      <CleanupSection refresh={results} />
    </div>
  );
}

const KIND_HEADING: Record<StrayKind, { title: string; help: string }> = {
  spoolman2slicer: { title: "From spoolman2slicer", help: "The generated presets that kept overwriting your tuning." },
  spoolkeeper: { title: "Old Spoolkeeper presets", help: "Published by Spoolkeeper, but no longer current." },
  yours: { title: "Made or saved in OrcaSlicer", help: "Copies, experiments and older hand-made presets. Each one's main values are shown so you can tell them apart." },
};
const KIND_ORDER: StrayKind[] = ["spoolman2slicer", "spoolkeeper", "yours"];

const valuesText = (v: Record<string, string>) =>
  [
    v.nozzle_temperature && `${v.nozzle_temperature} °C`,
    v.filament_flow_ratio && `flow ${v.filament_flow_ratio}`,
    v.filament_max_volumetric_speed && `${v.filament_max_volumetric_speed} mm³/s`,
  ]
    .filter(Boolean)
    .join(" · ");

/** Safe to remove without asking twice: its filament has a current Spoolkeeper preset, or it's Spoolkeeper's own stale one. */
const safe = (f: StrayFile) => f.replaced || f.kind === "spoolkeeper";

/**
 * Every filament preset in OrcaSlicer that isn't a current Spoolkeeper one:
 * back them up and remove them, so OrcaSlicer's list is just your shelf.
 */
function CleanupSection({ refresh }: { refresh: unknown }) {
  const strays = useAsync(fetchStrays, [refresh]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [loadedFor, setLoadedFor] = useState<unknown>(null);
  const [done, setDone] = useState<{ removed: string[]; backupDir: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (strays.data && strays.data !== loadedFor) {
    setLoadedFor(strays.data);
    setPicked(new Set(strays.data.strays.filter(safe).map((f) => f.fileName)));
  }
  const files = strays.data?.strays ?? [];
  if (!files.length && !done) return null;

  const toggle = (fileName: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(fileName)) next.delete(fileName);
      else next.add(fileName);
      return next;
    });

  const remove = async () => {
    const list = [...(picked ?? [])];
    if (!window.confirm(`Back up and remove ${list.length} preset${list.length === 1 ? "" : "s"} from OrcaSlicer?`)) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await removeStrays(list));
      strays.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-3" aria-labelledby="cleanup-heading">
      <div>
        <h2 id="cleanup-heading" className="font-semibold">
          Clean up OrcaSlicer
        </h2>
        <p className="text-sm text-ink-400">
          Every other filament preset in OrcaSlicer. Publish first, then remove what's left so the list is just your shelf. Ones whose filament already has
          a Spoolkeeper preset start ticked. Removed files are backed up first.
        </p>
      </div>
      {done && (
        <p role="status" className="text-sm text-emerald-300 day:text-emerald-800">
          Removed {done.removed.length}. Backed up to <span className="font-mono break-all">{done.backupDir}</span>. Restart OrcaSlicer to drop them from its list.
        </p>
      )}
      {files.length > 0 && (
        <>
          <div className="flex gap-3">
            <button type="button" className="text-xs text-accent-400 underline" onClick={() => setPicked(new Set(files.map((f) => f.fileName)))}>
              Select all {files.length}
            </button>
            <button type="button" className="text-xs text-ink-400 underline" onClick={() => setPicked(new Set())}>
              None
            </button>
          </div>
          {KIND_ORDER.filter((k) => files.some((f) => f.kind === k)).map((kind) => (
            <div key={kind}>
              <h3 className="text-xs font-semibold tracking-wide text-ink-400 uppercase">{KIND_HEADING[kind].title}</h3>
              <p className="text-xs text-ink-500">{KIND_HEADING[kind].help}</p>
              <ul className="mt-1 divide-y divide-ink-800">
                {files
                  .filter((f) => f.kind === kind)
                  .map((f) => (
                    <li key={f.fileName} className="flex items-start gap-3 py-1.5 text-sm">
                      <input type="checkbox" className="mt-1" aria-label={`Remove ${f.name}`} checked={!!picked?.has(f.fileName)} onChange={() => toggle(f.fileName)} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words">{f.fileName.replace(/\.json$/, "")}</span>
                        <span className="block text-xs text-ink-400">
                          {[valuesText(f.values), f.reason, f.inheritedBy.length ? `${f.inheritedBy.map((c) => c.replace(/\.json$/, "")).join(", ")} is built on it` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className={`shrink-0 text-xs ${safe(f) ? "text-emerald-400" : "text-amber-400"}`}>
                        {f.kind === "spoolkeeper" ? "stale" : f.replaced ? "replaced ✓" : f.spoolIds.length ? `publish #${f.spoolIds.join(", #")} first` : "no filament"}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {error && (
            <p role="alert" className="text-sm text-rose-400">
              {error}
            </p>
          )}
          <button type="button" className="btn w-full" disabled={busy || !picked?.size || !strays.data?.writable.ok} onClick={() => void remove()}>
            {busy ? "Removing…" : `Back up and remove ${picked?.size ?? 0}`}
          </button>
        </>
      )}
    </section>
  );
}
