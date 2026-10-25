import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractGameInfo } from '../src/lib/extract';
import { preflightTitlePage } from '../src/lib/preflight';

const FIXTURES = join(__dirname, 'fixtures', 'hshop');

function loadFixture(name: string): Document {
  // Drop external stylesheets and scripts: happy-dom would try to fetch them.
  const html = readFileSync(join(FIXTURES, name), 'utf8')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '');
  return new DOMParser().parseFromString(html, 'text/html');
}

const TITLE_FIXTURES = ['title-retail-us-1814.html', 'title-retail-eu-98.html', 'title-digital-us-18761.html'];

function reasonOf(doc: Document): string {
  const res = preflightTitlePage(doc);
  return res.ok ? 'ok' : res.reason;
}

describe('preflightTitlePage', () => {
  it.each(TITLE_FIXTURES)('accepts the live title page %s', (name) => {
    const doc = loadFixture(name);
    expect(preflightTitlePage(doc)).toEqual({ ok: true });
    expect(extractGameInfo(doc)).not.toBeNull();
  });

  it('accepts the theme page structure and leaves the skip to extract', () => {
    const doc = loadFixture('title-theme-15834.html');
    expect(preflightTitlePage(doc)).toEqual({ ok: true });
    expect(extractGameInfo(doc)).toBeNull();
  });

  it('rejects a listing page', () => {
    expect(reasonOf(loadFixture('list-games-north-america.html'))).toMatch(/missing/);
  });

  it('rejects a title page without .basic-meta', () => {
    const doc = loadFixture('title-retail-us-1814.html');
    doc.querySelector('.basic-meta')?.remove();
    expect(reasonOf(doc)).toBe('missing .basic-meta');
  });

  it('rejects a renamed .basic-meta even if the text is still there', () => {
    const doc = loadFixture('title-retail-us-1814.html');
    doc.querySelector('.basic-meta')?.setAttribute('class', 'meta-v4');
    expect(preflightTitlePage(doc).ok).toBe(false);
  });

  it('rejects a page without the container or the title name', () => {
    const noContainer = loadFixture('title-retail-us-1814.html');
    noContainer.querySelector('.landing.sectioned-l')?.classList.remove('sectioned-l');
    expect(reasonOf(noContainer)).toBe('missing .landing.sectioned-l');

    const noName = loadFixture('title-retail-us-1814.html');
    noName.querySelector('.title-name > h2')?.remove();
    expect(reasonOf(noName)).toBe('missing .title-name > h2');

    const emptyName = loadFixture('title-retail-us-1814.html');
    const h2 = emptyName.querySelector('.title-name > h2');
    if (h2) h2.textContent = '   ';
    expect(reasonOf(emptyName)).toBe('empty title name');
  });

  it('rejects a technical table without rows or without the product-code row', () => {
    const empty = loadFixture('title-retail-us-1814.html');
    empty.querySelector('.basic-meta')?.replaceChildren();
    expect(reasonOf(empty)).toBe('technical table has no rows');

    const noCode = loadFixture('title-retail-us-1814.html');
    for (const p of noCode.querySelectorAll('.basic-meta > p')) {
      if (p.textContent?.startsWith('Product Code')) p.remove();
    }
    expect(reasonOf(noCode)).toBe('no "Product Code" row');

    const relabelled = loadFixture('title-retail-us-1814.html');
    for (const p of relabelled.querySelectorAll('.basic-meta > p')) {
      if (p.firstChild && p.textContent?.startsWith('Product Code')) p.firstChild.textContent = 'Serial: ';
    }
    expect(reasonOf(relabelled)).toBe('no "Product Code" row');

    const blank = loadFixture('title-retail-us-1814.html');
    for (const p of blank.querySelectorAll('.basic-meta > p')) {
      if (p.textContent?.startsWith('Product Code')) p.querySelector('span')?.replaceChildren();
    }
    expect(reasonOf(blank)).toBe('"Product Code" row has no value');
  });

  it('rejects a duplicated technical table', () => {
    const doc = loadFixture('title-retail-us-1814.html');
    const meta = doc.querySelector('.basic-meta');
    if (meta) meta.after(meta.cloneNode(true));
    expect(reasonOf(doc)).toBe('more than one .basic-meta');
  });

  it('accepts its own re-run (our shadow host first in .basic-meta)', () => {
    const doc = loadFixture('title-retail-us-1814.html');
    const meta = doc.querySelector('.basic-meta');
    meta?.prepend(doc.createElement('coverly-shelf-cover'));
    meta?.setAttribute('data-hshop-enhanced', '');
    expect(preflightTitlePage(doc)).toEqual({ ok: true });
  });

  it('never throws on an empty document', () => {
    const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    expect(preflightTitlePage(doc).ok).toBe(false);
  });
});
