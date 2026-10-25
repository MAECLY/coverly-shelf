import { h } from './dom';

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'de', 'la', 'le', 'el', 'der', 'die', 'das']);

/**
 * Up to two initials for a game title: the first letter or digit of the first
 * two significant words. "Batman - Arkham Origins Blackgate" → "BA",
 * "3D Classics Excitebike" → "3C", "The Legend of Zelda" → "LZ".
 * Falls back to "?" when the title has no letters or digits at all.
 */
export function getInitials(title: string): string {
  const words = title
    .normalize('NFC')
    .split(/[\s\-–—:_/·.,!?'"()[\]]+/u)
    .map((w) => w.trim())
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  const significant = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  const pool = significant.length > 0 ? significant : words;
  const letters = pool
    .slice(0, 2)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
    .join('');
  return letters.length > 0 ? letters.toLocaleUpperCase() : '?';
}

export interface PlaceholderOptions {
  /**
   * True when something next to it already names the game (a listing row's
   * link text): the placeholder is then decorative and gets no role or label.
   */
  decorative?: boolean;
}

/**
 * Generated stand-in cover: initials over a gradient made from hShop's own
 * tokens. Pure DOM, exposed to assistive tech as one image named after the
 * game unless `decorative`.
 */
export function createPlaceholder(
  title: string,
  doc: Document = document,
  { decorative = false }: PlaceholderOptions = {},
): HTMLElement {
  return h(
    'div',
    decorative
      ? { class: 'cs-placeholder', 'aria-hidden': 'true' }
      : { class: 'cs-placeholder', role: 'img', 'aria-label': title },
    [
      h('span', { class: 'cs-placeholder-initials', 'aria-hidden': 'true' }, [getInitials(title)], doc),
      h('span', { class: 'cs-placeholder-title', 'aria-hidden': 'true' }, [title], doc),
    ],
    doc,
  );
}
