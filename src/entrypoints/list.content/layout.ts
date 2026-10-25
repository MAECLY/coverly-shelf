/**
 * The only CSS the listing script puts in hShop's own document.
 *
 * hShop lays a row out as `.base-info` (50%) + `.meta` (50%) in a wrapping
 * flex line (docs/REFERENCE.md, "Layout of a.list-entry"). A thumbnail host
 * added as the first child would push `.meta` onto a new line, so these rules
 * cut the width of the element right after our host. They never name an hShop
 * class: every rule hangs off our own marker attribute and host tag, and only
 * applies to a row that really holds a thumbnail (`:has(> host)`). Removing
 * the host (or this <style>) gives the row back its original layout.
 *
 * `--cs-thumb-w`, `--cs-thumb-gap`, `--cs-thumb-align` and `--cs-thumb-top`
 * are read by the host's `:host` rule in style.css, so the host size and the
 * width cut come from one place.
 */
import { ENHANCED_ATTR } from '../../lib/selectors';

export const THUMB_HOST = 'coverly-shelf-thumb';
export const LAYOUT_STYLE_ATTR = 'data-coverly-shelf-list';

/** Desktop: main-list rows / top-list rows (the top list is a 500px scroll box). */
const W_MAIN = '80px';
const W_COMPACT = '56px';
/** Under hShop's 1200px breakpoint, where rows become columns. */
const W_MAIN_MOBILE = '64px';
const W_COMPACT_MOBILE = '48px';
/** Phones: every pixel of `.base-info` saved keeps long names from wrapping. */
const W_MAIN_PHONE = '52px';
const W_COMPACT_PHONE = '40px';
const GAP = '10px';
const GAP_PHONE = '8px';

const ROW = `[${ENHANCED_ATTR}]:has(> ${THUMB_HOST})`;
const COMPACT_ROW = `[${ENHANCED_ATTR}]:has(> ${THUMB_HOST}[data-compact])`;
const INFO = `[${ENHANCED_ATTR}] > ${THUMB_HOST} + *`;
const META = `[${ENHANCED_ATTR}] > ${THUMB_HOST} + * + *`;

export const LAYOUT_CSS = `
${ROW} { --cs-thumb-w: ${W_MAIN}; --cs-thumb-gap: ${GAP}; }
${COMPACT_ROW} { --cs-thumb-w: ${W_COMPACT}; }
${INFO} { width: calc(50% - var(--cs-thumb-w) - var(--cs-thumb-gap)); }
@media (max-width: 1200px) {
  /* Rows are taller here (names wrap): pin the thumb next to the name, level with its 5px padding. */
  ${ROW} { flex-direction: row; flex-wrap: wrap; --cs-thumb-w: ${W_MAIN_MOBILE}; --cs-thumb-align: flex-start; --cs-thumb-top: 5px; }
  ${COMPACT_ROW} { --cs-thumb-w: ${W_COMPACT_MOBILE}; }
  ${INFO} { width: calc(100% - var(--cs-thumb-w) - var(--cs-thumb-gap)); }
  ${META} { width: 100%; }
}
@media (max-width: 600px) {
  ${ROW} { --cs-thumb-w: ${W_MAIN_PHONE}; --cs-thumb-gap: ${GAP_PHONE}; }
  ${COMPACT_ROW} { --cs-thumb-w: ${W_COMPACT_PHONE}; }
}
`;

/** Adds the layout <style> to the document (once) and returns a function that removes it. */
export function injectLayoutStyle(doc: Document = document): () => void {
  let style = doc.querySelector<HTMLStyleElement>(`style[${LAYOUT_STYLE_ATTR}]`);
  if (!style) {
    style = doc.createElement('style');
    style.setAttribute(LAYOUT_STYLE_ATTR, '');
    style.textContent = LAYOUT_CSS; // constant text, never page data
    (doc.head ?? doc.documentElement).append(style);
  }
  const node = style;
  return () => node.remove();
}
