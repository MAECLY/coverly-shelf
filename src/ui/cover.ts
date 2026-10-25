import type { CoverResult } from '../lib/types';
import { creditText, createCredit } from './credits';
import { h } from './dom';
import { openLightbox, type LightboxHandle } from './lightbox';
import { createPlaceholder } from './placeholder';

/** Opening the box art full size in the lightbox (title pages). */
export interface CoverZoom {
  /** Where the lightbox overlay is appended: the cover's own shadow root. */
  container: ShadowRoot | HTMLElement;
  /** Full-size art for the viewer. Defaults to what the box shows. */
  src?: string | null;
}

export interface CoverOptions {
  /** Game title: used for the image's alt text and the placeholder. */
  title: string;
  result: CoverResult;
  /**
   * What to put in `<img src>`. Defaults to `result.url`; the content script
   * passes a data URL here when images go through the background worker.
   */
  src?: string | null;
  /**
   * When set, the box becomes a button that opens the art full size. Never
   * applied to the placeholder, and removed again if the art fails to load.
   */
  zoom?: CoverZoom | null;
  doc?: Document;
}

/** Accessible name of the zoomable box. Content-script strings are English, like the rest of the page UI. */
export const zoomLabel = (title: string): string => `View box art for ${title} full size`;

/**
 * Turns the cover's `.cs-stage` into a button (role, tabindex, label) that
 * opens `src` in the lightbox on click, Enter or Space. Only the stage listens,
 * so clicks anywhere else on the page are never intercepted. Returns a
 * function that removes the affordance and closes an open viewer.
 */
function enableZoom(stage: HTMLElement, title: string, src: string, zoom: CoverZoom): () => void {
  let lightbox: LightboxHandle | null = null;
  const open = (): void => {
    if (lightbox) return;
    lightbox = openLightbox({
      container: zoom.container,
      images: [{ src, alt: `${title} box art` }],
      index: 0,
      label: `${title} box art`,
      closeLabel: 'Close box art',
      variant: 'art',
      opener: stage,
      onClose: () => {
        lightbox = null;
      },
    });
  };
  const onClick = (event: MouseEvent): void => {
    event.preventDefault();
    open();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    // Space would scroll the page; neither key may reach hShop's own listeners.
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) open();
  };
  const attrs: Record<string, string> = {
    role: 'button',
    tabindex: '0',
    'aria-label': zoomLabel(title),
    'aria-haspopup': 'dialog',
  };
  for (const [name, value] of Object.entries(attrs)) stage.setAttribute(name, value);
  stage.classList.add('is-zoomable');
  stage.addEventListener('click', onClick);
  stage.addEventListener('keydown', onKey);
  return () => {
    stage.removeEventListener('click', onClick);
    stage.removeEventListener('keydown', onKey);
    for (const name of Object.keys(attrs)) stage.removeAttribute(name);
    stage.classList.remove('is-zoomable');
    lightbox?.close();
  };
}

/**
 * The 3D-box frame shared by the skeleton, the art and the placeholder:
 * `figure > .cs-stage > .cs-box > .cs-face`. The box tilt, spine and shadow
 * are pure CSS (see title.content/style.css).
 */
function frame(face: HTMLElement, doc: Document, extra: { busy?: boolean } = {}): {
  figure: HTMLElement;
  stage: HTMLElement;
  box: HTMLElement;
} {
  const box = h('div', { class: 'cs-box' }, [h('div', { class: 'cs-face' }, [face], doc)], doc);
  const stage = h('div', { class: 'cs-stage' }, [box], doc);
  const figure = h('figure', { class: 'cs-cover', 'aria-busy': extra.busy ? 'true' : null }, [stage], doc);
  return { figure, stage, box };
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
export function createCover({ title, result, src, zoom, doc = document }: CoverOptions): HTMLElement {
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
  const { figure, stage, box } = frame(img, doc);
  const shown = src ?? result.url;
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
      disableZoom?.();
    },
    { once: true },
  );
  // The placeholder never zooms: the affordance exists only while real art is shown.
  const disableZoom = zoom ? enableZoom(stage, title, zoom.src || shown, zoom) : null;
  // Set src last so the listeners are in place before the request starts.
  img.src = shown;
  return figure;
}
