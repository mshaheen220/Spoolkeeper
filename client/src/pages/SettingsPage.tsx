import { useState } from "react";
import { Link } from "react-router";
import { refreshEnrichment } from "../api/enrich";
import { checkEsteps, fetchSettings, saveSettings, type Settings } from "../api/profile";
import { useAsync } from "../hooks/useAsync";

export function SettingsPage() {
  const { data, error, reload } = useAsync(fetchSettings, []);
  const [printer, setPrinter] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const printerValue = printer ?? data?.printerProfile ?? "";

  const save = async () => {
    await saveSettings({ printerProfile: printerValue });
    setPrinter(null);
    reload();
    setStatus("Saved.");
  };

  const refresh = async () => {
    setStatus("Clearing cached filament data…");
    await refreshEnrichment();
    setStatus("Cached filament data cleared; the next lookup fetches fresh copies.");
  };

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-ink-400 hover:text-ink-100">
        ‹ All spools
      </Link>
      <h1 className="text-lg font-semibold">Settings</h1>
      {error && (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      )}

      <section className="card space-y-3" aria-labelledby="orca-heading">
        <h2 id="orca-heading" className="font-semibold">
          OrcaSlicer
        </h2>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-200">Printer profile</span>
          <input className="field font-mono" value={printerValue} onChange={(e) => setPrinter(e.target.value)} />
          <span className="mt-1 block text-xs text-ink-400">
            Exported filament profiles attach to this printer preset. It must match OrcaSlicer's name exactly — yours has two spaces in “TheHammer
            {"  "}0.4 nozzle”.
          </span>
        </label>
        <p className="text-xs text-ink-400">
          Profiles folder: <span className="font-mono break-all">{data?.orcaUserDir}</span>
        </p>
        <button type="button" className="btn-primary" onClick={save} disabled={!printerValue || printerValue === data?.printerProfile}>
          Save
        </button>
      </section>

      {data && <PrinterSection settings={data} onChange={reload} />}

      <section className="card space-y-2" aria-labelledby="data-heading">
        <h2 id="data-heading" className="font-semibold">
          Filament data
        </h2>
        <p className="text-sm text-ink-400">
          Lookups use the Open Filament Database, SpoolmanDB and spoolz, cached for a day (a week for spoolz's file list). Refresh to pick up
          changes sooner.
        </p>
        <button type="button" className="btn" onClick={refresh}>
          Refresh cached data
        </button>
      </section>

      {status && (
        <p role="status" className="text-sm text-ink-300">
          {status}
        </p>
      )}
    </div>
  );
}

const LA_OPTIONS: { value: Settings["linearAdvance"]; label: string; help: string }[] = [
  { value: "unsupported", label: "Not available", help: "M900 answers “Unknown command”, or M503 has no M900 line. The pressure advance step is skipped and profiles keep it off." },
  { value: "supported", label: "Available", help: "M503 lists an M900 K line. The wizard includes the pressure advance tower." },
  { value: "unknown", label: "Not checked", help: "Send M503 from OctoPrint's terminal and look for “M900 K…”." },
];

/** Printer-level facts the calibration wizard depends on. */
function PrinterSection({ settings, onChange }: { settings: Settings; onChange: () => void }) {
  const [current, setCurrent] = useState(String(settings.esteps?.current ?? 93));
  const [remaining, setRemaining] = useState("");
  const [error, setError] = useState<string | null>(null);
  const e = settings.esteps;

  const runCheck = async () => {
    setError(null);
    try {
      await checkEsteps({ current: Number(current), remainingMm: Number(remaining) });
      setRemaining("");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="card space-y-4" aria-labelledby="printer-heading">
      <h2 id="printer-heading" className="font-semibold">
        Printer
      </h2>

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink-200">Linear Advance (pressure advance) in firmware</legend>
        <div className="space-y-2">
          {LA_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`block cursor-pointer rounded-md border px-3 py-2 text-sm ${settings.linearAdvance === o.value ? "border-accent-500 bg-accent-500/10" : "border-ink-700"}`}
            >
              <input
                type="radio"
                name="linear-advance"
                className="sr-only"
                checked={settings.linearAdvance === o.value}
                onChange={async () => {
                  await saveSettings({ linearAdvance: o.value });
                  onChange();
                }}
              />
              <span className="font-medium">{o.label}</span>
              <span className="mt-0.5 block text-xs text-ink-400">{o.help}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <p className="text-sm font-medium text-ink-200">E-steps check (once per extruder)</p>
        <p className="text-xs leading-snug text-ink-400">
          Flow calibration assumes the extruder pushes what it's told to. Heat the nozzle, mark the filament 120 mm above the extruder inlet, send{" "}
          <span className="font-mono">M83</span> then <span className="font-mono">G1 E100 F100</span>, and measure from the inlet to the mark. Your Creality
          direct-drive kit uses the stock gear, so 93 is expected.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-ink-300">Current E-steps (M92 E)</span>
            <input className="field" inputMode="decimal" value={current} onChange={(ev) => setCurrent(ev.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-ink-300">Left to the mark</span>
            <div className="relative">
              <input className="field pr-12" inputMode="decimal" value={remaining} onChange={(ev) => setRemaining(ev.target.value)} placeholder="20" />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-500">mm</span>
            </div>
          </label>
        </div>
        <button type="button" className="btn" onClick={runCheck} disabled={!current || remaining === ""}>
          Work it out
        </button>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        {e && (
          <div className="rounded-md border border-ink-700 p-3 text-sm">
            <p>
              Extruded {e.extrudedMm} mm of {e.extrudeMm} requested →{" "}
              {Math.abs(e.extrudedMm - e.extrudeMm) <= 1 ? (
                <span className="text-emerald-400 day:text-emerald-700">within 1 mm, E-steps are fine.</span>
              ) : (
                <>
                  set <span className="font-mono font-semibold">M92 E{e.suggested}</span> then <span className="font-mono">M500</span> to save.
                </>
              )}
            </p>
            <p className="mt-1 font-mono text-xs text-ink-400">
              new = {e.current} × {e.extrudeMm} / {e.extrudedMm} = {e.suggested}
            </p>
            <p className="mt-1 text-xs text-ink-500">Checked {new Date(e.checkedAt).toLocaleDateString()}</p>
          </div>
        )}
      </div>
    </section>
  );
}
