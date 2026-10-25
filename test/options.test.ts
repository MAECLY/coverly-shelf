import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { RETENTIONS } from '../src/lib/settings';

type Messages = Record<string, { message: string }>;
const load = (locale: string): Messages =>
  JSON.parse(readFileSync(resolve(__dirname, `../public/_locales/${locale}/messages.json`), 'utf8')) as Messages;
const EN = load('en');
const ES = load('es');
const HTML = readFileSync(resolve(__dirname, '../src/entrypoints/options/index.html'), 'utf8');

/** Mimics chrome.i18n: only the given locale is served, whatever the UI language is. */
function serve(messages: Messages, uiLanguage: string): void {
  const i18n = (fakeBrowser as unknown as { i18n: Record<string, unknown> }).i18n;
  i18n.getMessage = (key: string, subs?: string | string[]) => {
    let msg = messages[key]?.message ?? '';
    const list = subs === undefined ? [] : Array.isArray(subs) ? subs : [subs];
    for (const s of list) msg = msg.replace(/\$[A-Z]+\$/, s);
    return msg;
  };
  i18n.getUILanguage = () => uiLanguage;
}

let opened = 0;
async function openPage(): Promise<void> {
  const doc = new DOMParser().parseFromString(HTML.replace(/<script[\s\S]*?<\/script>|<link[^>]*>/g, ''), 'text/html');
  delete document.body.dataset.ready;
  document.body.replaceChildren(...Array.from(doc.body.childNodes).map((n) => document.importNode(n, true)));
  // A fresh instance of the page script only (resetModules would also swap the fake browser).
  opened += 1;
  await import(/* @vite-ignore */ `../src/entrypoints/options/main.ts?open=${opened}`);
  await vi.waitFor(() => expect(document.body.dataset.ready).toBe('true'));
}

const radio = (v: string): HTMLInputElement =>
  document.querySelector<HTMLInputElement>(`input[name="retention"][value="${v}"]`)!;
const status = (): string => document.getElementById('status')?.textContent ?? '';

describe('options locales', () => {
  it('ship the same keys in English and Spanish, each naming its own language', () => {
    expect(Object.keys(ES).sort()).toEqual(Object.keys(EN).sort());
    expect(EN.lang?.message).toBe('en');
    expect(ES.lang?.message).toBe('es');
  });

  it('have a full saved sentence per retention choice and a save-failure message', () => {
    const suffix: Record<string, string> = { session: 'Session', '1d': '1d', '7d': '7d', '30d': '30d', forever: 'Forever' };
    for (const r of RETENTIONS) {
      for (const m of [EN, ES]) expect(m[`retentionSaved${suffix[r]}`]?.message).toMatch(/\.$/);
    }
    expect(EN.retentionSaveFailed?.message).toBeTruthy();
    expect(ES.retentionSaveFailed?.message).toBeTruthy();
    expect(EN.retentionSaved).toBeUndefined();
  });

  it('call the artwork "carátula" throughout the Spanish copy', () => {
    expect(JSON.stringify(ES)).not.toMatch(/portada/i);
  });
});

describe('options page', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    document.documentElement.removeAttribute('lang');
  });

  it('marks the page with the served locale, not the browser UI language', async () => {
    serve(EN, 'fr-FR');
    await openPage();
    expect(document.documentElement.lang).toBe('en');
  });

  it('describes every retention radio with the live hint', async () => {
    serve(ES, 'es-ES');
    await openPage();
    expect(document.documentElement.lang).toBe('es');
    const hint = document.getElementById('retention-hint')!;
    for (const r of RETENTIONS) expect(radio(r).getAttribute('aria-describedby')).toBe('retention-hint');
    expect(hint.textContent).toBe(ES.retentionHint7d?.message);
  });

  it('announces a full sentence when a choice is saved', async () => {
    serve(EN, 'en-US');
    await openPage();
    radio('30d').click();
    await vi.waitFor(() => expect(status()).toBe(EN.retentionSaved30d?.message));
    await expect(storage.getItem('sync:settings')).resolves.toMatchObject({ retention: '30d' });
  });

  it('reverts the control and reports a save failure (not a clear failure) when saving fails', async () => {
    serve(EN, 'en-US');
    await openPage();
    vi.spyOn(storage, 'setItem').mockRejectedValue(new Error('quota'));
    radio('forever').click();
    await vi.waitFor(() => expect(status()).toBe(EN.retentionSaveFailed?.message));
    expect(document.getElementById('status')?.classList.contains('is-error')).toBe(true);
    expect(radio('7d').checked).toBe(true);
    expect(radio('forever').checked).toBe(false);
    vi.restoreAllMocks();
  });
});
