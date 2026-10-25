import { h } from './dom';

export interface LightboxImage {
  src: string;
  alt: string;
}

export interface LightboxOptions {
  /** Where to append the overlay: the shadow root or a container inside it. */
  container: ShadowRoot | HTMLElement;
  images: readonly LightboxImage[];
  index: number;
  /** Accessible name of the dialog, e.g. "Batman screenshots". */
  label: string;
  /** Element that gets focus back when the dialog closes (the thumbnail). */
  opener?: HTMLElement | null;
  onClose?: () => void;
  /** Accessible name of the close button. Default "Close screenshots". */
  closeLabel?: string;
  /**
   * `shots` (default): native-resolution screenshots, upscaled with crisp pixels.
   * `art`: box art, scaled smoothly.
   */
  variant?: 'shots' | 'art';
}

export interface LightboxHandle {
  element: HTMLElement;
  close(): void;
  show(index: number): void;
  readonly index: number;
}

/** Keys we handle; they never reach hShop's own listeners. */
const HANDLED_KEYS = new Set(['Escape', 'ArrowLeft', 'ArrowRight', 'Tab']);

function activeIn(node: Node): Element | null {
  const root = node.getRootNode() as Document | ShadowRoot;
  return root.activeElement ?? null;
}

/**
 * Modal image viewer. It lives entirely inside our shadow root as a
 * `position: fixed` overlay, so hShop's `<body>` styles and scroll are never
 * touched. Esc closes, ←/→ wrap through the images, Tab is trapped, focus goes
 * back to the opener on close, and a click on the backdrop closes.
 */
export function openLightbox(opts: LightboxOptions): LightboxHandle {
  const { container, images, label, opener, onClose } = opts;
  const closeLabel = opts.closeLabel ?? 'Close screenshots';
  const variant = opts.variant === 'art' ? 'art' : 'shots';
  const doc = container.ownerDocument ?? document;
  const total = images.length;
  let index = Math.min(Math.max(0, opts.index), Math.max(0, total - 1));
  let closed = false;

  const img = h('img', { class: 'cs-lightbox-img', decoding: 'async', referrerpolicy: 'no-referrer' }, [], doc);
  img.referrerPolicy = 'no-referrer';
  const counter = h('p', { class: 'cs-lightbox-counter', 'aria-live': 'polite' }, [], doc);
  const closeBtn = h(
    'button',
    { type: 'button', class: 'cs-lightbox-btn cs-lightbox-close', 'aria-label': closeLabel },
    [h('span', { 'aria-hidden': 'true' }, ['×'], doc)],
    doc,
  );
  const prevBtn =
    total > 1
      ? h(
          'button',
          { type: 'button', class: 'cs-lightbox-btn cs-lightbox-prev', 'aria-label': 'Previous screenshot' },
          [h('span', { 'aria-hidden': 'true' }, ['‹'], doc)],
          doc,
        )
      : null;
  const nextBtn =
    total > 1
      ? h(
          'button',
          { type: 'button', class: 'cs-lightbox-btn cs-lightbox-next', 'aria-label': 'Next screenshot' },
          [h('span', { 'aria-hidden': 'true' }, ['›'], doc)],
          doc,
        )
      : null;

  const panel = h(
    'div',
    { class: 'cs-lightbox-panel' },
    [h('figure', { class: 'cs-lightbox-figure' }, [img, counter], doc), prevBtn, nextBtn, closeBtn],
    doc,
  );
  const overlay = h(
    'div',
    { class: variant === 'art' ? 'cs-lightbox is-art' : 'cs-lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' },
    [panel],
    doc,
  );

  function render(): void {
    const current = images[index];
    if (!current) return;
    img.src = current.src;
    img.alt = current.alt;
    counter.textContent = total > 1 ? `${index + 1} / ${total}` : '';
  }

  function show(next: number): void {
    if (total === 0) return;
    index = ((next % total) + total) % total;
    render();
  }

  function focusables(): HTMLElement[] {
    return [closeBtn, prevBtn, nextBtn].filter((b): b is HTMLButtonElement => b !== null && !b.disabled);
  }

  function close(): void {
    if (closed) return;
    closed = true;
    overlay.remove();
    try {
      opener?.focus({ preventScroll: true });
    } catch {
      /* opener may be gone */
    }
    onClose?.();
  }

  overlay.addEventListener('keydown', (event: KeyboardEvent) => {
    if (!HANDLED_KEYS.has(event.key)) return;
    event.stopPropagation();
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close();
        return;
      case 'ArrowLeft':
        event.preventDefault();
        show(index - 1);
        return;
      case 'ArrowRight':
        event.preventDefault();
        show(index + 1);
        return;
      case 'Tab': {
        const items = focusables();
        if (items.length === 0) {
          event.preventDefault();
          return;
        }
        const active = activeIn(overlay);
        const at = items.findIndex((el) => el === active);
        event.preventDefault();
        const step = event.shiftKey ? -1 : 1;
        const nextAt = at === -1 ? (event.shiftKey ? items.length - 1 : 0) : (at + step + items.length) % items.length;
        items[nextAt]?.focus();
        return;
      }
    }
  });

  overlay.addEventListener('click', (event) => {
    // Backdrop = the overlay itself or the empty panel area around the image.
    if (event.target === overlay || event.target === panel) close();
  });
  closeBtn.addEventListener('click', () => close());
  prevBtn?.addEventListener('click', () => show(index - 1));
  nextBtn?.addEventListener('click', () => show(index + 1));
  img.addEventListener('error', () => {
    img.removeAttribute('src');
    img.classList.add('is-broken');
  });
  img.addEventListener('load', () => {
    img.classList.remove('is-broken');
    // Box art is sized by its own aspect ratio (style.css), so no band shows around it.
    if (variant === 'art' && img.naturalWidth > 0 && img.naturalHeight > 0) {
      img.style.setProperty('--cs-art-ratio', String(img.naturalWidth / img.naturalHeight));
    }
  });

  render();
  container.append(overlay);
  closeBtn.focus({ preventScroll: true });

  return {
    element: overlay,
    close,
    show,
    get index() {
      return index;
    },
  };
}
