import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import type { GameInfo } from '../src/lib/types';

// The resolver calls the outcome-aware variants; they delegate to the boolean
// mocks below so most tests only steer `probeImage` / `requestLibretroNames`.
const outcomes = vi.hoisted(() => new Map<string, 'hit' | 'miss' | 'error'>());
vi.mock('../src/lib/probe', () => {
  const probeImage = vi.fn();
  return {
    probeImage,
    probeOutcome: async (url: string) => outcomes.get(url) ?? ((await probeImage(url)) ? 'hit' : 'miss'),
    displaySrc: vi.fn(async (url: string) => url),
  };
});
vi.mock('../src/lib/messages', () => {
  const requestLibretroNames = vi.fn();
  return {
    requestLibretroNames,
    requestLibretroNamesResult: async (serial: string) => requestLibretroNames(serial),
    requestImageData: vi.fn(async () => null),
  };
});
vi.mock('../src/lib/sources/gametdb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/sources/gametdb')>();
  return { ...actual, gametdbCoverCandidates: vi.fn(actual.gametdbCoverCandidates) };
});

const { probeImage } = await import('../src/lib/probe');
const { requestLibretroNames } = await import('../src/lib/messages');
const { gametdbCoverCandidates } = await import('../src/lib/sources/gametdb');
const { resolveCover, resolveGallery, resetProbeMemo } = await import('../src/lib/resolver');
const { setCached } = await import('../src/lib/cache');
const { CACHE_TTL_MS } = await import('../src/lib/config');

const probe = vi.mocked(probeImage);
const names = vi.mocked(requestLibretroNames);
const coverCandidates = vi.mocked(gametdbCoverCandidates);

const GT = 'https://art.gametdb.com/3ds';
const LR = 'https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%203DS';
const NAME = 'Batman - Arkham Origins Blackgate (USA) (En,Fr,Es)';
const FILE = encodeURIComponent(NAME);

function game(over: Partial<GameInfo> = {}): GameInfo {
  return {
    title: 'Batman: Arkham Origins Blackgate',
    productCode: 'CTR-P-AZEE',
    platform: 'CTR',
    distribution: 'P',
    gameCode: 'AZEE',
    regionChar: 'E',
    region: 'US',
    titleId: '0004000000123400',
    hshopRegion: 'north-america',
    ...over,
  };
}

/** Probe succeeds only for the given URLs. */
function hits(...urls: string[]): void {
  probe.mockImplementation(async (url: string) => urls.includes(url));
}

const probed = (): string[] => probe.mock.calls.map((c) => c[0]);

beforeEach(() => {
  fakeBrowser.reset();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  resetProbeMemo();
  outcomes.clear();
  names.mockResolvedValue([NAME]);
  probe.mockResolvedValue(false);
});

