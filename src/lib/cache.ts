/**
 * Versioned, TTL-bound cache on top of WXT's `local:` storage area. Every call
 * swallows storage errors: a broken cache only means more network requests.
 */
import { storage } from '#imports';
import { CACHE_TTL_MS, CACHE_VERSION } from './config';

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
