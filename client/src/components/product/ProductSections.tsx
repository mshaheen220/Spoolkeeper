import { useId, useState } from "react";
import { fetchMaterials } from "../../api/enrich";
import { fetchProducts, fetchVendors } from "../../api/inventory";
import { useAsync } from "../../hooks/useAsync";
import type { ProductForm } from "../../hooks/useProductForm";
import {
  FINISH_HELP,
  FINISHES,
  FLEXIBLE_MATERIALS,
  GRID_FIELDS,
  finishForLine,
  LINE_SUGGESTIONS,
  splitFinishes,
  toggleFinish,
  MATERIAL_PRESETS,
  SHORE_HELP,
  type ProductFieldKey,
} from "../../lib/productFields";
import { ComboField } from "../ComboField";
import { FormField } from "../FormField";
import { SuggestionsPanel } from "../intake/SuggestionsPanel";
import { SourceBadge } from "../SourceBadge";
import { ColorEditor } from "./ColorEditor";

/** Brand, material (with shortcuts), line and color name. */
export function IdentityFields({ form }: { form: ProductForm }) {
  const { values, prov, set } = form;
  const { data: vendors } = useAsync(fetchVendors, []);
  const { data: materials } = useAsync(fetchMaterials, []);
  const { data: products } = useAsync(fetchProducts, []);
  const sortText = (list: string[]) => [...new Set(list)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  // Offer what's already in use alongside the built-in suggestions.
  const typeOptions = [...new Set([...(materials ?? []).map((m) => m.type), ...(products ?? []).map((p) => p.material)])];
  // Lines already in use are offered too - except ones that are really a finish ("Silk", "Transparent").
  const lineOptions = sortText([...LINE_SUGGESTIONS, ...(products ?? []).map((p) => p.line ?? "").filter((l) => l && !finishForLine(l))]);
  const lineFinish = finishForLine(values.line);
  return (
    <>
      <ComboField
        label="Brand"
        value={values.vendor}
        onChange={(v) => set("vendor", v)}
        options={sortText((vendors ?? []).map((v) => v.name))}
        required
        placeholder="Sunlu"
        provenance={prov.vendor}
        newLabel="Add new brand"
      />

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
                  if (p.finish) set("finishes", p.finish);
                }}
                className={`rounded-full border px-3 py-1 text-sm ${active ? "border-accent-500 bg-accent-500/15 text-ink-50" : "border-ink-700 text-ink-300 hover:border-ink-500"}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {/* Type, Line and Finish sit together: Line (the maker's range name) and
            Finish (how it looks) are easy to confuse, so each says which it is. */}
        <div className="grid grid-cols-2 gap-3">
          <ComboField
            label="Type"
            value={values.material}
            onChange={(v) => set("material", v.toUpperCase())}
            options={typeOptions}
            required
            provenance={prov.material}
            help="OrcaSlicer's filament type."
            newLabel="Use type"
          />
          <ComboField
            label="Line"
            value={values.line ?? ""}
            onChange={(v) => set("line", v)}
            options={lineOptions}
            placeholder="PLA+, High Speed…"
            provenance={prov.line}
            help="The maker's range name, if it has one."
            newLabel="Use line"
          />
        </div>
        <FinishPicker form={form} className="mt-3" />
        {lineFinish && !splitFinishes(values.finishes).includes(lineFinish) && (
          <p role="status" className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 day:text-amber-900">
            <span>“{values.line}” describes how it looks — that's a Finish, which is what filters and profiles use.</span>
            <button
              type="button"
              className="btn py-1 text-xs"
              onClick={() => {
                set("finishes", toggleFinish(splitFinishes(values.finishes), lineFinish).join(","));
                set("line", "");
              }}
            >
              Move to Finish: {lineFinish}
            </button>
          </p>
        )}
      </div>

      <FormField label="Color name" value={values.colorName ?? ""} onChange={(v) => set("colorName", v)} provenance={prov.colorName} placeholder="Walnut" />
    </>
  );
}

/**
 * How the filament looks - several can apply (Translucent + Glitter). Chips
 * rather than a select, so every option is visible and multiple can be on.
 */
function FinishPicker({ form, className }: { form: ProductForm; className?: string }) {
  const { values, prov, set } = form;
  const id = useId();
  const selected = splitFinishes(values.finishes);
  return (
    <div className={className} role="group" aria-labelledby={id} aria-describedby={`${id}-help`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span id={id} className="text-sm font-medium text-ink-200">
          Finish
        </span>
        {prov.finishes && selected.length > 0 && <SourceBadge compact source={prov.finishes.source} sourceRef={prov.finishes.sourceRef} />}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FINISHES.map((f) => {
          const on = selected.includes(f);
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              onClick={() => set("finishes", toggleFinish(selected, f).join(","))}
              className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-accent-500 bg-accent-500/15 text-ink-50" : "border-ink-700 text-ink-300 hover:border-ink-500"}`}
            >
              {on && <span aria-hidden>✓ </span>}
              {f}
            </button>
          );
        })}
      </div>
      <p id={`${id}-help`} className="mt-1 text-xs leading-snug text-ink-400" title={FINISH_HELP}>
        How it looks — pick every one that applies (e.g. Translucent + Glitter).
      </p>
    </div>
  );
}

