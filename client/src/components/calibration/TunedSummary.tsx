import { Link } from "react-router";
import { fetchCalibration } from "../../api/calibration";
import { useAsync } from "../../hooks/useAsync";
import { range } from "../../lib/format";

// Display order and units for tuned OrcaSlicer keys.
const ROWS: { key: string; label: string; unit?: string }[] = [
  { key: "nozzle_temperature", label: "Nozzle", unit: "°C" },
  { key: "nozzle_temperature_initial_layer", label: "Nozzle, first layer", unit: "°C" },
  { key: "filament_max_volumetric_speed", label: "Max volumetric speed", unit: "mm³/s" },
  { key: "pressure_advance", label: "Linear Advance K" },
  { key: "filament_flow_ratio", label: "Flow ratio" },
  { key: "filament_retraction_length", label: "Retraction", unit: "mm" },
  { key: "filament_retraction_speed", label: "Retraction speed", unit: "mm/s" },
  { key: "filament_z_hop_types", label: "Z-hop type" },
  { key: "filament_z_hop", label: "Z-hop", unit: "mm" },
  { key: "filament_wipe_distance", label: "Wipe distance", unit: "mm" },
  { key: "fan_min_speed", label: "Fan min", unit: "%" },
  { key: "fan_max_speed", label: "Fan max", unit: "%" },
  { key: "hot_plate_temp", label: "Bed, smooth PEI", unit: "°C" },
  { key: "textured_plate_temp", label: "Bed, textured PEI", unit: "°C" },
];

const withUnit = (v: string | null | undefined, unit?: string) => (v == null || v === "" ? null : unit ? `${v} ${unit}` : v);

/**
 * This spool's tuned values next to the maker's range, the base profile's
 * default and the same value on other spools of this filament.
 */
export function TunedSummary({ spoolId }: { spoolId: number }) {
  const { data } = useAsync(() => fetchCalibration(spoolId), [spoolId]);
  if (!data) return null;
  const p = data.product;
  const maker: Record<string, string | null> = {
    nozzle_temperature: range(p.nozzleMin, p.nozzleMax, "°C"),
    hot_plate_temp: range(p.bedMin, p.bedMax, "°C"),
    textured_plate_temp: range(p.bedMin, p.bedMax, "°C"),
  };
  const tunedCount = Object.keys(data.tuned).length;
  const rows = ROWS.filter((r) => data.tuned[r.key] || data.siblings.some((s) => s.tuned[r.key]));

  return (
    <section className="card space-y-3" aria-labelledby="tuned-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="tuned-heading" className="text-sm font-semibold tracking-wide text-ink-300 uppercase">
          Tuned settings
        </h2>
        <Link to={`/spools/${spoolId}/calibrate`} className="btn-primary py-1.5 text-sm">
          📐 {tunedCount ? "Continue calibrating" : "Calibrate this spool"}
        </Link>
      </div>
      {data.linearAdvance === "unsupported" && <p className="text-xs text-ink-400">Pressure advance: skipped — your firmware has no Linear Advance.</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-ink-400">Not calibrated yet. The wizard walks you through each OrcaSlicer test at the printer and works out the values.</p>
      ) : (
        <ul className="divide-y divide-ink-800">
          {rows.map((r) => {
            const mine = data.tuned[r.key];
            const others = data.siblings.filter((s) => s.tuned[r.key]);
            return (
              <li key={r.key} className="py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink-300">{r.label}</span>
                  <span className={`text-sm font-semibold ${mine ? "" : "text-ink-500"}`}>{withUnit(mine?.value, r.unit) ?? "not tuned"}</span>
                </div>
                <p className="mt-0.5 flex flex-wrap justify-end gap-x-3 text-xs text-ink-400">
                  {maker[r.key] && <span>maker {maker[r.key]}</span>}
                  {data.baseDefaults[r.key] && <span>base profile {withUnit(data.baseDefaults[r.key], r.unit)}</span>}
                  {others.map((s) => (
                    <Link key={s.spoolId} to={`/spools/${s.spoolId}`} className="underline">
                      spool #{s.spoolId}: {withUnit(s.tuned[r.key].value, r.unit)}
                    </Link>
                  ))}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
