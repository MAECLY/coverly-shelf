/**
 * Update (`CTR-U-XXXX`) and DLC (`CTR-M-XXXX-NN`) rows resolve like their
 * base game: same 4-character code, same region chain. Every expected first
 * URL below answered 200 on art.gametdb.com on 2026-10-25 (docs/REFERENCE.md,
 * "Updates and DLC").
 */
import { describe, expect, it } from 'vitest';
import { parseProductCode, regionChain, regionFor } from '../src/lib/extract';
import { gametdbCoverCandidates } from '../src/lib/sources/gametdb';
import type { GameInfo } from '../src/lib/types';

const GT = 'https://art.gametdb.com/3ds/cover';

function row(raw: string, slug: string): GameInfo {
  const code = parseProductCode(raw);
  if (!code) throw new Error(`not a code: ${raw}`);
  return { title: '', ...code, region: regionFor(code.regionChar, slug, code.platform), titleId: null, hshopRegion: slug };
}

const thumbs = (info: GameInfo): string[] =>
  gametdbCoverCandidates(info, regionChain(info), 'thumb').map((c) => c.url);

describe('update and DLC rows', () => {
  it.each([
    // [hShop row, subcategory, chain, verified hit]
    ['CTR-U-ALZF', 'france', ['EN', 'US'], 'EN/ALZF'],
    ['CTR-U-AFJF', 'france', ['EN', 'US'], 'EN/AFJF'],
    ['CTR-M-JCVF-00', 'france', ['EN', 'US'], 'EN/JCVF'],
    ['CTR-U-ALZD', 'germany', ['DE', 'EN', 'US'], 'EN/ALZD'],
    ['CTR-M-JCVD-00', 'germany', ['DE', 'EN', 'US'], 'EN/JCVD'],
    ['CTR-M-JCVI-00', 'italy', ['IT', 'EN', 'US'], 'EN/JCVI'],
    ['CTR-U-ALEX', 'spain', ['EN', 'US'], 'EN/ALEX'],
    ['CTR-U-AQ2J', 'japan', ['JA', 'EN', 'US'], 'JA/AQ2J'],
    ['CTR-M-BZMJ-00', 'japan', ['JA', 'EN', 'US'], 'JA/BZMJ'],
    ['CTR-M-AACJ-00', 'japan', ['JA', 'EN', 'US'], 'JA/AACJ'],
    ['CTR-U-A9CK', 'korea', ['KO', 'EN', 'US'], 'KO/A9CK'],
    ['CTR-M-BYGK-00', 'korea', ['KO', 'EN', 'US'], 'KO/BYGK'],
    ['CTR-M-BG6Y-00', 'korea', ['EN', 'US'], 'EN/BG6Y'],
    ['CTR-U-BLSY', 'france', ['EN', 'US'], 'EN/BLSY'],
    ['CTR-U-AJJW', 'taiwan', ['ZH', 'EN', 'US'], 'ZH/AJJW'],
    ['CTR-M-ABEW-00', 'china', ['ZH', 'EN', 'US'], 'ZH/ABEW'],
    ['CTR-U-AH4Z', 'taiwan', ['EN', 'US'], 'EN/AH4Z'],
    ['CTR-U-ALEZ', 'france', ['EN', 'US'], 'EN/ALEZ'],
    ['CTR-M-BYGZ-00', 'australia', ['EN', 'US'], 'EN/BYGZ'],
    ['CTR-U-AY6A', 'world', ['EN', 'US'], 'EN/AY6A'],
    ['KTR-U-BD3E', 'north-america', ['US', 'EN'], 'US/BD3E'],
    ['CTR-M-KRJE-00', 'north-america', ['US', 'EN'], 'US/KRJE'],
  ])('%s (%s) asks for the base game in %j', (raw, slug, chain, hit) => {
    const info = row(raw, slug);
    expect(regionChain(info)).toEqual(chain);
    const urls = thumbs(info);
    // One `cover` per region, and the verified hit is among them.
    expect(urls).toEqual(chain.map((r) => `${GT}/${r}/${info.gameCode}.jpg`));
    expect(urls).toContain(`${GT}/${hit}.jpg`);
  });

  it('never probes a sibling region code (a shared stem can be another game: AT8J ≠ AT8P)', () => {
    const urls = thumbs(row('CTR-U-AT8J', 'japan'));
    expect(urls.every((u) => u.endsWith('/AT8J.jpg'))).toBe(true);
  });

  it('keeps the unverified letters C, R and U on the slug, then EN and US', () => {
    expect(regionChain(row('CTR-N-JMKC', 'china'))).toEqual(['EN', 'US']);
    expect(regionChain(row('CTR-P-APNR', 'russia'))).toEqual(['EN', 'US']);
    expect(regionChain(row('CTR-N-JMKC', 'japan'))).toEqual(['JA', 'EN', 'US']);
  });
});
