import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { getCached, setCached } from '../src/lib/cache';
import { CACHE_TTL_MS, CACHE_VERSION } from '../src/lib/config';

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
