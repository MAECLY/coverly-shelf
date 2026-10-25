import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageHead } from '../src/lib/messages';

vi.mock('../src/lib/messages', () => ({
  requestImageHead: vi.fn(),
  requestImageDataResult: vi.fn(async () => ({ ok: false })),
}));

const { requestImageHead } = await import('../src/lib/messages');
const { headVerdict, probeImage, probeOutcome } = await import('../src/lib/probe');
const head = vi.mocked(requestImageHead);

const ART = 'https://art.gametdb.com/3ds/coverHQ/US/AZEE.jpg';
const HSHOP_ICON = 'https://hshop.erista.me/i/t/1814.png';

const h = (status: number, ok: boolean, contentType: string | null = 'image/jpeg'): ImageHead => ({
  ok,
  status,
  contentType,
  length: ok ? 1000 : null,
});

/** Fake <img>: records every src set and settles as `imgResult` says on the next tick. */
let imgResult: 'load' | 'error' = 'load';
const imgSrcs: string[] = [];
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  referrerPolicy = '';
  decoding = '';
  private _src = '';
  get src(): string {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    if (!v) return;
    imgSrcs.push(v);
    setTimeout(() => {
      if (imgResult === 'load') {
        this.naturalWidth = 300;
        this.onload?.();
      } else {
        this.onerror?.();
      }
    }, 0);
  }
}

beforeEach(() => {
  head.mockReset();
  imgSrcs.length = 0;
  imgResult = 'load';
  vi.stubGlobal('Image', FakeImage);
});
afterEach(() => vi.unstubAllGlobals());

describe('headVerdict', () => {
  it('maps HEAD answers to probe outcomes', () => {
    expect(headVerdict(null)).toBe('fallback');
    expect(headVerdict(h(0, false, null))).toBe('fallback');
    expect(headVerdict(h(405, false))).toBe('fallback');
    expect(headVerdict(h(501, false))).toBe('fallback');
    expect(headVerdict(h(200, true))).toBe('hit');
    expect(headVerdict(h(404, false, 'text/html'))).toBe('miss');
    expect(headVerdict(h(200, false, 'text/html'))).toBe('miss');
    expect(headVerdict(h(403, false))).toBe('miss');
    expect(headVerdict(h(429, false))).toBe('error');
    expect(headVerdict(h(408, false))).toBe('error');
    expect(headVerdict(h(503, false))).toBe('error');
  });
});

describe('probeOutcome (direct mode)', () => {
  it('counts a HEAD 200 image/* as a hit without loading the image', async () => {
    head.mockResolvedValue(h(200, true));
    expect(await probeOutcome(ART)).toBe('hit');
    expect(head).toHaveBeenCalledWith(ART);
    expect(imgSrcs).toEqual([]);
  });

  it('discards a HEAD 404 without loading the image', async () => {
    head.mockResolvedValue(h(404, false, 'text/html'));
    expect(await probeOutcome(ART)).toBe('miss');
    expect(await probeImage(ART)).toBe(false);
    expect(imgSrcs).toEqual([]);
  });

  it('discards a 200 that is not an image', async () => {
    head.mockResolvedValue(h(200, false, 'text/html'));
    expect(await probeOutcome(ART)).toBe('miss');
    expect(imgSrcs).toEqual([]);
  });

  it('reports a server error as unknown, not as a miss', async () => {
    head.mockResolvedValue(h(503, false, 'text/html'));
    expect(await probeOutcome(ART)).toBe('error');
    expect(imgSrcs).toEqual([]);
  });

  it('falls back to the <img> probe when the HEAD gets no answer', async () => {
    head.mockResolvedValue(null);
    expect(await probeOutcome(ART)).toBe('hit');
    expect(imgSrcs).toEqual([ART]);

    imgResult = 'error';
    expect(await probeOutcome(ART)).toBe('miss');
  });

  it('falls back to the <img> probe when messaging rejects or the host refuses HEAD', async () => {
    head.mockRejectedValueOnce(new Error('port closed'));
    expect(await probeOutcome(ART)).toBe('hit');
    head.mockResolvedValueOnce(h(405, false, null));
    expect(await probeOutcome(ART)).toBe('hit');
    expect(imgSrcs).toEqual([ART, ART]);
  });

  it('never sends a HEAD for a URL outside the allow-list', async () => {
    expect(await probeOutcome(HSHOP_ICON)).toBe('hit');
    expect(head).not.toHaveBeenCalled();
    expect(imgSrcs).toEqual([HSHOP_ICON]);
  });

  it('keeps at most 4 probes in flight, HEAD and fallback included', async () => {
    let active = 0;
    let peak = 0;
    head.mockImplementation(async (url: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return url.endsWith('-0.jpg') || url.endsWith('-1.jpg') ? null : h(404, false);
    });
    const urls = Array.from({ length: 12 }, (_, i) => `https://art.gametdb.com/3ds/cover/US/X-${i}.jpg`);
    const outcomes = await Promise.all(urls.map((u) => probeOutcome(u)));
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
    expect(outcomes.slice(0, 2)).toEqual(['hit', 'hit']);
    expect(outcomes.slice(2).every((o) => o === 'miss')).toBe(true);
  });
});
