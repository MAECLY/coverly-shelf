import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import type { GameInfo } from '../src/lib/types';

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

const { probeImage } = await import('../src/lib/probe');
const { requestLibretroNames } = await import('../src/lib/messages');
const { resolveCover, resolveGallery, resetProbeMemo } = await import('../src/lib/resolver');
const { setCached } = await import('../src/lib/cache');

const probe = vi.mocked(probeImage);
const names = vi.mocked(requestLibretroNames);

const GT = 'https://art.gametdb.com/3ds';
const DS = 'https://art.gametdb.com/ds';
const LR = 'https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%203DS';
const NAME = 'Batman - Arkham Origins Blackgate (USA) (En,Fr,Es)';
const BOX = `${LR}/Named_Boxarts/${encodeURIComponent(NAME)}.png`;

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

const dsi = (over: Partial<GameInfo> = {}): GameInfo =>
  game({ title: 'Fire Panic', productCode: 'TWL-N-KF8E', platform: 'TWL', distribution: 'N', gameCode: 'KF8E', ...over });

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

describe("resolveCover({ size: 'thumb' })", () => {
  it('probes only the small cover, region by region', async () => {
    hits(`${GT}/cover/EN/AZEE.jpg`);
    await expect(resolveCover(game(), { size: 'thumb' })).resolves.toEqual({
      kind: 'image',
      url: `${GT}/cover/EN/AZEE.jpg`,
      source: 'gametdb',
    });
    expect(probed()).toEqual([`${GT}/cover/US/AZEE.jpg`, `${GT}/cover/EN/AZEE.jpg`]);
  });

  it('caches thumbs apart from title-page covers', async () => {
    hits(`${GT}/cover/US/AZEE.jpg`, `${GT}/coverHQ/US/AZEE.jpg`);
    await resolveCover(game(), { size: 'thumb' });
    await expect(storage.getItem('local:thumb:AZEE')).resolves.toMatchObject({
      value: { kind: 'image', url: `${GT}/cover/US/AZEE.jpg` },
    });
    await expect(storage.getItem('local:cover:AZEE')).resolves.toBeNull();
    // The title page still gets HQ art.
    await expect(resolveCover(game())).resolves.toMatchObject({ url: `${GT}/coverHQ/US/AZEE.jpg` });
  });

  it('falls back to Libretro, then to the placeholder', async () => {
    hits(BOX);
    await expect(resolveCover(game(), { size: 'thumb' })).resolves.toMatchObject({ source: 'libretro', url: BOX });
    resetProbeMemo();
    fakeBrowser.reset();
    probe.mockResolvedValue(false);
    await expect(resolveCover(game(), { size: 'thumb' })).resolves.toEqual({ kind: 'placeholder' });
  });

  it.each([
    ['a placeholder', { kind: 'placeholder' }],
    ['a Libretro image', { kind: 'image', url: BOX, source: 'libretro' }],
    ['the same cover URL', { kind: 'image', url: `${GT}/cover/EN/AZEE.jpg`, source: 'gametdb' }],
  ])('reuses %s cached by a title page without probing', async (_, full) => {
    await setCached('local:cover:AZEE', full);
    await expect(resolveCover(game(), { size: 'thumb' })).resolves.toEqual(full);
    expect(probe).not.toHaveBeenCalled();
    await expect(storage.getItem('local:thumb:AZEE')).resolves.toMatchObject({ value: full });
  });

  it('probes when the title page found HQ art only', async () => {
    await setCached('local:cover:AZEE', { kind: 'image', url: `${GT}/coverHQ/US/AZEE.jpg`, source: 'gametdb' });
    hits(`${GT}/cover/US/AZEE.jpg`);
    await expect(resolveCover(game(), { size: 'thumb' })).resolves.toMatchObject({ url: `${GT}/cover/US/AZEE.jpg` });
    expect(probed()).toEqual([`${GT}/cover/US/AZEE.jpg`]);
  });

  it('does not cache a placeholder after a transport error', async () => {
    outcomes.set(`${GT}/cover/US/AZEE.jpg`, 'error');
    await expect(resolveCover(game(), { size: 'thumb' })).resolves.toEqual({ kind: 'placeholder' });
    await expect(storage.getItem('local:thumb:AZEE')).resolves.toBeNull();
  });
});

describe('DSiWare (TWL)', () => {
  it('resolves from GameTDB ds/ and never asks Libretro', async () => {
    hits(`${DS}/cover/US/KF8E.jpg`);
    await expect(resolveCover(dsi(), { size: 'thumb' })).resolves.toEqual({
      kind: 'image',
      url: `${DS}/cover/US/KF8E.jpg`,
      source: 'gametdb',
    });
    probe.mockResolvedValue(false);
    await expect(resolveCover(dsi({ gameCode: 'KZIK', regionChar: 'K', region: 'EN' }), { size: 'thumb' })).resolves.toEqual({
      kind: 'placeholder',
    });
    expect(names).not.toHaveBeenCalled();
  });

  it('uses HQ art first on title pages', async () => {
    hits(`${DS}/coverHQ/US/KF8E.jpg`);
    await expect(resolveCover(dsi())).resolves.toMatchObject({ url: `${DS}/coverHQ/US/KF8E.jpg` });
    expect(probed()[0]).toBe(`${DS}/coverHQ/US/KF8E.jpg`);
  });

  it('keeps DSiWare cache keys apart from 3DS codes', async () => {
    await setCached('local:thumb:KF8E', { kind: 'image', url: `${GT}/cover/US/KF8E.jpg`, source: 'gametdb' });
    hits(`${DS}/cover/US/KF8E.jpg`);
    await expect(resolveCover(dsi(), { size: 'thumb' })).resolves.toMatchObject({ url: `${DS}/cover/US/KF8E.jpg` });
    await expect(storage.getItem('local:thumb:ds:KF8E')).resolves.toMatchObject({
      value: { url: `${DS}/cover/US/KF8E.jpg` },
    });
  });

  it('has no gallery', async () => {
    await expect(resolveGallery(dsi())).resolves.toEqual([]);
    expect(names).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
  });
});
