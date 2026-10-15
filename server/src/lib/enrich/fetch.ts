import { config } from "../../config";
import { getDb } from "../../db";
import { HttpError } from "../http";

const MAX_BYTES = 25 * 1024 * 1024; // SpoolmanDB + OFD's GTIN index are a few MB each

/** GET a URL as text with a timeout, a size cap and an identifiable User-Agent. */
export async function fetchText(url: string, opts: { maxBytes?: number; accept?: string } = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": config.userAgent, Accept: opts.accept ?? "*/*" },
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new HttpError(502, `${new URL(url).host} returned HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > (opts.maxBytes ?? MAX_BYTES)) throw new HttpError(502, `${new URL(url).host} response too large`);
  return text;
}

export async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url, { accept: "application/json" })) as T;
}

// Parsed bodies stay in memory too, so repeated searches don't re-parse
// multi-megabyte JSON out of SQLite each time.
const memo = new Map<string, { fetchedAt: number; body: unknown }>();

/**
 * Fetch through the enrich_cache table. Fresh entries are served without a
 * request; if a refresh fails, a stale copy is served rather than an error,
 * so lookups keep working offline once data has been fetched once.
 */
export async function cachedJson<T>(source: string, url: string, maxAgeMs: number): Promise<T> {
  const key = `${source}:${url}`;
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && now - hit.fetchedAt < maxAgeMs) return hit.body as T;

  const db = getDb();
  const row = db.prepare("SELECT body, fetched_at FROM enrich_cache WHERE source = ? AND key = ?").get(source, url) as
    | { body: string; fetched_at: string }
    | undefined;
  if (row && now - Date.parse(row.fetched_at) < maxAgeMs) {
    const body = JSON.parse(row.body) as T;
    memo.set(key, { fetchedAt: Date.parse(row.fetched_at), body });
    return body;
  }

  try {
    const text = await fetchText(url, { accept: "application/json" });
    const body = JSON.parse(text) as T;
    db.prepare(
      `INSERT INTO enrich_cache (source, key, fetched_at, body) VALUES (?, ?, ?, ?)
       ON CONFLICT(source, key) DO UPDATE SET fetched_at = excluded.fetched_at, body = excluded.body`,
    ).run(source, url, new Date(now).toISOString(), text);
    memo.set(key, { fetchedAt: now, body });
    return body;
  } catch (err) {
    if (row) return JSON.parse(row.body) as T; // stale beats nothing
    throw err;
  }
}

/** A 404 from a static dataset just means "no such record". */
export async function cachedJsonOrNull<T>(source: string, url: string, maxAgeMs: number): Promise<T | null> {
  try {
    return await cachedJson<T>(source, url, maxAgeMs);
  } catch (err) {
    if (err instanceof HttpError && /HTTP 404/.test(err.message)) return null;
    throw err;
  }
}

/** Drop every cached dataset (Settings → Refresh data). */
export function clearEnrichCache() {
  memo.clear();
  getDb().prepare("DELETE FROM enrich_cache").run();
}

export const DAY_MS = 24 * 60 * 60 * 1000;
