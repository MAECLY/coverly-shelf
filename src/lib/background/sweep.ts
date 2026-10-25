/**
 * Background side of the cache retention setting. Called from
 * src/entrypoints/background.ts; every function here never rejects.
 *
 * - The session area is opened to content scripts, so "This session only"
 *   entries can live in `storage.session` (cleared by the browser on close).
 * - On browser start and on install/update, expired entries are swept; in
 *   session mode the local fallback copies (Firefox MV2) are dropped too.
 * - When the setting changes, entries stranded in the area that is no longer
 *   used are removed, then the new TTL is applied.
 */
import { browser } from 'wxt/browser';
import { clearCache, sweepExpired } from '../cache';
import { getSettings, watchSettings, type Retention } from '../settings';

/** Lets content scripts use `storage.session`. A no-op where the API does not exist. */
export async function openSessionArea(): Promise<boolean> {
  try {
    const session = (browser.storage as unknown as { session?: { setAccessLevel?: (o: object) => Promise<void> } })
      .session;
    if (!session || typeof session.setAccessLevel !== 'function') return false;
    await session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
    return true;
  } catch {
    return false;
  }
}

/** Browser start: a new session, so session-mode leftovers in local go away. */
export async function sweepOnStartup(now: number = Date.now()): Promise<void> {
  try {
    if ((await getSettings()).retention === 'session') await clearCache(['local']);
    await sweepExpired(now);
  } catch {
    // nothing to do: the cache only saves requests
  }
}

/** Applies a retention change: clear the area no longer used, then expire by the new TTL. */
export async function applyRetention(retention: Retention, now: number = Date.now()): Promise<void> {
  try {
    await clearCache(retention === 'session' ? ['local'] : ['session']);
    await sweepExpired(now);
  } catch {
    // ignore
  }
}

/** Wires everything up. Call once from defineBackground. */
export function initCacheRetention(): void {
  void openSessionArea();
  try {
    browser.runtime.onStartup.addListener(() => {
      void sweepOnStartup();
    });
    browser.runtime.onInstalled.addListener(() => {
      void sweepOnStartup();
    });
  } catch {
    // runtime events unavailable (tests)
  }
  let last: Retention | null = null;
  void getSettings().then((s) => {
    last ??= s.retention;
  });
  watchSettings((s) => {
    if (s.retention === last) return;
    last = s.retention;
    void applyRetention(s.retention);
  });
}
