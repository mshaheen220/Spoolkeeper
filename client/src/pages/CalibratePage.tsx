import { useState } from "react";
import { Link, useParams } from "react-router";
import { fetchCalibration, setRunAccepted, type CalibrationRun, type CalibrationState, type StepId, type TestInfo } from "../api/calibration";
import { TestPanel } from "../components/calibration/TestPanel";
import { Swatch } from "../components/Swatch";
import { useAsync } from "../hooks/useAsync";

interface StepMeta {
  id: StepId;
  title: string;
  /** The tuned key that marks the step done, shown as its summary. */
  doneKey: string;
  unit: string;
}

// OrcaSlicer's recommended order (Calibration Guide): temperature, max
// volumetric speed, pressure advance, flow ratio, retraction.
const STEPS: StepMeta[] = [
  { id: "temp", title: "Temperature", doneKey: "nozzle_temperature", unit: "°C" },
  { id: "mvs", title: "Max volumetric speed", doneKey: "filament_max_volumetric_speed", unit: "mm³/s" },
  { id: "pa", title: "Pressure advance", doneKey: "pressure_advance", unit: "" },
  { id: "flow", title: "Flow ratio", doneKey: "filament_flow_ratio", unit: "" },
  { id: "retraction", title: "Retraction", doneKey: "filament_retraction_length", unit: "mm" },
  { id: "cooling", title: "Cooling, bed & first layer", doneKey: "", unit: "" },
];

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function History({ runs, onChange }: { runs: CalibrationRun[]; onChange: () => void }) {
  if (runs.length === 0) return null;
  return (
    <details className="rounded-md border border-ink-800 px-3 py-2">
      <summary className="cursor-pointer text-sm text-ink-300">History ({runs.length})</summary>
      <ul className="mt-2 space-y-2">
        {[...runs].reverse().map((r) => (
          <li key={r.id} className={`rounded-md border p-2 text-xs ${r.accepted ? "border-ink-700" : "border-ink-800 opacity-60"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {date(r.createdAt)} · run #{r.id}
                {r.printerProfile && <span className="font-normal text-ink-400"> · {r.printerProfile.replace(/\s+/g, " ")}</span>}
              </span>
              <button
                type="button"
                className="btn py-0.5 text-[11px]"
                onClick={async () => {
                  await setRunAccepted(r.id, !r.accepted);
                  onChange();
                }}
              >
                {r.accepted ? "Don't use" : "Use again"}
              </button>
            </div>
            <p className="mt-1">{r.result.map((v) => `${v.label}: ${v.value}`).join(" · ")}</p>
            <div className="mt-1 font-mono text-ink-400">
              {r.formula.map((f) => (
                <p key={f}>{f}</p>
              ))}
            </div>
            {r.notes && <p className="mt-1 text-ink-300">“{r.notes}”</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Flow has two methods; the user's choice of Pass 1 + Pass 2 is the default, YOLO is OrcaSlicer's newer single print. */
function FlowStep({ data, reload, onPass1Saved, onDone }: { data: CalibrationState; reload: () => void; onPass1Saved: () => void; onDone: () => void }) {
  const [method, setMethod] = useState<"two_pass" | "yolo">(() => (data.runs.some((r) => r.test === "flow_yolo" && r.accepted) ? "yolo" : "two_pass"));
  const t = (id: string) => data.tests.find((x) => x.id === id)!;
  const pass1 = [...data.runs].reverse().find((r) => r.test === "flow1" && r.accepted);
  const pass1Flow = pass1?.result.find((v) => v.key === "filament_flow_ratio")?.value;
  const tab = (active: boolean) => `flex-1 rounded px-3 py-1.5 text-sm ${active ? "bg-ink-700 text-ink-50" : "text-ink-400 hover:text-ink-100"}`;
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Flow method" className="flex rounded-md border border-ink-700 bg-ink-900/60 p-0.5">
        <button type="button" role="tab" aria-selected={method === "two_pass"} className={tab(method === "two_pass")} onClick={() => setMethod("two_pass")}>
          Pass 1 + Pass 2
        </button>
        <button type="button" role="tab" aria-selected={method === "yolo"} className={tab(method === "yolo")} onClick={() => setMethod("yolo")}>
          YOLO (one print)
        </button>
      </div>
      {method === "two_pass" ? (
        <>
          <h3 className="font-semibold">Pass 1 (coarse)</h3>
          <TestPanel
            key="flow1"
            spoolId={data.spoolId}
            test={t("flow1")}
            onSaved={() => {
              onPass1Saved(); // stay on this step - Pass 2 comes next
              reload();
            }}
          />
          <div className="border-t border-ink-800 pt-4">
            <h3 className="font-semibold">Pass 2 (fine)</h3>
            {pass1Flow ? (
              <>
                <p className="my-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-200 day:text-amber-900">
                  Before printing Pass 2, set this filament's <span className="font-medium">Flow ratio</span> in OrcaSlicer to{" "}
                  <span className="font-mono font-semibold">{pass1Flow}</span> (Pass 1's result) and save the profile — Pass 2 builds on it.
                </p>
                <TestPanel
                  key={`flow2-${pass1!.id}`}
                  spoolId={data.spoolId}
                  test={t("flow2")}
                  initialParams={{ oldFlow: pass1Flow }}
                  onSaved={() => {
                    onDone();
                    reload();
                  }}
                />
              </>
            ) : (
              <p className="text-sm text-ink-400">Save Pass 1 first; Pass 2 starts from its result.</p>
            )}
          </div>
        </>
      ) : (
        <TestPanel
          key="flow_yolo"
          spoolId={data.spoolId}
          test={t("flow_yolo")}
          onSaved={() => {
            onDone();
            reload();
          }}
        />
      )}
      <History runs={data.runs.filter((r) => r.test.startsWith("flow"))} onChange={reload} />
    </div>
  );
}

export function CalibratePage() {
  const spoolId = Number(useParams().id);
  const { data, error, reload } = useAsync(() => fetchCalibration(spoolId), [spoolId]);
  // null = follow progress (first unfinished step); "none" = all collapsed.
  const [open, setOpen] = useState<StepId | "none" | null>(null);

  if (error) return <p role="alert" className="text-sm text-rose-400">{error}</p>;
  if (!data) return <p className="text-sm text-ink-400">Loading…</p>;

  const p = data.product;
  const testFor = (step: StepId) => data.tests.find((t) => t.step === step) as TestInfo;
  // First unfinished, non-optional, non-skipped step opens by default.
  const firstTodo = STEPS.find((s) => s.doneKey && !data.tuned[s.doneKey] && !testFor(s.id).skipped)?.id ?? null;
  const current = open === null ? firstTodo : open;

  return (
    <div className="space-y-4">
      <Link to={`/spools/${spoolId}`} className="text-sm text-ink-400 hover:text-ink-100">
        ‹ Spool #{spoolId}
      </Link>
      <div className="flex items-center gap-3">
        <Swatch hex={p.colorHex} hexes={p.colorHexes} direction={p.multiColorDirection} size={44} />
        <div>
          <h1 className="text-lg leading-tight font-semibold">Calibrate {p.displayName}</h1>
          <p className="text-sm text-ink-400">Spool #{spoolId} · follow the steps in order; each builds on the last.</p>
          <p className="text-xs text-ink-400">
            Calibrating on <span className="whitespace-pre">{data.calibratingOn.name}</span>
            {data.calibratingOn.nozzleDiameter ? ` (${data.calibratingOn.nozzleDiameter} mm nozzle)` : ""} ·{" "}
            <Link to="/settings" className="underline">
              change
            </Link>
          </p>
        </div>
      </div>

      {data.linearAdvance === "unknown" && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200 day:text-amber-900">
          Does your firmware have Linear Advance? Send <span className="font-mono">M503</span> and look for an <span className="font-mono">M900 K</span> line,
          then set it in{" "}
          <Link to="/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      )}

      <ol className="space-y-2">
        {STEPS.map((s, i) => {
          const test = testFor(s.id);
          const tunedValue = s.doneKey ? data.tuned[s.doneKey] : undefined;
          const coolingDone = s.id === "cooling" && data.runs.some((r) => r.test === "cooling" && r.accepted);
          const status = test.skipped
            ? { text: "Skipped — firmware has no Linear Advance", cls: "text-ink-500" }
            : tunedValue
              ? { text: `✓ ${tunedValue.value}${s.unit ? ` ${s.unit}` : ""} · ${date(tunedValue.date)}`, cls: "text-emerald-400 day:text-emerald-700" }
              : coolingDone
                ? { text: "✓ recorded", cls: "text-emerald-400 day:text-emerald-700" }
                : { text: test.optional ? "Optional" : "To do", cls: "text-ink-400" };
          const isOpen = current === s.id;
          return (
            <li key={s.id} className={`card p-0 ${isOpen ? "border-accent-500/60" : ""}`}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? "none" : s.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink-600 text-sm">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.title}</span>
                  <span className={`block text-xs ${status.cls}`}>{status.text}</span>
                </span>
                <span aria-hidden className="text-ink-500">
                  {isOpen ? "▴" : "▾"}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-ink-800 px-4 py-4">
                  {test.skipped ? (
                    <div className="space-y-2 text-sm text-ink-300">
                      <p>{test.why}</p>
                      <p>
                        Your printer answered <span className="font-mono">Unknown command: "M900"</span>, so Linear Advance isn't built into its firmware. A K value
                        would do nothing, so this step is skipped and exported profiles keep pressure advance off. If you flash a firmware build with Linear
                        Advance, change it in{" "}
                        <Link to="/settings" className="text-accent-400 underline">
                          Settings
                        </Link>
                        .
                      </p>
                    </div>
                  ) : s.id === "flow" ? (
                    <FlowStep data={data} reload={reload} onPass1Saved={() => setOpen("flow")} onDone={() => setOpen(null)} />
                  ) : (
                    <div className="space-y-4">
                      <TestPanel
                        key={test.id}
                        spoolId={spoolId}
                        test={test}
                        onSaved={() => {
                          setOpen(null); // follow progress to the next unfinished step
                          reload();
                        }}
                      />
                      <History runs={data.runs.filter((r) => r.test === test.id)} onChange={reload} />
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <p className="text-sm text-ink-400">
        Results go straight into this spool's{" "}
        <Link to={`/spools/${spoolId}`} className="text-accent-400 underline">
          OrcaSlicer profile
        </Link>
        .
      </p>
    </div>
  );
}
