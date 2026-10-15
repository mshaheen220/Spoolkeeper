import { materialDefaults } from "../materials";
import type { Source } from "../schemas";
import { lookupGtin, searchOfd } from "./ofd";
import { searchSpoolmanDb } from "./spoolmandb";
import { searchSpoolz } from "./spoolz";
import type { Candidate, EnrichQuery, EnrichResult } from "./types";

function defaultsCandidate(q: EnrichQuery): Candidate | null {
  const m = materialDefaults(q.material);
  if (!m) return null;
  const s = (field: Candidate["suggestions"][number]["field"], value: number) => ({
    field,
    value,
    source: "default" as const,
    sourceRef: null,
    note: `typical ${m.type}`,
  });
  return {
    source: "default",
    id: m.type,
    title: `Typical ${m.type} values`,
    sourceRef: null,
    score: 0,
    suggestions: [
      s("density", m.density),
      s("nozzleMin", m.nozzle[0]),
      s("nozzleMax", m.nozzle[1]),
      s("bedMin", m.bed[0]),
      s("bedMax", m.bed[1]),
      s("dryTempC", m.dry[0]),
      s("dryHours", m.dry[1]),
    ],
  };
}

/** Query every dataset in parallel; one failing source never sinks the rest. */
export async function enrich(q: EnrichQuery): Promise<EnrichResult> {
  const sources: [Source, Promise<Candidate[]>][] = [
    ["ofd", searchOfd(q)],
    ["spoolmandb", searchSpoolmanDb(q)],
    ["spoolz", searchSpoolz(q)],
  ];
  const settled = await Promise.allSettled(sources.map(([, p]) => p));
  const candidates: Candidate[] = [];
  const errors: EnrichResult["errors"] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") candidates.push(...r.value);
    else errors.push({ source: sources[i][0], message: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  });
  const defaults = defaultsCandidate(q);
  if (defaults) candidates.push(defaults);
  return { candidates, errors };
}

export { lookupGtin };
