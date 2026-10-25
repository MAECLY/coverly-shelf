/**
 * End-to-end checks of the options page and the cache retention setting
 * (`bun run e2e:options`).
 *
 * 1. Builds the Chrome MV3 bundle and checks the manifest additions (options
 *    page in a tab, default_locale, still only the `storage` permission) and
 *    that the en/es locales define the same strings.
 * 2. Loads it into a real Chromium and drives the options page against the
 *    LIVE hshop.erista.me: retention persists across reloads, the usage
 *    readout fills after visiting /t/1814, the two-step "Clear cache" empties
 *    it (settings stay) and the title page resolves again, and session mode
 *    keeps entries in storage.session only. Screenshots at 1280 and 390,
 *    light and dark, go to docs/screenshots/options-*.png.
 *
 * Prints PASS/FAIL per check and exits non-zero on any FAIL.
 * Set E2E_HEADED=1 to watch it run.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page, type Worker } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '.output', 'chrome-mv3');
// Throwaway profiles outside the repo, so nothing needs a .gitignore entry.
const profileDir = mkdtempSync(join(tmpdir(), 'coverly-options-'));
const shotsDir = join(root, 'docs', 'screenshots');
const SITE = 'https://hshop.erista.me';
const TITLE_PATH = '/t/1814';
const COVER_HOST = 'coverly-shelf-cover';
const CACHE_KEY = /^(cover|gallery|lookup):/;

const failures: string[] = [];

function check(ok: boolean, message: string, detail?: string): boolean {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${message}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(message);
  return ok;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function until<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 30_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  let v = await fn();
  while (!ok(v) && Date.now() < end) {
    await sleep(250);
    v = await fn();
  }
  return v;
}

// ─── 1. Build and static checks ────────────────────────────────────────────

const build = spawnSync('bunx', ['wxt', 'build'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) {
  console.error('wxt build failed');
  process.exit(1);
}

interface Manifest {
  permissions?: string[];
  default_locale?: string;
  options_ui?: { page?: string; open_in_tab?: boolean };
  action?: { default_title?: string; default_popup?: string };
}

console.log('\n── static: manifest and locales');
const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')) as Manifest;
check(manifest.options_ui?.page === 'options.html', 'options_ui points at options.html');
check(manifest.options_ui?.open_in_tab === true, 'options page opens in a tab');
check(manifest.default_locale === 'en', 'default_locale is en');
check(!!manifest.action && !manifest.action.default_popup, 'toolbar action has no popup (a click opens the settings page)', JSON.stringify(manifest.action));
check(manifest.action?.default_title === '__MSG_optionsTitle__', 'toolbar action tooltip is the localised settings title');
check(
  JSON.stringify(manifest.permissions) === JSON.stringify(['storage']),
  'permissions are still exactly ["storage"]',
  JSON.stringify(manifest.permissions),
);
const keysOf = (lang: string): string[] =>
  Object.keys(JSON.parse(readFileSync(join(out, '_locales', lang, 'messages.json'), 'utf8')) as object).sort();
const en = keysOf('en');
const es = keysOf('es');
check(en.length > 0 && JSON.stringify(en) === JSON.stringify(es), 'en and es locales define the same messages', `${en.length} keys`);
const chunks = join(out, 'chunks');
const optionsJs = existsSync(chunks)
  ? readdirSync(chunks)
      .filter((f) => f.startsWith('options'))
      .map((f) => readFileSync(join(chunks, f), 'utf8'))
      .join('\n')
  : '';
check(optionsJs.length > 0, 'options bundle is built');
check(!/\.innerHTML\s*=/.test(optionsJs), 'options bundle never assigns innerHTML');
for (const f of ['archivo-variable.woff2', 'atkinson-hyperlegible-next-variable.woff2', 'OFL-Archivo.txt', 'OFL-AtkinsonHyperlegibleNext.txt']) {
  check(existsSync(join(out, 'fonts', f)), `fonts/${f} ships`);
}

// ─── 2. Live browser checks ────────────────────────────────────────────────

type Area = 'local' | 'session' | 'sync';

async function dump(worker: Worker, area: Area): Promise<Record<string, unknown>> {
  return worker.evaluate(async (a) => {
    type StorageArea = { get(keys: null): Promise<Record<string, unknown>> };
    const api = (globalThis as unknown as { chrome: { storage: Record<string, StorageArea> } }).chrome;
    return api.storage[a]!.get(null);
  }, area);
}

const cacheKeys = (items: Record<string, unknown>): string[] => Object.keys(items).filter((k) => CACHE_KEY.test(k));

interface OptionsState {
  ready: boolean;
  checked: string | null;
  games: number;
  bytes: number;
  usage: string;
  status: string;
  confirmHidden: boolean;
  startDisabled: boolean;
  heading: string;
  lang: string;
}

async function optionsState(page: Page): Promise<OptionsState> {
  return page.evaluate(() => {
    const usage = document.getElementById('usage');
    return {
      ready: document.body.dataset.ready === 'true',
      checked: document.querySelector<HTMLInputElement>('input[name="retention"]:checked')?.value ?? null,
      games: Number(usage?.dataset.games ?? '-1'),
      bytes: Number(usage?.dataset.bytes ?? '-1'),
      usage: usage?.textContent ?? '',
      status: document.getElementById('status')?.textContent ?? '',
      confirmHidden: document.getElementById('clear-confirm')?.hidden === true,
      startDisabled: (document.getElementById('clear-start') as HTMLButtonElement | null)?.disabled ?? true,
      heading: document.getElementById('cache-heading')?.textContent ?? '',
      lang: document.documentElement.lang,
    };
  });
}

async function openOptions(page: Page, url: string): Promise<OptionsState> {
  await page.goto(url, { waitUntil: 'load' });
  return until(() => optionsState(page), (s) => s.ready, 10_000);
}

/** Visits the title page and waits until the cover image has loaded (or times out). */
async function visitTitle(context: BrowserContext): Promise<number> {
  const page = await context.newPage();
  try {
    await page.goto(`${SITE}${TITLE_PATH}`, { waitUntil: 'load', timeout: 90_000 });
    const width = await until(
      () =>
        page.evaluate((tag) => {
          const img = document.querySelector(tag)?.shadowRoot?.querySelector<HTMLImageElement>('img.cs-art');
          return img?.complete ? img.naturalWidth : 0;
        }, COVER_HOST),
      (w) => w > 0,
      90_000, // GameTDB can be slow to answer misses
    );
    await sleep(1500); // let the gallery lookup land in the cache too
    return width;
  } finally {
    await page.close();
  }
}

