/**
 * Versioned cache of artwork lookups (which URL worked for each game). The
 * user's retention setting (src/lib/settings.ts) decides where entries live
 * and how long they count as fresh:
 * - `1d` / `7d` / `30d`: `storage.local`, expired on read and by sweepExpired.
 * - `forever`: `storage.local`, no TTL; only clearCache removes them.
 * - `session`: `storage.session` (cleared by the browser when it closes). If the
 *   session area is unavailable (Firefox MV2, or access not granted yet) the
 *   entry goes to `storage.local`, which the background clears on startup.
 *
 * Every call swallows storage errors: a broken cache only means more network requests.
 */
import { browser } from 'wxt/browser';
import { storage } from '#imports';
import { CACHE_PRUNE, CACHE_VERSION, LOOKUP } from './config';
import { getSettings, retentionMs, SETTINGS_KEY, type Settings } from './settings';

export interface CacheEntry<T> {
  v: number;
  at: number;
  value: T;
}

export type CacheArea = 'local' | 'session';
export const CACHE_AREAS: readonly CacheArea[] = ['local', 'session'];

type StorageKey = `local:${string}` | `session:${string}`;

/** Prefixes every artwork cache key uses. Entries written by setCached are also recognised by shape. */
const CACHE_KEY = /^(cover|thumb|gallery|lookup):/;

/**
 * Bookkeeping that is stored like a cache entry but is not artwork: hShop's
 * back-off window (`hshop:cooldown`) and the last sweep time. "Clear cache"
 * and the usage readout leave these alone; sweepExpired still drops them
 * once they are past their own TTL.
 */
const INTERNAL_KEY = /^(hshop|meta):/;

/**
 * Entries that are not artwork and keep their own lifetime whatever the
 * retention setting says (it is about how long art is kept): an hShop title
 * lookup never changes, and the back-off window must not outlive an hour.
 * They still follow the setting's storage area, and "Clear cache" removes lookups.
 */
const PREFIX_TTL: ReadonlyArray<readonly [string, number]> = [
  ['lookup:', LOOKUP.ttlMs],
  ['hshop:', LOOKUP.maxCooldownMs],
];

/** The caller's or the prefix's own TTL when there is one, else the retention (`null`: no limit). */
function keyTtl(key: string, retention: number | null, ttlMs?: number): number | null {
  if (ttlMs !== undefined) return ttlMs;
  const k = baseKey(key);
  return PREFIX_TTL.find(([prefix]) => k.startsWith(prefix))?.[1] ?? retention;
}

