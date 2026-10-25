import { describe, expect, it } from 'vitest';
import { GAMETDB } from '../src/lib/config';
import { gametdbCoverCandidates, gametdbUrl } from '../src/lib/sources/gametdb';
import { libretroCandidates, libretroFileName, libretroUrl } from '../src/lib/sources/libretro';
import type { GameInfo } from '../src/lib/types';

const batman: GameInfo = {
  title: 'Batman: Arkham Origins Blackgate',
  productCode: 'CTR-P-AZEE',
  platform: 'CTR',
  distribution: 'P',
  gameCode: 'AZEE',
  regionChar: 'E',
  region: 'US',
  titleId: '0004000000105200',
  hshopRegion: 'north-america',
};
const BATMAN_NAME = 'Batman - Arkham Origins Blackgate (USA) (En,Fr,Es)';

describe('gametdb', () => {
  it('builds the exact coverHQ URL', () => {
    expect(gametdbUrl({ type: 'coverHQ', ext: 'jpg', retailOnly: false }, 'US', 'AZEE')).toBe(
      'https://art.gametdb.com/3ds/coverHQ/US/AZEE.jpg',
    );
  });

  it('lists every cover type per region, region-major, best first', () => {
    const urls = gametdbCoverCandidates(batman, ['US', 'EN']).map((c) => c.url);
    expect(urls).toEqual([
      'https://art.gametdb.com/3ds/coverHQ/US/AZEE.jpg',
      'https://art.gametdb.com/3ds/cover/US/AZEE.jpg',
      'https://art.gametdb.com/3ds/coverHQ/EN/AZEE.jpg',
      'https://art.gametdb.com/3ds/cover/EN/AZEE.jpg',
    ]);
    expect(gametdbCoverCandidates(batman, ['US']).every((c) => c.source === 'gametdb' && c.kind === 'cover')).toBe(true);
  });

  it('skips retail-only types for digital (N) releases', () => {
    const types = [
      { type: 'coverHQ', ext: 'jpg', retailOnly: false },
      { type: 'coverfull', ext: 'jpg', retailOnly: true },
    ];
    const original = [...GAMETDB.coverTypes];
    const mutable = GAMETDB.coverTypes as unknown as typeof types;
    mutable.splice(0, mutable.length, ...types);
    try {
      const digital = { ...batman, distribution: 'N', gameCode: 'SAEE' };
      expect(gametdbCoverCandidates(digital, ['US']).map((c) => c.url)).toEqual([
        'https://art.gametdb.com/3ds/coverHQ/US/SAEE.jpg',
      ]);
      expect(gametdbCoverCandidates(batman, ['US']).map((c) => c.url)).toEqual([
        'https://art.gametdb.com/3ds/coverHQ/US/AZEE.jpg',
        'https://art.gametdb.com/3ds/coverfull/US/AZEE.jpg',
      ]);
    } finally {
      mutable.splice(0, mutable.length, ...(original as typeof types));
    }
  });

  it('returns nothing without regions', () => {
    expect(gametdbCoverCandidates(batman, [])).toEqual([]);
  });
});

describe('libretro', () => {
  it('builds the exact Named_Boxarts URL for Batman', () => {
    expect(libretroUrl('cover', BATMAN_NAME)).toBe(
      'https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%203DS/Named_Boxarts/Batman%20-%20Arkham%20Origins%20Blackgate%20(USA)%20(En%2CFr%2CEs).png',
    );
  });

  it('maps kinds to folders', () => {
    expect(libretroUrl('snap', 'A')).toContain('/Named_Snaps/A.png');
    expect(libretroUrl('title', 'A')).toContain('/Named_Titles/A.png');
  });

  it('replaces every unsafe character with _', () => {
    expect(libretroFileName('a&b*c/d:e`f<g>h?i\\j|k')).toBe('a_b_c_d_e_f_g_h_i_j_k');
    expect(libretroFileName("Pokemon X (USA) (En,Ja,Fr,De,Es,It,Ko)")).toBe('Pokemon X (USA) (En,Ja,Fr,De,Es,It,Ko)');
    // Repeated calls must not be affected by the global regex lastIndex.
    expect(libretroFileName('a:b')).toBe('a_b');
    expect(libretroFileName('a:b')).toBe('a_b');
    expect(libretroUrl('cover', 'Title: Sub?')).toContain('/Title_%20Sub_.png');
  });

  it('builds de-duplicated candidates in name order', () => {
    const c = libretroCandidates(['B', 'A', 'B'], 'snap');
    expect(c.map((x) => x.url)).toEqual([libretroUrl('snap', 'B'), libretroUrl('snap', 'A')]);
    expect(c.every((x) => x.source === 'libretro' && x.kind === 'snap')).toBe(true);
  });
});

