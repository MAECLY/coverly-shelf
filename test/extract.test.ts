import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractGameInfo,
  parseProductCode,
  parseTitleId,
  regionChain,
  regionFor,
} from '../src/lib/extract';
import type { GameInfo } from '../src/lib/types';

const FIXTURES = join(__dirname, 'fixtures', 'hshop');

function loadFixture(name: string): Document {
  // Drop external stylesheets and scripts: happy-dom would try to fetch them.
  const html = readFileSync(join(FIXTURES, name), 'utf8')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '');
  return new DOMParser().parseFromString(html, 'text/html');
}

function infoWithRegion(region: string): GameInfo {
  return {
    title: 'x',
    productCode: 'CTR-P-AAAA',
    platform: 'CTR',
    distribution: 'P',
    gameCode: 'AAAA',
    regionChar: 'A',
    region,
    titleId: null,
    hshopRegion: null,
  };
}

describe('parseProductCode', () => {
  it('parses a CTR retail code', () => {
    expect(parseProductCode('CTR-P-AZEE')).toEqual({
      productCode: 'CTR-P-AZEE',
      platform: 'CTR',
      distribution: 'P',
      gameCode: 'AZEE',
      regionChar: 'E',
    });
  });

  it('parses a New 3DS (KTR) code', () => {
    expect(parseProductCode('KTR-P-CFMP')).toMatchObject({
      platform: 'KTR',
      gameCode: 'CFMP',
      regionChar: 'P',
    });
  });

  it('rejects theme pseudo-codes', () => {
    expect(parseProductCode('CTR-N-THEME')).toBeNull();
  });

  it('rejects lowercase codes', () => {
    expect(parseProductCode('ctr-p-azee')).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(parseProductCode('')).toBeNull();
  });
});

describe('parseTitleId', () => {
  it('normalises lowercase to upper case', () => {
    expect(parseTitleId('00040000000d6b00')).toBe('00040000000D6B00');
  });

  it('returns null when there is no title ID', () => {
    expect(parseTitleId('N/A')).toBeNull();
  });
});

describe('regionFor', () => {
  it.each([
    ['E', 'US'],
    ['P', 'EN'],
    ['J', 'JA'],
    ['K', 'KO'],
  ])('maps region char %s to %s', (char, region) => {
    expect(regionFor(char, null)).toBe(region);
  });

  it('falls back to the hShop slug for unknown chars', () => {
    expect(regionFor('R', 'japan')).toBe('JA');
    expect(regionFor('C', 'north-america')).toBe('US');
  });

  it('falls back to EN when nothing is known', () => {
    expect(regionFor('R', null)).toBe('EN');
    expect(regionFor('U', 'atlantis')).toBe('EN');
  });

  it.each([
    // Live GameTDB folders, 2026-10-25 (see config.ts).
    ['W', 'ZH'],
    ['Y', 'EN'],
    ['Z', 'EN'],
    ['V', 'EN'],
    ['X', 'EN'],
    ['A', 'EN'],
    ['F', 'EN'],
    ['S', 'EN'],
    ['H', 'EN'],
    ['D', 'DE'],
    ['I', 'IT'],
  ])('maps verified letter %s to %s whatever the slug', (char, region) => {
    expect(regionFor(char, 'korea')).toBe(region);
    expect(regionFor(char, 'canada')).toBe(region);
  });
});

describe('regionChain', () => {
  it('de-duplicates while keeping order', () => {
    expect(regionChain(infoWithRegion('EN'))).toEqual(['EN', 'US']);
    expect(regionChain(infoWithRegion('US'))).toEqual(['US', 'EN']);
    expect(regionChain(infoWithRegion('JA'))).toEqual(['JA', 'EN', 'US']);
  });
});

describe('extractGameInfo', () => {
  it('reads the retail US fixture (1814)', () => {
    expect(extractGameInfo(loadFixture('title-retail-us-1814.html'))).toEqual({
      title: 'Batman - Arkham Origins Blackgate',
      productCode: 'CTR-P-AZEE',
      platform: 'CTR',
      distribution: 'P',
      gameCode: 'AZEE',
      regionChar: 'E',
      region: 'US',
      titleId: '00040000000D6B00',
      hshopRegion: 'north-america',
    });
  });

  it('reads the retail EU fixture (98)', () => {
    const info = extractGameInfo(loadFixture('title-retail-eu-98.html'));
    expect(info).toMatchObject({
      gameCode: 'AZEP',
      region: 'EN',
      titleId: '00040000000D7000',
      hshopRegion: 'europe',
    });
  });

  it('reads the digital fixture (18761)', () => {
    const info = extractGameInfo(loadFixture('title-digital-us-18761.html'));
    expect(info).toMatchObject({
      title: '3D Classics Excitebike',
      gameCode: 'SAEE',
      distribution: 'N',
      region: 'US',
    });
  });

  it('returns null for a theme (15834)', () => {
    expect(extractGameInfo(loadFixture('title-theme-15834.html'))).toBeNull();
  });

  it('returns null for an empty document', () => {
    expect(extractGameInfo(new DOMParser().parseFromString('', 'text/html'))).toBeNull();
  });

  it('falls back to scanning the meta block when labelled rows are missing', () => {
    const doc = new DOMParser().parseFromString(
      '<div class="title-name"><h2>X</h2></div><div class="basic-meta"><p>Code CTR-P-AZEJ 00040000000aaaaa</p></div>',
      'text/html',
    );
    expect(extractGameInfo(doc)).toMatchObject({
      gameCode: 'AZEJ',
      region: 'JA',
      titleId: '00040000000AAAAA',
      hshopRegion: null,
    });
  });
});