/** `local:cover:AZEE`, `session:cover:AZEE` and `cover:AZEE` all become `cover:AZEE`. */
function baseKey(key: string): string {
  return key.replace(/^(local|session|sync|managed):/, '');
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

function isCacheKey(key: string, value: unknown): boolean {
  return key !== SETTINGS_KEY && !INTERNAL_KEY.test(key) && (CACHE_KEY.test(key) || isEntry(value));
}

function preferredArea(s: Settings): CacheArea {
  return s.retention === 'session' ? 'session' : 'local';
}

function fresh(raw: unknown, ttl: number | null, now: number): raw is CacheEntry<unknown> {
  if (!isEntry(raw) || raw.v !== CACHE_VERSION) return false;
  const age = now - raw.at;
  if (age < 0) return false;
  return ttl === null || age < ttl;
}

/**
 * Returns the cached value, or `undefined` when it is missing, older than its
 * lifetime (the caller's `ttlMs`, else the key prefix's own, else the retention
 * setting), from another `CACHE_VERSION`, or storage fails. Never rejects.
 */
export async function getCached<T>(
  key: string,
  now: () => number = Date.now,
  ttlMs?: number,
): Promise<T | undefined> {
  try {
    const settings = await getSettings();
    const ttl = keyTtl(key, retentionMs(settings.retention), ttlMs);
    const k = baseKey(key);
    const areas: CacheArea[] = preferredArea(settings) === 'session' ? ['session', 'local'] : ['local'];
    for (const area of areas) {
      try {
        const raw: unknown = await storage.getItem(`${area}:${k}` as StorageKey);
        if (raw == null) continue;
        return fresh(raw, ttl, now()) ? (raw.value as T) : undefined;
      } catch {
        // area unavailable: try the next one
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Stores `value` stamped with the current time and version. Never rejects. */
export async function setCached<T>(key: string, value: T, now: () => number = Date.now): Promise<void> {
  try {
    const settings = await getSettings();
    const entry: CacheEntry<T> = { v: CACHE_VERSION, at: now(), value };
    const k = baseKey(key);
    if (preferredArea(settings) === 'session') {
      try {
        await storage.setItem(`session:${k}`, entry);
        return;
      } catch {
        // no session area here: local, cleared on the next browser start
      }
    }
    await storage.setItem(`local:${k}`, entry);
  } catch {
    // Quota or a missing storage permission: carry on without caching.
  }
}

type RawArea = {
  get(keys?: null): Promise<Record<string, unknown>>;
  remove(keys: string[]): Promise<void>;
  getBytesInUse?: (keys: string[]) => Promise<number>;
};

function rawArea(area: CacheArea): RawArea | null {
  try {
    const a = (browser.storage as unknown as Record<string, RawArea | undefined>)[area];
    return a && typeof a.get === 'function' ? a : null;
  } catch {
    return null;
  }
}

async function cacheItems(
  area: CacheArea,
  include: (key: string, value: unknown) => boolean = isCacheKey,
): Promise<Record<string, unknown>> {
  const a = rawArea(area);
  if (!a) return {};
  try {
    const all = await a.get(null);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(all ?? {})) if (include(k, v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

async function removeKeys(area: CacheArea, keys: string[]): Promise<number> {
  const a = rawArea(area);
  if (!a || keys.length === 0) return 0;
  try {
    await a.remove(keys);
    return keys.length;
  } catch {
    return 0;
  }
}

/**
 * Removes every cache entry (any `cover:`, `gallery:`, `lookup:` key or
 * cache-shaped value) from the given areas, both by default. Settings stay.
 * Never rejects.
 */
export async function clearCache(areas: readonly CacheArea[] = CACHE_AREAS): Promise<void> {
  for (const area of areas) {
    await removeKeys(area, Object.keys(await cacheItems(area)));
  }
}

export interface CacheUsage {
  /** Bytes the cache entries take (exact where getBytesInUse exists, estimated otherwise). */
  bytes: number;
  /** Number of cache keys. */
  entries: number;
  /** Number of distinct games the entries belong to. */
  games: number;
}

const encoder = new TextEncoder();

function estimateBytes(items: Record<string, unknown>): number {
  let total = 0;
  for (const [k, v] of Object.entries(items)) {
    total += encoder.encode(k).length + encoder.encode(JSON.stringify(v) ?? '').length;
  }
  return total;
}

/** Size of the cache across both areas. Never rejects. */
export async function cacheUsage(): Promise<CacheUsage> {
  let bytes = 0;
  let entries = 0;
  const games = new Set<string>();
  for (const area of CACHE_AREAS) {
    const items = await cacheItems(area);
    const keys = Object.keys(items);
    if (keys.length === 0) continue;
    entries += keys.length;
    for (const k of keys) games.add(k.replace(CACHE_KEY, ''));
    let exact: number | null = null;
    const a = rawArea(area);
    if (a && typeof a.getBytesInUse === 'function') {
      try {
        const n = await a.getBytesInUse(keys);
        if (typeof n === 'number' && Number.isFinite(n)) exact = n;
      } catch {
        exact = null;
      }
    }
    bytes += exact ?? estimateBytes(items);
  }
  return { bytes, entries, games: games.size };
}

/**
 * Deletes entries that are expired under the current retention setting, from
 * another cache version, or malformed. Returns how many were removed. Never rejects.
 */
export async function sweepExpired(now: number = Date.now()): Promise<number> {
  const retention = retentionMs((await getSettings()).retention);
  const sweepable = (k: string, v: unknown): boolean => isCacheKey(k, v) || k.startsWith('hshop:');
  let removed = 0;
  for (const area of CACHE_AREAS) {
    const items = await cacheItems(area, sweepable);
    const stale = Object.entries(items)
      .filter(([k, v]) => !fresh(v, keyTtl(k, retention), now))
      .map(([k]) => k);
    removed += await removeKeys(area, stale);
  }
  return removed;
}

const SWEPT_AT_KEY = 'local:meta:sweptAt';

/**
 * sweepExpired at most once per CACHE_PRUNE.intervalMs, remembered under
 * `local:meta:sweptAt` (not a cache key). The background worker calls it
 * whenever it starts, so a browser left open for weeks still sheds expired
 * entries without the `alarms` permission. Never rejects.
 */
export async function sweepIfDue(now: () => number = Date.now): Promise<number> {
  try {
    const last = await storage.getItem<number>(SWEPT_AT_KEY);
    const t = now();
    if (typeof last === 'number' && t - last >= 0 && t - last < CACHE_PRUNE.intervalMs) return 0;
    await storage.setItem(SWEPT_AT_KEY, t);
    return await sweepExpired(t);
  } catch {
    return 0;
  }
}
