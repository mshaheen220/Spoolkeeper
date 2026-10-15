import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { fetchMaterials, searchEnrichment, type EnrichResult, type Suggestion } from "../api/enrich";
import { createSpools, fetchVendors, findProductMatch, type SourceMap } from "../api/inventory";
import { FormField } from "../components/FormField";
import { SuggestionsPanel } from "../components/intake/SuggestionsPanel";
import { Swatch } from "../components/Swatch";
import { useAsync } from "../hooks/useAsync";
import { DETAIL_FIELDS, ID_FIELDS, LINE_SUGGESTIONS, MATERIAL_PRESETS, type ProductFieldKey } from "../lib/productFields";
import { agreedFills, defaultSelection, optionsByField, type Selection } from "../lib/suggestions";
import type { Product, Source } from "../types";

type Values = Record<string, string>;
type Provenance = Record<string, { source: Source; sourceRef?: string | null }>;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const INITIAL_VALUES: Values = { vendor: "", material: "PLA", line: "", colorName: "", diameterMm: "1.75", netWeightG: "1000" };
// The two prefilled fields are form defaults, not facts about this spool - badge them so.
const INITIAL_PROVENANCE: Provenance = { diameterMm: { source: "default" }, netWeightG: { source: "default" } };

/** Product fields sent on save (identity + every detail field + reference ids). */
const PRODUCT_KEYS = ["vendor", "material", "line", ...DETAIL_FIELDS.map((f) => f.key), ...ID_FIELDS, "notes"];

