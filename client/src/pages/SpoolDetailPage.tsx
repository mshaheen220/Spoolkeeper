import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { fetchSpool, updateSpool } from "../api/inventory";
import { TunedSummary } from "../components/calibration/TunedSummary";
import { ProfileCard } from "../components/ProfileCard";
import { SourceBadge } from "../components/SourceBadge";
import { Swatch } from "../components/Swatch";
import { useAsync } from "../hooks/useAsync";
import { grams, money, range } from "../lib/format";
import { DIRECTION_LABELS } from "../lib/productFields";
import type { FieldSource } from "../types";

function Row({ label, value, sources }: { label: string; value: ReactNode; sources?: (FieldSource | undefined)[] }) {
  if (value == null || value === "") return null;
  const shown = (sources ?? []).filter((s): s is FieldSource => !!s);
  // Several fields can feed one row (e.g. nozzle min + max); show each distinct source once.
  const unique = shown.filter((s, i) => shown.findIndex((o) => o.source === s.source && o.sourceRef === s.sourceRef) === i);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
      <dt className="text-sm text-ink-400">{label}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-1.5 text-right text-sm">
        <span>{value}</span>
        {unique.map((s) => (
          <SourceBadge key={`${s.source}${s.sourceRef}`} source={s.source} sourceRef={s.sourceRef} />
        ))}
      </dd>
    </div>
  );
}

