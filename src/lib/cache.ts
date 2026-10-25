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
import { CACHE_VERSION } from './config';
import { getSettings, retentionMs, SETTINGS_KEY, type Settings } from './settings';

export interface CacheEntry<T> {
  v: number;
  at: number;
  value: T;
}

export type CacheArea = 'local' | 'session';
export const CACHE_AREAS: readonly CacheArea[] = ['local', 'session'];

type StorageKey = `local:${string}` | `session:${string}`;

/** Prefixes every cache key uses. Entries written by setCached are also recognised by shape. */
const CACHE_KEY = /^(cover|gallery|lookup):/;

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
  return key !== SETTINGS_KEY && (CACHE_KEY.test(key) || isEntry(value));
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
 * Returns the cached value, or `undefined` when it is missing, expired, from
 * another `CACHE_VERSION`, or storage fails. Never rejects.
 */
export async function getCached<T>(key: string, now: () => number = Date.now): Promise<T | undefined> {
  try {
    const settings = await getSettings();
    const ttl = retentionMs(settings.retention);
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

async function cacheItems(area: CacheArea): Promise<Record<string, unknown>> {
  const a = rawArea(area);
  if (!a) return {};
  try {
    const all = await a.get(null);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(all ?? {})) if (isCacheKey(k, v)) out[k] = v;
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
  const ttl = retentionMs((await getSettings()).retention);
  let removed = 0;
  for (const area of CACHE_AREAS) {
    const items = await cacheItems(area);
    const stale = Object.entries(items)
      .filter(([, v]) => !fresh(v, ttl, now))
      .map(([k]) => k);
    removed += await removeKeys(area, stale);
  }
  return removed;
}
