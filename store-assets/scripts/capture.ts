/**
 * Captures raw screenshots of Coverly Shelf on live hShop pages, and of its
 * settings page, for the Chrome Web Store.
 *
 * Launches Playwright's Chromium with the built extension loaded (branded
 * Chrome Stable 137+ no longer honors --load-extension), waits until the cover,
 * the gallery or the list thumbnails have settled, and saves hi-dpi PNGs into
 * store-assets/raw/. hShop's download QR code carries a live token, so it is
 * hidden in every capture of an hShop page.
 *
 * Prerequisites:
 *   bun run build                  # produces .output/chrome-mv3
 *   bunx playwright install chromium
 *
 * Usage: bun store-assets/scripts/capture.ts
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page } from 'playwright';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EXT_DIR = join(ROOT, '.output', 'chrome-mv3');
const RAW_DIR = join(ROOT, 'store-assets', 'raw');
const SITE = 'https://hshop.erista.me';
const SCALE = 2; // deviceScaleFactor for crisp captures

const COVER_HOST = 'coverly-shelf-cover';
const GALLERY_HOST = 'coverly-shelf-gallery';
const THUMB_HOST = 'coverly-shelf-thumb';
// Most downloaded first, so the rows are well-known retail games.
const LIST_PATH = '/c/games/s/north-america?sb=downloads&sd=descending';
const LIST_ROWS = 5;
const HIDE_DOWNLOAD_QR = '.landing-dl img { visibility: hidden !important; }';
// hShop's nav and footer are fixed and would overlap a tall element capture.
const HIDE_FIXED_BARS = 'header, footer { visibility: hidden !important; }';

/** Waits until the cover is past its skeleton and every gallery thumbnail has loaded. */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    ([coverTag, galleryTag]) => {
      const root = document.querySelector(coverTag)?.shadowRoot;
      const fig = root?.querySelector('.cs-cover');
      if (!fig || fig.getAttribute('aria-busy') === 'true') return false;
      const art = root?.querySelector<HTMLImageElement>('img.cs-art');
      if (!fig.classList.contains('is-placeholder') && !(art?.complete && art.naturalWidth > 0)) return false;
      const thumbs = [...(document.querySelector(galleryTag)?.shadowRoot?.querySelectorAll<HTMLImageElement>('img.cs-thumb-img') ?? [])];
      return thumbs.every((i) => i.complete && i.naturalWidth > 0);
    },
    [COVER_HOST, GALLERY_HOST],
    { timeout: 30_000, polling: 200 },
  );
  // Let the 150–200 ms transitions finish.
  await page.waitForTimeout(500);
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(`${SITE}${path}`, { waitUntil: 'load', timeout: 30_000 });
  await settle(page);
}

async function setColorMode(context: BrowserContext, mode: 'dark' | 'light'): Promise<void> {
  await context.addCookies([{ name: 'colormode', value: mode, domain: 'hshop.erista.me', path: '/' }]);
}

/** Screenshot of the left card only (name, cover, technical table, gallery). */
async function card(page: Page, name: string): Promise<void> {
  const path = join(RAW_DIR, name);
  await page.locator('.landing.sectioned-l').screenshot({ path, style: `${HIDE_DOWNLOAD_QR}\n${HIDE_FIXED_BARS}` });
  console.log(`  captured store-assets/raw/${name}`);
}

async function viewport(page: Page, name: string): Promise<void> {
  const path = join(RAW_DIR, name);
  await page.screenshot({ path, style: HIDE_DOWNLOAD_QR });
  console.log(`  captured store-assets/raw/${name}`);
}

/** Waits until every list thumbnail that intersects [top, bottom) (page coordinates) has settled. */
async function settleThumbs(page: Page, top: number, bottom: number): Promise<void> {
  await page.waitForFunction(
    ([host, t, b]) => {
      const inBand = [...document.querySelectorAll(host)].filter((h) => {
        const r = h.getBoundingClientRect();
        return r.bottom + scrollY > t && r.top + scrollY < b;
      });
      return (
        inBand.length > 0 &&
        inBand.every((h) => {
          const thumb = h.shadowRoot?.querySelector('.cs-thumb');
          const state = thumb?.getAttribute('data-state');
          if (!state || state === 'loading') return false;
          if (state !== 'image') return true;
          const img = h.shadowRoot?.querySelector<HTMLImageElement>('img.cs-thumb-art');
          return !!img && img.complete && img.naturalWidth > 0;
        })
      );
    },
    [THUMB_HOST, top, bottom] as const,
    { timeout: 45_000, polling: 300 },
  );
  await page.waitForTimeout(500);
}

