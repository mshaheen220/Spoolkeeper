import { useState } from "react";
import { strToU8, zipSync } from "fflate";
import { fetchSpoolProfile, profileJsonUrl, type ProfileScope } from "../api/profile";
import { useAsync } from "../hooks/useAsync";
import { downloadBlob } from "../lib/download";
import { SourceBadge } from "./SourceBadge";

const SCOPES: { value: ProfileScope; label: string; help: string }[] = [
  { value: "spool", label: "This spool", help: "Its own preset, named with the Spool #ID. Use when this spool tunes differently." },
  { value: "product", label: "All spools of this filament", help: "One shared preset for the product. Keeps OrcaSlicer's list short." },
];

/** The OrcaSlicer preset for a spool: what it contains, where each value came from, and download. */
export function ProfileCard({ spoolId }: { spoolId: number }) {
  const [scope, setScope] = useState<ProfileScope>("spool");
  const { data, error } = useAsync(() => fetchSpoolProfile(spoolId, scope), [spoolId, scope]);

  const downloadZip = () => {
    if (!data) return;
    const name = data.profile.fileName;
    const zip = zipSync({
      [`${name}.json`]: strToU8(`${JSON.stringify(data.orca.json, null, 4)}\n`),
      [`${name}.info`]: strToU8(data.orca.info),
    });
    downloadBlob(new Blob([zip as BlobPart], { type: "application/zip" }), `${name}.zip`);
  };

  return (
    <section className="card space-y-3" aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="text-sm font-semibold tracking-wide text-ink-300 uppercase">
        OrcaSlicer profile
      </h2>

      <fieldset>
        <legend className="mb-1 text-sm text-ink-300">Profile for</legend>
        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <label
              key={s.value}
              className={`flex-1 basis-40 cursor-pointer rounded-md border px-3 py-2 text-sm ${scope === s.value ? "border-accent-500 bg-accent-500/10" : "border-ink-700"}`}
            >
              <input type="radio" name="scope" className="sr-only" checked={scope === s.value} onChange={() => setScope(s.value)} />
              <span className="font-medium">{s.label}</span>
              <span className="mt-0.5 block text-xs text-ink-400">{s.help}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="text-sm">
            <p className="font-medium break-words">{data.profile.name}</p>
            <p className="text-xs text-ink-400">
              Inherits <span className="font-mono">{data.profile.inherits}</span>
              {data.profile.baseFallback && " (no base for this material; using PLA's)"} · for{" "}
              <span className="font-mono whitespace-pre">{data.profile.compatiblePrinters.join(", ")}</span>
            </p>
          </div>

          {data.tunedFromSpool != null && data.tunedFromSpool !== spoolId && (
            <p className="text-xs text-ink-400">Tuned values come from spool #{data.tunedFromSpool}, the most recently calibrated spool of this filament.</p>
          )}
          <details>
            <summary className="cursor-pointer text-sm text-ink-300">{data.values.length} values written</summary>
            <ul className="mt-2 divide-y divide-ink-800">
              {data.values.map((v) => (
                <li key={v.key} className="py-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-ink-300">{v.key}</span>
                    <span className="flex items-center gap-1.5 text-sm">
                      {v.value}
                      {v.source === "calibration" ? (
                        <span className="rounded-full border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300 day:text-emerald-800" title={v.sourceRef ?? undefined}>
                          Tuned
                        </span>
                      ) : (
                        v.source !== "spoolkeeper" && <SourceBadge compact source={v.source} sourceRef={v.sourceRef} />
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-ink-500">{v.why}</p>
                </li>
              ))}
            </ul>
          </details>

          {data.pending.length > 0 && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 day:text-amber-900">
            <p className="font-medium">Not tuned yet — the base profile's values apply for:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {data.pending.map((p) => (
                <li key={p.key}>
                  <span className="font-mono">{p.key}</span> — {p.why}
                </li>
              ))}
            </ul>
          </div>}

          <div className="flex flex-wrap gap-2">
            <a className="btn-primary" href={profileJsonUrl(spoolId, scope)} download>
              Download .json
            </a>
            <button type="button" className="btn" onClick={downloadZip}>
              Download .json + .info (zip)
            </button>
          </div>
          <p className="text-xs text-ink-400">
            Import the .json in OrcaSlicer with <span className="font-medium">File → Import → Import Configs…</span>, or copy both files from the zip into{" "}
            <span className="font-mono break-all">~/Library/Application Support/OrcaSlicer/user/default/filament/</span> and restart OrcaSlicer.
          </p>
        </>
      )}
    </section>
  );
}
