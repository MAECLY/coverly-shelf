import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractListEntries,
  hshopIdFromHref,
  parseProductCode,
  regionChain,
  regionFor,
  type ListEntry,
} from '../src/lib/extract';

const LISTS = join(__dirname, 'fixtures', 'hshop', 'lists');

function load(path: string): Document {
  // Drop external stylesheets and scripts: happy-dom would try to fetch them.
  const html = readFileSync(path, 'utf8')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '');
  return new DOMParser().parseFromString(html, 'text/html');
}

const PATHS: Record<string, string> = {
  'category-root-games.html': '/c/games',
  'dlc-north-america.html': '/c/dlc/s/north-america',
  'dsiware-north-america.html': '/c/dsiware/s/north-america',
  'extras-hb.html': '/c/extras/s/hb',
  'games-digital-demos.html': '/c/games/s/digital-demos',
  'games-japan.html': '/c/games/s/japan',
  'search-mario.html': '/search/results',
  'themes-north-america.html': '/c/themes/s/north-america',
  'updates-europe.html': '/c/updates/s/europe',
  'virtual-console-north-america.html': '/c/virtual-console/s/north-america',
};

function entries(file: string): ListEntry[] {
  return extractListEntries(load(join(LISTS, file)), { pathname: PATHS[file] ?? '/c/x' });
}

const isTop = (e: ListEntry): boolean => e.anchor.closest('.list.top-list') !== null;
const main = (list: ListEntry[]): ListEntry[] => list.filter((e) => !isTop(e));
const top = (list: ListEntry[]): ListEntry[] => list.filter(isTop);

describe('parseProductCode (listing codes)', () => {
  it('accepts DSiWare TWL codes', () => {
    expect(parseProductCode('TWL-N-KFMU')).toEqual({
      productCode: 'TWL-N-KFMU',
      platform: 'TWL',
      distribution: 'N',
      gameCode: 'KFMU',
      regionChar: 'U',
    });
  });

  it('reads DLC codes as their base game', () => {
    expect(parseProductCode('CTR-M-BYGE-00')).toMatchObject({ productCode: 'CTR-M-BYGE', gameCode: 'BYGE' });
  });

  it.each(['CTR-N-THEME', 'CTR-N-PICROSS-S', 'CTR-P-BBB', 'MOD-P-BT8J', 'DevMenu 2x', 'MC-N3DS-FRII-DLC', 'TWL-N-THEME'])(
    'rejects %s',
    (code) => {
      expect(parseProductCode(code)).toBeNull();
    },
  );
});

describe('DSiWare regions', () => {
  it('maps E to US, J to JA and every other letter to EN', () => {
    expect(regionFor('E', null, 'TWL')).toBe('US');
    expect(regionFor('J', 'japan', 'TWL')).toBe('JA');
    for (const c of ['P', 'U', 'V', 'D', 'F', 'K', 'O']) expect(regionFor(c, 'north-america', 'TWL')).toBe('EN');
  });

  it('keeps the 3DS mapping for CTR/KTR', () => {
    expect(regionFor('D', null, 'CTR')).toBe('DE');
    expect(regionFor('D', null)).toBe('DE');
  });

  it('chains the DSiWare region with EN then US', () => {
    const [entry] = main(entries('dsiware-north-america.html'));
    expect(entry?.info?.platform).toBe('TWL');
    expect(regionChain(entry!.info!)).toEqual(['US', 'EN']);
  });
});

describe('hshopIdFromHref', () => {
  it.each([
    ['/t/19093', '19093'],
    ['/t/19093/', '19093'],
    ['/t/19093?x=1', '19093'],
    ['https://hshop.erista.me/t/42', '42'],
    [' /t/7 ', '7'],
  ])('reads %s', (href, id) => {
    expect(hshopIdFromHref(href)).toBe(id);
  });

  it.each(['/c/games/s/japan', '/t/abc', '/t/12/download', 'https://evil.example/t/1', '', null, undefined])(
    'rejects %s',
    (href) => {
      expect(hshopIdFromHref(href)).toBeNull();
    },
  );
});

