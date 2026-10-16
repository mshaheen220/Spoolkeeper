import type { Candidate, EnrichResult, Suggestion } from "../../api/enrich";
import { DETAIL_FIELDS, DIRECTION_LABELS, type ProductFieldKey } from "../../lib/productFields";
import { SOURCE_PRIORITY, valueKey, type FieldOption, type Selection } from "../../lib/suggestions";
import { SOURCE_LABELS, type Source } from "../../types";
import { SourceBadge } from "../SourceBadge";

interface Props {
  result: EnrichResult;
  selection: Selection;
  onSelect: (source: Source, id: string | null) => void;
  options: Map<ProductFieldKey, FieldOption[]>;
  values: Partial<Record<ProductFieldKey, string>>;
  onUse: (field: ProductFieldKey, suggestion: Suggestion, value: string) => void;
  onFillAgreed: () => void;
  agreedCount: number;
}

/**
 * The review step: which record each source matched (switchable), then
 * every suggested value per field with its source. Nothing reaches the form
 * until it's tapped - scraped and community data are suggestions, not facts.
 */
export function SuggestionsPanel({ result, selection, onSelect, options, values, onUse, onFillAgreed, agreedCount }: Props) {
  const bySource = new Map<Source, Candidate[]>();
  for (const c of result.candidates) bySource.set(c.source, [...(bySource.get(c.source) ?? []), c]);
  const sources = SOURCE_PRIORITY.filter((s) => bySource.has(s));
  const fields = DETAIL_FIELDS.filter((f) => options.has(f.key));

  return (
    <section className="card space-y-4" aria-labelledby="suggestions-heading">
      <div>
        <h2 id="suggestions-heading" className="font-semibold">
          Suggestions
        </h2>
        <p className="text-xs text-ink-400">Tap a value to use it. Check the source if it matters — community data can be wrong.</p>
      </div>

      {result.errors.map((e) => (
        <p key={e.source} role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 day:text-amber-800">
          {SOURCE_LABELS[e.source]} unavailable: {e.message}
        </p>
      ))}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-ink-400 uppercase">Matched records</h3>
        {sources.length === 0 && <p className="text-sm text-ink-400">No source knows this filament. Fill in what's on the box.</p>}
        {sources.map((source) => {
          const list = bySource.get(source)!;
          const selected = list.find((c) => c.id === selection[source]);
          return (
            <div key={source} className="flex flex-wrap items-center gap-2">
              <span className="w-28 shrink-0 text-xs text-ink-400">{SOURCE_LABELS[source]}</span>
              <select
                aria-label={`${SOURCE_LABELS[source]} match`}
                className="field min-w-0 flex-1 basis-48 py-1.5"
                value={selection[source] ?? ""}
                onChange={(e) => onSelect(source, e.target.value || null)}
              >
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
                <option value="">Don't use {SOURCE_LABELS[source]}</option>
              </select>
              {selected?.sourceRef && /^https?:/.test(selected.sourceRef) && (
                <a href={selected.sourceRef} target="_blank" rel="noreferrer" className="text-xs text-accent-400 underline">
                  view
                </a>
              )}
            </div>
          );
        })}
      </div>

      {fields.length > 0 && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-ink-400 uppercase">Values</h3>
            <button type="button" className="btn py-1 text-xs" onClick={onFillAgreed} disabled={agreedCount === 0}>
              Fill {agreedCount} empty field{agreedCount === 1 ? "" : "s"} where sources agree
            </button>
          </div>
          <ul className="divide-y divide-ink-800">
            {fields.map((f) => {
              const opts = options.get(f.key)!;
              const current = values[f.key] ?? "";
              const realCount = opts.filter((o) => o.suggestions.some((s) => s.source !== "default")).length;
              return (
                <li key={f.key} className="py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{f.label}</span>
                    {realCount > 1 && <span className="text-[11px] text-amber-400 day:text-amber-700">sources disagree</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {opts.map((o) => {
                      const active = current !== "" && valueKey(current) === valueKey(o.value);
                      const notes = [...new Set(o.suggestions.map((s) => s.note).filter(Boolean))];
                      return (
                        <button
                          key={o.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => onUse(f.key, o.suggestions[0], o.value)}
                          className={`flex max-w-full flex-col items-start rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                            active ? "border-accent-500 bg-accent-500/15" : "border-ink-700 bg-ink-900 hover:border-ink-500"
                          }`}
                        >
                          <span className="flex max-w-full items-center gap-1.5">
                            {f.type === "color" && <span aria-hidden className="h-3.5 w-3.5 rounded-full border border-ink-600" style={{ background: o.value }} />}
                            {f.type === "colors" && (
                              <span aria-hidden className="flex">
                                {o.value.split(",").map((h) => (
                                  <span key={h} className="-mr-1 h-3.5 w-3.5 rounded-full border border-ink-600" style={{ background: h }} />
                                ))}
                              </span>
                            )}
                            <span className="truncate font-medium">
                              {f.key === "multiColorDirection" ? (DIRECTION_LABELS[o.value]?.label ?? o.value) : f.type === "colors" ? o.value.split(",").join(" ") : o.value}
                              {f.unit && ` ${f.unit}`}
                            </span>
                            {active && <span aria-hidden>✓</span>}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {o.suggestions.map((s) => (
                              <SourceBadge key={s.source} source={s.source} />
                            ))}
                          </span>
                          {notes.length > 0 && <span className="mt-0.5 text-[11px] text-ink-400">{notes.join("; ")}</span>}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
