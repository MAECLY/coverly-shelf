/**
 * `/t/{id}` → GameInfo for listing rows that show no product code (the "Top
 * content" list). Fetches hShop's own title page (same origin, plain GET, no
 * scripts run: it is only parsed with DOMParser) and reads it with
 * extractGameInfo, exactly like the title-page content script does.
 *
 * - Cached under `local:lookup:{id}` for LOOKUP.ttlMs (30 days). A title's
 *   product code never changes, so hits and definite misses (404, a page
 *   without a usable code such as a theme) are both kept.
 * - Transport problems (network error, timeout, 429/5xx, a challenge page or a
 *   redirect away from the title) are not cached, so a later visit retries.
 * - At most LOOKUP.maxConcurrent requests to hShop at once, separate from the
 *   artwork limiter, and one request per id per page however often it is asked.
 * - Never rejects.
 */
import { getCached, setCached } from './cache';
import { LOOKUP } from './config';
import { extractGameInfo, hshopIdFromHref, type ListEntry } from './extract';
import { createLimiter } from './queue';
import { SELECTORS } from './selectors';
import type { GameInfo, Platform } from './types';

export const HSHOP_ORIGIN = 'https://hshop.erista.me';

const ID_RE = /^\d{1,10}$/;
const PLATFORMS: readonly Platform[] = ['CTR', 'KTR', 'TWL'];

/** Stored shape: the wrapper tells a cached "no code" apart from a cache miss. */
interface LookupRecord {
  info: GameInfo | null;
}

/** null = no usable code (definite); undefined = no answer this time (transient). */
type Outcome = GameInfo | null | undefined;

const limitHshop = createLimiter(LOOKUP.maxConcurrent);
const inflight = new Map<string, Promise<GameInfo | null>>();

const lookupKey = (id: string): string => `local:lookup:${id}`;

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

export function isGameInfo(value: unknown): value is GameInfo {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isString(v.title) &&
    isString(v.productCode) &&
    PLATFORMS.includes(v.platform as Platform) &&
    isString(v.distribution) &&
    isString(v.gameCode) &&
    /^[A-Z0-9]{4}$/.test(v.gameCode) &&
    isString(v.regionChar) &&
    isString(v.region) &&
    (v.titleId === null || isString(v.titleId)) &&
    (v.hshopRegion === null || isString(v.hshopRegion))
  );
}

function isRecord(value: unknown): value is LookupRecord {
  if (typeof value !== 'object' || value === null || !('info' in value)) return false;
  const info = (value as LookupRecord).info;
  return info === null || isGameInfo(info);
}

/** Reads a fetched title page. A page without hShop's title layout is not an answer. */
export function parseTitlePage(html: string): Outcome {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc.querySelector(SELECTORS.title.container)) return undefined;
    return extractGameInfo(doc);
  } catch {
    return undefined;
  }
}

async function fetchTitle(id: string): Promise<Outcome> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LOOKUP.timeoutMs);
  try {
    const res = await fetch(`${HSHOP_ORIGIN}/t/${id}`, {
      method: 'GET',
      credentials: 'same-origin',
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) return undefined;
    // A redirect elsewhere (challenge, maintenance) is not this title's page.
    if (res.url && hshopIdFromHref(res.url) !== id) return undefined;
    return parseTitlePage(await res.text());
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function lookup(id: string, now: () => number): Promise<GameInfo | null> {
  const cached = await getCached<unknown>(lookupKey(id), now, LOOKUP.ttlMs);
  if (isRecord(cached)) return cached.info;

  const outcome = await limitHshop(() => fetchTitle(id));
  if (outcome === undefined) return null;
  await setCached<LookupRecord>(lookupKey(id), { info: outcome }, now);
  return outcome;
}

/**
 * GameInfo of hShop title `hshopId`, from the cache or hShop's title page;
 * null when it has no usable product code or hShop could not be reached.
 * Never rejects.
 */
export function lookupGameInfo(hshopId: string, opts: { now?: () => number } = {}): Promise<GameInfo | null> {
  if (!ID_RE.test(hshopId)) return Promise.resolve(null);
  let pending = inflight.get(hshopId);
  if (!pending) {
    pending = lookup(hshopId, opts.now ?? Date.now).catch(() => null);
    inflight.set(hshopId, pending);
    // Only the in-flight request is shared; the storage cache keeps the answer.
    void pending.finally(() => inflight.delete(hshopId));
  }
  return pending;
}

const sameCode = (a: GameInfo | null, b: GameInfo): boolean =>
  !!a && a.productCode === b.productCode && a.hshopRegion === b.hshopRegion && a.titleId === b.titleId;

/**
 * Stores what a page already showed (a main-list row's code) so a later
 * "Top content" row for the same title needs no request. Skips the write when
 * the cache already holds the same code. Never rejects.
 */
export async function rememberGameInfo(hshopId: string, info: GameInfo, opts: { now?: () => number } = {}): Promise<void> {
  if (!ID_RE.test(hshopId) || !isGameInfo(info)) return;
  const now = opts.now ?? Date.now;
  const cached = await getCached<unknown>(lookupKey(hshopId), now, LOOKUP.ttlMs);
  if (isRecord(cached) && sameCode(cached.info, info)) return;
  await setCached<LookupRecord>(lookupKey(hshopId), { info }, now);
}

/**
 * Remembers every listing row whose own product code the page shows (main
 * list and search results; never "Top content" rows, which only borrow one),
 * so a top-list row for the same title on another page or a later page of
 * this subcategory costs no hShop request. Never rejects.
 */
export async function rememberShownCodes(entries: readonly ListEntry[], opts: { now?: () => number } = {}): Promise<void> {
  try {
    for (const entry of entries) {
      if (!entry.info || !entry.hshopId || entry.anchor.closest(SELECTORS.list.topList)) continue;
      await rememberGameInfo(entry.hshopId, entry.info, opts);
    }
  } catch {
    /* only a cache warm-up */
  }
}
