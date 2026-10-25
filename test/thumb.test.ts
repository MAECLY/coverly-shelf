import { afterEach, describe, expect, it } from 'vitest';
import { LAYOUT_CSS, injectLayoutStyle, LAYOUT_STYLE_ATTR, THUMB_HOST } from '../src/entrypoints/list.content/layout';
import { ENHANCED_ATTR } from '../src/lib/selectors';
import { createThumb, updateThumb } from '../src/ui/thumb';

const ART = 'https://art.gametdb.com/3ds/cover/US/AZEE.jpg';

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('createThumb', () => {
  it('starts as a skeleton that assistive tech skips', () => {
    const el = createThumb({ title: 'Kid Icarus: Uprising', result: null });
    expect(el.dataset.state).toBe('loading');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.cs-thumb-skeleton')).not.toBeNull();
    expect(el.querySelector('img')).toBeNull();
  });

  it('renders decorative art (the row link already names the game), no referrer and a credit tooltip', () => {
    const el = createThumb({ title: 'Kid Icarus: Uprising', result: { kind: 'image', url: ART, source: 'gametdb' } });
    const img = el.querySelector('img');
    expect(el.dataset.state).toBe('image');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img?.getAttribute('src')).toBe(ART);
    expect(el.getAttribute('title')).toBe('Art: GameTDB');
  });

  it('prefers an explicit src (background mode data URL)', () => {
    const el = createThumb({
      title: 'X',
      result: { kind: 'image', url: ART, source: 'gametdb' },
      src: 'data:image/jpeg;base64,AAAA',
    });
    expect(el.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
  });

  it('renders the initials placeholder and no image for a placeholder result', () => {
    const el = createThumb({ title: 'Kid Icarus: Uprising', result: { kind: 'placeholder' } });
    expect(el.dataset.state).toBe('placeholder');
    expect(el.querySelector('img')).toBeNull();
    // Decorative: no image role or label, and the whole thumbnail is hidden.
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('[role="img"], [aria-label]')).toBeNull();
    expect(el.textContent).toContain('KI');
  });

  it('keeps markup in titles as text', () => {
    const el = createThumb({ title: '<img src=x onerror=alert(1)>', result: { kind: 'placeholder' } });
    expect(el.querySelector('img')).toBeNull();
  });

  it('adds nothing to the row link\'s accessible name in any state', () => {
    for (const result of [null, { kind: 'image', url: ART, source: 'gametdb' }, { kind: 'placeholder' }] as const) {
      const el = createThumb({ title: 'Mario Kart 7', result });
      expect(el.getAttribute('aria-hidden')).toBe('true');
      expect(el.querySelector('[role], [aria-label], img:not([alt=""])')).toBeNull();
    }
  });

  it('contains nothing interactive, so clicks follow the row link', () => {
    const el = createThumb({ title: 'X', result: { kind: 'image', url: ART, source: 'gametdb' } });
    expect(el.querySelector('a, button, input, [tabindex]')).toBeNull();
    const row = document.createElement('a');
    row.href = '/t/1';
    row.append(el);
    document.body.append(row);
    let reached = false;
    row.addEventListener('click', (e) => {
      reached = true;
      e.preventDefault();
    });
    el.querySelector('img')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(reached).toBe(true);
  });
});

describe('updateThumb', () => {
  it('swaps the skeleton for the art', () => {
    const el = createThumb({ title: 'Kid Icarus: Uprising', result: null });
    updateThumb(el, { kind: 'image', url: ART, source: 'gametdb' });
    expect(el.querySelector('.cs-thumb-skeleton')).toBeNull();
    expect(el.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('never leaves a broken image: an error turns it into the placeholder', () => {
    const el = createThumb({ title: 'Kid Icarus: Uprising', result: null });
    document.body.append(el);
    updateThumb(el, { kind: 'image', url: ART, source: 'gametdb' });
    el.querySelector('img')?.dispatchEvent(new Event('error'));
    expect(el.dataset.state).toBe('placeholder');
    expect(el.querySelector('img')).toBeNull();
    expect(el.hasAttribute('title')).toBe(false);
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('[role="img"]')).toBeNull();
  });

  it('ignores a late error from an image that was already replaced', () => {
    const el = createThumb({ title: 'A', result: null });
    document.body.append(el);
    updateThumb(el, { kind: 'image', url: ART, source: 'gametdb' });
    const first = el.querySelector('img');
    updateThumb(el, { kind: 'image', url: 'https://thumbnails.libretro.com/a.png', source: 'libretro' });
    first?.dispatchEvent(new Event('error'));
    expect(el.dataset.state).toBe('image');
    expect(el.getAttribute('title')).toBe('Art: Libretro');
  });

  it('marks the art loaded only when it has pixels', () => {
    const el = createThumb({ title: 'A', result: { kind: 'image', url: ART, source: 'gametdb' } });
    const img = el.querySelector('img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { value: 160 });
    img.dispatchEvent(new Event('load'));
    expect(el.classList.contains('is-loaded')).toBe(true);
  });

  it('shows hShop art with no credit', () => {
    const el = createThumb({ title: 'A', result: null });
    updateThumb(el, { kind: 'image', url: 'https://hshop.erista.me/x.png', source: 'hshop' });
    expect(el.hasAttribute('title')).toBe(false);
  });
});

describe('list layout style', () => {
  it('only targets rows that hold our host, never an hShop class', () => {
    expect(LAYOUT_CSS).toContain(`[${ENHANCED_ATTR}]:has(> ${THUMB_HOST})`);
    expect(LAYOUT_CSS).not.toMatch(/\.(list-entry|base-info|meta)\b/);
  });

  it('is injected once and removed by the returned function', () => {
    const remove = injectLayoutStyle(document);
    injectLayoutStyle(document);
    expect(document.querySelectorAll(`style[${LAYOUT_STYLE_ATTR}]`)).toHaveLength(1);
    remove();
    expect(document.querySelector(`style[${LAYOUT_STYLE_ATTR}]`)).toBeNull();
  });
});
