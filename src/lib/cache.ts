/**
 * Versioned, TTL-bound cache on top of WXT's `local:` storage area. Every call
 * swallows storage errors: a broken cache only means more network requests.
 */
import { storage } from '#imports';
import { CACHE_PRUNE, CACHE_TTL_MS, CACHE_VERSION, LOOKUP } from './config';

export interface CacheEntry<T> {
  v: number;
  at: number;
  value: T;
}

type StorageKey = `local:${string}` | `session:${string}` | `sync:${string}` | `managed:${string}`;

/** Accepts `local:cover:AZEE` as-is and turns a bare `cover:AZEE` into `local:cover:AZEE`. */
function storageKey(key: string): StorageKey {
  return /^(local|session|sync|managed):/.test(key) ? (key as StorageKey) : `local:${key}`;
}

function isEntry(raw: unknown): raw is CacheEntry<unknown> {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    'v' in raw &&
    'at' in raw &&
    'value' in raw &&
    typeof (raw as CacheEntry<unknown>).at === 'number'
  );
}

/**
 * Returns the cached value, or `undefined` when it is missing, older than
 * `ttlMs` (default `CACHE_TTL_MS`), from another `CACHE_VERSION`, or storage
 * fails. Never rejects.
 */
export async function getCached<T>(
  key: string,
  now: () => number = Date.now,
  ttlMs: number = CACHE_TTL_MS,
): Promise<T | undefined> {
  try {
    const raw: unknown = await storage.getItem(storageKey(key));
    if (!isEntry(raw) || raw.v !== CACHE_VERSION) return undefined;
    const age = now() - raw.at;
    if (age < 0 || age >= ttlMs) return undefined;
    return raw.value as T;
  } catch {
    return undefined;
  }
}

/** Stores `value` stamped with the current time and version. Never rejects. */
export async function setCached<T>(key: string, value: T, now: () => number = Date.now): Promise<void> {
  try {
    const entry: CacheEntry<T> = { v: CACHE_VERSION, at: now(), value };
    await storage.setItem(storageKey(key), entry);
  } catch {
    // Quota or a missing storage permission: carry on without caching.
  }
}

// ---------------------------------------------------------------------------
// Pruning: getCached only ignores stale entries, so without this the storage
// area would only grow (every listing row adds `thumb:` and `lookup:` keys,
// and each CACHE_VERSION bump leaves the old entries behind).
// ---------------------------------------------------------------------------

/** Key prefixes (inside `local:`) this cache owns, with how long their entries live. */
export const CACHE_PREFIXES: Readonly<Record<string, number>> = {
  'cover:': CACHE_TTL_MS,
  'thumb:': CACHE_TTL_MS,
  'gallery:': CACHE_TTL_MS,
  'lookup:': LOOKUP.ttlMs,
  'hshop:': LOOKUP.maxCooldownMs,
};

function ownTtl(bareKey: string): number | undefined {
  for (const [prefix, ttl] of Object.entries(CACHE_PREFIXES)) {
    if (bareKey.startsWith(prefix)) return ttl;
  }
  return undefined;
}

export interface PruneOptions {
  now?: () => number;
  /** Remove every cache entry, fresh or not (a "clear cache" action). */
  all?: boolean;
}

/**
 * Deletes cache entries that no read would ever use again: another
 * CACHE_VERSION, past their TTL, stamped in the future or not an entry at
 * all. Only keys under CACHE_PREFIXES are touched, so other data in
 * `local:` (settings) is never removed. Returns how many keys went away;
 * never rejects (0 on a storage error).
 */
export async function pruneCache({ now = Date.now, all = false }: PruneOptions = {}): Promise<number> {
  try {
    const items = await storage.snapshot('local');
    const t = now();
    const stale: StorageKey[] = [];
    for (const [key, raw] of Object.entries(items)) {
      const ttl = ownTtl(key);
      if (ttl === undefined) continue;
      const age = isEntry(raw) ? t - raw.at : Number.NaN;
      const keep = !all && isEntry(raw) && raw.v === CACHE_VERSION && age >= 0 && age < ttl;
      if (!keep) stale.push(`local:${key}`);
    }
    if (stale.length > 0) await storage.removeItems(stale);
    return stale.length;
  } catch {
    return 0;
  }
}

/**
 * pruneCache at most once per CACHE_PRUNE.intervalMs, remembered under
 * `local:meta:prunedAt` (outside the cache prefixes). The background worker
 * calls it whenever it starts, which needs no `alarms` permission. Never rejects.
 */
export async function pruneCacheIfDue(now: () => number = Date.now): Promise<number> {
  try {
    const last = await storage.getItem<number>('local:meta:prunedAt');
    const t = now();
    if (typeof last === 'number' && t - last >= 0 && t - last < CACHE_PRUNE.intervalMs) return 0;
    await storage.setItem('local:meta:prunedAt', t);
    return await pruneCache({ now });
  } catch {
    return 0;
  }
}
