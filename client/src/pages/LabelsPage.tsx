import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { fetchLabels } from "../api/labels";
import { SpoolLabel } from "../components/SpoolLabel";
import { useAsync } from "../hooks/useAsync";

type Mode = "label" | "letter" | "a4";

const MODES: { value: Mode; label: string; help: string }[] = [
  { value: "label", label: "Label printer", help: "One label per page at the exact label size - for Brother, Dymo or thermal label printers." },
  { value: "letter", label: "Letter paper", help: "Labels tiled on US Letter with cut lines - print, then cut them out." },
  { value: "a4", label: "A4 paper", help: "Labels tiled on A4 with cut lines." },
];

const MODE_KEY = "spoolkeeper:label-mode";
const STRIPE_KEY = "spoolkeeper:label-stripe";
const read = (k: string, fallback: string) => {
  try {
    return localStorage.getItem(k) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // Preference just won't persist.
  }
};

/**
 * Printable spool labels. The page CSS sets @page to the label size (label
 * printer) or the paper size (sheets), and everything but the labels is
 * hidden when printing.
 */
export function LabelsPage() {
  const [params] = useSearchParams();
  const ids = (params.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const { data, error } = useAsync(() => (ids.length ? fetchLabels(ids) : Promise.resolve(null)), [ids.join(",")]);
  const [mode, setModeState] = useState<Mode>(() => read(MODE_KEY, "label") as Mode);
  const [stripe, setStripeState] = useState(() => read(STRIPE_KEY, "1") === "1");
  const [zoom, setZoom] = useState(2);
  const setMode = (m: Mode) => {
    setModeState(m);
    write(MODE_KEY, m);
  };
  const setStripe = (on: boolean) => {
    setStripeState(on);
    write(STRIPE_KEY, on ? "1" : "0");
  };

  if (!ids.length)
    return (
      <p className="text-sm text-ink-400">
        No spools chosen.{" "}
        <Link to="/" className="text-accent-400 underline">
          Pick spools from the list
        </Link>
        .
      </p>
    );
  if (error) return <p role="alert" className="text-sm text-rose-400">{error}</p>;
  if (!data) return <p className="text-sm text-ink-400">Loading…</p>;

  const { widthMm: w, heightMm: h } = data.size;
  const pageCss =
    mode === "label"
      ? `@page { size: ${w}mm ${h}mm; margin: 0; } .print-sheet { display: block !important; } .print-sheet > * { break-after: page; }`
      : `@page { size: ${mode === "a4" ? "A4" : "letter"}; margin: 10mm; } .print-sheet { gap: 0 !important; } .print-sheet .spool-label { outline: 0.2mm dashed #999; }`;
  const localOnly = /localhost|127\.0\.0\.1/.test(data.baseUrl);

  return (
    <div className="space-y-4">
      <style>{`@media print { ${pageCss} }`}</style>
      <div className="print-hide space-y-4">
        <Link to="/" className="text-sm text-ink-400 hover:text-ink-100">
          ‹ All spools
        </Link>
        <div>
          <h1 className="text-lg font-semibold">
            Print {data.labels.length} label{data.labels.length === 1 ? "" : "s"}
          </h1>
          <p className="text-sm text-ink-400">
            {w} × {h} mm ·{" "}
            <Link to="/settings" className="underline">
              change size or QR address
            </Link>
          </p>
          {data.missing.length > 0 && <p className="text-xs text-amber-400">Not found: #{data.missing.join(", #")}</p>}
          {localOnly && (
            <p role="alert" className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200 day:text-amber-900">
              The QR codes point at {data.baseUrl}, which only works on this computer. Set an address your phone can reach in Settings.
            </p>
          )}
        </div>

        <fieldset className="card space-y-2 p-3">
          <legend className="sr-only">Print layout</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <label key={m.value} className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${mode === m.value ? "border-accent-500 bg-accent-500/10" : "border-ink-700"}`}>
                <input type="radio" name="label-mode" className="sr-only" checked={mode === m.value} onChange={() => setMode(m.value)} />
                <span className="font-medium">{m.label}</span>
                <span className="mt-0.5 block text-xs text-ink-400">{m.help}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={stripe} onChange={(e) => setStripe(e.target.checked)} />
              Color stripe <span className="text-xs text-ink-400">(for color printers - prints black on a thermal printer)</span>
            </label>
            <div className="flex items-center gap-2 text-sm" role="group" aria-label="Preview zoom">
              <span className="text-xs text-ink-400">Preview</span>
              {[1, 2, 3].map((z) => (
                <button key={z} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)} className={`rounded px-2 py-0.5 ${zoom === z ? "bg-ink-700 text-ink-50" : "text-ink-400"}`}>
                  {z === 1 ? "actual" : `${z}×`}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="btn-primary w-full" onClick={() => window.print()}>
            🖨 Print
          </button>
          <p className="text-xs text-ink-400">
            In the print dialog, set scale to 100% (not “fit to page”) and turn off headers and footers. ✓ next to a temperature means it came
            from calibrating that spool; otherwise it's the maker's range.
          </p>
        </fieldset>
      </div>

      {/* Preview on screen (zoomed); the same elements print at real size. */}
      <div className="overflow-x-auto rounded-lg border border-ink-800 bg-ink-900/40 p-3 print:overflow-visible print:border-0 print:bg-transparent print:p-0">
        <div className="print-sheet flex flex-wrap gap-3" style={{ zoom }}>
          {data.labels.map((l) => (
            <div key={l.spoolId} className="label-frame">
              <SpoolLabel label={l} widthMm={w} heightMm={h} stripe={stripe} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
