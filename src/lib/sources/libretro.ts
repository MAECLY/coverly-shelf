/**
 * Libretro thumbnail URLs (pure, no network).
 * Pattern: `{LIBRETRO.root}/{system}/{Named_Boxarts|Named_Snaps|Named_Titles}/{name}.png`.
 * 3DS names live under `Nintendo - Nintendo 3DS` (`LIBRETRO.base`); Virtual
 * Console names under their original system (`LIBRETRO_VC_SYSTEMS`).
 */
import { LIBRETRO, LIBRETRO_VC_SYSTEMS, type LibretroVcSystem } from '../config';
import type { ImageCandidate, ImageKind } from '../types';

/** Libretro replaces the characters in `LIBRETRO.unsafeChars` with `_` in thumbnail file names. */
export function libretroFileName(noIntroName: string): string {
  return noIntroName.replace(LIBRETRO.unsafeChars, '_');
}

export function isLibretroVcSystem(value: unknown): value is LibretroVcSystem {
  return typeof value === 'string' && (LIBRETRO_VC_SYSTEMS as readonly string[]).includes(value);
}

/** Thumbnail folder of a system: the 3DS one by default. */
function systemBase(system?: LibretroVcSystem): string {
  return system ? `${LIBRETRO.root}/${encodeURIComponent(system)}` : LIBRETRO.base;
}

export function libretroUrl(kind: ImageKind, noIntroName: string, system?: LibretroVcSystem): string {
  const file = encodeURIComponent(libretroFileName(noIntroName));
  return `${systemBase(system)}/${LIBRETRO.folders[kind]}/${file}.png`;
}

export function libretroCandidates(
  names: readonly string[],
  kind: ImageKind,
  system?: LibretroVcSystem,
): ImageCandidate[] {
  const seen = new Set<string>();
  const out: ImageCandidate[] = [];
  for (const name of names) {
    const url = libretroUrl(kind, name, system);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, source: 'libretro', kind });
  }
  return out;
}
