/**
 * Small box-art thumbnail for hShop listing rows.
 *
 * Flat on purpose (no 3D box): it sits inside a `--clevel-1` frame like the
 * row's own meta chips, so it reads as one more hShop chip. The element lives
 * inside the row's `<a>`, so it holds no buttons or links and no listeners
 * that could stop the click from following the row.
 *
 * Decorative in every state: the thumbnail sits inside the row's link, whose
 * text (`.base-info > h3`) already names the game, so exposing the art as an
 * image named after the game would make screen readers say the name twice
 * (WCAG technique H2). The wrapper is `aria-hidden` and the art has `alt=""`.
 *
 * States, kept on `data-state`:
 * - `loading`: shimmer;
 * - `image`: the art; on load error it turns into the placeholder;
 * - `placeholder`: initials over hShop's tokens (reuses placeholder.ts).
 */
import type { CoverResult } from '../lib/types';
import { creditText } from './credits';
import { h } from './dom';
import { createPlaceholder } from './placeholder';

export interface ThumbOptions {
  /** Game title: the placeholder's initials (never announced; the row names the game). */
  title: string;
  /** null while the cover is still being resolved. */
  result: CoverResult | null;
  /** What to put in `<img src>` (a data URL in background mode). Defaults to `result.url`. */
  src?: string | null;
  doc?: Document;
}

export type ThumbState = 'loading' | 'image' | 'placeholder';

const TITLE_KEY = 'csTitle';

function showPlaceholder(el: HTMLElement, title: string, doc: Document): void {
  el.dataset.state = 'placeholder';
  el.removeAttribute('title');
  el.classList.remove('is-loaded');
  el.replaceChildren(createPlaceholder(title, doc, { decorative: true }));
}

function showImage(el: HTMLElement, title: string, url: string, tip: string, doc: Document): void {
  const img = h(
    'img',
    {
      class: 'cs-thumb-art',
      alt: '',
      decoding: 'async',
      referrerpolicy: 'no-referrer',
      draggable: 'false',
    },
    [],
    doc,
  );
  img.referrerPolicy = 'no-referrer';
  el.dataset.state = 'image';
  el.classList.remove('is-loaded');
  if (tip) el.setAttribute('title', tip);
  else el.removeAttribute('title');

  img.addEventListener('load', () => {
    if (img.naturalWidth > 0) el.classList.add('is-loaded');
  });
  img.addEventListener(
    'error',
    () => {
      // Only if this image is still the one shown (a later update may have replaced it).
      if (img.isConnected && img.parentNode === el) showPlaceholder(el, title, doc);
    },
    { once: true },
  );
  el.replaceChildren(img);
  // Set src last so the listeners are in place before the request starts.
  img.src = url;
}

/** Puts `result` into a thumbnail made by `createThumb`. Never leaves a broken image. */
export function updateThumb(el: HTMLElement, result: CoverResult, src?: string | null): void {
  const doc = el.ownerDocument;
  const title = el.dataset[TITLE_KEY] ?? '';
  const url = result.kind === 'image' ? (src ?? result.url) : null;
  if (result.kind !== 'image' || !url) {
    showPlaceholder(el, title, doc);
    return;
  }
  showImage(el, title, url, creditText([result.source]), doc);
}

/** A listing-row thumbnail: a skeleton when `result` is null, else the art or the placeholder. */
export function createThumb({ title, result, src, doc = document }: ThumbOptions): HTMLElement {
  const el = h('div', { class: 'cs-thumb', 'data-state': 'loading', 'aria-hidden': 'true' }, [], doc);
  el.dataset[TITLE_KEY] = title;
  if (result === null) {
    el.append(h('div', { class: 'cs-thumb-skeleton' }, [], doc));
    return el;
  }
  updateThumb(el, result, src);
  return el;
}
