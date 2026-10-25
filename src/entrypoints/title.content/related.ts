/**
 * Title pages: a small box-art thumbnail at the start of every row of the
 * "Related Content" box (`.related > a.list-entry`), placed exactly like the
 * listing-page thumbnails: one shadow host as the first child of the row's
 * `<a>`, decorative, nothing interactive inside the link, plus the shared
 * row-layout <style> (src/ui/thumb-layout.ts).
 *
 * Art comes from resolveRelatedCover (src/lib/related.ts): the row's own code
 * first, then, for rows hShop says are the same game, the Base Title's art and
 * the page's own cover. Rows resolve once within ~400px of the viewport and go
 * through the shared artwork limiter. Rows without a usable code get nothing.
 * Any failure removes what was added, so the row stays as it was.
 */
import { createShadowRootUi, type ContentScriptContext, type ShadowRootContentScriptUi } from '#imports';
import { toDisplayable } from '../../lib/display';
import type { RelatedEntry } from '../../lib/extract';
import { resolveRelatedCover, type RelatedContext } from '../../lib/related';
import { ENHANCED_ATTR } from '../../lib/selectors';
import { createThumb, updateThumb } from '../../ui/thumb';
import { injectLayoutStyle, THUMB_HOST } from '../../ui/thumb-layout';

type Ui = ShadowRootContentScriptUi<HTMLElement>;

interface Row {
  entry: RelatedEntry;
  ui: Ui | null;
  thumb: HTMLElement | null;
}

const ROOT_MARGIN = '400px 0px';

/**
 * Mounts the thumbnails and returns at once with a teardown function that
 * removes every host, marker and the layout <style> and cancels queued work.
 */
export function mountRelated(
  ctx: ContentScriptContext,
  entries: readonly RelatedEntry[],
  related: RelatedContext,
  isStale: () => boolean,
): () => void {
  const planned = entries.filter((e) => e.info && e.hshopId && !e.anchor.hasAttribute(ENHANCED_ATTR));
  if (planned.length === 0) return () => {};

  const abort = new AbortController();
  const rows: Row[] = [];
  const removeStyle = injectLayoutStyle(document);
  let done = false;

  const unmount = (row: Row): void => {
    try {
      row.ui?.remove();
    } catch {
      /* already gone */
    }
    row.ui = null;
    row.thumb = null;
    row.entry.anchor.removeAttribute(ENHANCED_ATTR);
  };

  const observer = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        observer.unobserve(record.target);
        const row = rows.find((r) => r.entry.anchor === record.target);
        if (row) void fill(row);
      }
    },
    { rootMargin: ROOT_MARGIN },
  );

  const gone = (): boolean => done || isStale();

  async function fill(row: Row): Promise<void> {
    try {
      const result = await resolveRelatedCover(row.entry, related, { signal: abort.signal });
      const shown = await toDisplayable(result);
      if (gone() || !row.thumb) return;
      updateThumb(row.thumb, shown.result, shown.src);
    } catch {
      if (!gone() && row.thumb) updateThumb(row.thumb, { kind: 'placeholder' });
    }
  }

  for (const entry of planned) {
    // Marked before the async mount so a second pass never doubles a row.
    entry.anchor.setAttribute(ENHANCED_ATTR, '');
    const row: Row = { entry, ui: null, thumb: null };
    rows.push(row);
    void createShadowRootUi(ctx, {
      name: THUMB_HOST,
      position: 'inline',
      anchor: entry.anchor,
      append: 'first',
      inheritStyles: true,
      onMount: (container) => {
        const thumb = createThumb({ title: entry.title || entry.info?.title || '', result: null });
        container.append(thumb);
        return thumb;
      },
    })
      .then((ui) => {
        if (gone() || !rows.includes(row)) {
          ui.remove();
          return;
        }
        row.ui = ui;
        ui.mount();
        row.thumb = ui.mounted ?? null;
        observer.observe(entry.anchor);
      })
      .catch(() => {
        const at = rows.indexOf(row);
        if (at !== -1) rows.splice(at, 1);
        unmount(row);
      });
  }

  return () => {
    done = true;
    abort.abort();
    observer.disconnect();
    for (const row of rows.splice(0)) unmount(row);
    removeStyle();
  };
}
