/**
 * Picks the artwork to show for a game. DOM-free: every network check goes
 * through `probeOutcome`, every result is cached per game code (misses too, so
 * 404s are not repeated for a week), and nothing here ever rejects.
 *
 * A result is only cached when every step gave a definite answer. If the
 * background could not be reached or a probe timed out, the outcome is still
 * returned for this page view but not stored, so a passing transport failure
 * is never remembered as "no artwork" for a week.
 *
 * Cover chain: GameTDB (game region, then EN/US) → Libretro Named_Boxarts →
 * hShop's own icon → placeholder. DSiWare (TWL) uses GameTDB's `ds/` folder
 * and skips Libretro, which has next to no DSi box art.
 *
 * Two sizes, cached apart so title pages keep their HQ art:
 * - `full` (default, title pages): coverHQ then cover per region;
 * - `thumb` (list rows): only the 160×144 `cover` per region, which keeps a
 *   listing page to a handful of GameTDB requests per row. A definite full
 *   result that a thumb can reuse (placeholder, Libretro, same URL) is reused
 *   without probing.
 */
import { getCached, setCached } from './cache';
import { regionChain } from './extract';
import { requestLibretroNamesResult } from './messages';
import { probeOutcome, type ProbeOutcome } from './probe';
import { gametdbCoverCandidates, type CoverSize } from './sources/gametdb';
import { libretroCandidates } from './sources/libretro';
import type { CoverResult, GameInfo, ImageCandidate, ImageKind, ImageSource } from './types';

export interface ResolveOptions {
  /** hShop's own icon for the title, used when no box art exists. Not cached: it lives on the page. */
  hshopIconUrl?: string | null;
  now?: () => number;
  /** `thumb` for list rows: small images only and a separate cache entry. Default `full`. */
  size?: CoverSize;
}

const PLACEHOLDER: CoverResult = { kind: 'placeholder' };
const GALLERY_KINDS: readonly ImageKind[] = ['title', 'snap'];
const SOURCES: readonly ImageSource[] = ['gametdb', 'libretro', 'hshop'];
const KINDS: readonly ImageKind[] = ['cover', 'snap', 'title'];

/** Tracks whether any step of one resolution failed for a transport reason. */
interface Run {
  transient: boolean;
}

/** One probe per URL per page, whoever asks for it. */
const probeMemo = new Map<string, Promise<ProbeOutcome>>();

function probeOnce(url: string): Promise<ProbeOutcome> {
  let pending = probeMemo.get(url);
  if (!pending) {
    pending = probeOutcome(url).then(
      (o): ProbeOutcome => (o === 'hit' || o === 'miss' ? o : 'error'),
      (): ProbeOutcome => 'error',
    );
    probeMemo.set(url, pending);
  }
  return pending;
}

async function probeIn(run: Run, url: string): Promise<boolean> {
  const outcome = await probeOnce(url);
  if (outcome === 'error') run.transient = true;
  return outcome === 'hit';
}

/** Test hook: forget every probe made so far. */
export function resetProbeMemo(): void {
  probeMemo.clear();
}

/** DSiWare and 3DS game codes share one namespace (both use K…), so DSiWare keys get a prefix. */
const codeKey = (info: GameInfo): string => (info.platform === 'TWL' ? `ds:${info.gameCode}` : info.gameCode);
const coverKey = (info: GameInfo, size: CoverSize = 'full'): string =>
  `local:${size === 'thumb' ? 'thumb' : 'cover'}:${codeKey(info)}`;
const galleryKey = (info: GameInfo): string => `local:gallery:${codeKey(info)}`;

/** Libretro's map only knows 3DS serials. */
const usesLibretro = (info: GameInfo): boolean => info.platform !== 'TWL';

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('https://');
}

function isCoverResult(value: unknown): value is CoverResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind === 'placeholder') return true;
  return v.kind === 'image' && isHttpsUrl(v.url) && SOURCES.includes(v.source as ImageSource);
}

function isCandidateList(value: unknown): value is ImageCandidate[] {
  return (
    Array.isArray(value) &&
    value.every((c: unknown) => {
      if (typeof c !== 'object' || c === null) return false;
      const r = c as Record<string, unknown>;
      return isHttpsUrl(r.url) && SOURCES.includes(r.source as ImageSource) && KINDS.includes(r.kind as ImageKind);
    })
  );
}

/** Retail and digital: the only distributions Libretro's No-Intro map has many serials for. */
const BASE_DISTRIBUTIONS: readonly string[] = ['P', 'N'];

/**
 * Serials to ask Libretro about, best first. DLC (`M`), updates (`U`), demos
 * (`T`) and kiosk builds (`B`/`H`) are almost never keys of the map, so the
 * base game's retail then digital serial come first, like GameTDB, which only
 * uses the 4-character game code.
 */
