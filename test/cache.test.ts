import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { cacheUsage, clearCache, getCached, setCached, sweepExpired } from '../src/lib/cache';
import { applyRetention, initCacheRetention, sweepOnStartup } from '../src/lib/background/sweep';
import { CACHE_TTL_MS, CACHE_VERSION } from '../src/lib/config';
import { setSettings } from '../src/lib/settings';

const DAY = 24 * 60 * 60 * 1000;

describe('cache', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('round-trips a value within the TTL', async () => {
    await setCached('local:cover:AZEE', { kind: 'placeholder' }, () => 1000);
    await expect(getCached('local:cover:AZEE', () => 1000 + CACHE_TTL_MS - 1)).resolves.toEqual({
      kind: 'placeholder',
    });
  });

  it('stores a versioned, timestamped entry', async () => {
    await setCached('local:gallery:AZEE', [], () => 42);
    await expect(storage.getItem('local:gallery:AZEE')).resolves.toEqual({ v: CACHE_VERSION, at: 42, value: [] });
  });

  it('treats bare keys as local keys', async () => {
    await setCached('cover:AREE', 'x', () => 0);
    await expect(getCached('local:cover:AREE', () => 0)).resolves.toBe('x');
  });

  it('expires entries once the default 7-day TTL has passed', async () => {
    await setCached('local:cover:AZEE', 'old', () => 0);
    await expect(getCached('local:cover:AZEE', () => CACHE_TTL_MS)).resolves.toBeUndefined();
  });

  it('ignores entries from another cache version', async () => {
    await storage.setItem('local:cover:AZEE', { v: CACHE_VERSION + 1, at: Date.now(), value: 'x' });
    await expect(getCached('local:cover:AZEE')).resolves.toBeUndefined();
  });

  it('ignores garbage and missing keys', async () => {
    await storage.setItem('local:cover:AZEE', 'not an entry');
    await expect(getCached('local:cover:AZEE')).resolves.toBeUndefined();
    await expect(getCached('local:cover:NONE')).resolves.toBeUndefined();
  });

  it('never rejects when storage throws', async () => {
    vi.spyOn(storage, 'getItem').mockRejectedValue(new Error('no storage'));
    vi.spyOn(storage, 'setItem').mockRejectedValue(new Error('quota'));
    await expect(setCached('local:cover:AZEE', 'x')).resolves.toBeUndefined();
    await expect(getCached('local:cover:AZEE')).resolves.toBeUndefined();
  });
});

