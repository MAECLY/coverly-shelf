/**
 * Tiny DOM builder. Everything the UI renders goes through here so no data
 * ever reaches `innerHTML`: text is set with `textContent`, attributes with
 * `setAttribute`.
 */
export type Attrs = Readonly<Record<string, string | number | boolean | null | undefined>>;
export type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: readonly Child[] = [],
  doc: Document = document,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? doc.createTextNode(child) : child);
  }
  return node;
}

/** External link that never leaks the referrer or gives the target page `window.opener`. */
export function externalLink(href: string, label: string, doc: Document = document): HTMLAnchorElement {
  const a = h('a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'cs-link' }, [label], doc);
  return a;
}
