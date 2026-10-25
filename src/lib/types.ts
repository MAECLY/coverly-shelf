/**
 * Shared contracts between the extract, sources, resolver and ui modules.
 * They are page-agnostic on purpose so the listing pages can reuse them.
 */

/** `CTR` is the original 3DS, `KTR` the New 3DS exclusives. */
export type Platform = 'CTR' | 'KTR';

/** Region folders GameTDB uses under `https://art.gametdb.com/3ds/{type}/{region}/`. */
export type GameTdbRegion = string;

export interface GameInfo {
  /** Game title as hShop shows it (already HTML-decoded). */
  title: string;
  /** Full product code, e.g. `CTR-P-AZEE`. */
  productCode: string;
  platform: Platform;
  /** Middle letter of the product code: `P` retail, `N` digital, etc. */
  distribution: string;
  /** Last 4 characters of the product code, e.g. `AZEE`. */
  gameCode: string;
  /** Last character of the game code, e.g. `E`. */
  regionChar: string;
  /** GameTDB region derived from `regionChar` (or hShop's region text as a fallback). */
  region: GameTdbRegion;
  /** 16-hex-digit title ID in upper case, or null if the page has none. */
  titleId: string | null;
  /** hShop's own region slug (e.g. `north-america`), only used as a fallback. */
  hshopRegion: string | null;
}

export type ImageSource = 'gametdb' | 'libretro' | 'hshop';
export type ImageKind = 'cover' | 'snap' | 'title';

export interface ImageCandidate {
  url: string;
  source: ImageSource;
  kind: ImageKind;
}

/** Outcome of the cover fallback chain. The placeholder is never a broken image. */
export type CoverResult =
  | { kind: 'image'; url: string; source: ImageSource }
  | { kind: 'placeholder' };
