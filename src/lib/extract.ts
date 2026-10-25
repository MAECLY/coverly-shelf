/**
 * Reads the game identity out of an hShop title page. Pure: it only queries
 * the given Document through SELECTORS and never throws on unexpected markup.
 */
import { FALLBACK_REGIONS, REGION_BY_CHAR, REGION_BY_HSHOP_SLUG } from './config';
import { META_LABELS, SELECTORS } from './selectors';
import type { GameInfo, GameTdbRegion, Platform } from './types';

const PRODUCT_CODE_RE = /\b(CTR|KTR)-([A-Z])-([A-Z0-9]{4})\b/;
const TITLE_ID_RE = /\b0004[0-9A-F]{12}\b/i;
const REGION_SLUG_RE = /\/c\/[^/]+\/s\/([^/?#]+)/;

export interface ParsedProductCode {
  productCode: string;
  platform: Platform;
  distribution: string;
  gameCode: string;
  regionChar: string;
}

export function parseProductCode(text: string): ParsedProductCode | null {
  const m = PRODUCT_CODE_RE.exec(text);
  if (!m) return null;
  const [productCode, platform, distribution, gameCode] = m;
  if (!productCode || !platform || !distribution || !gameCode) return null;
  return {
    productCode,
    platform: platform as Platform,
    distribution,
    gameCode,
    regionChar: gameCode.charAt(3),
  };
}

export function parseTitleId(text: string): string | null {
  const m = TITLE_ID_RE.exec(text);
  return m ? m[0].toUpperCase() : null;
}

export function regionFor(regionChar: string, hshopSlug: string | null): GameTdbRegion {
  const byChar = REGION_BY_CHAR[regionChar];
  if (byChar) return byChar;
  const bySlug = hshopSlug ? REGION_BY_HSHOP_SLUG[hshopSlug] : undefined;
  if (bySlug) return bySlug;
  return FALLBACK_REGIONS[0] ?? 'EN';
}

export function regionChain(info: GameInfo): GameTdbRegion[] {
  return [...new Set<GameTdbRegion>([info.region, ...FALLBACK_REGIONS])];
}

/** Value of the `<p>Label: <span>value</span></p>` row whose label matches, or null. */
function metaValue(doc: Document, label: string): string | null {
  for (const row of doc.querySelectorAll(SELECTORS.title.metaRows)) {
    const text = row.textContent ?? '';
    const colon = text.indexOf(':');
    if (colon < 0 || text.slice(0, colon).trim() !== label) continue;
    const value = row.querySelector('span')?.textContent ?? text.slice(colon + 1);
    return value.trim();
  }
  return null;
}

function hshopSlug(doc: Document): string | null {
  const links = doc.querySelectorAll(SELECTORS.title.breadcrumbLinks);
  const last = links[links.length - 1];
  const href = last?.getAttribute('href');
  if (!href) return null;
  const slug = REGION_SLUG_RE.exec(href)?.[1];
  return slug ?? null;
}

export function extractGameInfo(doc: Document): GameInfo | null {
  try {
    const metaText = doc.querySelector(SELECTORS.title.meta)?.textContent ?? '';

    const codeRow = metaValue(doc, META_LABELS.productCode);
    const code = parseProductCode(codeRow ?? metaText);
    if (!code) return null;

    const titleRow = metaValue(doc, META_LABELS.titleId);
    const titleId = parseTitleId(titleRow ?? metaText);

    const title = doc.querySelector(SELECTORS.title.name)?.textContent?.trim() ?? '';
    const slug = hshopSlug(doc);

    return {
      title,
      ...code,
      region: regionFor(code.regionChar, slug),
      titleId,
      hshopRegion: slug,
    };
  } catch {
    return null;
  }
}