/** The top of the main list down to the end of its LIST_ROWS-th row, at the full list width. */
async function listClip(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate((rows) => {
    const list = document.querySelector('.list:not(.top-list)')!.getBoundingClientRect();
    const entry = document.querySelectorAll('.list:not(.top-list) a.list-entry')[rows - 1]!.getBoundingClientRect();
    const y = Math.round(list.top + scrollY);
    return { x: Math.round(list.left), y, width: Math.round(list.width), height: Math.round(entry.bottom + scrollY + 10) - y };
  }, LIST_ROWS);
}

/**
 * Chromium on macOS takes its UI language from the system, which Playwright
 * cannot override, so the settings page could render in another language.
 * This swaps chrome.i18n on extension pages for the shipped English catalogue.
 */
async function forceEnglish(context: BrowserContext): Promise<void> {
  const catalogue = JSON.parse(readFileSync(join(EXT_DIR, '_locales', 'en', 'messages.json'), 'utf8')) as Record<
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

async function main(): Promise<void> {
  if (!existsSync(EXT_DIR)) {
    console.error('Missing .output/chrome-mv3 — run `bun run build` first');
    process.exit(1);
  }
  mkdirSync(RAW_DIR, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'coverly-shelf-shots-'));

  const context = await chromium.launchPersistentContext(profile, {
    // channel 'chromium' selects the full build in new-headless mode;
    // the default headless shell cannot load extensions.
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: SCALE,
    // Keeps third-party widgets on hShop's pages (the security check) in English.
    locale: 'en-US',
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    const extensionId = new URL(worker.url()).host;
    await forceEnglish(context);
    const page = context.pages()[0] ?? (await context.newPage());

    await setColorMode(context, 'dark');
    await open(page, '/t/1814');
    await card(page, 'card-dark.png');

    // Cover zoom: click the box to open the full-size art.
    await page.locator(`${COVER_HOST} .cs-stage`).click();
    await page.waitForFunction(
      (host) => {
        const i = document.querySelector(host)?.shadowRoot?.querySelector<HTMLImageElement>('[role="dialog"] img.cs-lightbox-img');
        return !!i && i.complete && i.naturalWidth > 0;
      },
      COVER_HOST,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(500);
    await viewport(page, 'cover-zoom.png');
    await page.keyboard.press('Escape');

    // Listing page: the first rows of the main list, once their thumbnails have settled.
    await page.goto(`${SITE}${LIST_PATH}`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForSelector(THUMB_HOST, { state: 'attached', timeout: 15_000 });
    const clip = await listClip(page);
    await page.evaluate((y) => window.scrollTo(0, y), clip.y - 60);
    await settleThumbs(page, clip.y, clip.y + clip.height);
    await page.screenshot({
      path: join(RAW_DIR, 'list-dark.png'),
      clip,
      fullPage: true,
      style: `${HIDE_DOWNLOAD_QR}\n${HIDE_FIXED_BARS}`,
    });
    console.log('  captured store-assets/raw/list-dark.png');

    await setColorMode(context, 'light');
    await open(page, '/t/1814');
    await card(page, 'card-light.png');

    // Settings page, dark, with the cache filled by the visits above.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && Number(document.getElementById('usage')?.dataset.games ?? '0') > 0, undefined, {
      timeout: 10_000,
    });
    await page.waitForTimeout(500);
    const box = await page.evaluate(() => {
      const rects = ['.masthead', '.panel', '.footer'].map((s) => document.querySelector(s)!.getBoundingClientRect());
      const pad = 32;
      const x = Math.min(...rects.map((r) => r.left)) - pad;
      const y = Math.max(0, Math.min(...rects.map((r) => r.top)) - pad);
      return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(Math.max(...rects.map((r) => r.right)) + pad - x),
        height: Math.round(Math.max(...rects.map((r) => r.bottom)) + pad - y),
      };
    });
    await page.screenshot({ path: join(RAW_DIR, 'options-dark.png'), clip: box });
    console.log('  captured store-assets/raw/options-dark.png');
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
