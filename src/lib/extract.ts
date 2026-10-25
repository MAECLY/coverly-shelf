/**
 * Reads the game identity out of hShop title pages and listing rows. Pure: it
 * only queries the given nodes through SELECTORS and never throws on
 * unexpected markup.
 */
import { FALLBACK_REGIONS, GAMETDB_DS, NO_ART_CATEGORIES, REGION_BY_CHAR, REGION_BY_HSHOP_SLUG } from './config';
import { LIST_BREADCRUMB_PREFIX, META_LABELS, SELECTORS } from './selectors';
import type { GameInfo, GameTdbRegion, Platform } from './types';

/**
 * `CTR`/`KTR` (3DS, New 3DS) and `TWL` (DSiWare). The trailing `\b` matters:
 * it rejects `CTR-N-THEME` (no art) and free-form extras such as
 * `CTR-N-PICROSS-S`, and reads DLC `CTR-M-BYGE-00` as its base game `BYGE`.
 */
const PRODUCT_CODE_RE = /\b(CTR|KTR|TWL)-([A-Z])-([A-Z0-9]{4})\b/;
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

export function regionFor(regionChar: string, hshopSlug: string | null, platform?: Platform): GameTdbRegion {
  // GameTDB files DSiWare by its own rule: E → US, J → JA, everything else EN.
  if (platform === 'TWL') return GAMETDB_DS.regionByChar[regionChar] ?? GAMETDB_DS.defaultRegion;
  const byChar = REGION_BY_CHAR[regionChar];
  if (byChar) return byChar;
  const bySlug = hshopSlug ? REGION_BY_HSHOP_SLUG[hshopSlug] : undefined;
  if (bySlug) return bySlug;
  return FALLBACK_REGIONS[0] ?? 'EN';
}

export function regionChain(info: GameInfo): GameTdbRegion[] {
  const fallbacks = info.platform === 'TWL' ? GAMETDB_DS.fallbackRegions : FALLBACK_REGIONS;
  return [...new Set<GameTdbRegion>([info.region, ...fallbacks])];
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
      region: regionFor(code.regionChar, slug, code.platform),
      titleId,
      hshopRegion: slug,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Listing pages (`/c/*`, `/search/results`)
// ---------------------------------------------------------------------------

export interface ListEntry {
  anchor: HTMLAnchorElement;
  /** `{id}` of the row's `/t/{id}` link. */
  hshopId: string | null;
  /** Null when the row shows no usable product code (top list, themes, free-form extras). */
  info: GameInfo | null;
  /** Name as the row shows it (rank prefix of top-list rows removed); for alt text and placeholders. */
  title: string;
  /**
   * True only for rows that carry no product code at all and could not be
   * matched to another row of the same page: the "Top content" rows. Rows
   * whose code is shown but unsupported (`CTR-N-THEME`, `DevMenu 2x`) are
   * false, so callers do not fetch their title page for nothing.
   */
  needsLookup: boolean;
}

const CATEGORY_PATH_RE = /^\/c\/([^/?#]+)/;
const TITLE_HREF_RE = /^(?:https?:\/\/hshop\.erista\.me)?\/t\/(\d+)\/?(?:[?#]|$)/;
const RANK_PREFIX_RE = /^\s*\d+\.\s*/;

/** `{id}` of an hShop `/t/{id}` href, or null for any other link. */
export function hshopIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  return TITLE_HREF_RE.exec(href.trim())?.[1] ?? null;
}

function text(node: Element | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Labelled values of a row's own `.meta` (never the badge box inside `.base-info`). */
function rowMeta(anchor: Element): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of anchor.querySelectorAll(SELECTORS.list.metaContent)) {
    const spans = entry.querySelectorAll(':scope > span');
    if (spans.length < 2) continue;
    const label = text(spans[spans.length - 1]);
    if (label && !out.has(label)) out.set(label, text(spans[0]));
  }
  return out;
}

/** Region slug from `content in games ➞ north-america` (its last span). */
function rowSlug(anchor: Element): string | null {
  for (const h4 of anchor.querySelectorAll(SELECTORS.list.infoLines)) {
    if (!text(h4).startsWith(LIST_BREADCRUMB_PREFIX)) continue;
    const spans = h4.querySelectorAll('span');
    const slug = text(spans[spans.length - 1]);
    return slug || null;
  }
  return null;
}

function rowTitle(anchor: Element, top: boolean): string {
  if (top) {
    const name = text(anchor.querySelector(SELECTORS.list.topName));
    if (name) return name;
  }
  const name = text(anchor.querySelector(SELECTORS.list.name));
  return top ? name.replace(RANK_PREFIX_RE, '') : name;
}

function rowInfo(title: string, meta: Map<string, string>, slug: string | null): GameInfo | null {
  const raw = meta.get(META_LABELS.productCode);
  if (raw === undefined) return null;
  const code = parseProductCode(raw);
  if (!code) return null;
  const titleIdRaw = meta.get(META_LABELS.titleId);
  return {
    title,
    ...code,
    region: regionFor(code.regionChar, slug, code.platform),
    titleId: titleIdRaw ? parseTitleId(titleIdRaw) : null,
    hshopRegion: slug,
  };
}

export interface ExtractListOptions {
  /** Page path, e.g. `/c/themes/s/europe`. Defaults to the current location. */
  pathname?: string;
}

function currentPathname(): string {
  try {
    return globalThis.location?.pathname ?? '';
  } catch {
    return '';
  }
}

/**
 * Every title row (`/t/{id}`) under `root`, in document order: the main list,
 * the "Top content" list and search results. Subcategory rows of category
 * roots are left out. Top-list rows borrow the GameInfo of a main-list row
 * with the same `/t/{id}` on the page when there is one. Never throws.
 */
export function extractListEntries(root: ParentNode, opts: ExtractListOptions = {}): ListEntry[] {
  try {
    const category = CATEGORY_PATH_RE.exec(opts.pathname ?? currentPathname())?.[1] ?? null;
    const lookups = !(category && NO_ART_CATEGORIES.includes(category));
    const entries: ListEntry[] = [];
    const known = new Map<string, GameInfo>();
    const shownCode = new Set<string>();
    for (const el of root.querySelectorAll(SELECTORS.list.entry)) {
      try {
        if (el.tagName.toUpperCase() !== 'A') continue;
        const anchor = el as HTMLAnchorElement;
        const hshopId = hshopIdFromHref(anchor.getAttribute('href'));
        if (!hshopId) continue;
        const top = anchor.closest(SELECTORS.list.topList) !== null;
        const title = rowTitle(anchor, top);
        const meta = rowMeta(anchor);
        const info = rowInfo(title, meta, rowSlug(anchor));
        if (meta.has(META_LABELS.productCode)) shownCode.add(hshopId);
        if (info && !known.has(hshopId)) known.set(hshopId, info);
        entries.push({ anchor, hshopId, info, title, needsLookup: false });
      } catch {
        /* skip a malformed row, keep the others */
      }
    }
    for (const entry of entries) {
      if (entry.info || !entry.hshopId) continue;
      const borrowed = known.get(entry.hshopId);
      if (borrowed) entry.info = { ...borrowed, title: entry.title || borrowed.title };
      else entry.needsLookup = lookups && !shownCode.has(entry.hshopId);
    }
    return entries;
  } catch {
    return [];
  }
}
