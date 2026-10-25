/**
 * Libretro thumbnail URLs (pure, no network).
 * Pattern: `{LIBRETRO.base}/{Named_Boxarts|Named_Snaps|Named_Titles}/{name}.png`.
 */
import { LIBRETRO } from '../config';
import type { ImageCandidate, ImageKind } from '../types';

/** Libretro replaces the characters in `LIBRETRO.unsafeChars` with `_` in thumbnail file names. */
export function libretroFileName(noIntroName: string): string {
  return noIntroName.replace(LIBRETRO.unsafeChars, '_');
}

export function libretroUrl(kind: ImageKind, noIntroName: string): string {
  const file = encodeURIComponent(libretroFileName(noIntroName));
  return `${LIBRETRO.base}/${LIBRETRO.folders[kind]}/${file}.png`;
}

export function libretroCandidates(names: readonly string[], kind: ImageKind): ImageCandidate[] {
  const seen = new Set<string>();
  const out: ImageCandidate[] = [];
  for (const name of names) {
    const url = libretroUrl(kind, name);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, source: 'libretro', kind });
  }
  return out;
}
