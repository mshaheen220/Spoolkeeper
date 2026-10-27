import { useEffect, useId, useState } from "react";
import { previewRun, saveRun, type Computed, type InputField, type TestInfo } from "../../api/calibration";

type Values = Record<string, string>;

const toStrings = (o: Record<string, unknown>): Values => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? "" : String(v)]));

function Field({ field, value, onChange, note }: { field: InputField; value: string; onChange: (v: string) => void; note?: string }) {
  const id = useId();
  const help = [note, field.help].filter(Boolean).join(" ");
  return (
    <div className={field.type === "text" ? "col-span-2" : undefined}>
      <label htmlFor={field.readOnly ? undefined : id} className="mb-1 block text-sm font-medium text-ink-200">
        {field.label}
        {field.optional && <span className="font-normal text-ink-500"> (optional)</span>}
      </label>
      {field.readOnly ? (
        <p id={id} className="rounded-md bg-ink-800 px-3 py-2 text-base font-semibold sm:text-sm">
          {value}
        </p>
      ) : field.type === "select" ? (
        <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.optional ? "—" : "Choose…"}</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="relative">
          <input
            id={id}
            className={`field ${field.unit ? "pr-16" : ""}`}
            type={field.type === "number" ? "number" : "text"}
            inputMode={field.type === "number" ? "decimal" : undefined}
            step={field.step ?? "any"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={help ? `${id}-help` : undefined}
          />
          {field.unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-500">{field.unit}</span>}
        </div>
      )}
      {help && (
        <p id={`${id}-help`} className="mt-1 text-xs leading-snug text-ink-400">
          {help}
        </p>
      )}
    </div>
  );
}

/**
 * One calibration test: what to run in OrcaSlicer (menu path and dialog
 * values), what to look for, inputs for what was seen, and the computed
 * result with its math - recomputed live by the server as values change.
 */
export function TestPanel({
  spoolId,
  test,
  initialParams,
  onSaved,
}: {
  spoolId: number;
  test: TestInfo;
  /** Overrides for the dialog values (e.g. Pass 2 starting from a just-saved Pass 1). */
  initialParams?: Record<string, unknown>;
  onSaved: () => void;
}) {
  const [params, setParams] = useState<Values>(() => toStrings({ ...test.suggestedParams, ...initialParams }));
  const [obs, setObs] = useState<Values>(() => toStrings(test.suggestedObservation));
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<Computed | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // Required observations that are still empty: no point asking the server yet.
  const missing = test.observation.filter((f) => !f.optional && !obs[f.key]);
  // Usually a prefilled value is just a default around the real measurement, so wait for the user's input.
  // When the prefill *is* the answer (bed temperatures), confirming it as-is is allowed.
  const anyObs = test.prefillIsAnswer
    ? test.observation.some((f) => obs[f.key])
    : test.observation.some((f) => obs[f.key] && !(f.key in test.suggestedObservation && obs[f.key] === String(test.suggestedObservation[f.key])));

  useEffect(() => {
    if (missing.length > 0 || !anyObs) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      previewRun(spoolId, { test: test.id, params, observation: obs })
        .then((p) => {
          if (cancelled) return;
          setPreview(p);
          setPreviewError(null);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setPreview(null);
          setPreviewError(e instanceof Error ? e.message : String(e));
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spoolId, test.id, JSON.stringify(params), JSON.stringify(obs)]);

  const showPreview = missing.length === 0 && anyObs;
  // Values the dialog asks for vs. ones the test takes from the selected filament profile.
  const dialogParams = test.params.filter((f) => !f.fromProfile);
  const profileParams = test.params.filter((f) => f.fromProfile);

  const save = async () => {
    setSaving(true);
    try {
      const { run } = await saveRun(spoolId, { test: test.id, params, observation: obs, notes: notes || null });
      setSaved(run.result.map((v) => `${v.label}: ${v.value}`).join(" · "));
      setObs(toStrings(test.suggestedObservation));
      setNotes("");
      setPreview(null);
      onSaved();
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-300">{test.why}</p>

      {test.orcaMenu.length > 0 && (
        <div className="space-y-2 rounded-md border border-ink-700 bg-ink-950/40 p-3">
          <p className="text-xs font-semibold tracking-wide text-ink-400 uppercase">In OrcaSlicer</p>
          <p className="text-sm">
            Menu bar →{" "}
            {test.orcaMenu.map((m, i) => (
              <span key={m}>
                {i > 0 && <span className="text-ink-500"> › </span>}
                <span className="rounded bg-ink-800 px-1.5 py-0.5 font-medium">{m}</span>
              </span>
            ))}
          </p>
          {dialogParams.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {dialogParams.map((f) => (
                <Field key={f.key} field={f} value={params[f.key] ?? ""} onChange={(v) => setParams((p) => ({ ...p, [f.key]: v }))} />
              ))}
            </div>
          )}
          {test.orcaSets && (
            <p className="text-xs leading-snug text-ink-400">
              <span className="font-medium text-ink-300">OrcaSlicer sets for this test:</span> {test.orcaSets}
            </p>
          )}
        </div>
      )}

      {profileParams.length > 0 && (
        <div className="space-y-2 rounded-md border border-ink-700 bg-ink-950/40 p-3">
          <p className="text-xs font-semibold tracking-wide text-ink-400 uppercase">In the filament profile</p>
          <div className="grid grid-cols-2 gap-3">
            {profileParams.map((f) => (
              <Field key={f.key} field={f} value={params[f.key] ?? ""} onChange={(v) => setParams((p) => ({ ...p, [f.key]: v }))} />
            ))}
          </div>
        </div>
      )}

      {test.checks.length > 0 && (
        <ul aria-label="Check before slicing" className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200 day:text-amber-900">
          {test.checks.map((c) => (
            <li key={c}>⚠ {c}</li>
          ))}
        </ul>
      )}

      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-300">
        {test.instructions.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>

      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-ink-400 uppercase">What you saw</p>
        <div className="grid grid-cols-2 gap-3">
          {test.observation.map((f) => (
            <Field key={f.key} field={f} note={test.suggestionNotes[f.key]} value={obs[f.key] ?? ""} onChange={(v) => setObs((o) => ({ ...o, [f.key]: v }))} />
          ))}
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-200">Notes</span>
          <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. slight stringing at 215 °C, bridges sag below 200 °C" />
        </label>
      </div>

      {showPreview && previewError && (
        <p role="alert" className="rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-300 day:text-rose-800">
          {previewError}
        </p>
      )}
      {showPreview && preview && (
        <div className="space-y-2 rounded-md border border-accent-500/50 bg-accent-500/10 p-3" aria-live="polite">
          <ul className="space-y-0.5">
            {preview.values.map((v) => (
              <li key={v.key} className="flex justify-between gap-3 text-sm">
                <span>{v.label}</span>
                <span className="font-semibold">{v.value}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-0.5 border-t border-ink-700 pt-2 font-mono text-xs text-ink-300">
            {preview.formula.map((f) => (
              <p key={f}>{f}</p>
            ))}
          </div>
          {preview.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-300 day:text-amber-800">
              ⚠ {w}
            </p>
          ))}
          <button type="button" className="btn-primary w-full" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save result"}
          </button>
        </div>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-400 day:text-emerald-700">
          ✓ Saved — {saved}
        </p>
      )}
    </div>
  );
}