describe('extractListEntries over every listing fixture', () => {
  const files = readdirSync(LISTS).filter((f) => f.endsWith('.html'));

  it('covers all fixtures', () => {
    expect(files.sort()).toEqual(Object.keys(PATHS).sort());
  });

  it.each(files)('%s: only /t/{id} rows, each with an id, a title and an anchor', (file) => {
    const list = entries(file);
    expect(list.length).toBeGreaterThan(0);
    for (const e of list) {
      expect(e.anchor.tagName).toBe('A');
      expect(e.anchor.getAttribute('href')).toBe(`/t/${e.hshopId}`);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.title).not.toMatch(/^\d+\.\s/);
      // A row either resolves, needs a title-page lookup, or shows an unsupported code.
      if (e.info) expect(e.needsLookup).toBe(false);
    }
  });

  it.each(files.filter((f) => f !== 'search-mario.html'))('%s: has a 50-row (or smaller) top list', (file) => {
    const t = top(entries(file));
    expect(t.length).toBeGreaterThan(0);
    expect(t.length).toBeLessThanOrEqual(50);
  });

  it('skips the subcategory rows of a category root', () => {
    const list = entries('category-root-games.html');
    expect(main(list)).toHaveLength(0);
    expect(top(list)).toHaveLength(50);
    expect(list.every((e) => e.info === null && e.needsLookup)).toBe(true);
    expect(list[0]).toMatchObject({ hshopId: '632', title: 'Pokemon Ultra Sun' });
  });

  it('reads a plain main-list row', () => {
    const [first] = main(entries('dsiware-north-america.html'));
    expect(first?.info).toEqual({
      title: 'Fire Panic',
      productCode: 'TWL-N-KF8E',
      platform: 'TWL',
      distribution: 'N',
      gameCode: 'KF8E',
      regionChar: 'E',
      region: 'US',
      titleId: '000480044B463845',
      hshopRegion: 'north-america',
    });
  });

  it('every main-list row of a regular subcategory has info', () => {
    for (const file of [
      'dsiware-north-america.html',
      'games-japan.html',
      'dlc-north-america.html',
      'updates-europe.html',
      'virtual-console-north-america.html',
      'games-digital-demos.html',
    ]) {
      const rows = main(entries(file));
      expect(rows).toHaveLength(25);
      expect(rows.filter((e) => e.info === null).map((e) => e.title)).toEqual([]);
    }
  });

  it('handles "Also known as" lines and the badge box (Japanese rows)', () => {
    const rows = main(entries('games-japan.html'));
    const first = rows[0]!;
    expect(first.info).toMatchObject({ title: 'ハコボーイ！', productCode: 'CTR-N-JCPJ', region: 'JA', hshopRegion: 'japan' });
    for (const e of rows) {
      expect(e.info?.hshopRegion).toBe('japan');
      expect(e.info?.titleId).toMatch(/^0004[0-9A-F]{12}$/);
    }
  });

  it('reads VC rows despite the badge box nested in .base-info', () => {
    const rows = main(entries('virtual-console-north-america.html'));
    expect(rows.every((e) => e.info?.hshopRegion === 'north-america')).toBe(true);
    expect(rows.some((e) => e.info?.platform === 'KTR')).toBe(true);
  });

  it('maps DLC rows to the base game code', () => {
    const [first] = main(entries('dlc-north-america.html'));
    expect(first?.info).toMatchObject({ productCode: 'CTR-M-KRJE', gameCode: 'KRJE', distribution: 'M' });
  });

  it('borrows info for top-list rows that are also in the main list', () => {
    const list = entries('dlc-north-america.html');
    const borrowed = top(list).filter((e) => e.info);
    expect(borrowed.length).toBeGreaterThan(0);
    for (const e of borrowed) {
      const twin = main(list).find((m) => m.hshopId === e.hshopId);
      expect(twin?.info?.productCode).toBe(e.info?.productCode);
      expect(e.needsLookup).toBe(false);
    }
    const rest = top(list).filter((e) => !e.info);
    expect(rest.every((e) => e.needsLookup)).toBe(true);
  });

  it('strips the rank from top-list names', () => {
    const t = top(entries('games-japan.html'));
    expect(t[0]).toMatchObject({ hshopId: '989', title: 'ブレイブリーデフォルト - フォーザ・シークウェル' });
  });

  it('never asks for lookups on themes (no art) and gives theme rows no info', () => {
    const list = entries('themes-north-america.html');
    expect(list.every((e) => e.info === null && !e.needsLookup)).toBe(true);
  });

  it('does not look up rows whose shown code is unsupported (extras)', () => {
    const list = entries('extras-hb.html');
    const unsupported = main(list).filter((e) => !e.info);
    for (const e of unsupported) expect(e.needsLookup).toBe(false);
    // Top-list twins of those rows do not trigger a lookup either.
    const ids = new Set(unsupported.map((e) => e.hshopId));
    for (const e of top(list)) if (ids.has(e.hshopId)) expect(e.needsLookup).toBe(false);
  });

  it('reads search results (single list, mixed categories, no top list)', () => {
    const list = entries('search-mario.html');
    expect(list).toHaveLength(25);
    expect(top(list)).toHaveLength(0);
    expect(list.some((e) => e.info?.platform === 'TWL')).toBe(true);
    expect(list.every((e) => !e.needsLookup)).toBe(true);
  });

  it('reads the older plain subcategory fixture', () => {
    const list = extractListEntries(load(join(__dirname, 'fixtures', 'hshop', 'list-games-north-america.html')), {
      pathname: '/c/games/s/north-america',
    });
    expect(main(list)[0]?.info).toMatchObject({ productCode: 'CTR-P-AZEE', region: 'US', titleId: '00040000000D6B00' });
  });
});

describe('extractListEntries on odd markup', () => {
  function rows(html: string): ListEntry[] {
    const doc = new DOMParser().parseFromString(`<div class="list"><div class="elements">${html}</div></div>`, 'text/html');
    return extractListEntries(doc, { pathname: '/c/games/s/europe' });
  }

  it('returns an empty list for a page without rows', () => {
    expect(extractListEntries(new DOMParser().parseFromString('<p>x</p>', 'text/html'))).toEqual([]);
  });

  it('ignores the badge box when it has a product-code-looking span', () => {
    const list = rows(
      `<a href="/t/1" class="list-entry block-link"><div class="base-info"><h3>X</h3>` +
        `<div class="meta"><div class="meta-content"><span>CTR-P-AZEE</span><span>Product Code</span></div></div></div></a>`,
    );
    expect(list[0]).toMatchObject({ hshopId: '1', info: null, needsLookup: true });
  });

  it('keeps going after a row without a name or meta', () => {
    const list = rows(
      `<a href="/t/1" class="list-entry"></a>` +
        `<a href="/t/2" class="list-entry"><div class="base-info"><h3>Y</h3><h4>content in <span>games</span> ➞ <span>europe</span></h4></div>` +
        `<div class="meta"><div class="meta-content"><span>CTR-P-ABCP</span><span>Product Code</span></div></div></a>`,
    );
    expect(list.map((e) => e.hshopId)).toEqual(['1', '2']);
    expect(list[1]?.info).toMatchObject({ gameCode: 'ABCP', region: 'EN', hshopRegion: 'europe', titleId: null });
  });
});
