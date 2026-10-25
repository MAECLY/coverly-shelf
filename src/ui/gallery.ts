import type { ImageCandidate } from '../lib/types';
import { createCredit } from './credits';
import { h } from './dom';
import { openLightbox, type LightboxHandle } from './lightbox';

export interface GalleryImage extends ImageCandidate {
  /** What to put in `<img src>`; defaults to `url` (a data URL in background mode). */
  src?: string;
}

export interface GalleryOptions {
  title: string;
  images: readonly GalleryImage[];
  /** Where the lightbox overlay is appended; defaults to the gallery's own root node. */
  overlayContainer?: ShadowRoot | HTMLElement;
  doc?: Document;
  /**
   * Called once when every thumbnail has failed and the section removed itself,
   * so the caller can drop its host too and leave the page as it was.
   */
  onEmpty?: () => void;
}

/**
 * "Screenshots:" block styled like hShop's description entry: a responsive
 * grid of thumbnail buttons that open a lightbox. Returns null for an empty
 * list so callers inject nothing at all.
 */
export function createGallery({ title, images, overlayContainer, doc = document, onEmpty }: GalleryOptions): HTMLElement | null {
  if (images.length === 0) return null;

  const shots = images.map((image, i) => ({
    src: image.src ?? image.url,
    alt: `${title} — screenshot ${i + 1}`,
  }));
  /** Shots whose thumbnail has not failed; the lightbox only ever walks these. */
  const live = [...shots];
  let lightbox: LightboxHandle | null = null;

  const grid = h('ul', { class: 'cs-grid', role: 'list' }, [], doc);
  const section = h(
    'section',
    { class: 'cs-gallery', 'aria-label': `${title} screenshots` },
    [h('h3', { class: 'cs-heading' }, ['Screenshots:'], doc), grid],
    doc,
  );

  shots.forEach((shot, i) => {
    const img = h(
      'img',
      { class: 'cs-thumb-img', alt: shot.alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' },
      [],
      doc,
    );
    img.referrerPolicy = 'no-referrer';
    const button = h(
      'button',
      { type: 'button', class: 'cs-thumb', 'aria-haspopup': 'dialog', title: `Open screenshot ${i + 1}` },
      [img],
      doc,
    );
    const item = h('li', { class: 'cs-grid-item' }, [button], doc);
    // A thumbnail that fails to load disappears instead of showing a broken icon.
    img.addEventListener('error', () => {
      item.remove();
      const at = live.indexOf(shot);
      if (at !== -1) live.splice(at, 1);
      if (grid.childElementCount === 0) {
        lightbox?.close();
        section.remove();
        onEmpty?.();
      }
    }, { once: true });
    button.addEventListener('click', () => {
      const index = live.indexOf(shot);
      if (index === -1) return;
      lightbox?.close();
      const container = overlayContainer ?? (section.getRootNode() instanceof ShadowRoot ? (section.getRootNode() as ShadowRoot) : section);
      lightbox = openLightbox({
        container,
        images: live.slice(),
        index,
        label: `${title} screenshots`,
        opener: button,
        onClose: () => {
          lightbox = null;
        },
      });
    });
    img.src = shot.src;
    grid.append(item);
  });

  const credit = createCredit(new Set(images.map((i) => i.source)), 'p', doc);
  if (credit) section.append(credit);
  return section;
}