describe('cache retention', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('uses the 1-day TTL when chosen', async () => {
    await setSettings({ retention: '1d' });
    await setCached('local:cover:AZEE', 'x', () => 0);
    await expect(getCached('local:cover:AZEE', () => DAY - 1)).resolves.toBe('x');
    await expect(getCached('local:cover:AZEE', () => DAY)).resolves.toBeUndefined();
  });

  it('uses the 30-day TTL when chosen', async () => {
    await setSettings({ retention: '30d' });
    await setCached('local:cover:AZEE', 'x', () => 0);
    await expect(getCached('local:cover:AZEE', () => 29 * DAY)).resolves.toBe('x');
    await expect(getCached('local:cover:AZEE', () => 30 * DAY)).resolves.toBeUndefined();
  });

  it('keeps entries with no time limit in forever mode', async () => {
    await setSettings({ retention: 'forever' });
    await setCached('local:cover:AZEE', 'x', () => 0);
    await expect(getCached('local:cover:AZEE', () => 3650 * DAY)).resolves.toBe('x');
    await expect(sweepExpired(3650 * DAY)).resolves.toBe(0);
  });

  it('routes entries to storage.session in session mode', async () => {
    await setSettings({ retention: 'session' });
    await setCached('local:cover:AZEE', 'x', () => 5);
    await expect(storage.getItem('session:cover:AZEE')).resolves.toEqual({ v: CACHE_VERSION, at: 5, value: 'x' });
    await expect(storage.getItem('local:cover:AZEE')).resolves.toBeNull();
    await expect(getCached('local:cover:AZEE', () => 365 * DAY)).resolves.toBe('x');
  });

  it('falls back to local when the session area is unavailable', async () => {
    await setSettings({ retention: 'session' });
    const real = storage.setItem.bind(storage);
    vi.spyOn(storage, 'setItem').mockImplementation(async (key, value) => {
      if (String(key).startsWith('session:')) throw new Error('Access to storage is not allowed');
      await real(key, value);
    });
    await setCached('local:cover:AZEE', 'x', () => 0);
    await expect(storage.getItem('local:cover:AZEE')).resolves.toMatchObject({ value: 'x' });
    await expect(getCached('local:cover:AZEE', () => 1)).resolves.toBe('x');
  });

  it('clearCache removes every cache key from both areas and keeps settings', async () => {
    await setSettings({ retention: '30d' });
    await setCached('local:cover:AZEE', 'a');
    await setCached('local:gallery:AZEE', []);
    await storage.setItem('local:lookup:AREE', { v: CACHE_VERSION, at: 0, value: 1 });
    await storage.setItem('session:cover:AREE', { v: CACHE_VERSION, at: 0, value: 1 });
    await storage.setItem('local:settings', { v: 1, retention: '1d' });
    await storage.setItem('local:unrelated', 'keep me');
    await clearCache();
    expect(await fakeBrowser.storage.local.get(null)).toEqual({
      settings: { v: 1, retention: '1d' },
      unrelated: 'keep me',
    });
    expect(await fakeBrowser.storage.session.get(null)).toEqual({});
    await expect(storage.getItem('sync:settings')).resolves.toEqual({ v: 1, retention: '30d' });
  });

  it('cacheUsage counts entries, games and bytes', async () => {
    await expect(cacheUsage()).resolves.toEqual({ bytes: 0, entries: 0, games: 0 });
    await setCached('local:cover:AZEE', { kind: 'placeholder' });
    await setCached('local:gallery:AZEE', []);
    await setCached('local:cover:AREE', { kind: 'placeholder' });
    const u = await cacheUsage();
    expect(u.entries).toBe(3);
    expect(u.games).toBe(2);
    expect(u.bytes).toBeGreaterThan(0);
  });

  it('sweepExpired removes expired, foreign-version and malformed entries only', async () => {
    await setSettings({ retention: '1d' });
    await setCached('local:cover:OLD1', 'x', () => 0);
    await setCached('local:cover:NEW1', 'x', () => 2 * DAY);
    await storage.setItem('local:cover:VER1', { v: CACHE_VERSION + 1, at: 2 * DAY, value: 1 });
    await storage.setItem('local:gallery:BAD1', 'garbage');
    await storage.setItem('session:cover:OLD2', { v: CACHE_VERSION, at: 0, value: 1 });
    await expect(sweepExpired(2 * DAY + 1)).resolves.toBe(4);
    expect(Object.keys(await fakeBrowser.storage.local.get(null)).sort()).toEqual(['cover:NEW1']);
    await expect(storage.getItem('sync:settings')).resolves.toMatchObject({ retention: '1d' });
  });

  it('switching to session mode clears the local cache; switching away clears the session one', async () => {
    await setCached('local:cover:AZEE', 'x');
    await setSettings({ retention: 'session' });
    await applyRetention('session');
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
    await setCached('local:cover:AZEE', 'y');
    expect(Object.keys(await fakeBrowser.storage.session.get(null))).toEqual(['cover:AZEE']);
    await setSettings({ retention: '7d' });
    await applyRetention('7d');
    expect(await fakeBrowser.storage.session.get(null)).toEqual({});
  });

  it('a worker woken by the settings change still applies the new retention', async () => {
    await setCached('local:cover:AZEE', 'x');
    // The change is already stored when the sleeping MV3 worker starts.
    await fakeBrowser.storage.sync.set({ settings: { v: 1, retention: 'session' } });
    initCacheRetention();
    await new Promise((r) => setTimeout(r, 0));
    // ...and only then is the queued onChanged event delivered.
    await fakeBrowser.storage.sync.onChanged.trigger({
      settings: { oldValue: { v: 1, retention: '7d' }, newValue: { v: 1, retention: 'session' } },
    });
    await vi.waitFor(async () => expect(await fakeBrowser.storage.local.get(null)).toEqual({}));
  });

  it('startup in session mode drops local fallback copies', async () => {
    await storage.setItem('local:cover:AZEE', { v: CACHE_VERSION, at: Date.now(), value: 'x' });
    await setSettings({ retention: 'session' });
    await sweepOnStartup();
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
  });
});
