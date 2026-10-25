import type { ImageSource } from '../lib/types';
import { externalLink, h } from './dom';

/** Third-party art hosts we credit. hShop's own images need no credit line. */
const CREDITED: ReadonlyArray<{ source: ImageSource; label: string; href: string }> = [
  { source: 'gametdb', label: 'GameTDB', href: 'https://www.gametdb.com' },
  { source: 'libretro', label: 'Libretro', href: 'https://www.libretro.com' },
];

/**
 * "Art: GameTDB · Libretro", listing only the sources actually shown.
 * Returns null when nothing needs crediting (placeholder or hShop art).
 */
export function createCredit(
  sources: Iterable<ImageSource>,
  tag: 'p' | 'figcaption' = 'p',
  doc: Document = document,
): HTMLElement | null {
  const used = new Set(sources);
  const entries = CREDITED.filter((c) => used.has(c.source));
  if (entries.length === 0) return null;
  const children: Array<Node | string> = ['Art: '];
  entries.forEach((entry, i) => {
    if (i > 0) children.push(' · ');
    children.push(externalLink(entry.href, entry.label, doc));
  });
  return h(tag, { class: 'cs-credit' }, children, doc);
}

/** Plain-text form of the credit, for `title` attributes. */
export function creditText(sources: Iterable<ImageSource>): string {
  const used = new Set(sources);
  const labels = CREDITED.filter((c) => used.has(c.source)).map((c) => c.label);
  return labels.length > 0 ? `Art: ${labels.join(' · ')}` : '';
}
