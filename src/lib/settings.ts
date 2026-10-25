/**
 * User settings, stored as one versioned object under `settings` in
 * `storage.sync` (so they follow the browser profile), with `storage.local`
 * as the fallback when sync is unavailable. Every read is validated: bad or
 * missing data falls back to DEFAULT_SETTINGS, never to an exception.
 */
import { storage } from '#imports';

/** How long cached artwork lookups are kept. `session` = until the browser closes. */
export type Retention = 'session' | '1d' | '7d' | '30d' | 'forever';

export interface Settings {
  v: 1;
  retention: Retention;
}

export const RETENTIONS: readonly Retention[] = ['session', '1d', '7d', '30d', 'forever'];

export const DEFAULT_SETTINGS: Settings = Object.freeze({ v: 1, retention: '7d' }) as Settings;

/** Storage key name (without the area prefix). Never a cache key. */
export const SETTINGS_KEY = 'settings';
const SYNC_KEY = `sync:${SETTINGS_KEY}` as const;
const LOCAL_KEY = `local:${SETTINGS_KEY}` as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** TTL for a retention choice; null means no time limit ('forever', and 'session' which ends with the browser). */
export function retentionMs(r: Retention): number | null {
  switch (r) {
    case '1d':
      return DAY_MS;
    case '7d':
      return 7 * DAY_MS;
    case '30d':
      return 30 * DAY_MS;
    case 'session':
    case 'forever':
      return null;
  }
}

export function isRetention(x: unknown): x is Retention {
  return typeof x === 'string' && (RETENTIONS as readonly string[]).includes(x);
}

/** Turns anything read from storage into valid Settings, keeping what is valid. */
export function normalizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const r = (raw as { retention?: unknown }).retention;
  return { v: 1, retention: isRetention(r) ? r : DEFAULT_SETTINGS.retention };
}

async function readRaw(): Promise<unknown> {
  try {
    const synced: unknown = await storage.getItem(SYNC_KEY);
    if (synced != null) return synced;
  } catch {
    // sync disabled or unavailable: try local
  }
  try {
    return await storage.getItem(LOCAL_KEY);
  } catch {
    return null;
  }
}

/** Current settings. Never rejects; defaults on any error. */
export async function getSettings(): Promise<Settings> {
  return normalizeSettings(await readRaw());
}

/** Merges `patch` into the stored settings. Invalid values are ignored. */
export async function setSettings(patch: Partial<Omit<Settings, 'v'>>): Promise<void> {
  const current = await getSettings();
  const next: Settings = normalizeSettings({ ...current, ...patch });
  if (patch.retention !== undefined && !isRetention(patch.retention)) next.retention = current.retention;
  try {
    await storage.setItem(SYNC_KEY, next);
    return;
  } catch {
    // fall through to local
  }
  await storage.setItem(LOCAL_KEY, next);
}

/** Calls `cb` with the new settings whenever they change in either area. Returns an unwatch function. */
export function watchSettings(cb: (s: Settings) => void): () => void {
  const unwatchers: (() => void)[] = [];
  const fire = (): void => {
    void getSettings().then(cb);
  };
  for (const key of [SYNC_KEY, LOCAL_KEY] as const) {
    try {
      unwatchers.push(storage.watch(key, fire));
    } catch {
      // area unavailable
    }
  }
  return () => {
    for (const u of unwatchers.splice(0)) u();
  };
}
