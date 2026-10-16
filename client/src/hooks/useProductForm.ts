import { useMemo, useState } from "react";
import { readProductPage, searchEnrichment, type Candidate, type EnrichResult, type Suggestion } from "../api/enrich";
import type { SourceMap } from "../api/inventory";
import { DETAIL_FIELDS, ID_FIELDS, type ProductFieldKey } from "../lib/productFields";
import { agreedFills, defaultSelection, optionsByField, type Selection } from "../lib/suggestions";
import type { Source } from "../types";

export type Values = Record<string, string>;
export type Provenance = Record<string, { source: Source; sourceRef?: string | null }>;

/** Product fields sent on save (identity + every detail field + reference ids). */
export const PRODUCT_KEYS = ["vendor", "material", "line", ...DETAIL_FIELDS.map((f) => f.key), ...ID_FIELDS, "notes"];

/**
 * Form state for a filament (product) plus the enrichment lookup that
 * feeds it. Every value carries where it came from; typing makes it
 * "manual", tapping a suggestion takes that suggestion's source. Shared by
 * the intake and edit-filament screens.
 */
export function useProductForm(initialValues: Values, initialProv: Provenance = {}) {
  const [values, setValues] = useState<Values>(initialValues);
  const [prov, setProv] = useState<Provenance>(initialProv);

  const [searchResult, setSearchResult] = useState<EnrichResult | null>(null);
  // Candidates from a scanned barcode or a read product page; kept across re-lookups.
  const [extras, setExtras] = useState<Candidate[]>([]);
  const [selection, setSelection] = useState<Selection>({});
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [readingPage, setReadingPage] = useState(false);
  const [pageStatus, setPageStatus] = useState<string | null>(null);

  const set = (key: string, value: string, source: Source = "manual", sourceRef?: string | null) => {
    setValues((v) => ({ ...v, [key]: value }));
    setProv((p) => ({ ...p, [key]: { source, sourceRef } }));
  };

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

  const lookup = async (q?: Parameters<typeof searchEnrichment>[0]) => {
    setLookingUp(true);
    setLookupError(null);
    try {
      const r = await searchEnrichment(
        q ?? {
          vendor: values.vendor,
          material: values.material,
          line: values.line,
          colorName: values.colorName,
          diameterMm: values.diameterMm,
          netWeightG: values.netWeightG,
        },
      );
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

  const readPage = async () => {
    const url = values.productUrl?.trim();
    if (!url) return;
    setReadingPage(true);
    setPageStatus(null);
    try {
      const c = await readProductPage(url);
      addExtra(c);
      setPageStatus(
        c.suggestions.length
          ? `Read ${c.suggestions.length} value(s) from the page; review them in Suggestions.`
          : "The page loaded, but no temperatures or settings could be read from it.",
      );
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

  /**
   * The product body for the API plus provenance, keyed "product.<field>".
   * With `baseline`, only fields that differ from it are included, and
   * cleared fields are sent as null so the server clears them too.
   */
  const productBody = (baseline?: Values) => {
    const product: Record<string, string | null> = {};
    const sources: SourceMap = {};
    for (const key of PRODUCT_KEYS) {
      const v = values[key]?.trim() ?? "";
      if (baseline) {
        if (v === (baseline[key] ?? "").trim()) continue;
        product[key] = v === "" ? null : v;
      } else {
        if (!v) continue;
        product[key] = v;
      }
      if (key !== "vendor" && v !== "") sources[`product.${key}`] = prov[key] ?? { source: "manual" };
    }
    return { product, sources };
  };

  return {
    values,
    prov,
    set,
    result,
    selection,
    setSelection,
    setExtras,
    options,
    fills,
    lookup,
    lookingUp,
    lookupError,
    addExtra,
    readPage,
    readingPage,
    pageStatus,
    applySuggestion,
    fillAgreed,
    productBody,
  };
}

export type ProductForm = ReturnType<typeof useProductForm>;
