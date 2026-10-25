import { afterEach, describe, expect, it } from 'vitest';
import { createCover, createCoverSkeleton, zoomLabel } from '../src/ui/cover';
import { createCredit } from '../src/ui/credits';
import { createGallery } from '../src/ui/gallery';
import { openLightbox } from '../src/ui/lightbox';
import { createPlaceholder, getInitials } from '../src/ui/placeholder';

function key(target: Element, k: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function shadowHost(): ShadowRoot {
  const host = document.createElement('coverly-test');
  document.body.append(host);
  return host.attachShadow({ mode: 'open' });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('placeholder', () => {
  it('takes the first letter of the first two significant words', () => {
    expect(getInitials('Batman - Arkham Origins Blackgate')).toBe('BA');
    expect(getInitials('3D Classics Excitebike')).toBe('3C');
    expect(getInitials('The Legend of Zelda: A Link Between Worlds')).toBe('LZ');
    expect(getInitials('pokémon')).toBe('P');
    expect(getInitials('ÉTRIAN odyssey')).toBe('ÉO');
  });

  it('falls back to "?" when there is nothing to abbreviate', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials(' - : ')).toBe('?');
  });

  it('is a single labelled image with no <img>', () => {
    const el = createPlaceholder('Batman - Arkham Origins Blackgate');
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('Batman - Arkham Origins Blackgate');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('BA');
  });

  it('keeps markup in titles as text', () => {
    const el = createPlaceholder('<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
  });
});

describe('cover', () => {
  it('renders a busy skeleton', () => {
    const el = createCoverSkeleton('Excitebike');
    expect(el.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('.cs-box')).not.toBeNull();
  });

  it('renders the art with safe attributes and a credit', () => {
    const el = createCover({
      title: 'Excitebike',
      result: { kind: 'image', url: 'https://art.gametdb.com/3ds/coverHQ/US/SAEE.jpg', source: 'gametdb' },
    });
    const img = el.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('Excitebike');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img?.getAttribute('loading')).toBe('lazy');
    const link = el.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://www.gametdb.com');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(el.textContent).not.toContain('Libretro');
  });

  it('falls back to the placeholder when the image errors', () => {
    const el = createCover({
      title: 'Excitebike',
      result: { kind: 'image', url: 'https://art.gametdb.com/3ds/coverHQ/US/NOPE.jpg', source: 'gametdb' },
    });
    el.querySelector('img')?.dispatchEvent(new Event('error'));
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Excitebike');
    expect(el.querySelector('.cs-credit')).toBeNull();
  });

  it('shows no credit for the placeholder outcome', () => {
    const el = createCover({ title: 'Excitebike', result: { kind: 'placeholder' } });
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.cs-credit')).toBeNull();
  });
});

