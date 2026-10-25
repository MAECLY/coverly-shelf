import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoverResult, GameInfo } from '../src/lib/types';

vi.mock('../src/lib/resolver', () => ({ resolveCover: vi.fn() }));

const { resolveCover } = await import('../src/lib/resolver');
const { extractGameInfo, extractRelatedEntries } = await import('../src/lib/extract');
const {
  baseTitleInfo,
  isDerivedRelease,
  isSameGameRelation,
  resolveRelatedCover,
  resolveTitleCover,
  sameArtwork,
} = await import('../src/lib/related');

const resolve = vi.mocked(resolveCover);
const FIXTURES = join(__dirname, 'fixtures', 'hshop');

function load(name: string): Document {
  // Drop external stylesheets and scripts: happy-dom would try to fetch them.
  const html = readFileSync(join(FIXTURES, name), 'utf8')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '');
  return new DOMParser().parseFromString(html, 'text/html');
}

function game(code: string, region = 'EN'): GameInfo {
  const [platform, distribution, gameCode] = code.split('-') as [GameInfo['platform'], string, string];
  return {
    title: code,
    productCode: code,
    platform,
    distribution,
    gameCode,
    regionChar: gameCode.charAt(3),
    region,
    titleId: null,
    hshopRegion: null,
  };
}

const art = (code: string, type = 'cover'): CoverResult => ({
  kind: 'image',
  url: `https://art.gametdb.com/3ds/${type}/EN/${code}.jpg`,
  source: 'gametdb',
});
const NONE: CoverResult = { kind: 'placeholder' };

/** resolveCover answers from a table keyed by product code; anything else is a placeholder. */
function artFor(table: Record<string, CoverResult>): void {
  resolve.mockImplementation(async (info: GameInfo) => table[info.productCode] ?? NONE);
}
const asked = (): string[] => resolve.mock.calls.map((c) => c[0].productCode);

beforeEach(() => {
  resolve.mockReset();
  resolve.mockResolvedValue(NONE);
});

describe('extractRelatedEntries (live fixtures)', () => {
  it('reads /t/6881: a sibling demo and the Base Title', () => {
    const rows = extractRelatedEntries(load('title-demo-eu-6881.html'));
    expect(rows.map((r) => [r.hshopId, r.info?.productCode, r.relation, r.title])).toEqual([
      ['6882', 'CTR-T-AZVP', 'Demo Title', '(Demo B) Project X Zone'],
      ['650', 'CTR-P-AXXP', 'Base Title', 'Project X Zone'],
    ]);
    expect(rows.every((r) => !r.needsLookup)).toBe(true);
    expect(rows[0]?.info?.region).toBe('EN');
    expect(rows[0]?.info?.titleId).toBe('00040002000DD702');
    expect(baseTitleInfo(rows)?.productCode).toBe('CTR-P-AXXP');
  });

  it('reads /t/20778 (DLC): Base Title and Update Data', () => {
    const doc = load('title-dlc-us-20778.html');
    expect(extractGameInfo(doc)?.gameCode).toBe('ALZE'); // CTR-M-ALZE-00 already maps to its base game code
    const rows = extractRelatedEntries(doc);
    expect(rows.map((r) => [r.hshopId, r.info?.productCode, r.relation])).toEqual([
      ['20699', 'CTR-P-ALZE', 'Base Title'],
      ['2890', 'CTR-U-ALZE', 'Update Data'],
    ]);
  });

  it('reads /t/2624 (update): Demo Title and Base Title', () => {
    const rows = extractRelatedEntries(load('title-update-eu-2624.html'));
    expect(rows.map((r) => [r.hshopId, r.info?.productCode, r.relation])).toEqual([
      ['8557', 'CTR-T-KWPP', 'Demo Title'],
      ['20019', 'CTR-N-KWPP', 'Base Title'],
    ]);
    expect(baseTitleInfo(rows)?.productCode).toBe('CTR-N-KWPP');
  });

  it('finds nothing on a page without the box', () => {
    expect(extractRelatedEntries(load('title-retail-us-1814.html'))).toEqual([]);
  });

  it('reads the relation only from the badge, never from the row meta', () => {
    const doc = load('title-demo-eu-6881.html');
    const anchor = doc.querySelector('.related a.list-entry')!;
    anchor.querySelector('.base-info > .meta')!.remove();
    expect(extractRelatedEntries(doc)[0]?.relation).toBeNull();
  });
});

