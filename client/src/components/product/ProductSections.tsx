import { useId, useState } from "react";
import { fetchMaterials } from "../../api/enrich";
import { fetchVendors } from "../../api/inventory";
import { useAsync } from "../../hooks/useAsync";
import type { ProductForm } from "../../hooks/useProductForm";
import {
  FINISH_HELP,
  FINISHES,
  FLEXIBLE_MATERIALS,
  GRID_FIELDS,
  LINE_SUGGESTIONS,
  MATERIAL_PRESETS,
  SHORE_HELP,
  type ProductFieldKey,
} from "../../lib/productFields";
import { FormField } from "../FormField";
import { SuggestionsPanel } from "../intake/SuggestionsPanel";
import { SourceBadge } from "../SourceBadge";
import { ColorEditor } from "./ColorEditor";

/** Brand, material (with shortcuts), line and color name. */
export function IdentityFields({ form }: { form: ProductForm }) {
  const { values, prov, set } = form;
  const { data: vendors } = useAsync(fetchVendors, []);
  const { data: materials } = useAsync(fetchMaterials, []);
  return (
    <>
      <FormField label="Brand" value={values.vendor} onChange={(v) => set("vendor", v)} list="vendor-list" required placeholder="Sunlu" provenance={prov.vendor} />
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
                  if (p.finish) set("finish", p.finish);
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
            provenance={prov.material}
            help="OrcaSlicer's filament type; picks the base profile."
          />
          <FormField label="Line" value={values.line ?? ""} onChange={(v) => set("line", v)} list="line-list" placeholder="PLA+, High Speed…" provenance={prov.line} />
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

      <FormField label="Color name" value={values.colorName ?? ""} onChange={(v) => set("colorName", v)} provenance={prov.colorName} placeholder="Walnut" />
    </>
  );
}

/** Color(s), finish and - for flexible filament - Shore hardness. */
export function AppearanceFields({ form }: { form: ProductForm }) {
  const { values, prov, set } = form;
  const finishId = useId();
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

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label htmlFor={finishId} className="text-sm font-medium text-ink-200">
            Finish
          </label>
          {prov.finish && values.finish && <SourceBadge compact source={prov.finish.source} sourceRef={prov.finish.sourceRef} />}
        </div>
        <select id={finishId} className="field" value={values.finish ?? ""} onChange={(e) => set("finish", e.target.value)} aria-describedby={`${finishId}-help`}>
          <option value="">Not set</option>
          {FINISHES.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <p id={`${finishId}-help`} className="mt-1 text-xs leading-snug text-ink-400">
          {FINISH_HELP}
        </p>
      </div>

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
