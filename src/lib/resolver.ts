/**
 * Picks the artwork to show for a game. DOM-free: every network check goes
 * through `probeImage`, every result is cached per game code (misses too, so
 * 404s are not repeated for a week), and nothing here ever rejects.
 *
 * Cover chain: GameTDB (game region, then EN/US) → Libretro Named_Boxarts →
 * hShop's own icon → placeholder.
 */
import { getCached, setCached } from './cache';
import { regionChain } from './extract';
import { requestLibretroNames } from './messages';
import { probeImage } from './probe';
import { gametdbCoverCandidates } from './sources/gametdb';
import { libretroCandidates } from './sources/libretro';
import type { CoverResult, GameInfo, ImageCandidate, ImageKind, ImageSource } from './types';

export interface ResolveOptions {
  /** hShop's own icon for the title, used when no box art exists. Not cached: it lives on the page. */
  hshopIconUrl?: string | null;
  now?: () => number;
}

const PLACEHOLDER: CoverResult = { kind: 'placeholder' };
const GALLERY_KINDS: readonly ImageKind[] = ['title', 'snap'];
const SOURCES: readonly ImageSource[] = ['gametdb', 'libretro', 'hshop'];
const KINDS: readonly ImageKind[] = ['cover', 'snap', 'title'];

/** One probe per URL per page, whoever asks for it. */
const probeMemo = new Map<string, Promise<boolean>>();

function probeOnce(url: string): Promise<boolean> {
  let pending = probeMemo.get(url);
  if (!pending) {
    pending = probeImage(url).then(
      (ok) => ok === true,
      () => false,
    );
    probeMemo.set(url, pending);
  }
  return pending;
}

/** Test hook: forget every probe made so far. */
export function resetProbeMemo(): void {
  probeMemo.clear();
}

const coverKey = (info: GameInfo): string => `local:cover:${info.gameCode}`;
const galleryKey = (info: GameInfo): string => `local:gallery:${info.gameCode}`;

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

async function libretroNames(info: GameInfo): Promise<string[]> {
  try {
    const names = await requestLibretroNames(info.productCode);
    return Array.isArray(names) ? names : [];
  } catch {
    return [];
  }
}

/** First candidate whose probe succeeds, probing strictly one after another. */
async function firstHit(candidates: readonly ImageCandidate[]): Promise<ImageCandidate | null> {
  for (const candidate of candidates) {
    if (await probeOnce(candidate.url)) return candidate;
  }
  return null;
}

/** Cover from the artwork hosts only (the cacheable part of the chain). */
async function resolveArtwork(info: GameInfo): Promise<CoverResult> {
  const gametdb = await firstHit(gametdbCoverCandidates(info, regionChain(info)));
  if (gametdb) return { kind: 'image', url: gametdb.url, source: gametdb.source };

  const names = await libretroNames(info);
  const libretro = await firstHit(libretroCandidates(names, 'cover'));
  if (libretro) return { kind: 'image', url: libretro.url, source: libretro.source };

  return PLACEHOLDER;
}

function withHshopFallback(result: CoverResult, opts: ResolveOptions): CoverResult {
  if (result.kind === 'placeholder' && opts.hshopIconUrl) {
    return { kind: 'image', url: opts.hshopIconUrl, source: 'hshop' };
  }
  return result;
}

export async function resolveCover(info: GameInfo, opts: ResolveOptions = {}): Promise<CoverResult> {
  try {
    const now = opts.now ?? Date.now;
    const cached = await getCached<unknown>(coverKey(info), now);
    if (isCoverResult(cached)) return withHshopFallback(cached, opts);

    const result = await resolveArtwork(info);
    await setCached(coverKey(info), result, now);
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
    const cached = await getCached<unknown>(galleryKey(info), now);
    if (isCandidateList(cached)) return cached;

    const names = await libretroNames(info);
    const perKind = await Promise.all(
      GALLERY_KINDS.map(async (kind) => {
        const candidates = libretroCandidates(names, kind);
        const hits = await Promise.all(candidates.map((c) => probeOnce(c.url)));
        return candidates.find((_, i) => hits[i]) ?? null;
      }),
    );
    const gallery = perKind.filter((c): c is ImageCandidate => c !== null);
    await setCached(galleryKey(info), gallery, now);
    return gallery;
  } catch {
    return [];
  }
}
