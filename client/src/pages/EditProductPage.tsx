import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { fetchProduct, updateProduct } from "../api/inventory";
import { AppearanceFields, DetailsGrid, IdentityFields, LookupControls, SizeFields, Suggestions } from "../components/product/ProductSections";
import { useAsync } from "../hooks/useAsync";
import { PRODUCT_KEYS, useProductForm, type Provenance, type Values } from "../hooks/useProductForm";
import type { FieldSource, Product } from "../types";

/** A saved product as form strings (the form edits text; the server coerces). */
function valuesFromProduct(p: Product): Values {
  const v: Values = { vendor: p.vendor.name };
  for (const key of PRODUCT_KEYS) {
    if (key === "vendor") continue;
    const raw = (p as unknown as Record<string, unknown>)[key];
    v[key] = raw == null ? "" : Array.isArray(raw) ? raw.join(",") : String(raw);
  }
  return v;
}

function provFromSources(sources: Record<string, FieldSource>): Provenance {
  return Object.fromEntries(Object.entries(sources).map(([k, s]) => [k, { source: s.source, sourceRef: s.sourceRef }]));
}

export function EditProductPage() {
  const id = Number(useParams().id);
  const { data, error } = useAsync(() => fetchProduct(id), [id]);
  if (error) return <p role="alert" className="text-sm text-rose-400">{error}</p>;
  if (!data) return <p className="text-sm text-ink-400">Loading…</p>;
  return <EditForm product={data.product} sources={data.sources} />;
}

function EditForm({ product, sources }: { product: Product; sources: Record<string, FieldSource> }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const backTo = params.get("spool") ? `/spools/${params.get("spool")}` : "/";
  const [baseline] = useState(() => valuesFromProduct(product));
  const form = useProductForm(baseline, provFromSources(sources));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { product: changes, sources: changedSources } = form.productBody(baseline);
  const changedCount = Object.keys(changes).length;
  const ready = !!form.values.vendor?.trim() && !!form.values.material?.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (changedCount === 0) return navigate(backTo);
    setSaving(true);
    setError(null);
    try {
      await updateProduct(product.id, { ...changes, sources: changedSources });
      navigate(backTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Link to={backTo} className="text-sm text-ink-400 hover:text-ink-100">
        ‹ Back
      </Link>
      <div>
        <h1 className="text-lg font-semibold">Edit filament</h1>
        <p className="text-sm text-ink-400">
          {product.displayName} ·{" "}
          {product.spoolCount === 1 ? "changes apply to its spool." : `changes apply to all ${product.spoolCount} spools of it.`}
        </p>
      </div>

      <section className="card space-y-3" aria-labelledby="identity-heading">
        <h2 id="identity-heading" className="font-semibold">
          What is it?
        </h2>
        <IdentityFields form={form} />
        <SizeFields form={form} />
        <LookupControls form={form} />
      </section>

      <Suggestions form={form} />

      <section className="card space-y-4" aria-labelledby="looks-heading">
        <h2 id="looks-heading" className="font-semibold">
          Look
        </h2>
        <AppearanceFields form={form} />
      </section>

      <section className="card space-y-3" aria-labelledby="details-heading">
        <h2 id="details-heading" className="font-semibold">
          Filament details
        </h2>
        <DetailsGrid form={form} />
      </section>

      {error && (
        <p role="alert" className="rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-300 day:text-rose-800">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <Link to={backTo} className="btn py-3">
          Cancel
        </Link>
        <button type="submit" className="btn-primary flex-1 py-3 text-base" disabled={!ready || saving}>
          {saving ? "Saving…" : changedCount ? `Save ${changedCount} change${changedCount === 1 ? "" : "s"}` : "No changes"}
        </button>
      </div>
    </form>
  );
}
