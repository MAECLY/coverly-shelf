import type { CoverResult } from '../lib/types';
import { creditText, createCredit } from './credits';
import { h } from './dom';
import { createPlaceholder } from './placeholder';

export interface CoverOptions {
  /** Game title: used for the image's alt text and the placeholder. */
  title: string;
  result: CoverResult;
  /**
   * What to put in `<img src>`. Defaults to `result.url`; the content script
   * passes a data URL here when images go through the background worker.
   */
  src?: string | null;
  doc?: Document;
}

/**
 * The 3D-box frame shared by the skeleton, the art and the placeholder:
 * `figure > .cs-stage > .cs-box > .cs-face`. The box tilt, spine and shadow
 * are pure CSS (see title.content/style.css).
 */
function frame(face: HTMLElement, doc: Document, extra: { busy?: boolean } = {}): {
  figure: HTMLElement;
  box: HTMLElement;
} {
  const box = h('div', { class: 'cs-box' }, [h('div', { class: 'cs-face' }, [face], doc)], doc);
  const figure = h(
    'figure',
    { class: 'cs-cover', 'aria-busy': extra.busy ? 'true' : null },
    [h('div', { class: 'cs-stage' }, [box], doc)],
    doc,
  );
  return { figure, box };
}

/** Loading state shown while the fallback chain runs. */
export function createCoverSkeleton(title: string, doc: Document = document): HTMLElement {
  const shimmer = h('div', { class: 'cs-skeleton', role: 'img', 'aria-label': `Loading box art for ${title}` }, [], doc);
  return frame(shimmer, doc, { busy: true }).figure;
}

/**
 * Box art (or the generated placeholder) in its 3D box. Never renders a
 * broken image: if the `<img>` fails, the face swaps to the placeholder and
 * the credit line is dropped.
 */
export function createCover({ title, result, src, doc = document }: CoverOptions): HTMLElement {
  if (result.kind === 'placeholder') {
    const { figure } = frame(createPlaceholder(title, doc), doc);
    figure.classList.add('is-placeholder');
    return figure;
  }

  const img = h(
    'img',
    {
      class: 'cs-art',
      alt: title,
      loading: 'lazy',
      decoding: 'async',
      referrerpolicy: 'no-referrer',
      draggable: 'false',
    },
    [],
    doc,
  );
  img.referrerPolicy = 'no-referrer';
  const { figure, box } = frame(img, doc);
  const credit = createCredit([result.source], 'figcaption', doc);
  if (credit) figure.append(credit);
  const tip = creditText([result.source]);
  if (tip) figure.setAttribute('title', tip);

  img.addEventListener('load', () => {
    if (img.naturalWidth > 0) figure.classList.add('is-loaded');
  });
  img.addEventListener(
    'error',
    () => {
      const face = box.querySelector('.cs-face');
      face?.replaceChildren(createPlaceholder(title, doc));
      figure.classList.add('is-placeholder');
      figure.classList.remove('is-loaded');
      figure.removeAttribute('title');
      credit?.remove();
    },
    { once: true },
  );
  // Set src last so the listeners are in place before the request starts.
  img.src = src ?? result.url;
  return figure;
}
