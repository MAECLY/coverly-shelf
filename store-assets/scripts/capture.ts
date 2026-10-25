/**
 * Captures raw screenshots of Coverly Shelf on live hShop title pages for the
 * Chrome Web Store.
 *
 * Launches Playwright's Chromium with the built extension loaded (branded
 * Chrome Stable 137+ no longer honors --load-extension), waits until the cover
 * and the gallery have settled, and saves hi-dpi PNGs into store-assets/raw/.
 * hShop's download QR code carries a live token, so it is hidden in every
 * capture.
 *
 * Prerequisites:
 *   bun run build                  # produces .output/chrome-mv3
 *   bunx playwright install chromium
 *
 * Usage: bun store-assets/scripts/capture.ts
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
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
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });
  try {
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    const page = context.pages()[0] ?? (await context.newPage());

    await setColorMode(context, 'dark');
    await open(page, '/t/1814');
    await card(page, 'card-dark.png');

    await page.locator(`${GALLERY_HOST} button.cs-thumb`).first().click();
    await page.waitForFunction(
      (host) => {
        const i = document.querySelector(host)?.shadowRoot?.querySelector<HTMLImageElement>('img.cs-lightbox-img');
        return !!i && i.complete && i.naturalWidth > 0;
      },
      GALLERY_HOST,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(500);
    await viewport(page, 'lightbox.png');
    await page.keyboard.press('Escape');

    await open(page, '/t/18761');
    await card(page, 'card-digital.png');

    await setColorMode(context, 'light');
    await open(page, '/t/1814');
    await card(page, 'card-light.png');

    await setColorMode(context, 'dark');
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '/t/98');
    // Bring the game name just below hShop's fixed nav bar.
    await page.evaluate(() => {
      const top = document.querySelector('.title-name')?.getBoundingClientRect().top ?? 0;
      window.scrollTo(0, window.scrollY + top - 70);
    });
    await page.waitForTimeout(300);
    await viewport(page, 'mobile.png');
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
