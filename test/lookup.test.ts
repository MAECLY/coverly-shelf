import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { CACHE_VERSION, LOOKUP } from '../src/lib/config';
import { extractListEntries } from '../src/lib/extract';
import {
  cooldownFromRetryAfter,
  lookupGameInfo,
  parseTitlePage,
  rememberGameInfo,
  rememberShownCodes,
  resetHshopCooldown,
} from '../src/lib/lookup';
import type { GameInfo } from '../src/lib/types';

const FIXTURES = join(__dirname, 'fixtures', 'hshop');

function page(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '');
}

const RETAIL = page('title-retail-us-1814.html');
const THEME = page('title-theme-15834.html');

function response(body: string, init: { status?: number; url?: string } = {}): Response {
  const res = new Response(body, { status: init.status ?? 200, headers: { 'content-type': 'text/html' } });
  Object.defineProperty(res, 'url', { value: init.url ?? '' });
  return res;
}

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fakeBrowser.reset();
  resetHshopCooldown();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('parseTitlePage', () => {
  it('reads a title page', () => {
    expect(parseTitlePage(RETAIL)).toMatchObject({ productCode: 'CTR-P-AZEE', gameCode: 'AZEE' });
  });

  it('gives a definite null for a page without a usable code (theme)', () => {
    expect(parseTitlePage(THEME)).toBeNull();
  });

  it('gives no answer for a page that is not a title page', () => {
    expect(parseTitlePage('<html><body>Just a moment…</body></html>')).toBeUndefined();
  });
});