async function shoot(page: Page, scheme: 'light' | 'dark', width: number, name = `options-${scheme}-${width}`): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
  await page.setViewportSize({ width, height: 900 });
  await sleep(300);
  await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: true });
  console.log(`  screenshot docs/screenshots/${name}.png`);
}

/**
 * Chromium takes its UI language from --lang on Linux/Windows, but from the
 * system (AppleLanguages) on macOS, which Playwright cannot pass. forceEnglish
 * covers that case for the screenshots: it swaps chrome.i18n on extension
 * pages for the shipped English catalogue, placeholders included.
 */
function uiLanguage(lang: string): string[] {
  return [`--lang=${lang}`];
}

async function forceEnglish(context: BrowserContext): Promise<void> {
  const catalogue = JSON.parse(readFileSync(join(out, '_locales', 'en', 'messages.json'), 'utf8')) as Record<
    string,
    { message: string; placeholders?: Record<string, { content: string }> }
  >;
  await context.addInitScript((messages) => {
    const api = (globalThis as unknown as { chrome?: { i18n?: Record<string, unknown> } }).chrome;
    if (!api?.i18n || !location.protocol.startsWith('chrome-extension')) return;
    api.i18n.getUILanguage = () => 'en';
    api.i18n.getMessage = (key: string, subs?: string | string[]) => {
      const entry = messages[key];
      if (!entry) return '';
      const args = subs === undefined ? [] : Array.isArray(subs) ? subs : [subs];
      return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_m, name: string) => {
        const content = entry.placeholders?.[name.toLowerCase()]?.content ?? '';
        return content.replace(/\$(\d)/g, (_n, i: string) => args[Number(i) - 1] ?? '');
      });
    };
  }, catalogue);
}