export function SpoolDetailPage() {
  const id = Number(useParams().id);
  const { data, error, isLoading, reload } = useAsync(() => fetchSpool(id), [id]);

  if (isLoading && !data) return <p className="text-sm text-ink-400">Loading…</p>;
  if (error || !data)
    return (
      <p role="alert" className="text-sm text-rose-400">
        {error ?? "Spool not found"}
      </p>
    );

  const { spool, sources, siblings, imported } = data;
  const p = spool.product;
  const ps = sources.product;
  const ss = sources.spool;

  const toggleArchived = async () => {
    await updateSpool(spool.id, { archived: !spool.archived });
    reload();
  };

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-ink-400 hover:text-ink-100">
        ‹ All spools
      </Link>

      <div className="flex items-center gap-3">
        <Swatch hex={p.colorHex} hexes={p.colorHexes} direction={p.multiColorDirection} size={48} />
        <div className="min-w-0">
          <h1 className="text-lg leading-tight font-semibold">{p.displayName}</h1>
          <p className="text-sm text-ink-400">
            Spool <span className="font-mono">#{spool.id}</span>
            {spool.archived && " · archived"}
          </p>
        </div>
      </div>

      <section className="card" aria-labelledby="filament-heading">
        <div className="flex items-center justify-between gap-2">
          <h2 id="filament-heading" className="text-sm font-semibold tracking-wide text-ink-300 uppercase">
            Filament
          </h2>
          <Link to={`/products/${p.id}/edit?spool=${spool.id}`} className="btn py-1 text-xs">
            ✎ Edit filament
          </Link>
        </div>
        <dl className="divide-y divide-ink-800">
          <Row label="Brand" value={p.vendor.name} />
          <Row label="Material" value={[p.material, p.line].filter(Boolean).join(" · ")} sources={[ps.material, ps.line]} />
          <Row
            label="Color"
            value={
              p.colorName || p.colorHex ? (
                <span className="inline-flex items-center gap-1.5">
                  {p.colorName}
                  {p.colorHex && <span className="font-mono text-xs text-ink-400">{p.colorHex}</span>}
                </span>
              ) : null
            }
            sources={[ps.colorName, ps.colorHex]}
          />
          {p.colorHexes && p.colorHexes.length >= 2 && (
            <Row
              label="Colors"
              value={
                <span className="inline-flex flex-col items-end gap-1">
                  <span className="inline-flex flex-wrap justify-end gap-1">
                    {p.colorHexes.map((h) => (
                      <span
                        key={h}
                        title={h === p.colorHex ? `${h} - main color (OrcaSlicer)` : h}
                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[11px] ${h === p.colorHex ? "border-accent-500" : "border-ink-700"}`}
                      >
                        <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: h }} />
                        {h}
                        {h === p.colorHex && <span aria-label="main color">★</span>}
                      </span>
                    ))}
                  </span>
                  {p.multiColorDirection && <span className="text-xs text-ink-400">{DIRECTION_LABELS[p.multiColorDirection]?.label}</span>}
                </span>
              }
              sources={[ps.colorHexes, ps.multiColorDirection]}
            />
          )}
          <Row label="Finish" value={p.finishes?.join(", ")} sources={[ps.finishes]} />
          <Row label="Shore hardness" value={p.shoreHardness != null ? `${p.shoreHardness}${p.shoreScale ?? ""}` : null} sources={[ps.shoreHardness, ps.shoreScale]} />
          <Row label="Diameter" value={p.diameterMm ? `${p.diameterMm} mm` : null} sources={[ps.diameterMm]} />
          <Row label="Density" value={p.density ? `${p.density} g/cm³` : null} sources={[ps.density]} />
          <Row label="Net weight" value={grams(p.netWeightG)} sources={[ps.netWeightG]} />
          <Row label="Empty spool" value={grams(p.spoolWeightG)} sources={[ps.spoolWeightG]} />
          <Row label="Nozzle (maker)" value={range(p.nozzleMin, p.nozzleMax, "°C")} sources={[ps.nozzleMin, ps.nozzleMax]} />
          <Row label="Bed (maker)" value={range(p.bedMin, p.bedMax, "°C")} sources={[ps.bedMin, ps.bedMax]} />
          <Row
            label="Drying"
            value={p.dryTempC ? `${p.dryTempC} °C${p.dryHours ? ` for ${p.dryHours} h` : ""}` : null}
            sources={[ps.dryTempC, ps.dryHours]}
          />
          <Row label="Maker's print notes" value={p.speedNote} sources={[ps.speedNote]} />
          <Row
            label="Product page"
            value={
              p.productUrl ? (
                <a href={p.productUrl} target="_blank" rel="noreferrer" className="break-all text-accent-400 underline">
                  {new URL(p.productUrl).hostname}
                </a>
              ) : null
            }
            sources={[ps.productUrl]}
          />
          <Row
            label="Datasheet"
            value={
              p.datasheetUrl ? (
                <a href={p.datasheetUrl} target="_blank" rel="noreferrer" className="text-accent-400 underline">
                  Open
                </a>
              ) : null
            }
            sources={[ps.datasheetUrl]}
          />
          <Row label="Barcode" value={p.gtin} sources={[ps.gtin]} />
        </dl>
      </section>

      <section className="card" aria-labelledby="purchase-heading">
        <h2 id="purchase-heading" className="text-sm font-semibold tracking-wide text-ink-300 uppercase">
          This spool
        </h2>
        <dl className="divide-y divide-ink-800">
          <Row label="Purchased" value={spool.purchasedOn} sources={[ss.purchasedOn]} />
          <Row label="Price" value={money(spool.price)} sources={[ss.price]} />
          <Row label="Store" value={spool.store} sources={[ss.store]} />
          <Row label="Lot" value={spool.lot} />
          <Row label="Filament on spool" value={grams(spool.initialWeightG)} />
          <Row label="Notes" value={spool.notes} />
        </dl>
      </section>

      <TunedSummary spoolId={spool.id} />

      <ProfileCard spoolId={spool.id} />

      {imported.length > 0 && (
        <section className="card space-y-2" aria-labelledby="imported-heading">
          <h2 id="imported-heading" className="text-sm font-semibold tracking-wide text-ink-300 uppercase">
            From your old OrcaSlicer profiles
          </h2>
          <p className="text-xs text-ink-400">
            Untrusted starting points, not calibrated values. Calibrating this spool replaces them.
          </p>
          {imported.map((p) => (
            <details key={p.fileName} className="rounded-md border border-ink-800 px-3 py-2">
              <summary className="cursor-pointer text-sm">
                {p.fileName}
                {p.generatedBy && <span className="ml-2 text-xs text-amber-400 day:text-amber-700">generated by {p.generatedBy}</span>}
              </summary>
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 font-mono text-xs">
                {Object.entries(p.settings).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="truncate text-ink-400">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
                {p.inherits && (
                  <div className="contents">
                    <dt className="text-ink-400">inherits</dt>
                    <dd className="text-right">{p.inherits}</dd>
                  </div>
                )}
              </dl>
            </details>
          ))}
        </section>
      )}

      {siblings.length > 0 && (
        <section className="card" aria-labelledby="siblings-heading">
          <h2 id="siblings-heading" className="text-sm font-semibold tracking-wide text-ink-300 uppercase">
            Other spools of this filament
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {siblings.map((s) => (
              <li key={s.id}>
                <Link to={`/spools/${s.id}`} className="btn font-mono">
                  #{s.id}
                  {s.archived && <span className="font-sans text-ink-500">(archived)</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Link to={`/labels?ids=${spool.id}`} className="btn">
          🏷 Print label
        </Link>
        <button type="button" className="btn" onClick={toggleArchived}>
          {spool.archived ? "Unarchive" : "Archive (spool is empty)"}
        </button>
      </div>
    </div>
  );
}
