/**
 * GameTDB artwork URLs (pure, no network).
 * Pattern: `https://art.gametdb.com/3ds/{type}/{region}/{gameCode}.{ext}` (docs/REFERENCE.md).
 */
import { GAMETDB, type GameTdbType } from '../config';
import type { GameInfo, GameTdbRegion, ImageCandidate } from '../types';

export function gametdbUrl(t: GameTdbType, region: GameTdbRegion, gameCode: string): string {
  return `${GAMETDB.base}/${t.type}/${region}/${gameCode}.${t.ext}`;
}

/**
 * Front cover candidates, best first: every cover type for the first region,
 * then the next region, and so on. Retail-only types are skipped for digital
 * releases.
 */
export function gametdbCoverCandidates(
  info: GameInfo,
  regions: readonly GameTdbRegion[],
): ImageCandidate[] {
  const digital = info.distribution === GAMETDB.digitalDistribution;
  const out: ImageCandidate[] = [];
  for (const region of regions) {
    for (const t of GAMETDB.coverTypes as readonly GameTdbType[]) {
      if (digital && t.retailOnly) continue;
      out.push({ url: gametdbUrl(t, region, info.gameCode), source: 'gametdb', kind: 'cover' });
    }
  }
  return out;
}
