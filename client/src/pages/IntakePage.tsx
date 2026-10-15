import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  fetchMaterials,
  lookupGtin,
  readProductPage,
  searchEnrichment,
  type Candidate,
  type EnrichResult,
  type GtinMatch,
  type Suggestion,
} from "../api/enrich";
import { createSpools, fetchVendors, findProductMatch, type SourceMap } from "../api/inventory";
import { FormField } from "../components/FormField";
import { SuggestionsPanel } from "../components/intake/SuggestionsPanel";
import { Swatch } from "../components/Swatch";
import { useAsync } from "../hooks/useAsync";
import { decodeBarcode } from "../lib/barcode";
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

  const [searchResult, setSearchResult] = useState<EnrichResult | null>(null);
  // Candidates from a scanned barcode or a read product page; kept across re-lookups.
  const [extras, setExtras] = useState<Candidate[]>([]);
  const [selection, setSelection] = useState<Selection>({});
  const [gtinInput, setGtinInput] = useState("");
  const [gtinMatches, setGtinMatches] = useState<GtinMatch[] | null>(null);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState<string | null>(null);
  const [readingPage, setReadingPage] = useState(false);
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

  const result = useMemo<EnrichResult | null>(() => {
    if (!searchResult && extras.length === 0) return null;
    const searched = (searchResult?.candidates ?? []).filter((c) => !extras.some((e) => e.source === c.source && e.id === c.id));
    return { candidates: [...extras, ...searched], errors: searchResult?.errors ?? [] };
  }, [searchResult, extras]);

  const options = useMemo(() => optionsByField(result?.candidates ?? [], selection), [result, selection]);
  // Reference ids ride along with accepted values; only count the visible fields.
  const fills = useMemo(
    () => agreedFills(options, values as Partial<Record<ProductFieldKey, string>>).filter((f) => !ID_FIELDS.includes(f.field)),
    [options, values],
  );

  /** Add a barcode/product-page candidate and select it for its source. */
  const addExtra = (c: Candidate) => {
    setExtras((list) => [...list.filter((e) => e.source !== c.source), c]);
    setSelection((sel) => ({ ...sel, [c.source]: c.id }));
  };

  const lookup = async (q = { vendor, material, line, colorName, diameterMm: values.diameterMm, netWeightG: values.netWeightG }) => {
    setLookingUp(true);
    setLookupError(null);
    try {
      const r = await searchEnrichment(q);
      setSearchResult(r);
      // Barcode/page picks stay selected; everything else defaults to its best match.
      setSelection((sel) => {
        const next = defaultSelection([...extras, ...r.candidates]);
        for (const e of extras) next[e.source] = sel[e.source] ?? e.id;
        return next;
      });
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : String(e));
    } finally {
      setLookingUp(false);
    }
  };

  /** A barcode match fills the identity fields (it's the product itself), then looks up the rest. */
  const applyGtinMatch = (m: GtinMatch) => {
    setGtinMatches(null);
    const ref = m.candidate.sourceRef;
    set("vendor", m.vendor, "ofd", ref);
    set("material", m.material.toUpperCase(), "ofd", ref);
    set("line", m.line ?? "", "ofd", ref);
    set("colorName", m.colorName, "ofd", ref);
    if (m.diameterMm) set("diameterMm", String(m.diameterMm), "ofd", ref);
    if (m.netWeightG) set("netWeightG", String(m.netWeightG), "ofd", ref);
    set("gtin", m.gtin, "ofd", ref);
    setExtras((list) => [...list.filter((e) => e.source !== "ofd"), m.candidate]);
    setSelection((sel) => ({ ...sel, ofd: m.candidate.id }));
    void lookup({
      vendor: m.vendor,
      material: m.material,
      line: m.line ?? "",
      colorName: m.colorName,
      diameterMm: String(m.diameterMm ?? values.diameterMm),
      netWeightG: String(m.netWeightG ?? values.netWeightG),
    });
  };

  const findGtin = async (code: string) => {
    const digits = code.replace(/\D/g, "");
    setGtinInput(digits);
    setScanStatus("Looking up barcode…");
    try {
      const matches = await lookupGtin(digits);
      if (matches.length === 0) {
        set("gtin", digits);
        setScanStatus(`Barcode ${digits} isn't in the Open Filament Database yet. Saved it on the form; fill in the rest from the box.`);
      } else if (matches.length === 1) {
        setScanStatus(`Found ${matches[0].candidate.title}.`);
        applyGtinMatch(matches[0]);
      } else {
        setScanStatus("That barcode matches several products. Pick one:");
        setGtinMatches(matches);
      }
    } catch (e) {
      setScanStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const scanPhoto = async (file: File | undefined) => {
    if (!file) return;
    setScanStatus("Reading barcode…");
    const code = await decodeBarcode(file);
    if (code) await findGtin(code);
    else setScanStatus("Couldn't read a barcode in that photo. Try closer, flatter and in focus, or type the number.");
  };

  const readPage = async () => {
    const url = values.productUrl?.trim();
    if (!url) return;
    setReadingPage(true);
    setPageStatus(null);
    try {
      const c = await readProductPage(url);
      addExtra(c);
      setPageStatus(c.suggestions.length ? `Read ${c.suggestions.length} value(s) from the page; review them below.` : "The page loaded, but no temperatures or settings could be read from it.");
    } catch (e) {
      setPageStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setReadingPage(false);
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
        <div className="space-y-2 rounded-md border border-dashed border-ink-700 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="btn-primary cursor-pointer">
              <span aria-hidden>📷</span> Scan barcode
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  void scanPhoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="flex min-w-0 flex-1 basis-40 gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Barcode number</span>
                <input className="field" inputMode="numeric" placeholder="or type the barcode" value={gtinInput} onChange={(e) => setGtinInput(e.target.value)} />
              </label>
              <button type="button" className="btn" disabled={gtinInput.replace(/\D/g, "").length < 8} onClick={() => void findGtin(gtinInput)}>
                Find
              </button>
            </div>
          </div>
          {scanStatus && (
            <p role="status" className="text-xs text-ink-300">
              {scanStatus}
            </p>
          )}
          {gtinMatches && (
            <ul className="space-y-1">
              {gtinMatches.map((m) => (
                <li key={m.candidate.id}>
                  <button type="button" className="btn w-full justify-start text-left" onClick={() => applyGtinMatch(m)}>
                    {m.candidate.title} · {m.netWeightG} g · {m.diameterMm} mm
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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

        <div className="flex items-end gap-2">
          <FormField
            className="min-w-0 flex-1"
            label="Product page URL"
            type="url"
            value={values.productUrl ?? ""}
            onChange={(v) => set("productUrl", v)}
            provenance={prov.productUrl}
            placeholder="https://…"
          />
          <button type="button" className="btn shrink-0" onClick={readPage} disabled={!values.productUrl?.trim() || readingPage}>
            {readingPage ? "Reading…" : "Read page"}
          </button>
        </div>
        {pageStatus && (
          <p role="status" className="text-xs text-ink-300">
            {pageStatus}
          </p>
        )}

        <button type="button" className="btn w-full" onClick={() => void lookup()} disabled={!identityReady || lookingUp}>
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
              {DETAIL_FIELDS.filter((f) => !["colorName", "colorHex", "diameterMm", "netWeightG", "productUrl"].includes(f.key)).map((f) => (
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
