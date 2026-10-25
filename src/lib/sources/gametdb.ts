/**
 * GameTDB artwork URLs (pure, no network).
 * Pattern: `https://art.gametdb.com/{3ds|ds}/{type}/{region}/{gameCode}.{ext}`
 * (docs/REFERENCE.md). 3DS codes (CTR/KTR) live under `3ds/`, DSiWare (TWL)
 * under `ds/`.
 */
import { GAMETDB, GAMETDB_DS, type GameTdbType } from '../config';
import type { GameInfo, GameTdbRegion, ImageCandidate } from '../types';

/** `full` = title pages (HQ first); `thumb` = list rows (small `cover` only). */
export type CoverSize = 'full' | 'thumb';

export function gametdbUrl(t: GameTdbType, region: GameTdbRegion, gameCode: string, base: string = GAMETDB.base): string {
  return `${base}/${t.type}/${region}/${gameCode}.${t.ext}`;
}

function coverTypesFor(info: GameInfo, size: CoverSize): { base: string; types: readonly GameTdbType[] } {
  if (info.platform === 'TWL') {
    return { base: GAMETDB_DS.base, types: size === 'thumb' ? GAMETDB_DS.thumbTypes : GAMETDB_DS.coverTypes };
  }
  return { base: GAMETDB.base, types: size === 'thumb' ? GAMETDB.thumbTypes : GAMETDB.coverTypes };
}

/**
 * Front cover candidates, best first: every cover type for the first region,
 * then the next region, and so on. Retail-only types are skipped for digital
 * releases.
 */
export function gametdbCoverCandidates(
  info: GameInfo,
  regions: readonly GameTdbRegion[],
  size: CoverSize = 'full',
): ImageCandidate[] {
  const digital = info.distribution === GAMETDB.digitalDistribution;
  const { base, types } = coverTypesFor(info, size);
  const out: ImageCandidate[] = [];
  for (const region of regions) {
    for (const t of types) {
      if (digital && t.retailOnly) continue;
      out.push({ url: gametdbUrl(t, region, info.gameCode, base), source: 'gametdb', kind: 'cover' });
    }
  }
  return out;
}
