import { useState } from "react";
import { Link } from "react-router";
import { refreshEnrichment } from "../api/enrich";
import { fetchSettings, saveSettings } from "../api/profile";
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