describe('relation helpers', () => {
  it('knows which relations are the same game', () => {
    for (const r of ['Base Title', 'Demo Title', 'Update Data', 'Downloadable Content']) expect(isSameGameRelation(r)).toBe(true);
    for (const r of [null, '', 'Theme', 'base title']) expect(isSameGameRelation(r)).toBe(false);
  });

  it('treats demos, updates, DLC and kiosk builds as derived releases', () => {
    for (const c of ['CTR-T-AZVP', 'CTR-U-KWPP', 'CTR-M-ALZE', 'CTR-B-BXXP', 'CTR-H-AABP']) expect(isDerivedRelease(game(c))).toBe(true);
    for (const c of ['CTR-P-AXXP', 'CTR-N-KWPP', 'KTR-N-ABCD']) expect(isDerivedRelease(game(c))).toBe(false);
  });

  it('compares artwork chains by platform, game code and region', () => {
    expect(sameArtwork(game('CTR-T-AXXP'), game('CTR-P-AXXP'))).toBe(true);
    expect(sameArtwork(game('CTR-T-AZVP'), game('CTR-P-AXXP'))).toBe(false);
    expect(sameArtwork(game('CTR-P-AXXP', 'EN'), game('CTR-P-AXXP', 'US'))).toBe(false);
    expect(sameArtwork(game('TWL-N-KQ9E'), game('CTR-N-KQ9E'))).toBe(false);
  });
});

describe('resolveTitleCover', () => {
  it('keeps its own art when it has some', async () => {
    artFor({ 'CTR-T-AZVP': art('AZVP', 'coverHQ'), 'CTR-P-AXXP': art('AXXP', 'coverHQ') });
    const c = await resolveTitleCover(game('CTR-T-AZVP'), game('CTR-P-AXXP'));
    expect(c).toEqual({ result: art('AZVP', 'coverHQ'), own: art('AZVP', 'coverHQ'), fromBase: false });
    expect(asked()).toEqual(['CTR-T-AZVP']);
  });

  it('uses the Base Title art for a demo without art (CTR-T-AZVP → CTR-P-AXXP)', async () => {
    artFor({ 'CTR-P-AXXP': art('AXXP', 'coverHQ') });
    const c = await resolveTitleCover(game('CTR-T-AZVP'), game('CTR-P-AXXP'));
    expect(c).toEqual({ result: art('AXXP', 'coverHQ'), own: NONE, fromBase: true });
    expect(asked()).toEqual(['CTR-T-AZVP', 'CTR-P-AXXP']);
    // Full size on title pages: no thumb option.
    expect(resolve.mock.calls[1]?.[1]?.size).toBeUndefined();
  });

  it('never falls back for a base release (retail or digital)', async () => {
    artFor({ 'CTR-P-AXXP': art('AXXP') });
    expect((await resolveTitleCover(game('CTR-N-ZZZE'), game('CTR-P-AXXP'))).result).toEqual(NONE);
    expect(asked()).toEqual(['CTR-N-ZZZE']);
  });

  it('skips the base when it has the same artwork chain, or when there is none', async () => {
    expect((await resolveTitleCover(game('CTR-T-KLRJ'), game('CTR-N-KLRJ'))).result).toEqual(NONE);
    expect((await resolveTitleCover(game('CTR-T-KLRJ'), null)).result).toEqual(NONE);
    expect(asked()).toEqual(['CTR-T-KLRJ', 'CTR-T-KLRJ']);
  });

  it('keeps the placeholder when the base has no art either', async () => {
    const c = await resolveTitleCover(game('CTR-T-AZVP'), game('CTR-P-AXXP'));
    expect(c).toEqual({ result: NONE, own: NONE, fromBase: false });
  });

  it('never rejects', async () => {
    resolve.mockRejectedValue(new Error('boom'));
    expect((await resolveTitleCover(game('CTR-T-AZVP'), game('CTR-P-AXXP'))).result).toEqual(NONE);
  });
});

