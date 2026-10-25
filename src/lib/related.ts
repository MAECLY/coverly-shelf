/**
 * Base-title fallback for demos, updates, DLC and kiosk builds, and the art of
 * the rows in a title page's "Related Content" box. The rules are recorded in
 * docs/REFERENCE.md ("Base-title fallback"); in short:
 *
 * - Every code first tries its own chain (resolveCover). A hit always wins.
 * - The page itself: when it is a derived release (distribution T, U, M, B or
 *   H) and its own chain found nothing, it uses the art of the row hShop marks
 *   `Relation: Base Title`. DLC (`CTR-M-XXXX-NN`) and updates (`CTR-U-XXXX`)
 *   already carry the base game code, which extract.ts reads as their game
 *   code, so for them this step only matters when the base row's code differs.
 * - A related row whose own code has no art falls back only when its relation
 *   says it is the same game as this page (Base Title, Demo Title, Update Data,
 *   Downloadable Content): first to the Base Title row's code, then to the
 *   page's own resolved cover. Any other relation keeps its placeholder.
 *
 * Nothing here guesses: every image is the verified art of an exact product
 * code, either the row's own or one hShop itself links as the same game.
 * Caching stays per code inside resolveCover, so a fallback costs no extra
 * request once its code is cached. Never rejects.
 */
import { resolveCover } from './resolver';
import { RELATIONS } from './selectors';
import type { RelatedEntry } from './extract';
import type { CoverResult, GameInfo } from './types';

const PLACEHOLDER: CoverResult = { kind: 'placeholder' };

/** Relations that name the same game as the page (hShop's wording, docs/REFERENCE.md). */
export const SAME_GAME_RELATIONS: readonly string[] = [RELATIONS.base, RELATIONS.demo, RELATIONS.update, RELATIONS.dlc];

/** Demo (T), update (U), DLC (M) and kiosk (B, H) distributions: their own code often has no art. */
export const DERIVED_DISTRIBUTIONS: readonly string[] = ['T', 'U', 'M', 'B', 'H'];

export function isSameGameRelation(relation: string | null | undefined): boolean {
  return !!relation && SAME_GAME_RELATIONS.includes(relation);
}

export function isDerivedRelease(info: GameInfo): boolean {
  return DERIVED_DISTRIBUTIONS.includes(info.distribution);
}

/**
 * Two codes whose artwork chains are the same (same platform, game code and
 * GameTDB region): when one found nothing, the other cannot either.
 */
export function sameArtwork(a: GameInfo, b: GameInfo): boolean {
  return a.platform === b.platform && a.gameCode === b.gameCode && a.region === b.region;
}

/** The first related row hShop marks `Relation: Base Title` that has a usable code, or null. */
export function baseTitleInfo(entries: readonly RelatedEntry[]): GameInfo | null {
  for (const entry of entries) {
    if (entry.relation === RELATIONS.base && entry.info) return entry.info;
  }
  return null;
}

export interface TitleCover {
  /** What the page shows. */
  result: CoverResult;
  /** The page's own chain, before any fallback. */
  own: CoverResult;
  /** True when `result` is the Base Title's art. */
  fromBase: boolean;
}

/** Title-page cover (full size) with the base-title fallback for derived releases. */
export async function resolveTitleCover(
  info: GameInfo,
  base: GameInfo | null,
  opts: { now?: () => number } = {},
): Promise<TitleCover> {
  try {
    const own = await resolveCover(info, opts);
    if (own.kind === 'image' || !base || !isDerivedRelease(info) || sameArtwork(info, base)) {
      return { result: own, own, fromBase: false };
    }
    const fromBase = await resolveCover(base, opts);
    return fromBase.kind === 'image' ? { result: fromBase, own, fromBase: true } : { result: own, own, fromBase: false };
  } catch {
    return { result: PLACEHOLDER, own: PLACEHOLDER, fromBase: false };
  }
}

export interface RelatedContext {
  /** The page's own game. */
  page: GameInfo;
  /** The Base Title row's code (baseTitleInfo), or null. */
  base: GameInfo | null;
  /** Resolves to the page's cover as shown (after its own fallback). */
  pageCover: Promise<TitleCover>;
}

/**
 * Art for one related row (thumbnail size). Rows whose code has the page's own
 * artwork reuse the page's own result (no request). Never rejects.
 */
export async function resolveRelatedCover(
  entry: Pick<RelatedEntry, 'info' | 'relation'>,
  ctx: RelatedContext,
  opts: { signal?: AbortSignal; now?: () => number } = {},
): Promise<CoverResult> {
  try {
    const info = entry.info;
    if (!info) return PLACEHOLDER;

    let own: CoverResult;
    if (sameArtwork(info, ctx.page)) own = (await ctx.pageCover).own;
    else own = await resolveCover(info, { ...opts, size: 'thumb' });
    if (own.kind === 'image' || !isSameGameRelation(entry.relation)) return own;
    if (opts.signal?.aborted) return own;

    const base = ctx.base;
    if (base && entry.relation !== RELATIONS.base && !sameArtwork(info, base) && !sameArtwork(base, ctx.page)) {
      const fromBase = await resolveCover(base, { ...opts, size: 'thumb' });
      if (fromBase.kind === 'image') return fromBase;
    }
    const page = (await ctx.pageCover).result;
    return page.kind === 'image' ? page : own;
  } catch {
    return PLACEHOLDER;
  }
}