export function IntakePage() {
  const navigate = useNavigate();
  const { data: vendors } = useAsync(fetchVendors, []);
  const { data: materials } = useAsync(fetchMaterials, []);

  const [values, setValues] = useState<Values>(INITIAL_VALUES);
  const [prov, setProv] = useState<Provenance>(INITIAL_PROVENANCE);
  const [purchase, setPurchase] = useState({ quantity: "1", price: "", store: "", purchasedOn: today(), lot: "", notes: "" });

  const [result, setResult] = useState<EnrichResult | null>(null);
  const [selection, setSelection] = useState<Selection>({});
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [match, setMatch] = useState<Product | null>(null);
  const [useExisting, setUseExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const set = (key: string, value: string, source: Source = "manual", sourceRef?: string | null) => {
    setValues((v) => ({ ...v, [key]: value }));
    setProv((p) => ({ ...p, [key]: { source, sourceRef } }));
  };

  // Offer "another spool of a filament you already have" as soon as the
  // identity fields match an existing product.
  const { vendor, material, line, colorName } = values;
  useEffect(() => {
    if (!vendor.trim() || !material.trim()) return;
    const timer = setTimeout(() => {
      findProductMatch({ vendor, material, line, colorName })
        .then(setMatch)
        .catch(() => setMatch(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [vendor, material, line, colorName]);
  const activeMatch = vendor.trim() && material.trim() ? match : null;

  const options = useMemo(() => optionsByField(result?.candidates ?? [], selection), [result, selection]);
  // Reference ids ride along with accepted values; only count the visible fields.
  const fills = useMemo(
    () => agreedFills(options, values as Partial<Record<ProductFieldKey, string>>).filter((f) => !ID_FIELDS.includes(f.field)),
    [options, values],
  );

  const lookup = async () => {
    setLookingUp(true);
    setLookupError(null);
    try {
      const r = await searchEnrichment({ vendor, material, line, colorName, diameterMm: values.diameterMm, netWeightG: values.netWeightG });
      setResult(r);
      setSelection(defaultSelection(r.candidates));
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : String(e));
    } finally {
      setLookingUp(false);
    }
  };

  /** Use a suggested value, and record the matched record's id so it can be revisited later. */
  const applySuggestion = (field: ProductFieldKey, s: Suggestion, value: string) => {
    set(field, value, s.source, s.sourceRef);
    const candidate = result?.candidates.find((c) => c.source === s.source && selection[s.source] === c.id);
    for (const idField of ID_FIELDS) {
      const idSuggestion = candidate?.suggestions.find((x) => x.field === idField);
      if (idSuggestion) set(idField, String(idSuggestion.value), idSuggestion.source, idSuggestion.sourceRef);
    }
  };

  const fillAgreed = () => {
    for (const { field, option } of fills) applySuggestion(field, option.suggestions[0], option.value);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const sources: SourceMap = {};
    const spoolValues = {
      quantity: Number(purchase.quantity) || 1,
      purchasedOn: purchase.purchasedOn,
      price: purchase.price,
      store: purchase.store,
      lot: purchase.lot,
      notes: purchase.notes,
    };
    for (const key of ["price", "store", "purchasedOn"] as const) if (purchase[key]) sources[`spool.${key}`] = { source: "manual" };
    try {
      let body;
      if (useExisting && activeMatch) {
        body = { productId: activeMatch.id, ...spoolValues, sources };
      } else {
        const product: Record<string, string> = {};
        for (const key of PRODUCT_KEYS) {
          const v = values[key]?.trim();
          if (!v) continue;
          product[key] = v;
          if (key !== "vendor") sources[`product.${key}`] = prov[key] ?? { source: "manual" };
        }
        body = { product, ...spoolValues, sources };
      }
      const created = await createSpools(body);
      navigate(`/spools/${created[0].id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const identityReady = vendor.trim() !== "" && material.trim() !== "";

  return (
    <form onSubmit={submit} className="space-y-4">
      <Link to="/" className="text-sm text-ink-400 hover:text-ink-100">
        ‹ All spools
      </Link>
      <h1 className="text-lg font-semibold">Add a spool</h1>

      <section className="card space-y-3" aria-labelledby="identity-heading">
        <h2 id="identity-heading" className="font-semibold">
          What is it?
        </h2>
        <FormField label="Brand" value={values.vendor} onChange={(v) => set("vendor", v)} list="vendor-list" required placeholder="Sunlu" />
        <datalist id="vendor-list">
          {vendors?.map((v) => (
            <option key={v.id} value={v.name} />
          ))}
        </datalist>

        <div>
          <span className="mb-1 block text-sm font-medium text-ink-200" id="preset-label">
            Material
          </span>
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-labelledby="preset-label">
            {MATERIAL_PRESETS.map((p) => {
              const active = values.material === p.material && values.line === p.line;
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    set("material", p.material);
                    set("line", p.line);
                  }}
                  className={`rounded-full border px-3 py-1 text-sm ${active ? "border-accent-500 bg-accent-500/15 text-ink-50" : "border-ink-700 text-ink-300 hover:border-ink-500"}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Type"
              value={values.material}
              onChange={(v) => set("material", v.toUpperCase())}
              list="material-list"
              required
              help="OrcaSlicer's filament type; picks the base profile."
            />
            <FormField label="Line / finish" value={values.line} onChange={(v) => set("line", v)} list="line-list" placeholder="Silk, Wood, Matte…" />
          </div>
          <datalist id="material-list">
            {materials?.map((m) => (
              <option key={m.type} value={m.type} />
            ))}
          </datalist>
          <datalist id="line-list">
            {LINE_SUGGESTIONS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Color name" value={values.colorName} onChange={(v) => set("colorName", v)} provenance={prov.colorName} placeholder="Walnut" />
          <FormField label="Color" type="color" value={values.colorHex ?? ""} onChange={(v) => set("colorHex", v)} provenance={prov.colorHex} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Diameter" type="number" unit="mm" value={values.diameterMm} onChange={(v) => set("diameterMm", v)} provenance={prov.diameterMm} />
          <FormField label="Net weight" type="number" unit="g" value={values.netWeightG} onChange={(v) => set("netWeightG", v)} provenance={prov.netWeightG} />
        </div>

        <button type="button" className="btn w-full" onClick={lookup} disabled={!identityReady || lookingUp}>
          {lookingUp ? "Looking up…" : "🔎 Look up filament data"}
        </button>
        {lookupError && (
          <p role="alert" className="text-sm text-rose-400">
            {lookupError}
          </p>
        )}
      </section>

      {activeMatch && (
        <section role="status" className="card flex flex-wrap items-center gap-3 border-accent-500/50">
          <Swatch hex={activeMatch.colorHex} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">You already have {activeMatch.displayName}.</p>
            <p className="text-ink-400">
              {activeMatch.spoolCount} active spool{activeMatch.spoolCount === 1 ? "" : "s"}. Reuse its filament details and just log the new spool?
            </p>
          </div>
          <label className="flex w-full items-center gap-2 rounded-md border border-ink-700 px-3 py-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4" checked={useExisting} onChange={(e) => setUseExisting(e.target.checked)} />
            Add another spool of this
          </label>
        </section>
      )}

      {!(useExisting && activeMatch) && (
        <>
          {result && (
            <SuggestionsPanel
              result={result}
              selection={selection}
              onSelect={(source, id) => setSelection((s) => ({ ...s, [source]: id }))}
              options={options}
              values={values as Partial<Record<ProductFieldKey, string>>}
              onUse={applySuggestion}
              onFillAgreed={fillAgreed}
              agreedCount={fills.length}
            />
          )}

          <section className="card space-y-3" aria-labelledby="details-heading">
            <h2 id="details-heading" className="font-semibold">
              Filament details
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {DETAIL_FIELDS.filter((f) => !["colorName", "colorHex", "diameterMm", "netWeightG"].includes(f.key)).map((f) => (
                <FormField
                  key={f.key}
                  label={f.label}
                  type={f.type === "color" ? "text" : f.type}
                  unit={f.unit}
                  step={f.step}
                  help={f.help}
                  value={values[f.key] ?? ""}
                  onChange={(v) => set(f.key, v)}
                  provenance={prov[f.key]}
                  className={f.type === "url" || f.type === "text" ? "col-span-2" : undefined}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <section className="card space-y-3" aria-labelledby="purchase-heading">
        <h2 id="purchase-heading" className="font-semibold">
          This purchase
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Spools"
            type="number"
            value={purchase.quantity}
            onChange={(v) => setPurchase((p) => ({ ...p, quantity: v }))}
            help="Bought several? Each gets its own Spool #ID."
          />
          <FormField label="Price per spool" type="number" unit="$" value={purchase.price} onChange={(v) => setPurchase((p) => ({ ...p, price: v }))} />
          <FormField label="Store" value={purchase.store} onChange={(v) => setPurchase((p) => ({ ...p, store: v }))} placeholder="Amazon" />
          <FormField label="Purchased" type="date" value={purchase.purchasedOn} onChange={(v) => setPurchase((p) => ({ ...p, purchasedOn: v }))} />
          <FormField label="Lot / batch" value={purchase.lot} onChange={(v) => setPurchase((p) => ({ ...p, lot: v }))} />
          <FormField label="Notes" value={purchase.notes} onChange={(v) => setPurchase((p) => ({ ...p, notes: v }))} />
        </div>
      </section>

      {saveError && (
        <p role="alert" className="rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-300 day:text-rose-800">
          {saveError}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <button type="submit" className="btn-primary w-full py-3 text-base" disabled={!identityReady || saving}>
          {saving ? "Saving…" : `Save ${Number(purchase.quantity) > 1 ? `${purchase.quantity} spools` : "spool"}`}
        </button>
      </div>
    </form>
  );
}