describe('background image fetch', async () => {
  const { isAllowedImageUrl, bytesToBase64, fetchImageAsDataUrl, MAX_IMAGE_BYTES, handleMessage } = await import(
    '../src/entrypoints/background'
  );
  const { vi, afterEach } = await import('vitest');
  afterEach(() => vi.unstubAllGlobals());

  const stubFetch = (body: Uint8Array<ArrayBuffer>, headers: Record<string, string>, url: string, status = 200) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const res = new Response(body, { status, headers });
        Object.defineProperty(res, 'url', { value: url });
        return res;
      }),
    );

  it('allows only the two artwork hosts over https', () => {
    expect(isAllowedImageUrl('https://art.gametdb.com/3ds/cover/US/AZEE.jpg')).toBe(true);
    expect(isAllowedImageUrl('https://thumbnails.libretro.com/x.png')).toBe(true);
    expect(isAllowedImageUrl('http://art.gametdb.com/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://art.gametdb.com.evil.test/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://user@art.gametdb.com/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://hshop.erista.me/x.png')).toBe(false);
    expect(isAllowedImageUrl('not a url')).toBe(false);
  });

  it('encodes bytes as base64', () => {
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe('aGk=');
    const big = new Uint8Array(100_000).fill(65);
    expect(atob(bytesToBase64(big)).length).toBe(100_000);
  });

  it('returns a data URL for an allowed image', async () => {
    const url = 'https://art.gametdb.com/3ds/cover/US/AZEE.jpg';
    stubFetch(new Uint8Array([1, 2, 3]), { 'content-type': 'image/jpeg' }, url);
    expect(await fetchImageAsDataUrl(url)).toBe('data:image/jpeg;base64,AQID');
  });

  it('rejects other hosts without fetching', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await fetchImageAsDataUrl('https://example.com/a.png')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('rejects non-image content, 404s, oversize bodies and off-host redirects', async () => {
    const url = 'https://thumbnails.libretro.com/a.png';
    stubFetch(new Uint8Array([1]), { 'content-type': 'text/html' }, url);
    expect(await fetchImageAsDataUrl(url)).toBeNull();
    stubFetch(new Uint8Array([1]), { 'content-type': 'image/png' }, url, 404);
    expect(await fetchImageAsDataUrl(url)).toBeNull();
    stubFetch(new Uint8Array(MAX_IMAGE_BYTES + 1), { 'content-type': 'image/png' }, url);
    expect(await fetchImageAsDataUrl(url)).toBeNull();
    stubFetch(new Uint8Array([1]), { 'content-type': 'image/png' }, 'https://evil.test/a.png');
    expect(await fetchImageAsDataUrl(url)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await fetchImageAsDataUrl(url)).toBeNull();
  });

  it('ignores unknown messages', () => {
    expect(handleMessage(null)).toBeUndefined();
    expect(handleMessage({ type: 'nope' })).toBeUndefined();
    expect(handleMessage({ type: 'image:fetch', url: 1 })).toBeUndefined();
  });
});