async function launch(dir: string, extraArgs: string[] = []): Promise<{ context: BrowserContext; worker: Worker; id: string }> {
  rmSync(dir, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    headless: process.env.E2E_HEADED !== '1',
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
    args: [`--disable-extensions-except=${out}`, `--load-extension=${out}`, ...extraArgs],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
  const id = new URL(worker.url()).host;
  return { context, worker, id };
}

async function main(): Promise<void> {
  mkdirSync(shotsDir, { recursive: true });
  const { context, worker, id } = await launch(profileDir, uiLanguage('en'));
  const lang = await worker.evaluate(() => (globalThis as unknown as { chrome: { i18n: { getUILanguage(): string } } }).chrome.i18n.getUILanguage());
  if (!lang.startsWith('en')) {
    console.log(`browser UI language is ${lang}; showing the English catalogue for screenshots`);
    await forceEnglish(context);
  }
  const optionsUrl = `chrome-extension://${id}/options.html`;
  const page = context.pages()[0] ?? (await context.newPage());
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  try {
    console.log('\n── 1. defaults');
    let s = await openOptions(page, optionsUrl);
    check(s.ready, 'options page renders');
    check(s.checked === '7d', 'default retention is 7 days', String(s.checked));
    check(s.games === 0 && s.startDisabled, 'empty cache: readout is 0 and Clear is disabled', s.usage);
    await shoot(page, 'light', 1280, 'options-empty-light-1280');

    console.log('\n── 2. usage after visiting a title page');
    const w1 = await visitTitle(context);
    check(w1 > 0, `${TITLE_PATH} shows a cover`, `naturalWidth ${w1}`);
    s = await until(() => optionsState(page), (x) => x.games > 0, 10_000);
    check(s.games >= 1 && s.bytes > 0, 'usage readout updates live and shows > 0', s.usage);
    for (const scheme of ['light', 'dark'] as const) {
      for (const width of [1280, 390]) await shoot(page, scheme, width);
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1280, height: 900 });

    console.log('\n── 3. retention persists');
    await page.locator('label.segment', { has: page.locator('input[value="30d"]') }).click();
    await until(async () => (await dump(worker, 'sync'))['settings'], (v) => (v as { retention?: string })?.retention === '30d', 5_000);
    const saved = (await dump(worker, 'sync'))['settings'] as { v?: number; retention?: string } | undefined;
    check(saved?.v === 1 && saved.retention === '30d', 'settings saved to storage.sync as { v: 1, retention: "30d" }', JSON.stringify(saved));
    s = await until(() => optionsState(page), (x) => x.status.length > 0, 3_000);
    check(s.status.length > 0, 'saving is announced in the live region', s.status);
    s = await openOptions(page, optionsUrl);
    check(s.checked === '30d', '30 days is still selected after a reload', String(s.checked));
    // Keyboard: arrow keys move through the radio group.
    await page.locator('input[value="30d"]').focus();
    await page.keyboard.press('ArrowRight');
    s = await until(() => optionsState(page), (x) => x.checked === 'forever', 3_000);
    check(s.checked === 'forever', 'arrow keys change the retention');

    console.log('\n── 4. clear cache (two-step)');
    const beforeLocal = cacheKeys(await dump(worker, 'local'));
    check(beforeLocal.length > 0, 'local cache has entries before clearing', beforeLocal.join(', '));
    await page.click('#clear-start');
    s = await optionsState(page);
    check(!s.confirmHidden, 'first click only asks for confirmation');
    check(cacheKeys(await dump(worker, 'local')).length === beforeLocal.length, 'nothing is removed before confirming');
    await page.setViewportSize({ width: 390, height: 900 });
    await shoot(page, 'light', 390, 'options-confirm-light-390');
    await page.keyboard.press('Escape');
    s = await optionsState(page);
    check(s.confirmHidden, 'Escape cancels the confirmation');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.click('#clear-start');
    await page.click('#clear-yes');
    s = await until(() => optionsState(page), (x) => x.games === 0 && x.status.length > 0, 10_000);
    check(s.games === 0 && s.bytes === 0, 'usage readout is 0 after clearing', s.usage);
    check(s.status.length > 0, 'success is announced', s.status);
    check(cacheKeys(await dump(worker, 'local')).length === 0, 'storage.local has no cache keys left');
    check((((await dump(worker, 'sync'))['settings']) as { retention?: string })?.retention === 'forever', 'settings survive clearing');
    const w2 = await visitTitle(context);
    check(w2 > 0, 'the title page resolves its cover again after clearing', `naturalWidth ${w2}`);
    check(cacheKeys(await dump(worker, 'local')).length > 0, 'the cache refills after the visit');

    console.log('\n── 5. session mode');
    await page.reload();
    await until(() => optionsState(page), (x) => x.ready, 5_000);
    await page.locator('label.segment', { has: page.locator('input[value="session"]') }).click();
    const localAfterSwitch = await until(async () => cacheKeys(await dump(worker, 'local')), (k) => k.length === 0, 5_000);
    check(localAfterSwitch.length === 0, 'switching to session mode clears the local cache', localAfterSwitch.join(', '));
    const w3 = await visitTitle(context);
    check(w3 > 0, 'the title page still shows a cover in session mode');
    const session = cacheKeys(await dump(worker, 'session'));
    const local = cacheKeys(await dump(worker, 'local'));
    check(session.length > 0, 'cache entries live in storage.session', session.join(', '));
    check(local.length === 0, 'storage.local holds no cache entries in session mode', local.join(', '));
    s = await until(() => optionsState(page), (x) => x.games > 0, 5_000);
    check(s.games > 0, 'usage counts session entries too', s.usage);
    await page.locator('label.segment', { has: page.locator('input[value="7d"]') }).click();
    const sessionAfter = await until(async () => cacheKeys(await dump(worker, 'session')), (k) => k.length === 0, 5_000);
    check(sessionAfter.length === 0, 'leaving session mode clears the session cache');

    check(errors.length === 0, 'no errors on the options page', errors.join(' | '));
  } finally {
    await context.close();
  }

  console.log('\n── 6. Spanish UI');
  const es = await launch(`${profileDir}-es`, uiLanguage('es'));
  try {
    const p = es.context.pages()[0] ?? (await es.context.newPage());
    const st = await openOptions(p, `chrome-extension://${es.id}/options.html`);
    check(st.heading === 'Caché' && st.lang === 'es', 'with a Spanish browser UI the page is in Spanish', `${st.heading} / ${st.lang}`);
    await shoot(p, 'dark', 390, 'options-es-dark-390');
  } finally {
    await es.context.close();
    rmSync(`${profileDir}-es`, { recursive: true, force: true });
  }
  rmSync(profileDir, { recursive: true, force: true });
}

await main().catch((e: unknown) => {
  check(false, 'e2e run crashed', e instanceof Error ? e.stack : String(e));
});
console.log(`\n${failures.length === 0 ? 'ALL PASS' : `${failures.length} FAIL(S)`}`);
process.exit(failures.length === 0 ? 0 : 1);
