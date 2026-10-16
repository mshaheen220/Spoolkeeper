import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { lookupGtin, type GtinMatch } from "../api/enrich";
import { createSpools, findProductMatch, type SourceMap } from "../api/inventory";
import { FormField } from "../components/FormField";
import { AppearanceFields, DetailsGrid, IdentityFields, LookupControls, SizeFields, Suggestions } from "../components/product/ProductSections";
import { Swatch } from "../components/Swatch";
import { useProductForm, type Provenance, type Values } from "../hooks/useProductForm";
import { decodeBarcode } from "../lib/barcode";
import type { Product } from "../types";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const INITIAL_VALUES: Values = { vendor: "", material: "PLA", line: "", colorName: "", diameterMm: "1.75", netWeightG: "1000" };
// The two prefilled fields are form defaults, not facts about this spool - badge them so.
const INITIAL_PROVENANCE: Provenance = { diameterMm: { source: "default" }, netWeightG: { source: "default" } };

export function IntakePage() {
  const navigate = useNavigate();
  const form = useProductForm(INITIAL_VALUES, INITIAL_PROVENANCE);
  const { values, set, lookup, setExtras, setSelection } = form;
  const [purchase, setPurchase] = useState({ quantity: "1", price: "", store: "", purchasedOn: today(), lot: "", notes: "" });

  const [gtinInput, setGtinInput] = useState("");
  const [gtinMatches, setGtinMatches] = useState<GtinMatch[] | null>(null);
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  const [match, setMatch] = useState<Product | null>(null);
  const [useExisting, setUseExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const spoolSources: SourceMap = {};
    for (const key of ["price", "store", "purchasedOn"] as const) if (purchase[key]) spoolSources[`spool.${key}`] = { source: "manual" };
    const spoolValues = {
      quantity: Number(purchase.quantity) || 1,
      purchasedOn: purchase.purchasedOn,
      price: purchase.price,
      store: purchase.store,
      lot: purchase.lot,
      notes: purchase.notes,
    };
    try {
      let body;
      if (useExisting && activeMatch) {
        body = { productId: activeMatch.id, ...spoolValues, sources: spoolSources };
      } else {
        const { product, sources } = form.productBody();
        body = { product, ...spoolValues, sources: { ...sources, ...spoolSources } };
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
        <IdentityFields form={form} />
        <SizeFields form={form} />
        <LookupControls form={form} />
      </section>

      {activeMatch && (
        <section role="status" className="card flex flex-wrap items-center gap-3 border-accent-500/50">
          <Swatch hex={activeMatch.colorHex} hexes={activeMatch.colorHexes} direction={activeMatch.multiColorDirection} />
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
          <Suggestions form={form} />

          <section className="card space-y-4" aria-labelledby="looks-heading">
            <h2 id="looks-heading" className="font-semibold">
              Color &amp; flexibility
            </h2>
            <AppearanceFields form={form} />
          </section>

          <section className="card space-y-3" aria-labelledby="details-heading">
            <h2 id="details-heading" className="font-semibold">
              Filament details
            </h2>
            <DetailsGrid form={form} />
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

      {form.problems.map((msg) => (
        <p key={msg} role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200 day:text-amber-900">
          {msg}
        </p>
      ))}

      <div className="sticky bottom-0 -mx-4 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <button type="submit" className="btn-primary w-full py-3 text-base" disabled={form.problems.length > 0 || !identityReady || saving}>
          {saving ? "Saving…" : `Save ${Number(purchase.quantity) > 1 ? `${purchase.quantity} spools` : "spool"}`}
        </button>
      </div>
    </form>
  );
}