describe('background image preflight (image:head)', async () => {
  const { headImage } = await import('../src/lib/background/head');
  const { handleMessage } = await import('../src/entrypoints/background');
  const { mediaType, isImageType } = await import('../src/lib/image-url');
  const { vi, afterEach } = await import('vitest');
  afterEach(() => vi.unstubAllGlobals());

  const ART = 'https://art.gametdb.com/3ds/coverHQ/US/AZEE.jpg';

  const stubHead = (status: number, headers: Record<string, string>, url = ART) => {
    const f = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      const res = new Response(null, { status, headers });
      Object.defineProperty(res, 'url', { value: url });
      return res;
    });
    vi.stubGlobal('fetch', f);
    return f;
  };

  it('parses media types', () => {
    expect(mediaType('Image/JPEG; charset=x')).toBe('image/jpeg');
    expect(mediaType(null)).toBe('');
    expect(isImageType('image/png')).toBe(true);
    expect(isImageType('image/svg+xml')).toBe(true);
    expect(isImageType('text/html')).toBe(false);
  });

  it('sends a credential-less, referrer-less HEAD and reports an image hit', async () => {
    const f = stubHead(200, { 'content-type': 'image/jpeg', 'content-length': '188576' });
    expect(await headImage(ART)).toEqual({ ok: true, status: 200, contentType: 'image/jpeg', length: 188576 });
    const init = f.mock.calls[0]?.[1];
    expect(f.mock.calls[0]?.[0]).toBe(ART);
    expect(init?.method).toBe('HEAD');
    expect(init?.credentials).toBe('omit');
    expect(init?.referrerPolicy).toBe('no-referrer');
  });

  it('reports a 404 as a definite non-image', async () => {
    stubHead(404, { 'content-type': 'text/html', 'content-length': '0' });
    expect(await headImage(ART)).toEqual({ ok: false, status: 404, contentType: 'text/html', length: 0 });
  });

  it('rejects a 200 that is not an image, is declared empty or left the allowed hosts', async () => {
    stubHead(200, { 'content-type': 'text/html; charset=iso-8859-1' });
    expect(await headImage(ART)).toMatchObject({ ok: false, status: 200, contentType: 'text/html', length: null });
    stubHead(200, { 'content-type': 'image/png', 'content-length': '0' });
    expect((await headImage(ART))?.ok).toBe(false);
    stubHead(200, { 'content-type': 'image/png' }, 'https://evil.test/a.png');
    expect((await headImage(ART))?.ok).toBe(false);
  });

  it('ignores a malformed Content-Length', async () => {
    stubHead(200, { 'content-type': 'image/png', 'content-length': '12abc' });
    expect(await headImage(ART)).toEqual({ ok: true, status: 200, contentType: 'image/png', length: null });
  });

  it('refuses other hosts without a request', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await headImage('https://example.com/a.png')).toEqual({ ok: false, status: 0, contentType: null, length: null });
    expect(await headImage('http://art.gametdb.com/a.png')).toMatchObject({ ok: false, status: 0 });
    expect(f).not.toHaveBeenCalled();
  });

  it('returns null when the network fails, so the page can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await headImage(ART)).toBeNull();
  });

  it('reports a host that never answers as a 408 instead of hanging', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_input: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            }),
        ),
      );
      const pending = headImage(ART);
      await vi.advanceTimersByTimeAsync(8_000);
      expect(await pending).toEqual({ ok: false, status: 408, contentType: null, length: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it('is reachable through the message handler', async () => {
    stubHead(200, { 'content-type': 'image/jpeg' });
    expect(await handleMessage({ type: 'image:head', url: ART })).toMatchObject({ ok: true, status: 200 });
    expect(handleMessage({ type: 'image:head', url: 42 })).toBeUndefined();
  });
});

describe('requestImageHead', async () => {
  const { fakeBrowser } = await import('wxt/testing/fake-browser');
  const { requestImageHead } = await import('../src/lib/messages');
  const { vi, afterEach } = await import('vitest');
  afterEach(() => {
    vi.restoreAllMocks();
    fakeBrowser.reset();
  });

  it('passes a well-formed answer through and turns anything else into null', async () => {
    type Send = (message: unknown) => Promise<unknown>;
    const send = vi.spyOn(fakeBrowser.runtime, 'sendMessage') as unknown as import('vitest').MockInstance<Send>;
    send.mockResolvedValueOnce({ ok: true, status: 200, contentType: 'image/png', length: 5, extra: 1 });
    expect(await requestImageHead('https://art.gametdb.com/a.png')).toEqual({ ok: true, status: 200, contentType: 'image/png', length: 5 });
    expect(send).toHaveBeenCalledWith({ type: 'image:head', url: 'https://art.gametdb.com/a.png' });
    send.mockResolvedValueOnce(null);
    expect(await requestImageHead('https://art.gametdb.com/a.png')).toBeNull();
    send.mockResolvedValueOnce({ ok: 'yes', status: 200 });
    expect(await requestImageHead('https://art.gametdb.com/a.png')).toBeNull();
    send.mockRejectedValueOnce(new Error('Receiving end does not exist'));
    expect(await requestImageHead('https://art.gametdb.com/a.png')).toBeNull();
  });
});
