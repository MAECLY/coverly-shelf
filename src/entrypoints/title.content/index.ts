/**
 * Title page (`/t/{id}`) enhancer: a 3D box cover next to the technical table
 * and, when Libretro has any, a screenshot gallery under the description.
 *
 * Purely cosmetic. The only DOM changes on hShop are our two shadow hosts and
 * the ENHANCED_ATTR marker; any failure removes them again so the page stays
 * exactly as it was.
 */
import './style.css';
import { createShadowRootUi, defineContentScript, type ContentScriptContext, type ShadowRootContentScriptUi } from '#imports';
import { extractGameInfo } from '../../lib/extract';
import { createPathWatcher } from '../../lib/navigation';
import { preflightTitlePage } from '../../lib/preflight';
import { displaySrc } from '../../lib/probe';
import { resolveCover, resolveGallery } from '../../lib/resolver';
import { ENHANCED_ATTR, SELECTORS } from '../../lib/selectors';
import type { CoverResult, GameInfo } from '../../lib/types';
import { createCover, createCoverSkeleton } from '../../ui/cover';
import { createGallery, type GalleryImage } from '../../ui/gallery';

const COVER_UI = 'coverly-shelf-cover';
const GALLERY_UI = 'coverly-shelf-gallery';

type Ui = ShadowRootContentScriptUi<unknown>;

interface Run {
  id: number;
  uis: Ui[];
  marked: Element | null;
}

export default defineContentScript({
  matches: ['*://hshop.erista.me/t/*'],
  cssInjectionMode: 'ui',
  runAt: 'document_idle',
  main(ctx) {
    let current: Run = { id: 0, uis: [], marked: null };

    const teardown = (run: Run): void => {
      for (const ui of run.uis.splice(0)) {
        try {
          ui.remove();
        } catch {
          /* already gone */
        }
      }
      run.marked?.removeAttribute(ENHANCED_ATTR);
      run.marked = null;
    };

    const start = (): void => {
      teardown(current);
      const run: Run = { id: current.id + 1, uis: [], marked: null };
      current = run;
      if (!location.pathname.startsWith('/t/')) return;
      const isStale = (): boolean => ctx.isInvalid || current !== run;
      enhance(ctx, run, isStale).catch(() => teardown(run));
    };

    ctx.onInvalidated(() => teardown(current));
    // Only a committed path change re-runs the enhancement: link clicks, form
    // submits and download clicks that merely START a navigation leave the UI alone.
    const watcher = createPathWatcher({
      initialPath: location.pathname,
      currentPath: () => location.pathname,
      defer: (fn) => {
        ctx.setTimeout(fn, 0);
      },
      onChange: () => start(),
    });
    ctx.addEventListener(window, 'wxt:locationchange', (event) => watcher.handle(event));
    start();
  },
});

async function enhance(ctx: ContentScriptContext, run: Run, isStale: () => boolean): Promise<void> {
  // hShop markup we do not recognise: leave the page alone rather than guess.
  const preflight = preflightTitlePage(document);
  if (!preflight.ok) {
    console.debug(`[coverly-shelf] page preflight failed (${preflight.reason}); page left untouched`);
    return;
  }

  const info = extractGameInfo(document);
  if (!info) return; // themes, homebrew, anything without a product code

  const meta = document.querySelector(SELECTORS.title.meta);
  if (!meta || meta.hasAttribute(ENHANCED_ATTR)) return;
  meta.setAttribute(ENHANCED_ATTR, '');
  run.marked = meta;

  // Cover: skeleton first, then the art (or placeholder) once the chain settles.
  const cover = await createShadowRootUi(ctx, {
    name: COVER_UI,
    position: 'inline',
    anchor: meta,
    append: 'first',
    inheritStyles: true,
    onMount: (container) => {
      container.append(createCoverSkeleton(info.title));
    },
  });
  if (isStale()) return;
  run.uis.push(cover as Ui);
  cover.mount();

  const [result, gallery] = await Promise.all([
    resolveCover(info).then(toDisplayable).catch((): Resolved => ({ result: { kind: 'placeholder' }, src: null })),
    resolveGallery(info).then(toGalleryImages).catch((): GalleryImage[] => []),
  ]);
  if (isStale()) return;
  cover.uiContainer.replaceChildren(createCover({ title: info.title, result: result.result, src: result.src }));

  await mountGallery(ctx, run, info, gallery, isStale);
}

interface Resolved {
  result: CoverResult;
  src: string | null;
}

/** In background mode the art must become a data URL first; if that fails, show the placeholder. */
async function toDisplayable(result: CoverResult): Promise<Resolved> {
  if (result.kind !== 'image') return { result, src: null };
  const src = await displaySrc(result.url);
  return src ? { result, src } : { result: { kind: 'placeholder' }, src: null };
}

async function toGalleryImages(list: readonly { url: string; source: GalleryImage['source']; kind: GalleryImage['kind'] }[]): Promise<GalleryImage[]> {
  const srcs = await Promise.all(list.map((c) => displaySrc(c.url)));
  const out: GalleryImage[] = [];
  list.forEach((c, i) => {
    const src = srcs[i];
    if (src) out.push({ ...c, src });
  });
  return out;
}

/** The `.extended-meta-entry` that holds hShop's description, or null. */
function descriptionEntry(): Element | null {
  for (const entry of document.querySelectorAll(SELECTORS.title.extendedEntry)) {
    if (entry.querySelector(SELECTORS.title.description)) return entry;
  }
  return null;
}

async function mountGallery(
  ctx: ContentScriptContext,
  run: Run,
  info: GameInfo,
  images: readonly GalleryImage[],
  isStale: () => boolean,
): Promise<void> {
  if (images.length === 0) return; // inject nothing at all
  const anchor = descriptionEntry();
  if (!anchor) return;

  // Every thumbnail failed: drop our host too, so no empty gap or `clear` is left behind.
  const dropHost = (): void => {
    const at = run.uis.indexOf(ui as Ui);
    if (at !== -1) run.uis.splice(at, 1);
    try {
      ui.remove();
    } catch {
      /* already gone */
    }
  };
  const ui = await createShadowRootUi(ctx, {
    name: GALLERY_UI,
    position: 'inline',
    anchor,
    append: 'after',
    inheritStyles: true,
    onMount: (container, shadow, host) => {
      const section = createGallery({ title: info.title, images, overlayContainer: shadow, onEmpty: dropHost });
      if (section) container.append(section);
      // Keep hShop's 25px rhythm when other entries follow ours.
      host.toggleAttribute('data-trailing', host.nextElementSibling !== null);
    },
  });
  if (isStale()) return;
  run.uis.push(ui as Ui);
  ui.mount();
}
