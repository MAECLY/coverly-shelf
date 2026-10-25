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
 * - hShop overload signals (429, 5xx, a challenge page or a redirect away)
 *   start a cooldown (`Retry-After`, else LOOKUP.cooldownMs) kept in memory and
 *   under `local:hshop:cooldown`: until it ends every lookup, queued ones too,
 *   resolves null without a request, on this page and on later page views.
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

/** What one request told us; `cooldownMs` when hShop asked us to back off. */
interface FetchResult {
  outcome: Outcome;
  cooldownMs?: number;
}

const limitHshop = createLimiter(LOOKUP.maxConcurrent);
const inflight = new Map<string, Promise<GameInfo | null>>();

const lookupKey = (id: string): string => `local:lookup:${id}`;
const COOLDOWN_KEY = 'local:hshop:cooldown';

/** Epoch ms until which hShop gets no lookup (mirrors COOLDOWN_KEY). */
let cooldownUntil = 0;

/** Test hook: forget the in-memory cooldown. */
export function resetHshopCooldown(): void {
  cooldownUntil = 0;
}

/**
 * Pause length for a `Retry-After` value (delta seconds or an HTTP date),
 * clamped to [LOOKUP.minCooldownMs, LOOKUP.maxCooldownMs]; LOOKUP.cooldownMs
 * when it is missing or unreadable.
 */
export function cooldownFromRetryAfter(header: string | null | undefined, nowMs: number): number {
  let ms: number = LOOKUP.cooldownMs;
  const raw = header?.trim();
  if (raw) {
    if (/^\d+$/.test(raw)) ms = Number(raw) * 1000;
    else {
      const at = Date.parse(raw);
      if (Number.isFinite(at)) ms = at - nowMs;
    }
  }
  return Math.min(LOOKUP.maxCooldownMs, Math.max(LOOKUP.minCooldownMs, ms));
}

async function coolingDown(now: () => number): Promise<boolean> {
  const t = now();
  if (t < cooldownUntil) return true;
  const stored = await getCached<unknown>(COOLDOWN_KEY, now, LOOKUP.maxCooldownMs);
  if (typeof stored === 'number' && Number.isFinite(stored) && t < stored) {
    // Never trust a stored pause longer than the maximum (clock changes).
    cooldownUntil = Math.min(stored, t + LOOKUP.maxCooldownMs);
    return true;
  }
  return false;
}

async function startCooldown(ms: number, now: () => number): Promise<void> {
  cooldownUntil = Math.max(cooldownUntil, now() + ms);
  await setCached(COOLDOWN_KEY, cooldownUntil, now);
}

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

async function fetchTitle(id: string, now: () => number, signal?: AbortSignal): Promise<FetchResult> {
  if (signal?.aborted) return { outcome: undefined };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LOOKUP.timeoutMs);
  const onAbort = (): void => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(`${HSHOP_ORIGIN}/t/${id}`, {
      method: 'GET',
      credentials: 'same-origin',
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (res.status === 404 || res.status === 410) return { outcome: null };
    if (res.status === 429 || res.status >= 500) {
      return { outcome: undefined, cooldownMs: cooldownFromRetryAfter(res.headers.get('retry-after'), now()) };
    }
    if (!res.ok) return { outcome: undefined };
    // A redirect elsewhere (challenge, maintenance) is not this title's page.
    if (res.url && hshopIdFromHref(res.url) !== id) return { outcome: undefined, cooldownMs: LOOKUP.cooldownMs };
    const outcome = parseTitlePage(await res.text());
    // A 200 without hShop's title layout is a challenge or maintenance page.
    return outcome === undefined ? { outcome, cooldownMs: LOOKUP.cooldownMs } : { outcome };
  } catch {
    return { outcome: undefined };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function lookup(id: string, now: () => number, signal?: AbortSignal): Promise<GameInfo | null> {
  const cached = await getCached<unknown>(lookupKey(id), now, LOOKUP.ttlMs);
  if (isRecord(cached)) return cached.info;
  if (signal?.aborted || (await coolingDown(now))) return null;

  // Checked again when the limiter starts the task: an earlier request may have hit a 429.
  // A task still queued when `signal` aborts never runs (the limiter rejects it).
  const { outcome, cooldownMs } = await limitHshop(
    async (): Promise<FetchResult> => (await coolingDown(now)) ? { outcome: undefined } : fetchTitle(id, now, signal),
    signal,
  );
  if (cooldownMs !== undefined) await startCooldown(cooldownMs, now);
  if (outcome === undefined) return null;
  await setCached<LookupRecord>(lookupKey(id), { info: outcome }, now);
  return outcome;
}

export interface LookupOptions {
  now?: () => number;
  /**
   * Aborting it (the page's run was torn down) drops the lookup if it is still
   * queued and cancels its request if it is in flight; it resolves null and
   * nothing is cached. Callers sharing one in-flight lookup share its signal,
   * which is fine within one run; a later caller starts afresh.
   */
  signal?: AbortSignal;
}

/**
 * GameInfo of hShop title `hshopId`, from the cache or hShop's title page;
 * null when it has no usable product code, hShop could not be reached or
 * `signal` aborted. Never rejects.
 */
export function lookupGameInfo(hshopId: string, opts: LookupOptions = {}): Promise<GameInfo | null> {
  if (!ID_RE.test(hshopId) || opts.signal?.aborted) return Promise.resolve(null);
  let pending = inflight.get(hshopId);
  if (!pending) {
    const own: Promise<GameInfo | null> = lookup(hshopId, opts.now ?? Date.now, opts.signal).catch(() => null);
    pending = own;
    inflight.set(hshopId, own);
    const forget = (): void => {
      if (inflight.get(hshopId) === own) inflight.delete(hshopId);
    };
    // Only the in-flight request is shared; the storage cache keeps the answer.
    void own.finally(forget);
    // An aborted lookup is never handed to a later caller.
    opts.signal?.addEventListener('abort', forget, { once: true });
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
