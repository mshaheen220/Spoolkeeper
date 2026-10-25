import type { KeyChange } from "../api/publish";
import { STATE_LABEL } from "../lib/publishState";

interface Props {
  changes: KeyChange[];
  /** Hand-tuned keys the user has chosen to overwrite. */
  overwrite: Set<string>;
  onToggle: (key: string) => void;
}

/**
 * Key-by-key diff of a preset against OrcaSlicer's copy. Values changed in
 * OrcaSlicer since Spoolkeeper wrote them are kept by default; ticking one
 * overwrites it.
 */
export function PublishChanges({ changes, overwrite, onToggle }: Props) {
  if (!changes.length) return <p className="text-xs text-ink-400">No value changes.</p>;
  return (
    <ul className="divide-y divide-ink-800 text-sm">
      {changes.map((c) => (
        <li key={c.key} className="py-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="font-mono text-xs break-all text-ink-300">{c.key}</span>
            <span className="flex flex-wrap items-baseline gap-1.5">
              {c.current != null && <span className="break-all text-ink-500 line-through">{c.current}</span>}
              <span aria-hidden className="text-ink-500">
                →
              </span>
              <span className="break-all">{c.proposed ?? <em className="text-ink-400">removed (base profile's value)</em>}</span>
            </span>
          </div>
          {c.handTuned && (
            <label className="mt-1 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200 day:text-amber-900">
              <input type="checkbox" className="mt-0.5" checked={overwrite.has(c.key)} onChange={() => onToggle(c.key)} />
              <span>
                Changed in OrcaSlicer (Spoolkeeper wrote {c.lastWritten ?? "nothing"}). {overwrite.has(c.key) ? "Will be overwritten." : "Kept as OrcaSlicer has it — tick to overwrite."}
              </span>
            </label>
          )}
        </li>
      ))}
    </ul>
  );
}

export function StateChip({ state }: { state: string }) {
  const s = STATE_LABEL[state];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap ${s.cls}`}>{s.text}</span>;
}