describe('resolveCover', () => {
  it('walks GameTDB regions in order and stops at the first hit', async () => {
    // A later candidate that would also hit must never be reached.
    hits(`${GT}/cover/EN/AZEE.jpg`, `${LR}/Named_Boxarts/${FILE}.png`);
    const result = await resolveCover(game());
    expect(result).toEqual({ kind: 'image', url: `${GT}/cover/EN/AZEE.jpg`, source: 'gametdb' });
    expect(probed()).toEqual([
      `${GT}/coverHQ/US/AZEE.jpg`,
      `${GT}/cover/US/AZEE.jpg`,
      `${GT}/coverHQ/EN/AZEE.jpg`,
      `${GT}/cover/EN/AZEE.jpg`,
    ]);
    expect(names).not.toHaveBeenCalled();
  });

  it('passes the region chain (game region first, then fallbacks) to GameTDB', async () => {
    const info = game({ productCode: 'CTR-N-SAEJ', distribution: 'N', gameCode: 'SAEJ', regionChar: 'J', region: 'JA' });
    await resolveCover(info);
    expect(coverCandidates).toHaveBeenCalledWith(info, ['JA', 'EN', 'US']);
    // Digital titles never request retail-only artwork.
    expect(probed().some((u) => /coverfull|cart/.test(u))).toBe(false);
  });

  it('falls back to Libretro box art with the product code serial', async () => {
    hits(`${LR}/Named_Boxarts/${FILE}.png`);
    const result = await resolveCover(game());
    expect(names).toHaveBeenCalledWith('CTR-P-AZEE');
    expect(result).toEqual({ kind: 'image', url: `${LR}/Named_Boxarts/${FILE}.png`, source: 'libretro' });
  });

  it('asks Libretro for the base game of DLC and update rows (retail, then digital)', async () => {
    const bx2k = 'Project Cross Zone 2 (Korea)';
    const url = `${LR}/Named_Boxarts/${encodeURIComponent(bx2k)}.png`;
    names.mockImplementation(async (serial: string) => (serial === 'CTR-P-BX2K' ? [bx2k] : []));
    hits(url);
    const base = { platform: 'CTR' as const, gameCode: 'BX2K', regionChar: 'K', region: 'KO', hshopRegion: 'korea' };
    for (const [productCode, distribution] of [
      ['CTR-M-BX2K', 'M'],
      ['CTR-U-BX2K', 'U'],
    ] as const) {
      // DLC and update share the game code, hence one cache key: start each from scratch.
      fakeBrowser.reset();
      names.mockClear();
      await expect(resolveCover(game({ ...base, productCode, distribution }), { size: 'thumb' })).resolves.toEqual({
        kind: 'image',
        url,
        source: 'libretro',
      });
      expect(names.mock.calls.map((c) => c[0])).toEqual(['CTR-P-BX2K', 'CTR-N-BX2K', productCode]);
    }
  });

  it('keeps one Libretro request for retail and digital rows', async () => {
    await resolveCover(game({ productCode: 'CTR-N-AZEE', distribution: 'N' }));
    expect(names.mock.calls.map((c) => c[0])).toEqual(['CTR-N-AZEE']);
  });

  it('does not cache a placeholder when one of the base-game Libretro requests fails', async () => {
    names.mockImplementation(async (serial: string) => (serial === 'CTR-N-BX2K' ? null : []) as string[]);
    const info = game({ productCode: 'CTR-M-BX2K', distribution: 'M', gameCode: 'BX2K', regionChar: 'K', region: 'KO' });
    await expect(resolveCover(info)).resolves.toEqual({ kind: 'placeholder' });
    await expect(storage.getItem('local:cover:BX2K')).resolves.toBeNull();
  });

  it('falls back to the hShop icon, then to the placeholder', async () => {
    const icon = 'https://hshop.erista.me/static/icon.png';
    await expect(resolveCover(game(), { hshopIconUrl: icon })).resolves.toEqual({
      kind: 'image',
      url: icon,
      source: 'hshop',
    });
    resetProbeMemo();
    fakeBrowser.reset();
    await expect(resolveCover(game())).resolves.toEqual({ kind: 'placeholder' });
  });

  it('caches a hit and reuses the URL without probing again', async () => {
    hits(`${GT}/coverHQ/US/AZEE.jpg`);
    const first = await resolveCover(game());
    resetProbeMemo();
    probe.mockClear();
    const second = await resolveCover(game());
    expect(second).toEqual(first);
    expect(probe).not.toHaveBeenCalled();
    await expect(storage.getItem('local:cover:AZEE')).resolves.toMatchObject({ value: first });
  });

  it('caches the placeholder so misses are not retried within the TTL', async () => {
    let t = 1_000;
    const now = () => t;
    await expect(resolveCover(game(), { now })).resolves.toEqual({ kind: 'placeholder' });
    const calls = probe.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    resetProbeMemo();

    t += CACHE_TTL_MS - 1;
    await expect(resolveCover(game(), { now })).resolves.toEqual({ kind: 'placeholder' });
    expect(probe.mock.calls.length).toBe(calls);

    t += 1;
    await resolveCover(game(), { now });
    expect(probe.mock.calls.length).toBe(calls * 2);
  });

  it('short-circuits on a pre-filled cache entry', async () => {
    const url = `${GT}/cover/EN/AZEE.jpg`;
    await setCached('local:cover:AZEE', { kind: 'image', url, source: 'gametdb' });
    await expect(resolveCover(game())).resolves.toEqual({ kind: 'image', url, source: 'gametdb' });
    expect(probe).not.toHaveBeenCalled();
    expect(names).not.toHaveBeenCalled();
  });

  it('uses the hShop icon over a cached placeholder', async () => {
    await setCached('local:cover:AZEE', { kind: 'placeholder' });
    const icon = 'https://hshop.erista.me/static/icon.png';
    await expect(resolveCover(game(), { hshopIconUrl: icon })).resolves.toMatchObject({ source: 'hshop' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('never probes the same URL twice in one page', async () => {
    await resolveCover(game());
    const first = probed().length;
    fakeBrowser.reset();
    await resolveCover(game());
    expect(probed().length).toBe(first);
  });

  it('never rejects when storage, probes and messaging all throw', async () => {
    vi.spyOn(storage, 'getItem').mockRejectedValue(new Error('storage'));
    vi.spyOn(storage, 'setItem').mockRejectedValue(new Error('storage'));
    probe.mockRejectedValue(new Error('probe'));
    names.mockRejectedValue(new Error('messaging'));
    await expect(resolveCover(game())).resolves.toEqual({ kind: 'placeholder' });
  });
});

describe('resolveGallery', () => {
  const title = `${LR}/Named_Titles/${FILE}.png`;
  const snap = `${LR}/Named_Snaps/${FILE}.png`;

  it('keeps only the images whose probe succeeds', async () => {
    hits(snap);
    await expect(resolveGallery(game())).resolves.toEqual([{ url: snap, source: 'libretro', kind: 'snap' }]);
    expect(probed().sort()).toEqual([snap, title].sort());
  });

  it('returns title then snap, picking the best-ranked name per kind', async () => {
    const other = 'Batman - Arkham Origins Blackgate (USA) (Rev 1)';
    names.mockResolvedValue([NAME, other]);
    const otherTitle = `${LR}/Named_Titles/${encodeURIComponent(other)}.png`;
    hits(snap, otherTitle, title);
    await expect(resolveGallery(game())).resolves.toEqual([
      { url: title, source: 'libretro', kind: 'title' },
      { url: snap, source: 'libretro', kind: 'snap' },
    ]);
  });

  it('caches the list, including an empty one', async () => {
    await expect(resolveGallery(game())).resolves.toEqual([]);
    await expect(storage.getItem('local:gallery:AZEE')).resolves.toMatchObject({ value: [] });
    resetProbeMemo();
    probe.mockClear();
    names.mockClear();
    await expect(resolveGallery(game())).resolves.toEqual([]);
    expect(probe).not.toHaveBeenCalled();
    expect(names).not.toHaveBeenCalled();
  });

  it('returns an empty list without probing when Libretro has no names', async () => {
    names.mockResolvedValue([]);
    await expect(resolveGallery(game())).resolves.toEqual([]);
    expect(probe).not.toHaveBeenCalled();
  });

  it('never rejects when storage and probes throw', async () => {
    vi.spyOn(storage, 'getItem').mockRejectedValue(new Error('storage'));
    vi.spyOn(storage, 'setItem').mockRejectedValue(new Error('storage'));
    probe.mockRejectedValue(new Error('probe'));
    await expect(resolveGallery(game())).resolves.toEqual([]);
  });
});

describe('transport failures', () => {
  const cover = `${LR}/Named_Boxarts/${FILE}.png`;
  const snap = `${LR}/Named_Snaps/${FILE}.png`;

  it('does not cache a placeholder when the background could not be reached', async () => {
    names.mockResolvedValue(null as unknown as string[]);
    await expect(resolveCover(game())).resolves.toEqual({ kind: 'placeholder' });
    await expect(storage.getItem('local:cover:AZEE')).resolves.toBeNull();
    resetProbeMemo();
    names.mockResolvedValue([NAME]);
    hits(cover);
    await expect(resolveCover(game())).resolves.toEqual({ kind: 'image', url: cover, source: 'libretro' });
  });

  it('does not cache a placeholder when a probe timed out', async () => {
    outcomes.set(cover, 'error');
    await expect(resolveCover(game())).resolves.toEqual({ kind: 'placeholder' });
    await expect(storage.getItem('local:cover:AZEE')).resolves.toBeNull();
  });

  it('still caches a hit found after a timed-out probe', async () => {
    outcomes.set(`${GT}/coverHQ/US/AZEE.jpg`, 'error');
    hits(cover);
    await resolveCover(game());
    await expect(storage.getItem('local:cover:AZEE')).resolves.toMatchObject({ value: { kind: 'image', url: cover } });
  });

  it('does not cache the gallery when messaging or a probe failed', async () => {
    names.mockRejectedValue(new Error('Could not establish connection'));
    await expect(resolveGallery(game())).resolves.toEqual([]);
    await expect(storage.getItem('local:gallery:AZEE')).resolves.toBeNull();

    names.mockResolvedValue([NAME]);
    outcomes.set(snap, 'error');
    await resolveGallery(game());
    await expect(storage.getItem('local:gallery:AZEE')).resolves.toBeNull();
  });
});
