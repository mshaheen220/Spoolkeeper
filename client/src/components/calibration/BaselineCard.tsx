import { useState } from "react";
import { Link } from "react-router";
import { fetchBaselines, setBaseline, setBaselineOverride, type BaselineCoverage, type CalibrationState } from "../../api/calibration";
import { useAsync } from "../../hooks/useAsync";
import { Swatch } from "../Swatch";

/** Short names for the keys a baseline usually carries. */
const KEY_LABEL: Record<string, string> = {
  nozzle_temperature: "temperature",
  filament_max_volumetric_speed: "max speed",
  filament_flow_ratio: "flow",
  filament_retraction_length: "retraction",
  fan_min_speed: "cooling",
  hot_plate_temp: "bed",
};
const summarize = (keys: string[]) => [...new Set(keys.map((k) => KEY_LABEL[k]).filter(Boolean))].join(", ");

const OVERRIDES: { value: boolean | null; label: string }[] = [
  { value: null, label: "Auto" },
  { value: true, label: "Use" },
  { value: false, label: "Don't" },
];

/** Auto / Use / Don't for one filament. */
function OverrideSwitch({ productId, value, onChange }: { productId: number; value: boolean | null; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const set = async (use: boolean | null) => {
    setBusy(true);
    try {
      await setBaselineOverride(productId, use);
      onChange();
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-md border border-ink-700 text-xs" role="group" aria-label="Use the baseline">
      {OVERRIDES.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={busy}
          aria-pressed={value === o.value}
          onClick={() => void set(o.value)}
          className={`px-2 py-0.5 ${value === o.value ? "bg-accent-500/20 text-ink-50" : "text-ink-400 hover:text-ink-100"}`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/** Every filament of the material and what the baseline gives it - the review list on the baseline spool's page. */
function Coverage({ material, refresh }: { material: string; refresh: unknown }) {
  const { data, reload } = useAsync(fetchBaselines, [refresh]);
  const filaments: BaselineCoverage[] = data?.baselines.find((b) => b.material === material)?.filaments ?? [];
  if (!data) return <p className="text-xs text-ink-400">Loading…</p>;
  if (!filaments.length) return <p className="text-xs text-ink-400">No other {material} on the shelf.</p>;
  const used = filaments.filter((f) => f.used).length;
  return (
    <div>
      <p className="mb-1.5 text-xs text-ink-400">
        Used by {used} of {filaments.length}. Auto leaves out specialty finishes; switch any one to Use or Don't.
      </p>
      <ul className="divide-y divide-ink-800 rounded-md border border-ink-800">
        {filaments.map((f) => (
          <li key={f.productId} className="flex items-start gap-2.5 px-3 py-2">
            <Swatch hex={f.colorHex} size={20} />
            <span className="min-w-0 flex-1 text-sm">
              <Link to={`/spools/${f.spoolId}/calibrate`} className={`block font-medium break-words ${f.used ? "" : "text-ink-400"}`}>
                {f.displayName}
              </Link>
              <span className="block text-xs text-ink-400">
                {f.used ? (f.keys.length ? `Gets ${summarize(f.keys)}` : "Has all of its own results") : "Not used"}
                {f.used && f.ownKeys.length > 0 && ` · own ${summarize(f.ownKeys)}`}
              </span>
              {f.notes.map((n) => (
                <span key={n} className="block text-xs text-amber-300 day:text-amber-800">
                  {n}
                </span>
              ))}
            </span>
            <OverrideSwitch productId={f.productId} value={f.override} onChange={reload} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A material's baseline: one calibrated spool whose results fill in for
 * every other filament of the material that hasn't been tuned itself.
 */
export function BaselineCard({ data, onChange }: { data: CalibrationState; onChange: () => void }) {
  const b = data.baseline;
  const material = data.product.material;
  const hasResults = Object.keys(data.tuned).length > 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = async (use: boolean) => {
    if (use && b.source && !window.confirm(`Replace ${b.source.name} as your ${material} baseline with this spool?`)) return;
    setBusy(true);
    setError(null);
    try {
      await setBaseline(data.spoolId, use);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!b.source && !hasResults) return null;

  return (
    <section className="card space-y-3 p-4" aria-labelledby="baseline-heading">
      <div>
        <h2 id="baseline-heading" className="font-semibold">
          {material} baseline
        </h2>
        <p className="text-xs text-ink-400">
          Most of what calibration finds is set by your printer more than the brand, so one well-tuned {material} is a better starting point for the rest than
          OrcaSlicer's generic profile. Each filament's own results always win.
        </p>
      </div>

      {b.isSource ? (
        <>
          <p className="text-sm">
            <span className="font-medium">This spool is your {material} baseline.</span> Recalibrating it updates every filament that uses it.
          </p>
          <Coverage material={b.material} refresh={data} />
          <button type="button" className="btn w-full" disabled={busy} onClick={() => void set(false)}>
            Stop using it as the baseline
          </button>
        </>
      ) : b.source ? (
        <>
          <p className="text-sm">
            {b.used ? (
              b.values.length ? (
                <>
                  Using{" "}
                  <Link to={`/spools/${b.source.spoolId}/calibrate`} className="text-accent-400 underline">
                    {b.source.name}
                  </Link>{" "}
                  for {summarize(b.values.map((v) => v.key)) || "the rest"} until this spool has its own.
                </>
              ) : (
                <>This spool has its own results for everything the baseline has.</>
              )
            ) : (
              <>
                Not using the baseline (
                <Link to={`/spools/${b.source.spoolId}/calibrate`} className="text-accent-400 underline">
                  {b.source.name}
                </Link>
                ).
              </>
            )}
          </p>
          {b.notes.map((n) => (
            <p key={n} className="text-xs text-amber-300 day:text-amber-800">
              {n}
            </p>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <OverrideSwitch productId={data.product.id} value={b.override} onChange={onChange} />
            {hasResults && (
              <button type="button" className="text-xs text-ink-400 underline" disabled={busy} onClick={() => void set(true)}>
                Make this spool the baseline instead
              </button>
            )}
          </div>
        </>
      ) : (
        <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => void set(true)}>
          Use as {material} baseline
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-400 day:text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}