describe('lookupGameInfo', () => {
  it('fetches /t/{id} on hShop and returns its GameInfo', async () => {
    fetchMock.mockResolvedValue(response(RETAIL, { url: 'https://hshop.erista.me/t/1814' }));
    const info = await lookupGameInfo('1814');
    expect(info).toMatchObject({ productCode: 'CTR-P-AZEE', region: 'US', hshopRegion: 'north-america' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://hshop.erista.me/t/1814');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('caches hits for 30 days', async () => {
    let t = 1_000;
    const now = (): number => t;
    fetchMock.mockResolvedValue(response(RETAIL));
    await lookupGameInfo('1814', { now });
    t += LOOKUP.ttlMs - 1;
    await expect(lookupGameInfo('1814', { now })).resolves.toMatchObject({ gameCode: 'AZEE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    t += 1;
    await lookupGameInfo('1814', { now });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches definite misses (theme page, 404)', async () => {
    fetchMock.mockResolvedValueOnce(response(THEME)).mockResolvedValueOnce(response('nope', { status: 404 }));
    await expect(lookupGameInfo('15834')).resolves.toBeNull();
    await expect(lookupGameInfo('99999999')).resolves.toBeNull();
    await expect(lookupGameInfo('15834')).resolves.toBeNull();
    await expect(lookupGameInfo('99999999')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(storage.getItem('local:lookup:15834')).resolves.toMatchObject({ value: { info: null } });
  });

  it('does not cache a network error and retries on the next call', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(lookupGameInfo('1814')).resolves.toBeNull();
    await expect(storage.getItem('local:lookup:1814')).resolves.toBeNull();
    fetchMock.mockResolvedValue(response(RETAIL));
    await expect(lookupGameInfo('1814')).resolves.toMatchObject({ gameCode: 'AZEE' });
  });

  it.each([
    ['a 429', () => Promise.resolve(response('slow down', { status: 429 }))],
    ['a 503', () => Promise.resolve(response('down', { status: 503 }))],
    ['a challenge page', () => Promise.resolve(response('<html><body>Checking your browser</body></html>'))],
    ['a redirect elsewhere', () => Promise.resolve(response(RETAIL, { url: 'https://hshop.erista.me/' }))],
  ])('does not cache %s and backs off before asking hShop again', async (_, impl) => {
    let t = 1_000_000;
    const now = (): number => t;
    fetchMock.mockImplementation(impl);
    await expect(lookupGameInfo('1814', { now })).resolves.toBeNull();
    await expect(storage.getItem('local:lookup:1814')).resolves.toBeNull();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(response(RETAIL));
    // During the cooldown nothing is sent, for this id or any other.
    t += LOOKUP.cooldownMs - 1;
    await expect(lookupGameInfo('1814', { now })).resolves.toBeNull();
    await expect(lookupGameInfo('2000', { now })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    t += 1;
    await expect(lookupGameInfo('1814', { now })).resolves.toMatchObject({ gameCode: 'AZEE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honours Retry-After and keeps the cooldown across page views', async () => {
    let t = 5_000_000;
    const now = (): number => t;
    const res = response('slow down', { status: 429 });
    res.headers.set('retry-after', '120');
    fetchMock.mockResolvedValueOnce(res);
    await lookupGameInfo('1814', { now });
    // A new page view: no in-memory state, only storage.
    resetHshopCooldown();
    fetchMock.mockResolvedValue(response(RETAIL));
    t += 119_000;
    await expect(lookupGameInfo('1814', { now })).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    t += 1_000;
    await expect(lookupGameInfo('1814', { now })).resolves.toMatchObject({ gameCode: 'AZEE' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('drops lookups already queued behind a request that got a 429', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/t/1') ? response('slow down', { status: 429 }) : response(RETAIL),
    );
    await Promise.all(['1', '2', '3', '4', '5', '6'].map((id) => lookupGameInfo(id)));
    // 1 and 2 start together (two in flight); 3+ start after the 429 and are skipped.
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://hshop.erista.me/t/1',
      'https://hshop.erista.me/t/2',
    ]);
  });

  it('drops queued lookups and cancels in-flight ones when the signal aborts', async () => {
    const ctrl = new AbortController();
    const seen: Array<AbortSignal | null | undefined> = [];
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((resolve, reject) => {
          seen.push(init?.signal);
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          setTimeout(() => resolve(response(RETAIL)), 50);
        }),
    );
    const all = Promise.all(['11', '12', '13', '14'].map((id) => lookupGameInfo(id, { signal: ctrl.signal })));
    await new Promise((r) => setTimeout(r, 0));
    ctrl.abort();
    await expect(all).resolves.toEqual([null, null, null, null]);
    // Only the two in-flight requests went out, and both were cancelled.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seen.every((sig) => sig?.aborted)).toBe(true);
    for (const id of ['11', '12', '13', '14']) await expect(storage.getItem(`local:lookup:${id}`)).resolves.toBeNull();
  });

  it('sends nothing for an already aborted signal, and a later caller starts afresh', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    fetchMock.mockResolvedValue(response(RETAIL));
    await expect(lookupGameInfo('1814', { signal: ctrl.signal })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(lookupGameInfo('1814')).resolves.toMatchObject({ gameCode: 'AZEE' });
  });

  it('does not hand an aborted in-flight lookup to a new caller', async () => {
    const ctrl = new AbortController();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          setTimeout(() => resolve(response(RETAIL)), 20);
        }),
    );
    const old = lookupGameInfo('1814', { signal: ctrl.signal });
    ctrl.abort();
    const fresh = lookupGameInfo('1814');
    await expect(old).resolves.toBeNull();
    await expect(fresh).resolves.toMatchObject({ gameCode: 'AZEE' });
  });

  it('reads Retry-After as seconds or an HTTP date, clamped', () => {
    expect(cooldownFromRetryAfter(null, 0)).toBe(LOOKUP.cooldownMs);
    expect(cooldownFromRetryAfter('garbage', 0)).toBe(LOOKUP.cooldownMs);
    expect(cooldownFromRetryAfter('120', 0)).toBe(120_000);
    expect(cooldownFromRetryAfter('1', 0)).toBe(LOOKUP.minCooldownMs);
    expect(cooldownFromRetryAfter('999999', 0)).toBe(LOOKUP.maxCooldownMs);
    const now = Date.parse('2026-10-25T10:00:00Z');
    expect(cooldownFromRetryAfter('Sun, 25 Oct 2026 10:05:00 GMT', now)).toBe(300_000);
  });

  it('shares one request between concurrent callers', async () => {
    fetchMock.mockResolvedValue(response(RETAIL));
    const [a, b] = await Promise.all([lookupGameInfo('1814'), lookupGameInfo('1814')]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps at most two hShop requests in flight', async () => {
    let active = 0;
    let peak = 0;
    fetchMock.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return response(RETAIL);
    });
    await Promise.all(['1', '2', '3', '4', '5', '6'].map((id) => lookupGameInfo(id)));
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(peak).toBe(LOOKUP.maxConcurrent);
  });

  it('rejects ids that are not numbers without a request', async () => {
    for (const id of ['', 'abc', '../c/games', '1/2', '12345678901']) {
      await expect(lookupGameInfo(id)).resolves.toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a corrupted cache entry and refetches', async () => {
    await storage.setItem('local:lookup:1814', { v: CACHE_VERSION, at: Date.now(), value: { info: { title: 1 } } });
    fetchMock.mockResolvedValue(response(RETAIL));
    await expect(lookupGameInfo('1814')).resolves.toMatchObject({ gameCode: 'AZEE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never rejects, even when storage fails', async () => {
    vi.spyOn(storage, 'getItem').mockRejectedValue(new Error('boom'));
    vi.spyOn(storage, 'setItem').mockRejectedValue(new Error('boom'));
    fetchMock.mockResolvedValue(response(RETAIL));
    await expect(lookupGameInfo('1814')).resolves.toMatchObject({ gameCode: 'AZEE' });
    vi.restoreAllMocks();
  });
});

describe('rememberGameInfo', () => {
  const info: GameInfo = {
    title: 'Fire Panic',
    productCode: 'TWL-N-KF8E',
    platform: 'TWL',
    distribution: 'N',
    gameCode: 'KF8E',
    regionChar: 'E',
    region: 'US',
    titleId: '000480044B463845',
    hshopRegion: 'north-america',
  };

  it('seeds the lookup cache so no request is made', async () => {
    await rememberGameInfo('6622', info);
    await expect(lookupGameInfo('6622')).resolves.toEqual(info);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not rewrite an entry that already holds the same code', async () => {
    await rememberGameInfo('6622', info, { now: () => 1_000 });
    const setItem = vi.spyOn(storage, 'setItem');
    await rememberGameInfo('6622', { ...info, title: 'Fire Panic (row)' }, { now: () => 2_000 });
    expect(setItem).not.toHaveBeenCalled();
    await rememberGameInfo('6622', { ...info, productCode: 'TWL-N-KF8P', gameCode: 'KF8P', regionChar: 'P' }, { now: () => 3_000 });
    expect(setItem).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('ignores bad input', async () => {
    await rememberGameInfo('x', info);
    await rememberGameInfo('1', { ...info, platform: 'NDS' } as unknown as GameInfo);
    await expect(storage.getItem('local:lookup:1')).resolves.toBeNull();
  });
});

describe('rememberShownCodes', () => {
  function listing(): Document {
    const html = readFileSync(join(FIXTURES, 'lists', 'games-japan.html'), 'utf8')
      .replace(/<link\b[^>]*>/gi, '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, '');
    return new DOMParser().parseFromString(html, 'text/html');
  }

  it('stores main-list codes so a top-list row on another page needs no request', async () => {
    const entries = extractListEntries(listing(), { pathname: '/c/games/s/japan' });
    const main = entries.filter((e) => e.info && !e.anchor.closest('.list.top-list'));
    expect(main.length).toBeGreaterThan(0);
    await rememberShownCodes(entries);
    for (const e of main) {
      await expect(lookupGameInfo(e.hshopId as string)).resolves.toMatchObject({ productCode: e.info?.productCode });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never stores a top-list row, even one that borrowed a code', async () => {
    const entries = extractListEntries(listing(), { pathname: '/c/games/s/japan' });
    const mainIds = new Set(entries.filter((e) => !e.anchor.closest('.list.top-list')).map((e) => e.hshopId));
    const topOnly = entries.filter((e) => e.anchor.closest('.list.top-list') && !mainIds.has(e.hshopId));
    expect(topOnly.length).toBeGreaterThan(0);
    await rememberShownCodes(entries);
    for (const e of topOnly) await expect(storage.getItem(`local:lookup:${e.hshopId}`)).resolves.toBeNull();
  });

  it('never rejects', async () => {
    vi.spyOn(storage, 'getItem').mockRejectedValue(new Error('boom'));
    vi.spyOn(storage, 'setItem').mockRejectedValue(new Error('boom'));
    await expect(rememberShownCodes(extractListEntries(listing(), { pathname: '/c/games/s/japan' }))).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });
});