describe('cover zoom', () => {
  const art = { kind: 'image', url: 'https://art.gametdb.com/3ds/coverHQ/US/AZEE.jpg', source: 'gametdb' } as const;

  function zoomable(extra: { src?: string } = {}) {
    const root = shadowHost();
    const el = createCover({ title: 'Batman', result: art, zoom: { container: root, ...extra } });
    root.append(el);
    const stage = el.querySelector<HTMLElement>('.cs-stage')!;
    return { root, el, stage };
  }

  it('makes the box a labelled, focusable button', () => {
    const { stage } = zoomable();
    expect(stage.getAttribute('role')).toBe('button');
    expect(stage.getAttribute('tabindex')).toBe('0');
    expect(stage.getAttribute('aria-label')).toBe(zoomLabel('Batman'));
    expect(stage.getAttribute('aria-haspopup')).toBe('dialog');
    expect(stage.classList.contains('is-zoomable')).toBe(true);
  });

  it('opens the full-size art in the lightbox on click', () => {
    const { root, stage } = zoomable();
    stage.click();
    const dialog = root.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.classList.contains('is-art')).toBe(true);
    expect(dialog.getAttribute('aria-label')).toBe('Batman box art');
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe(art.url);
    expect(dialog.querySelector('.cs-lightbox-close')?.getAttribute('aria-label')).toBe('Close box art');
    expect(dialog.querySelectorAll('.cs-lightbox-prev, .cs-lightbox-next')).toHaveLength(0);
    // A second click while open does not stack another dialog.
    stage.click();
    expect(root.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  it('prefers the given full-size src over the shown one', () => {
    const { root, stage } = zoomable({ src: 'https://art.gametdb.com/3ds/coverHQ/EN/AXXP.jpg' });
    stage.click();
    expect(root.querySelector('[role="dialog"] img')?.getAttribute('src')).toBe('https://art.gametdb.com/3ds/coverHQ/EN/AXXP.jpg');
  });

  it('sizes the zoomed art by its own aspect ratio once it loads (no letterbox bands)', () => {
    const { root, stage } = zoomable();
    stage.click();
    const img = root.querySelector<HTMLImageElement>('[role="dialog"] img')!;
    Object.defineProperty(img, 'naturalWidth', { value: 768, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 680, configurable: true });
    img.dispatchEvent(new Event('load'));
    expect(Number(img.style.getPropertyValue('--cs-art-ratio'))).toBeCloseTo(768 / 680, 5);

    // Screenshots keep their fixed-height, contain-fit layout.
    const shots = openLightbox({ container: shadowHost(), images: [{ src: 'https://x/1.png', alt: 'shot' }], index: 0, label: 'Shots' });
    const shot = shots.element.querySelector<HTMLImageElement>('img')!;
    Object.defineProperty(shot, 'naturalWidth', { value: 400, configurable: true });
    Object.defineProperty(shot, 'naturalHeight', { value: 240, configurable: true });
    shot.dispatchEvent(new Event('load'));
    expect(shot.style.getPropertyValue('--cs-art-ratio')).toBe('');
    shots.close();
  });

  it('opens on Enter and Space, keeps those keys from the page, and ignores other keys', () => {
    for (const k of ['Enter', ' ']) {
      const { root, stage } = zoomable();
      let leaked = false;
      const listener = () => (leaked = true);
      document.addEventListener('keydown', listener);
      const ev = key(stage, k);
      document.removeEventListener('keydown', listener);
      expect(ev.defaultPrevented).toBe(true);
      expect(leaked).toBe(false);
      expect(root.querySelector('[role="dialog"]')).not.toBeNull();
      document.body.replaceChildren();
    }
    const { root, stage } = zoomable();
    const ev = key(stage, 'a');
    expect(ev.defaultPrevented).toBe(false);
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('traps focus in the dialog, closes on Esc and gives focus back to the box', () => {
    const { root, stage } = zoomable();
    stage.focus();
    key(stage, 'Enter');
    const dialog = root.querySelector<HTMLElement>('[role="dialog"]')!;
    const close = dialog.querySelector('.cs-lightbox-close');
    expect(root.activeElement).toBe(close);
    for (let i = 0; i < 3; i++) {
      expect(key(root.activeElement!, 'Tab').defaultPrevented).toBe(true);
      expect(root.activeElement).toBe(close);
    }
    key(dialog, 'Escape');
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(root.activeElement).toBe(stage);
  });

  it('never makes the placeholder zoomable', () => {
    const root = shadowHost();
    const el = createCover({ title: 'Batman', result: { kind: 'placeholder' }, zoom: { container: root } });
    root.append(el);
    const stage = el.querySelector<HTMLElement>('.cs-stage')!;
    expect(stage.hasAttribute('role')).toBe(false);
    expect(stage.hasAttribute('tabindex')).toBe(false);
    stage.click();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('drops the affordance (and an open viewer) when the art fails to load', () => {
    const { root, el, stage } = zoomable();
    stage.click();
    el.querySelector('img.cs-art')!.dispatchEvent(new Event('error'));
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(stage.hasAttribute('role')).toBe(false);
    expect(stage.hasAttribute('tabindex')).toBe(false);
    expect(stage.classList.contains('is-zoomable')).toBe(false);
    stage.click();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('is off without the zoom option', () => {
    const el = createCover({ title: 'Batman', result: art });
    expect(el.querySelector('.cs-stage')?.hasAttribute('role')).toBe(false);
  });
});

describe('credits', () => {
  it('lists only the sources used', () => {
    expect(createCredit(['hshop'])).toBeNull();
    expect(createCredit(['libretro'])?.textContent).toBe('Art: Libretro');
    expect(createCredit(['libretro', 'gametdb'])?.textContent).toBe('Art: GameTDB · Libretro');
  });
});

describe('gallery', () => {
  it('injects nothing when there are no screenshots', () => {
    expect(createGallery({ title: 'Excitebike', images: [] })).toBeNull();
  });

  it('builds one button per screenshot with numbered alt text', () => {
    const el = createGallery({
      title: 'Excitebike',
      images: [
        { url: 'https://thumbnails.libretro.com/a.png', source: 'libretro', kind: 'title' },
        { url: 'https://thumbnails.libretro.com/b.png', source: 'libretro', kind: 'snap' },
      ],
    });
    expect(el).not.toBeNull();
    const buttons = el!.querySelectorAll('button.cs-thumb');
    expect(buttons).toHaveLength(2);
    expect(el!.querySelectorAll('img')[1]?.getAttribute('alt')).toBe('Excitebike — screenshot 2');
    expect(el!.querySelector('h3')?.textContent).toBe('Screenshots:');
    expect(el!.querySelector('.cs-credit')?.textContent).toBe('Art: Libretro');
  });

  it('opens the lightbox from a thumbnail inside a shadow root', () => {
    const root = shadowHost();
    const el = createGallery({
      title: 'Excitebike',
      images: [{ url: 'https://thumbnails.libretro.com/a.png', source: 'libretro', kind: 'snap' }],
    })!;
    root.append(el);
    (el.querySelector('button.cs-thumb') as HTMLButtonElement).click();
    const dialog = root.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
  });

  const three = [
    { url: 'https://thumbnails.libretro.com/a.png', source: 'libretro', kind: 'title' },
    { url: 'https://thumbnails.libretro.com/b.png', source: 'libretro', kind: 'snap' },
    { url: 'https://thumbnails.libretro.com/c.png', source: 'libretro', kind: 'snap' },
  ] as const;

  it('leaves failed thumbnails out of the lightbox and its counter', () => {
    const root = shadowHost();
    const el = createGallery({ title: 'Excitebike', images: three })!;
    root.append(el);
    el.querySelectorAll('img')[1]!.dispatchEvent(new Event('error'));
    const buttons = el.querySelectorAll<HTMLButtonElement>('button.cs-thumb');
    expect(buttons).toHaveLength(2);
    buttons[1]!.click();
    const dialog = root.querySelector<HTMLElement>('[role="dialog"]')!;
    const img = () => dialog.querySelector('.cs-lightbox-img')!;
    expect(img().getAttribute('alt')).toBe('Excitebike — screenshot 3');
    expect(dialog.querySelector('.cs-lightbox-counter')?.textContent).toBe('2 / 2');
    key(dialog, 'ArrowRight');
    expect(img().getAttribute('alt')).toBe('Excitebike — screenshot 1');
    key(dialog, 'ArrowRight');
    expect(img().getAttribute('alt')).toBe('Excitebike — screenshot 3');
  });

  it('removes itself and calls onEmpty once every thumbnail failed', () => {
    let empty = 0;
    const root = shadowHost();
    const el = createGallery({ title: 'Excitebike', images: three, onEmpty: () => empty++ })!;
    root.append(el);
    const imgs = el.querySelectorAll('img');
    imgs[0]!.dispatchEvent(new Event('error'));
    imgs[1]!.dispatchEvent(new Event('error'));
    expect(empty).toBe(0);
    imgs[2]!.dispatchEvent(new Event('error'));
    expect(empty).toBe(1);
    expect(el.isConnected).toBe(false);
  });
});

describe('lightbox', () => {
  const images = [
    { src: 'https://thumbnails.libretro.com/1.png', alt: 'shot 1' },
    { src: 'https://thumbnails.libretro.com/2.png', alt: 'shot 2' },
    { src: 'https://thumbnails.libretro.com/3.png', alt: 'shot 3' },
  ];

  function setup() {
    const root = shadowHost();
    const opener = document.createElement('button');
    root.append(opener);
    opener.focus();
    const lb = openLightbox({ container: root, images, index: 0, label: 'Excitebike screenshots', opener });
    return { root, opener, lb };
  }

  it('is a labelled modal dialog with a labelled close button', () => {
    const { lb } = setup();
    expect(lb.element.getAttribute('role')).toBe('dialog');
    expect(lb.element.getAttribute('aria-modal')).toBe('true');
    expect(lb.element.getAttribute('aria-label')).toBe('Excitebike screenshots');
    expect(lb.element.querySelector('.cs-lightbox-close')?.getAttribute('aria-label')).toBeTruthy();
  });

  it('wraps with the arrow keys', () => {
    const { lb } = setup();
    const img = () => lb.element.querySelector('img')!;
    key(lb.element, 'ArrowLeft');
    expect(lb.index).toBe(2);
    expect(img().getAttribute('alt')).toBe('shot 3');
    key(lb.element, 'ArrowRight');
    expect(lb.index).toBe(0);
    key(lb.element, 'ArrowRight');
    expect(img().getAttribute('alt')).toBe('shot 2');
  });

  it('traps focus with Tab and Shift+Tab', () => {
    const { root, lb } = setup();
    const buttons = Array.from(lb.element.querySelectorAll('button'));
    const close = lb.element.querySelector('.cs-lightbox-close');
    expect(root.activeElement).toBe(close);
    const seen = new Set<Element | null>();
    for (let i = 0; i < buttons.length * 2; i++) {
      const ev = key(root.activeElement ?? lb.element, 'Tab');
      expect(ev.defaultPrevented).toBe(true);
      seen.add(root.activeElement);
      expect(lb.element.contains(root.activeElement)).toBe(true);
    }
    expect(seen.size).toBe(buttons.length);
    key(root.activeElement!, 'Tab', true);
    expect(lb.element.contains(root.activeElement)).toBe(true);
  });

  it('closes on Esc and restores focus to the opener', () => {
    const { root, opener, lb } = setup();
    key(lb.element, 'Escape');
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(root.activeElement).toBe(opener);
  });

  it('closes on a backdrop click but not on an image click', () => {
    const { root, lb } = setup();
    lb.element.querySelector('img')!.click();
    expect(root.querySelector('[role="dialog"]')).not.toBeNull();
    lb.element.click();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps the handled keys away from the page', () => {
    const { lb } = setup();
    let leaked = false;
    document.addEventListener('keydown', () => (leaked = true));
    key(lb.element, 'ArrowRight');
    expect(leaked).toBe(false);
  });
});
