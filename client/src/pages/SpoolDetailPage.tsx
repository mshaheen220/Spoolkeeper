import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { fetchSpool, updateSpool } from "../api/inventory";
import { SourceBadge } from "../components/SourceBadge";
import { Swatch } from "../components/Swatch";
import { useAsync } from "../hooks/useAsync";
import { grams, money, range } from "../lib/format";
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

  const { spool, sources, siblings } = data;
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
        <Swatch hex={p.colorHex} size={48} />
        <div className="min-w-0">
          <h1 className="text-lg leading-tight font-semibold">{p.displayName}</h1>
          <p className="text-sm text-ink-400">
            Spool <span className="font-mono">#{spool.id}</span>
            {spool.archived && " · archived"}
          </p>
        </div>
      </div>

      <section className="card" aria-labelledby="filament-heading">
        <h2 id="filament-heading" className="text-sm font-semibold tracking-wide text-ink-300 uppercase">
          Filament
        </h2>
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
          <Row label="Speed guidance" value={p.speedNote} sources={[ps.speedNote]} />
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
        <button type="button" className="btn" onClick={toggleArchived}>
          {spool.archived ? "Unarchive" : "Archive (spool is empty)"}
        </button>
      </div>
    </div>
  );
}