/** Color(s) and - for flexible filament - Shore hardness. */
export function AppearanceFields({ form }: { form: ProductForm }) {
  const { values, prov, set } = form;
  const shoreId = useId();
  const isFlexible = FLEXIBLE_MATERIALS.includes((values.material ?? "").toUpperCase());
  const [showShore, setShowShore] = useState(false);
  const shoreVisible = isFlexible || showShore || !!values.shoreHardness || !!values.shoreScale;

  return (
    <>
      <ColorEditor
        colorHex={values.colorHex ?? ""}
        colorHexes={values.colorHexes ?? ""}
        direction={values.multiColorDirection ?? ""}
        prov={prov}
        set={(k, v) => set(k, v)}
      />

      {shoreVisible ? (
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span id={shoreId} className="text-sm font-medium text-ink-200">
              Shore hardness
            </span>
            {prov.shoreHardness && values.shoreHardness && <SourceBadge compact source={prov.shoreHardness.source} sourceRef={prov.shoreHardness.sourceRef} />}
          </div>
          <div className="flex gap-2" role="group" aria-labelledby={shoreId}>
            <input
              className="field w-24"
              inputMode="numeric"
              aria-label="Shore hardness value"
              placeholder="95"
              value={values.shoreHardness ?? ""}
              onChange={(e) => set("shoreHardness", e.target.value)}
            />
            <select className="field w-auto" aria-label="Shore scale" value={values.shoreScale ?? ""} onChange={(e) => set("shoreScale", e.target.value)}>
              <option value="">Scale…</option>
              <option value="A">A (flexible)</option>
              <option value="D">D (rigid)</option>
            </select>
          </div>
          <p className="mt-1 text-xs leading-snug text-ink-400">{SHORE_HELP}</p>
        </div>
      ) : (
        <button type="button" className="text-left text-xs text-accent-400 underline" onClick={() => setShowShore(true)}>
          Flexible filament? Add Shore hardness
        </button>
      )}
    </>
  );
}

/** Diameter and net weight - fill-in-the-blanks from the box. */
export function SizeFields({ form }: { form: ProductForm }) {
  const { values, prov, set } = form;
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField label="Diameter" type="number" unit="mm" value={values.diameterMm ?? ""} onChange={(v) => set("diameterMm", v)} provenance={prov.diameterMm} />
      <FormField label="Net weight" type="number" unit="g" value={values.netWeightG ?? ""} onChange={(v) => set("netWeightG", v)} provenance={prov.netWeightG} />
    </div>
  );
}

/** Product URL with "Read page", and the "Look up filament data" button. */
export function LookupControls({ form }: { form: ProductForm }) {
  const { values, prov, set, readPage, readingPage, pageStatus, lookup, lookingUp, lookupError } = form;
  const ready = !!values.vendor?.trim() && !!values.material?.trim();
  return (
    <>
      <div className="flex items-end gap-2">
        <FormField
          className="min-w-0 flex-1"
          label="Product page URL"
          type="url"
          value={values.productUrl ?? ""}
          onChange={(v) => set("productUrl", v)}
          provenance={prov.productUrl}
          placeholder="https://…"
          help="A product page or a datasheet (PDF) link. Read page also follows a TDS linked from the page."
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
      <button type="button" className="btn w-full" onClick={() => void lookup()} disabled={!ready || lookingUp}>
        {lookingUp ? "Looking up…" : "🔎 Look up filament data"}
      </button>
      {lookupError && (
        <p role="alert" className="text-sm text-rose-400">
          {lookupError}
        </p>
      )}
    </>
  );
}

/** The suggestions review, when a lookup has run. */
export function Suggestions({ form }: { form: ProductForm }) {
  const { result, selection, setSelection, options, values, applySuggestion, fillAgreed, fills } = form;
  if (!result) return null;
  return (
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
  );
}

/** Temps, drying, density and the rest of the maker's data. */
export function DetailsGrid({ form }: { form: ProductForm }) {
  const { values, prov, set } = form;
  return (
    <div className="grid grid-cols-2 gap-3">
      {GRID_FIELDS.map((f) => (
        <FormField
          key={f.key}
          label={f.label}
          type={f.type === "number" || f.type === "url" ? f.type : "text"}
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
  );
}
