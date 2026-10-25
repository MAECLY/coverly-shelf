import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { LOOKUP } from '../src/lib/config';
import { lookupGameInfo, parseTitlePage, rememberGameInfo } from '../src/lib/lookup';
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

  it.each([
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a 429', () => Promise.resolve(response('slow down', { status: 429 }))],
    ['a 503', () => Promise.resolve(response('down', { status: 503 }))],
    ['a challenge page', () => Promise.resolve(response('<html><body>Checking your browser</body></html>'))],
    ['a redirect elsewhere', () => Promise.resolve(response(RETAIL, { url: 'https://hshop.erista.me/' }))],
  ])('does not cache %s', async (_, impl) => {
    fetchMock.mockImplementation(impl);
    await expect(lookupGameInfo('1814')).resolves.toBeNull();
    await expect(storage.getItem('local:lookup:1814')).resolves.toBeNull();
    fetchMock.mockResolvedValue(response(RETAIL));
    await expect(lookupGameInfo('1814')).resolves.toMatchObject({ gameCode: 'AZEE' });
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
    await storage.setItem('local:lookup:1814', { v: 2, at: Date.now(), value: { info: { title: 1 } } });
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

  it('ignores bad input', async () => {
    await rememberGameInfo('x', info);
    await rememberGameInfo('1', { ...info, platform: 'NDS' } as unknown as GameInfo);
    await expect(storage.getItem('local:lookup:1')).resolves.toBeNull();
  });
});
