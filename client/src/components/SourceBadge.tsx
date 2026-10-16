import { SOURCE_LABELS, SOURCE_SHORT_LABELS, type Source } from "../types";

const STYLES: Record<Source, string> = {
  manual: "border-ink-600 bg-ink-800 text-ink-200",
  ofd: "border-sky-500/50 bg-sky-500/15 text-sky-300 day:text-sky-800",
  spoolmandb: "border-violet-500/50 bg-violet-500/15 text-violet-300 day:text-violet-800",
  spoolz: "border-teal-500/50 bg-teal-500/15 text-teal-300 day:text-teal-800",
  product_url: "border-amber-500/50 bg-amber-500/15 text-amber-300 day:text-amber-800",
  orca_import: "border-rose-500/50 bg-rose-500/15 text-rose-300 day:text-rose-800",
  default: "border-ink-600 bg-ink-900 text-ink-400",
  inferred: "border-ink-600 border-dashed bg-ink-900 text-ink-300",
};

/** Where a value came from. Links out when the source has a URL. */
export function SourceBadge({ source, sourceRef, compact }: { source: Source; sourceRef?: string | null; compact?: boolean }) {
  const cls = `inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${STYLES[source]}`;
  const label = compact ? SOURCE_SHORT_LABELS[source] : SOURCE_LABELS[source];
  if (sourceRef && /^https?:\/\//.test(sourceRef)) {
    return (
      <a href={sourceRef} target="_blank" rel="noreferrer" className={`${cls} hover:underline`} title={`${SOURCE_LABELS[source]}: ${sourceRef}`}>
        {label} ↗
      </a>
    );
  }
  return (
    <span className={cls} title={sourceRef ? `${SOURCE_LABELS[source]}: ${sourceRef}` : SOURCE_LABELS[source]}>
      {label}
    </span>
  );
}
