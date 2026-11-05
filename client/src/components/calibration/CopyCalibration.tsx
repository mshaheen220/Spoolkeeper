import { useState } from "react";
import { Link } from "react-router";
import { copyCalibration, type CalibrationState, type StepId } from "../../api/calibration";
import { Swatch } from "../Swatch";
import { HintText } from "./HintText";

/**
 * Copies this spool's results to other filaments of the same brand and
 * material. Ones that may print differently (or already have their own
 * results) start unticked.
 */
export function CopyCalibration({ data, steps, onCopied }: { data: CalibrationState; steps: { id: StepId; title: string }[]; onCopied: () => void }) {
  const stepOf = (test: string) => data.tests.find((t) => t.id === test)?.step;
  const done = steps.filter((s) => data.runs.some((r) => r.accepted && stepOf(r.test) === s.id));
  const title = (id: StepId) => steps.find((s) => s.id === id)?.title ?? id;

  const [chosenSteps, setChosenSteps] = useState<Set<StepId>>(() => new Set(done.map((s) => s.id)));
  const [picked, setPicked] = useState<Set<number>>(
    () => new Set(data.copyTargets.filter((t) => !t.differences.length && !t.calibratedSteps.length).map((t) => t.productId)),
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!done.length || !data.copyTargets.length) return null;

  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const copy = async () => {
    setBusy(true);
    setError(null);
    try {
      const { copied } = await copyCalibration(data.spoolId, { productIds: [...picked], steps: [...chosenSteps] });
      const name = (id: number) => data.copyTargets.find((t) => t.productId === id)?.displayName ?? `#${id}`;
      const fresh = copied.filter((c) => c.runs > 0).map((c) => name(c.productId));
      const same = copied.filter((c) => c.runs === 0).map((c) => name(c.productId));
      setResult([fresh.length && `Copied to ${fresh.join(", ")}.`, same.length && `${same.join(", ")} already had these.`].filter(Boolean).join(" "));
      onCopied();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) => `flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${on ? "border-accent-500/60 bg-accent-500/10" : "border-ink-700 text-ink-400"}`;

  return (
    <section className="card space-y-3 p-4" aria-labelledby="copy-calibration">
      <h2 id="copy-calibration" className="font-semibold">
        Copy to similar filaments
      </h2>
      <div className="text-xs text-ink-400">
        <HintText
          hint={{
            title: "How copying works",
            detail:
              "Same brand and material only. Each filament gets these results as copied runs in its history: its own test later replaces them, and Don't use undoes them. Ones that may print differently - another finish (translucent, silk…), line or temperature range - or that already have their own results start unticked.",
          }}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink-400 uppercase">Results</legend>
        <div className="flex flex-wrap gap-2">
          {done.map((s) => (
            <label key={s.id} className={chip(chosenSteps.has(s.id))}>
              <input type="checkbox" checked={chosenSteps.has(s.id)} onChange={() => setChosenSteps((c) => toggle(c, s.id))} />
              {s.title}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink-400 uppercase">Filaments</legend>
        <ul className="space-y-1.5">
          {data.copyTargets.map((t) => (
            <li key={t.productId}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-ink-800 px-3 py-2">
                <input type="checkbox" className="mt-1.5" checked={picked.has(t.productId)} onChange={() => setPicked((p) => toggle(p, t.productId))} />
                <Swatch hex={t.colorHex} hexes={t.colorHexes} direction={t.multiColorDirection} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t.displayName}</span>
                  {(t.differences.length > 0 || t.calibratedSteps.length > 0) && (
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {t.differences.map((d) => (
                        <span key={d} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-200 day:text-amber-900">
                          {d}
                        </span>
                      ))}
                      {t.calibratedSteps.length > 0 && (
                        <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-ink-300">Has its own: {t.calibratedSteps.map(title).join(", ")}</span>
                      )}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <button type="button" className="btn-primary w-full" disabled={busy || picked.size === 0 || chosenSteps.size === 0} onClick={copy}>
        {busy ? "Copying…" : `Copy to ${picked.size} filament${picked.size === 1 ? "" : "s"}`}
      </button>
      {error && (
        <p role="alert" className="text-sm text-rose-400 day:text-rose-700">
          {error}
        </p>
      )}
      {result && (
        <p role="status" className="text-sm text-emerald-400 day:text-emerald-700">
          ✓ {result}{" "}
          <Link to="/publish" className="underline">
            Publish
          </Link>{" "}
          to send them to OrcaSlicer.
        </p>
      )}
    </section>
  );
}