export function libretroSerials(info: GameInfo): string[] {
  const serials: string[] = [];
  if (!BASE_DISTRIBUTIONS.includes(info.distribution)) {
    for (const d of BASE_DISTRIBUTIONS) serials.push(`${info.platform}-${d}-${info.gameCode}`);
  }
  if (!serials.includes(info.productCode)) serials.push(info.productCode);
  return serials;
}

async function libretroNames(run: Run, info: GameInfo): Promise<string[]> {
  const answers = await Promise.all(
    libretroSerials(info).map(async (serial) => {
      try {
        const names = await requestLibretroNamesResult(serial);
        if (Array.isArray(names)) return names;
      } catch {
        /* treated as a transport failure below */
      }
      run.transient = true;
      return [];
    }),
  );
  return [...new Set(answers.flat())];
}

/** First candidate whose probe succeeds, probing strictly one after another. */
async function firstHit(run: Run, candidates: readonly ImageCandidate[]): Promise<ImageCandidate | null> {
  for (const candidate of candidates) {
    if (await probeIn(run, candidate.url)) return candidate;
  }
  return null;
}

function gametdbCandidates(info: GameInfo, size: CoverSize): ImageCandidate[] {
  const regions = regionChain(info);
  return size === 'thumb' ? gametdbCoverCandidates(info, regions, 'thumb') : gametdbCoverCandidates(info, regions);
}

/** Cover from the artwork hosts only (the cacheable part of the chain). */
async function resolveArtwork(run: Run, info: GameInfo, size: CoverSize): Promise<CoverResult> {
  const gametdb = await firstHit(run, gametdbCandidates(info, size));
  if (gametdb) return { kind: 'image', url: gametdb.url, source: gametdb.source };
  if (!usesLibretro(info)) return PLACEHOLDER;

  const names = await libretroNames(run, info);
  const libretro = await firstHit(run, libretroCandidates(names, 'cover'));
  if (libretro) return { kind: 'image', url: libretro.url, source: libretro.source };

  return PLACEHOLDER;
}

function withHshopFallback(result: CoverResult, opts: ResolveOptions): CoverResult {
  if (result.kind === 'placeholder' && opts.hshopIconUrl) {
    return { kind: 'image', url: opts.hshopIconUrl, source: 'hshop' };
  }
  return result;
}

/**
 * A thumb that a cached full-size result already answers: the full chain is a
 * superset of the thumb chain, so a full placeholder means no thumb either,
 * and a Libretro or `cover` URL is the same image.
 */
async function thumbFromFull(info: GameInfo, now: () => number): Promise<CoverResult | null> {
  const full = await getCached<unknown>(coverKey(info, 'full'), now);
  if (!isCoverResult(full)) return null;
  if (full.kind === 'placeholder') return full;
  if (full.source === 'libretro') return full;
  if (full.source === 'gametdb' && gametdbCandidates(info, 'thumb').some((c) => c.url === full.url)) return full;
  return null;
}

export async function resolveCover(info: GameInfo, opts: ResolveOptions = {}): Promise<CoverResult> {
  try {
    const now = opts.now ?? Date.now;
    const size: CoverSize = opts.size === 'thumb' ? 'thumb' : 'full';
    const key = coverKey(info, size);
    const cached = await getCached<unknown>(key, now);
    if (isCoverResult(cached)) return withHshopFallback(cached, opts);

    if (size === 'thumb') {
      const reused = await thumbFromFull(info, now);
      if (reused) {
        await setCached(key, reused, now);
        return withHshopFallback(reused, opts);
      }
    }

    const run: Run = { transient: false };
    const result = await resolveArtwork(run, info, size);
    // A hit is always worth keeping; a miss only when every step really answered.
    if (result.kind === 'image' || !run.transient) await setCached(key, result, now);
    return withHshopFallback(result, opts);
  } catch {
    return withHshopFallback(PLACEHOLDER, opts);
  }
}

/**
 * Title screen and in-game snapshot from Libretro, at most one of each: for
 * every kind, the best-ranked name whose image exists. All probes go out at
 * once and the shared limiter keeps them to four in flight.
 */
export async function resolveGallery(info: GameInfo, opts: Pick<ResolveOptions, 'now'> = {}): Promise<ImageCandidate[]> {
  try {
    const now = opts.now ?? Date.now;
    if (!usesLibretro(info)) return [];
    const cached = await getCached<unknown>(galleryKey(info), now);
    if (isCandidateList(cached)) return cached;

    const run: Run = { transient: false };
    const names = await libretroNames(run, info);
    const perKind = await Promise.all(
      GALLERY_KINDS.map(async (kind) => {
        const candidates = libretroCandidates(names, kind);
        const hits = await Promise.all(candidates.map((c) => probeIn(run, c.url)));
        return candidates.find((_, i) => hits[i]) ?? null;
      }),
    );
    const gallery = perKind.filter((c): c is ImageCandidate => c !== null);
    if (!run.transient) await setCached(galleryKey(info), gallery, now);
    return gallery;
  } catch {
    return [];
  }
}
