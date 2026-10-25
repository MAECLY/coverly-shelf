import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import {
  DEFAULT_SETTINGS,
  getSettings,
  normalizeSettings,
  retentionMs,
  setSettings,
  watchSettings,
  type Settings,
} from '../src/lib/settings';

const DAY = 24 * 60 * 60 * 1000;

describe('settings', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('defaults to 7 days, version 1', async () => {
    expect(DEFAULT_SETTINGS).toEqual({ v: 1, retention: '7d' });
    await expect(getSettings()).resolves.toEqual({ v: 1, retention: '7d' });
  });

  it('maps every retention to its TTL', () => {
    expect(retentionMs('1d')).toBe(DAY);
    expect(retentionMs('7d')).toBe(7 * DAY);
    expect(retentionMs('30d')).toBe(30 * DAY);
    expect(retentionMs('forever')).toBeNull();
    expect(retentionMs('session')).toBeNull();
  });

  it('persists under one versioned key in storage.sync', async () => {
    await setSettings({ retention: '30d' });
    await expect(storage.getItem('sync:settings')).resolves.toEqual({ v: 1, retention: '30d' });
    await expect(getSettings()).resolves.toEqual({ v: 1, retention: '30d' });
  });

  it('falls back to storage.local when sync fails', async () => {
    const real = storage.setItem.bind(storage);
    vi.spyOn(storage, 'setItem').mockImplementation(async (key, value) => {
      if (String(key).startsWith('sync:')) throw new Error('sync disabled');
      await real(key, value);
    });
    await setSettings({ retention: 'session' });
    await expect(storage.getItem('local:settings')).resolves.toEqual({ v: 1, retention: 'session' });
    await expect(getSettings()).resolves.toMatchObject({ retention: 'session' });
  });

  it('validates what it reads', async () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ retention: '2y' })).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ v: 9, retention: '1d' })).toEqual({ v: 1, retention: '1d' });
    await storage.setItem('sync:settings', { v: 1, retention: 42 });
    await expect(getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('ignores invalid patches', async () => {
    await setSettings({ retention: '1d' });
    await setSettings({ retention: 'nope' as Settings['retention'] });
    await expect(getSettings()).resolves.toMatchObject({ retention: '1d' });
  });

  it('never rejects when storage throws', async () => {
    vi.spyOn(storage, 'getItem').mockRejectedValue(new Error('gone'));
    await expect(getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('notifies watchers and stops after unwatch', async () => {
    const seen: Settings[] = [];
    const unwatch = watchSettings((s) => seen.push(s));
    await setSettings({ retention: 'forever' });
    await vi.waitFor(() => expect(seen.at(-1)).toEqual({ v: 1, retention: 'forever' }));
    unwatch();
    const count = seen.length;
    await setSettings({ retention: '1d' });
    await new Promise((r) => setTimeout(r, 10));
    expect(seen.length).toBe(count);
  });
});