describe('resolveRelatedCover', () => {
  const page6881 = game('CTR-T-AXXP');
  const base650 = game('CTR-P-AXXP');
  const cover = (result: CoverResult, own: CoverResult = result) => Promise.resolve({ result, own, fromBase: false });

  it('shows a row its own art first (thumbnail size)', async () => {
    artFor({ 'CTR-T-AZVP': art('AZVP') });
    const r = await resolveRelatedCover(
      { info: game('CTR-T-AZVP'), relation: 'Demo Title' },
      { page: page6881, base: base650, pageCover: cover(art('AXXP', 'coverHQ')) },
    );
    expect(r).toEqual(art('AZVP'));
    expect(resolve.mock.calls[0]?.[1]?.size).toBe('thumb');
  });

  it('gives a same-game row without art the page cover when the base is the page game (/t/6881 → 6882)', async () => {
    const r = await resolveRelatedCover(
      { info: game('CTR-T-AZVP'), relation: 'Demo Title' },
      { page: page6881, base: base650, pageCover: cover(art('AXXP', 'coverHQ')) },
    );
    expect(r).toEqual(art('AXXP', 'coverHQ'));
    // The base has the page's artwork chain: no separate thumb lookup for it.
    expect(asked()).toEqual(['CTR-T-AZVP']);
  });

  it('tries the Base Title code before the page cover when they differ (/t/6882 rows)', async () => {
    artFor({ 'CTR-P-AXXP': art('AXXP') });
    const r = await resolveRelatedCover(
      { info: game('CTR-U-AZVP'), relation: 'Update Data' },
      { page: game('CTR-T-QQQP'), base: base650, pageCover: cover(art('QQQP', 'coverHQ')) },
    );
    expect(r).toEqual(art('AXXP'));
    expect(asked()).toEqual(['CTR-U-AZVP', 'CTR-P-AXXP']);
  });

  it('falls back to the page cover when the base has nothing either', async () => {
    const r = await resolveRelatedCover(
      { info: game('CTR-M-ABCP'), relation: 'Downloadable Content' },
      { page: game('CTR-P-ZZZP'), base: game('CTR-P-YYYP'), pageCover: cover(art('ZZZP', 'coverHQ')) },
    );
    expect(r).toEqual(art('ZZZP', 'coverHQ'));
  });

  it('gives the Base Title row the page cover directly (never itself again)', async () => {
    const r = await resolveRelatedCover(
      { info: game('CTR-P-ABCP'), relation: 'Base Title' },
      { page: game('CTR-T-ZZZP'), base: game('CTR-P-ABCP'), pageCover: cover(art('ZZZP', 'coverHQ')) },
    );
    expect(r).toEqual(art('ZZZP', 'coverHQ'));
    expect(asked()).toEqual(['CTR-P-ABCP']);
  });

  it('never borrows art for a row whose relation is not the same game', async () => {
    for (const relation of [null, 'Theme', 'Something Else']) {
      resolve.mockClear();
      const r = await resolveRelatedCover(
        { info: game('CTR-P-ABCP'), relation },
        { page: page6881, base: base650, pageCover: cover(art('AXXP', 'coverHQ')) },
      );
      expect(r).toEqual(NONE);
      expect(asked()).toEqual(['CTR-P-ABCP']);
    }
  });

  it('reuses the page result for a row with the page artwork chain, without a request', async () => {
    const r = await resolveRelatedCover(
      { info: game('CTR-P-AXXP'), relation: 'Base Title' },
      { page: page6881, base: base650, pageCover: cover(art('AXXP', 'coverHQ')) },
    );
    expect(r).toEqual(art('AXXP', 'coverHQ'));
    expect(asked()).toEqual([]);
  });

  it('keeps the placeholder when nothing has art', async () => {
    const r = await resolveRelatedCover(
      { info: game('CTR-N-KLRJ', 'JA'), relation: 'Base Title' },
      { page: game('CTR-T-KLRJ', 'JA'), base: game('CTR-N-KLRJ', 'JA'), pageCover: cover(NONE) },
    );
    expect(r).toEqual(NONE);
  });

  it('does not fall back after its run was aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const r = await resolveRelatedCover(
      { info: game('CTR-T-AZVP'), relation: 'Demo Title' },
      { page: game('CTR-T-QQQP'), base: base650, pageCover: cover(art('QQQP')) },
      { signal: ctrl.signal },
    );
    expect(r).toEqual(NONE);
    expect(asked()).toEqual(['CTR-T-AZVP']);
  });

  it('shows nothing for a row without a code, and never rejects', async () => {
    const ctx = { page: page6881, base: base650, pageCover: cover(art('AXXP')) };
    expect(await resolveRelatedCover({ info: null, relation: 'Demo Title' }, ctx)).toEqual(NONE);
    resolve.mockRejectedValue(new Error('boom'));
    expect(await resolveRelatedCover({ info: game('CTR-T-AZVP'), relation: 'Demo Title' }, ctx)).toEqual(NONE);
  });
});
