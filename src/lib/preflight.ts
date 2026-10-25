/**
 * Page preflight: before touching a title page, check that it still has the
 * structure the extension was built against. If hShop changes its markup the
 * content script bails out instead of guessing, so the page stays exactly as
 * it was.
 *
 * Pure: it only queries the given Document through SELECTORS and never throws.
 * It checks structure, not content: a theme or homebrew page whose product
 * code is not a game code passes here and is skipped by extractGameInfo.
 */
import { META_LABELS, SELECTORS } from './selectors';

export type PreflightResult = { ok: true } | { ok: false; reason: string };

/** The `<p>Label: <span>value</span></p>` row of the technical table whose label is `label`. */
function metaRow(meta: Element, label: string): Element | null {
  for (const row of meta.querySelectorAll(':scope > p')) {
    const text = row.textContent ?? '';
    const colon = text.indexOf(':');
    if (colon >= 0 && text.slice(0, colon).trim() === label) return row;
  }
  return null;
}

export function preflightTitlePage(doc: Document): PreflightResult {
  try {
    const container = doc.querySelector(SELECTORS.title.container);
    if (!container) return { ok: false, reason: `missing ${SELECTORS.title.container}` };

    const name = doc.querySelector(SELECTORS.title.name);
    if (!name || !container.contains(name)) return { ok: false, reason: `missing ${SELECTORS.title.name}` };
    if (!name.textContent?.trim()) return { ok: false, reason: 'empty title name' };

    const metas = doc.querySelectorAll(SELECTORS.title.meta);
    if (metas.length === 0) return { ok: false, reason: `missing ${SELECTORS.title.meta}` };
    if (metas.length > 1) return { ok: false, reason: `more than one ${SELECTORS.title.meta}` };
    const meta = metas[0] as Element;
    if (!container.contains(meta)) return { ok: false, reason: `${SELECTORS.title.meta} outside ${SELECTORS.title.container}` };
    if (doc.querySelectorAll(SELECTORS.title.metaRows).length === 0) return { ok: false, reason: 'technical table has no rows' };

    const codeRow = metaRow(meta, META_LABELS.productCode);
    if (!codeRow) return { ok: false, reason: `no "${META_LABELS.productCode}" row` };
    const value = codeRow.querySelector('span')?.textContent?.trim() ?? '';
    if (!value) return { ok: false, reason: `"${META_LABELS.productCode}" row has no value` };

    return { ok: true };
  } catch {
    return { ok: false, reason: 'preflight threw' };
  }
}
