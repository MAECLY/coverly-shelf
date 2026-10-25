import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { getCached, pruneCache, pruneCacheIfDue, setCached } from '../src/lib/cache';
import { CACHE_PRUNE, CACHE_TTL_MS, CACHE_VERSION, LOOKUP } from '../src/lib/config';

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

  it('expires entries once the TTL has passed', async () => {
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

describe('pruneCache', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  const T = 10 * CACHE_TTL_MS;

  async function seed(): Promise<void> {
    await setCached('local:thumb:FRESH', 'x', () => T - 1000);
    await setCached('local:cover:OLD', 'x', () => T - CACHE_TTL_MS);
    await storage.setItem('local:gallery:V1', { v: 1, at: T, value: [] });
    await storage.setItem('local:thumb:FUTURE', { v: CACHE_VERSION, at: T + 60_000, value: 'x' });
    await storage.setItem('local:cover:JUNK', 'not an entry');
    // Lookups live 30 days, not 7.
    await setCached('local:lookup:1', { info: null }, () => T - CACHE_TTL_MS);
    await setCached('local:lookup:2', { info: null }, () => T - LOOKUP.ttlMs);
    // Not ours: never touched, whatever it holds.
    await storage.setItem('local:settings', { v: 0, at: 0, value: 'keep' });
    await storage.setItem('local:meta:prunedAt', 0);
  }

  it('removes old-version, expired, future-stamped and malformed entries only', async () => {
    await seed();
    await expect(pruneCache({ now: () => T })).resolves.toBe(5);
    const left = Object.keys(await storage.snapshot('local')).sort();
    expect(left).toEqual(['lookup:1', 'meta:prunedAt', 'settings', 'thumb:FRESH']);
    await expect(getCached('local:thumb:FRESH', () => T)).resolves.toBe('x');
  });

  it('clears every cache entry with all: true and keeps other data', async () => {
    await seed();
    await pruneCache({ now: () => T, all: true });
    expect(Object.keys(await storage.snapshot('local')).sort()).toEqual(['meta:prunedAt', 'settings']);
  });

  it('never rejects when storage throws', async () => {
    vi.spyOn(storage, 'snapshot').mockRejectedValue(new Error('no storage'));
    await expect(pruneCache()).resolves.toBe(0);
  });
});

describe('pruneCacheIfDue', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('prunes at most once per interval', async () => {
    let t = 50 * CACHE_TTL_MS;
    const now = (): number => t;
    await storage.setItem('local:cover:V1', { v: 1, at: t, value: 'x' });
    await expect(pruneCacheIfDue(now)).resolves.toBe(1);
    await storage.setItem('local:cover:V1', { v: 1, at: t, value: 'x' });
    t += CACHE_PRUNE.intervalMs - 1;
    await expect(pruneCacheIfDue(now)).resolves.toBe(0);
    await expect(storage.getItem('local:cover:V1')).resolves.not.toBeNull();
    t += 1;
    await expect(pruneCacheIfDue(now)).resolves.toBe(1);
  });

  it('never rejects when storage throws', async () => {
    vi.spyOn(storage, 'getItem').mockRejectedValue(new Error('no storage'));
    await expect(pruneCacheIfDue()).resolves.toBe(0);
  });
});
