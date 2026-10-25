/**
 * Listing pages (`/c/*`, `/search/results`): a small box-art thumbnail at the
 * start of every title row, in the main list and in the "Top content" list.
 *
 * Purely cosmetic. The only DOM changes on hShop are one shadow host per row
 * (first child of the row's `<a>`), the ENHANCED_ATTR marker on that `<a>` and
 * one constant <style> (./layout.ts). Any failure removes them again, so the
 * row stays exactly as it was. Clicks on the thumbnail are left alone and
 * follow the row link.
 *
 * Requests: a row only resolves when it comes within ~400px of the viewport.
 * Top-list rows carry no product code; extractListEntries lends them the
 * main-list row's info for the same `/t/{id}`, else they go through
 * `lookupGameInfo` (cached, 2 at a time) once in view. Every code a page
 * shows is stored for those lookups (`rememberShownCodes`), so a title seen
 * on any listing page never needs its `/t/{id}` fetched.
 */
import '../../ui/thumb.css';
import { createShadowRootUi, defineContentScript, type ContentScriptContext, type ShadowRootContentScriptUi } from '#imports';
import { extractListEntries, type ListEntry } from '../../lib/extract';
import { lookupGameInfo, rememberShownCodes } from '../../lib/lookup';
import { createPathWatcher } from '../../lib/navigation';
import { displaySrc } from '../../lib/probe';
import { resolveCover } from '../../lib/resolver';
import { ENHANCED_ATTR, SELECTORS } from '../../lib/selectors';
import type { CoverResult, GameInfo } from '../../lib/types';
import { createThumb, updateThumb } from '../../ui/thumb';
import { injectLayoutStyle, THUMB_HOST } from '../../ui/thumb-layout';

type Ui = ShadowRootContentScriptUi<HTMLElement>;

interface Row {
  anchor: HTMLAnchorElement;
  hshopId: string;
  title: string;
  /** Known up front (main list, or a top-list row matched to one). */
  info: GameInfo | null;
  ui: Ui | null;
  thumb: HTMLElement | null;
}

interface Run {
  rows: Row[];
  observer: IntersectionObserver | null;
  removeStyle: (() => void) | null;
  /** Aborted on teardown: queued hShop lookups and artwork probes of this run never go out. */
  abort: AbortController;
}

const newRun = (): Run => ({ rows: [], observer: null, removeStyle: null, abort: new AbortController() });

const ROOT_MARGIN = '400px 0px';

function isListingPath(path: string): boolean {
  return path.startsWith('/c/') || path === '/search/results' || path === '/search/results/';
}

export default defineContentScript({
  matches: ['*://hshop.erista.me/c/*', '*://hshop.erista.me/search/results*'],
  cssInjectionMode: 'ui',
  runAt: 'document_idle',
  main(ctx) {
    let current: Run = newRun();

    const teardown = (run: Run): void => {
      run.abort.abort();
      run.observer?.disconnect();
      run.observer = null;
      for (const row of run.rows.splice(0)) unmountRow(row);
      run.removeStyle?.();
      run.removeStyle = null;
    };

    const start = (): void => {
      teardown(current);
      const run = newRun();
      current = run;
      if (!isListingPath(location.pathname)) return;
      const isStale = (): boolean => ctx.isInvalid || current !== run;
      enhance(ctx, run, isStale).catch(() => teardown(run));
    };

    ctx.onInvalidated(() => teardown(current));
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

function unmountRow(row: Row): void {
  try {
    row.ui?.remove();
  } catch {
    /* already gone */
  }
  row.ui = null;
  row.thumb = null;
  row.anchor.removeAttribute(ENHANCED_ATTR);
}

/**
 * Rows to enhance. A row with no usable code that cannot be looked up either
 * (themes' `CTR-N-THEME`, free-form extras codes) gets nothing at all, like
 * the title page.
 */
function planRows(entries: readonly ListEntry[]): Array<Row & { compact: boolean }> {
  const rows: Array<Row & { compact: boolean }> = [];
  for (const entry of entries) {
    const { anchor, hshopId, info } = entry;
    if (!hshopId || anchor.hasAttribute(ENHANCED_ATTR)) continue;
    if (!info && !entry.needsLookup) continue;
    rows.push({
      anchor,
      hshopId,
      title: entry.title || info?.title || '',
      info,
      ui: null,
      thumb: null,
      // The "Top content" box is a 500px scroll area of short rows: smaller thumbs.
      compact: anchor.closest(SELECTORS.list.topList) !== null,
    });
  }
  return rows;
}

async function enhance(ctx: ContentScriptContext, run: Run, isStale: () => boolean): Promise<void> {
  const entries = extractListEntries(document);
  // Codes this page shows spare a later "Top content" row its hShop request.
  void rememberShownCodes(entries);
  const planned = planRows(entries);
  if (planned.length === 0) return;

  run.removeStyle = injectLayoutStyle(document);
  const observer = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        observer.unobserve(record.target);
        const row = run.rows.find((r) => r.anchor === record.target);
        if (row) void fill(run, row, isStale);
      }
    },
    { rootMargin: ROOT_MARGIN },
  );
  run.observer = observer;

  await Promise.all(
    planned.map(async ({ compact, ...row }) => {
      // Marked before the async mount so a second pass never doubles a row.
      row.anchor.setAttribute(ENHANCED_ATTR, '');
      run.rows.push(row);
      try {
        const ui = await createShadowRootUi(ctx, {
          name: THUMB_HOST,
          position: 'inline',
          anchor: row.anchor,
          append: 'first',
          inheritStyles: true,
          onMount: (container, _shadow, host) => {
            host.toggleAttribute('data-compact', compact);
            const thumb = createThumb({ title: row.title, result: null });
            container.append(thumb);
            return thumb;
          },
        });
        if (isStale() || !run.rows.includes(row)) {
          ui.remove();
          return;
        }
        row.ui = ui;
        ui.mount();
        row.thumb = ui.mounted ?? null;
        observer.observe(row.anchor);
      } catch {
        dropRow(run, row);
      }
    }),
  );
}

function dropRow(run: Run, row: Row): void {
  run.observer?.unobserve(row.anchor);
  const at = run.rows.indexOf(row);
  if (at !== -1) run.rows.splice(at, 1);
  unmountRow(row);
}

async function fill(run: Run, row: Row, isStale: () => boolean): Promise<void> {
  try {
    if (isStale()) return;
    const { signal } = run.abort;
    const info = row.info ?? (await lookupGameInfo(row.hshopId, { signal }));
    if (isStale()) return;
    if (!info) {
      // Theme, homebrew or anything without a usable code: give the row back untouched.
      dropRow(run, row);
      return;
    }
    const result = await resolveCover(info, { size: 'thumb', signal });
    const shown = await toDisplayable(result);
    if (isStale() || !row.thumb) return;
    updateThumb(row.thumb, shown.result, shown.src);
  } catch {
    if (!isStale() && row.thumb) updateThumb(row.thumb, { kind: 'placeholder' });
  }
}

/** In background mode the art must become a data URL first; if that fails, show the placeholder. */
async function toDisplayable(result: CoverResult): Promise<{ result: CoverResult; src: string | null }> {
  if (result.kind !== 'image') return { result, src: null };
  const src = await displaySrc(result.url);
  return src ? { result, src } : { result: { kind: 'placeholder' }, src: null };
}
