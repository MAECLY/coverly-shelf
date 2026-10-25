/**
 * End-to-end checks of the BUILT extension (`bun run e2e`).
 *
 * 1. Builds the Chrome MV3 bundle and checks what actually ships (permissions,
 *    content-script scope, CSS that cannot leak, the Libretro serial map).
 * 2. Loads it into a real Chromium (Playwright, new headless) and drives the
 *    LIVE hshop.erista.me title pages: cover, regions, digital titles, themes,
 *    gallery + lightbox keyboard, cover zoom, Related Content thumbnails and
 *    the base-title fallback, idempotence, request concurrency, cache and
 *    responsive screenshots (saved to docs/screenshots/).
 * 3. Drives LIVE listing pages (/c/*, /search/results): row thumbnails, row
 *    links, layout overflow, DSiWare art, themes left untouched, idempotence
 *    and the separate thumbnail cache.
 *
 * Prints PASS/FAIL per check and exits non-zero on any FAIL.
 * Set E2E_HEADED=1 to watch it run.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page, type Request } from 'playwright';

// hShop's QR code encodes a live download token; keep it out of committed screenshots.
const HIDE_DOWNLOAD_QR = '.landing-dl img { visibility: hidden !important; }';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '.output', 'chrome-mv3');
const profileDir = join(root, '.e2e-profile');
const shotsDir = join(root, 'docs', 'screenshots');
const SITE = 'https://hshop.erista.me';
const ART_HOSTS = ['art.gametdb.com', 'thumbnails.libretro.com'];
const COVER_HOST = 'coverly-shelf-cover';
const GALLERY_HOST = 'coverly-shelf-gallery';
const THUMB_HOST = 'coverly-shelf-thumb';
const TITLE_MATCHES = ['*://hshop.erista.me/t/*'];
const LIST_MATCHES = ['*://hshop.erista.me/c/*', '*://hshop.erista.me/search/results*'];
const MAX_IN_FLIGHT = 4;

const failures: string[] = [];

function check(ok: boolean, message: string, detail?: string): boolean {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${message}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(message);
  return ok;
}

function sameSet(a: readonly string[] | undefined, b: readonly string[]): boolean {
  return Array.isArray(a) && a.length === b.length && b.every((x) => a.includes(x));
}

const isArt = (url: string): boolean => {
  try {
    return ART_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ─── 1. Build and static checks ────────────────────────────────────────────

const build = spawnSync('bunx', ['wxt', 'build'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) {
  console.error('wxt build failed');
  process.exit(1);
}

interface Manifest {
  manifest_version?: number;
  permissions?: string[];
  host_permissions?: string[];
  content_scripts?: { matches?: string[]; js?: string[]; css?: string[] }[];
}

console.log('\n── static: built bundle');
const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')) as Manifest;
check(manifest.manifest_version === 3, 'manifest is MV3');
check(sameSet(manifest.permissions, ['storage']), 'permissions are exactly ["storage"]');
check(
  sameSet(manifest.host_permissions, ['https://art.gametdb.com/*', 'https://thumbnails.libretro.com/*']),
  'host_permissions are only the two artwork hosts',
);
const scripts = manifest.content_scripts ?? [];
check(scripts.length === 2, 'exactly two content scripts (title pages and listing pages)', `found ${scripts.length}`);
const titleScript = scripts.find((s) => (s.js ?? []).includes('content-scripts/title.js'));
const listScript = scripts.find((s) => (s.js ?? []).includes('content-scripts/list.js'));
check(sameSet(titleScript?.matches, TITLE_MATCHES), 'title content script matches only /t/* on hShop', JSON.stringify(titleScript?.matches));
check(sameSet(listScript?.matches, LIST_MATCHES), 'list content script matches only /c/* and /search/results* on hShop', JSON.stringify(listScript?.matches));
check(
  scripts.every((s) => (s.matches ?? []).every((m) => m.startsWith('*://hshop.erista.me/'))),
  'every content script runs on hShop only',
);
check(!scripts.some((s) => (s.css ?? []).length > 0), 'no manifest CSS is injected into hShop (cssInjectionMode "ui")');

for (const name of ['title', 'list']) {
  const cssPath = join(out, 'content-scripts', `${name}.css`);
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';
  check(css.length > 0, `${name}.css is built`);
  check(!css.includes('@property'), `${name}.css has no @property rules (WXT would move them into hShop's document)`);
  check(!css.includes('@font-face'), `${name}.css declares no @font-face`);

  const jsPath = join(out, 'content-scripts', `${name}.js`);
  const js = existsSync(jsPath) ? readFileSync(jsPath, 'utf8') : '';
  check(js.length > 0, `${name}.js is built`);
  check(!/\.innerHTML\s*=/.test(js), `${name}.js never assigns innerHTML`);
}

let libretroMap: Record<string, string[]> = {};
let mapOk = false;
try {
  libretroMap = JSON.parse(readFileSync(join(out, 'libretro-3ds.json'), 'utf8')) as Record<string, string[]>;
  const entries = Object.entries(libretroMap);
  mapOk =
    entries.length > 0 &&
    entries.every(
      ([serial, names]) =>
        /^(CTR|KTR)-[A-Z]-[A-Z0-9]{4}$/.test(serial) &&
        Array.isArray(names) &&
        names.length >= 1 &&
        names.length <= 3 &&
        names.every((n) => typeof n === 'string' && n.length > 0),
    );
} catch {
  mapOk = false;
}
check(mapOk, 'libretro-3ds.json maps product codes to 1-3 No-Intro names');

// ─── 2. Live browser checks ────────────────────────────────────────────────

/** Network bookkeeping for the two artwork hosts, shared by every page of a context. */
class ArtTracker {
  inFlight = 0;
  maxInFlight = 0;
  /** Peak in-flight count per mark, to tell which step went over the cap. */
  peaks: Record<string, number> = {};
  log: { url: string; method: string; status: number | null; failed: boolean; mark: string }[] = [];
  private live = new Set<Request>();
  mark = '';

  attach(context: BrowserContext): void {
    context.on('request', (req) => {
      if (!isArt(req.url())) return;
      this.live.add(req);
      this.inFlight += 1;
      this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
      this.peaks[this.mark] = Math.max(this.peaks[this.mark] ?? 0, this.inFlight);
    });
    const settle = (req: Request, failed: boolean): void => {
      if (!this.live.delete(req)) return;
      this.inFlight -= 1;
      void (async () => {
        const res = failed ? null : await req.response().catch(() => null);
        this.log.push({ url: req.url(), method: req.method(), status: res?.status() ?? null, failed, mark: this.mark });
      })();
    };
    context.on('requestfinished', (req) => settle(req, false));
    context.on('requestfailed', (req) => settle(req, true));
  }

  /**
   * Waits (bounded) until no art request is open. The HEAD preflights run in the
   * service worker and outlive the page that asked for them, so navigating while
   * one hangs would count the old page's request against the next page's cap.
   */
  async idle(timeout = 12_000): Promise<void> {
    const until = Date.now() + timeout;
    while (this.inFlight > 0 && Date.now() < until) await sleep(100);
  }

  during(mark: string): { url: string; method: string; status: number | null; failed: boolean }[] {
    return this.log.filter((e) => e.mark === mark);
  }
}

interface PageWatch {
  pageErrors: string[];
  extConsoleErrors: string[];
}

function watchPage(page: Page): PageWatch {
  const w: PageWatch = { pageErrors: [], extConsoleErrors: [] };
  page.on('pageerror', (err) => w.pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const loc = msg.location().url ?? '';
    const text = msg.text();
    if (loc.startsWith('chrome-extension://') || /coverly|content-scripts\/(title|list)/i.test(text)) {
      w.extConsoleErrors.push(`${text} @ ${loc}`);
    }
  });
  return w;
}

/** Waits until the extension has settled on the current page (cover past its skeleton). */
async function waitForCover(page: Page, timeout = 30_000): Promise<boolean> {
  return page
    .waitForFunction(
      (host) => {
        const root = document.querySelector(host)?.shadowRoot;
        const fig = root?.querySelector('.cs-cover');
        if (!fig || fig.getAttribute('aria-busy') === 'true') return false;
        if (fig.classList.contains('is-placeholder')) return true;
        const img = root?.querySelector<HTMLImageElement>('img.cs-art');
        return !!img && img.complete && img.naturalWidth > 0;
      },
      COVER_HOST,
      { timeout, polling: 200 },
    )
    .then(() => true)
    .catch(() => false);
}

interface CoverState {
  hostIsFirstChild: boolean;
  enhanced: boolean;
  hosts: number;
  galleryHosts: number;
  src: string | null;
  alt: string | null;
  naturalWidth: number;
  placeholder: boolean;
  title: string;
}

function coverState(page: Page): Promise<CoverState> {
  return page.evaluate(
    ([coverTag, galleryTag]) => {
      const meta = document.querySelector('.basic-meta');
      const host = document.querySelector(coverTag);
      const root = host?.shadowRoot;
      const img = root?.querySelector<HTMLImageElement>('img.cs-art') ?? null;
      return {
        hostIsFirstChild: !!meta && meta.firstElementChild?.tagName.toLowerCase() === coverTag,
        enhanced: !!meta?.hasAttribute('data-hshop-enhanced'),
        hosts: document.querySelectorAll(coverTag).length,
        galleryHosts: document.querySelectorAll(galleryTag).length,
        src: img?.currentSrc || img?.getAttribute('src') || null,
        alt: img?.getAttribute('alt') ?? null,
        naturalWidth: img?.naturalWidth ?? 0,
        placeholder: !!root?.querySelector('.cs-cover.is-placeholder'),
        title: document.querySelector('.title-name > h2')?.textContent?.trim() ?? '',
      };
    },
    [COVER_HOST, GALLERY_HOST] as const,
  );
}

/**
 * hShop's download box (`.landing-dl`) as HTML, with the Cloudflare Turnstile
 * widget emptied: Turnstile renders a random widget id on every load (two loads
 * without the extension already differ), so only hShop's own markup is compared.
 */
function downloadBoxHtml(page: Page): Promise<string> {
  return page
    .locator('.landing-dl')
    .first()
    .evaluate((el) => {
      const copy = el.cloneNode(true) as Element;
      for (const widget of copy.querySelectorAll('.cf-turnstile')) widget.replaceChildren();
      return copy.outerHTML;
    });
}

/** Set once the extension context exists, so navigations wait for the previous page's art requests. */
let tracker: ArtTracker | null = null;

async function goto(page: Page, path: string): Promise<void> {
  await tracker?.idle();
  await page.goto(`${SITE}${path}`, { waitUntil: 'load', timeout: 60_000 });
}

// ─── Listing-page helpers ───────────────────────────────────────────────────

interface ListState {
  titleRows: number;
  hosts: number;
  /** Every host is the first child of an enhanced `a.list-entry` that links to /t/{id}. */
  hostsPlaced: boolean;
  /** No row carries more than one host. */
  oneHostPerRow: boolean;
  states: Record<string, number>;
  /** Thumbnails exposed to assistive tech (the row link already names the game). */
  imagesLoaded: number;
  a11yLeaks: string[];
  artSrcs: string[];
  overflow: number;
  styleTags: number;
}

function listState(page: Page): Promise<ListState> {
  return page.evaluate((host) => {
    const rows = [...document.querySelectorAll<HTMLAnchorElement>('a.list-entry[href^="/t/"]')];
    const hosts = [...document.querySelectorAll(host)];
    const states: Record<string, number> = {};
    let imagesLoaded = 0;
    const a11yLeaks: string[] = [];
    const artSrcs: string[] = [];
    for (const h of hosts) {
      const thumb = h.shadowRoot?.querySelector('.cs-thumb');
      const state = thumb?.getAttribute('data-state') ?? 'none';
      states[state] = (states[state] ?? 0) + 1;
      const img = h.shadowRoot?.querySelector<HTMLImageElement>('img.cs-thumb-art');
      if (img && img.complete && img.naturalWidth > 0) {
        imagesLoaded += 1;
        artSrcs.push(img.currentSrc || img.src);
      }
      // Decorative: hidden wrapper, empty alt, no image role or label inside.
      if (
        thumb?.getAttribute('aria-hidden') !== 'true' ||
        (img && img.getAttribute('alt') !== '') ||
        thumb.querySelector('[role], [aria-label]')
      ) {
        a11yLeaks.push(`${state}: ${h.parentElement?.getAttribute('href') ?? '?'}`);
      }
    }
    return {
      titleRows: rows.length,
      hosts: hosts.length,
      hostsPlaced: hosts.every((h) => {
        const a = h.parentElement;
        return (
          !!a &&
          a.matches('a.list-entry[href^="/t/"]') &&
          a.hasAttribute('data-hshop-enhanced') &&
          a.firstElementChild === h
        );
      }),
      oneHostPerRow: rows.every((a) => a.querySelectorAll(`:scope > ${host}`).length <= 1),
      states,
      imagesLoaded,
      a11yLeaks,
      artSrcs,
      overflow: document.documentElement.scrollWidth - innerWidth,
      styleTags: document.querySelectorAll('style[data-coverly-shelf-list]').length,
    };
  }, THUMB_HOST);
}

/** Scrolls the page and the top list so every row comes into view once. */
async function scrollLists(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      scrollTo(0, y);
      await wait(200);
    }
    const top = document.querySelector('.list.top-list');
    if (top) {
      for (let y = 0; y < top.scrollHeight; y += 300) {
        top.scrollTop = y;
        await wait(200);
      }
      top.scrollTop = 0;
    }
    scrollTo(0, 0);
  });
}

/** Waits until no mounted thumbnail is still loading (or the timeout passes). */
async function waitForThumbs(page: Page, timeout = 45_000): Promise<boolean> {
  return page
    .waitForFunction(
      (host) => {
        const hosts = [...document.querySelectorAll(host)];
        return (
          hosts.length > 0 &&
          hosts.every((h) => {
            const t = h.shadowRoot?.querySelector('.cs-thumb');
            if (!t) return false;
            const state = t.getAttribute('data-state');
            if (state === 'loading') return false;
            if (state !== 'image') return true;
            const img = h.shadowRoot?.querySelector<HTMLImageElement>('img.cs-thumb-art');
            return !!img && img.complete;
          })
        );
      },
      THUMB_HOST,
      { timeout, polling: 300 },
    )
    .then(() => true)
    .catch(() => false);
}

/** State of the cover's zoom affordance (the `.cs-stage` button) and its dialog. */
function zoomState(page: Page) {
  return page.evaluate((host) => {
    const h = document.querySelector(host);
    const root = h?.shadowRoot;
    const stage = root?.querySelector<HTMLElement>('.cs-stage') ?? null;
    const dialog = root?.querySelector<HTMLElement>('[role="dialog"]') ?? null;
    const img = dialog?.querySelector<HTMLImageElement>('img.cs-lightbox-img') ?? null;
    const active = root?.activeElement ?? null;
    return {
      role: stage?.getAttribute('role') ?? null,
      tabindex: stage?.getAttribute('tabindex') ?? null,
      label: stage?.getAttribute('aria-label') ?? null,
      cursor: stage ? getComputedStyle(stage).cursor : '',
      dialog: !!dialog,
      dialogLabel: dialog?.getAttribute('aria-label') ?? null,
      imgSrc: img?.getAttribute('src') ?? null,
      imgLoaded: !!img && img.complete && img.naturalWidth > 0,
      focusInDialog: document.activeElement === h && !!active && !!dialog && dialog.contains(active),
      focusOnStage: document.activeElement === h && !!stage && active === stage,
      outline: stage && active === stage ? getComputedStyle(stage).outlineStyle : '',
    };
  }, COVER_HOST);
}

/**
 * Cover zoom on a title page whose cover shows real art: the box is a labelled
 * button, click / Enter / Space open the full-size art in the lightbox, Tab is
 * trapped, Esc closes and focus goes back to the box. Clicks elsewhere on the
 * page never open it.
 */
async function checkCoverZoom(page: Page, tag: string, expectedSrc: string | null): Promise<void> {
  const stage = page.locator(`${COVER_HOST} .cs-stage`);
  const z0 = await zoomState(page);
  check(z0.role === 'button' && z0.tabindex === '0', `${tag}: cover is a focusable button (role=button, tabindex=0)`, JSON.stringify(z0));
  check(!!z0.label && z0.label.includes('full size'), `${tag}: cover button has an accessible label`, String(z0.label));
  check(z0.cursor === 'zoom-in', `${tag}: cover shows a zoom-in cursor`, z0.cursor);

  // A click elsewhere on the card (the technical table) opens nothing.
  await page.locator('.basic-meta > p').last().click();
  check(!(await zoomState(page)).dialog, `${tag}: clicking the technical table does not open the viewer`);

  await stage.scrollIntoViewIfNeeded();
  await stage.click();
  await page
    .waitForFunction(
      (host) => {
        const i = document.querySelector(host)?.shadowRoot?.querySelector<HTMLImageElement>('[role="dialog"] img.cs-lightbox-img');
        return !!i && i.complete && i.naturalWidth > 0;
      },
      COVER_HOST,
      { timeout: 10_000 },
    )
    .catch(() => null);
  const z1 = await zoomState(page);
  check(z1.dialog && z1.imgLoaded, `${tag}: clicking the cover opens the full-size art in a dialog`, JSON.stringify({ src: z1.imgSrc, loaded: z1.imgLoaded }));
  if (expectedSrc) check(z1.imgSrc === expectedSrc, `${tag}: the viewer shows the resolved full-size art`, String(z1.imgSrc));
  check(z1.focusInDialog, `${tag}: focus moves into the dialog`);
  if (tag === '1814') {
    await sleep(400); // let the 180 ms fade-in finish
    await page.screenshot({ style: HIDE_DOWNLOAD_QR, path: join(shotsDir, 'cover-zoom-1440.png') });
  }

  let trapped = true;
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Tab');
    if (!(await zoomState(page)).focusInDialog) trapped = false;
  }
  check(trapped, `${tag}: Tab keeps focus inside the cover viewer (4 presses)`);
  await page.keyboard.press('Escape');
  await sleep(200);
  const z2 = await zoomState(page);
  check(!z2.dialog, `${tag}: Escape closes the cover viewer`);
  check(z2.focusOnStage, `${tag}: focus returns to the cover`);
  check(z2.outline !== '' && z2.outline !== 'none', `${tag}: the focused cover shows a focus ring`, z2.outline);

  await page.keyboard.press('Enter');
  await sleep(300);
  check((await zoomState(page)).dialog, `${tag}: Enter on the focused cover opens the viewer`);
  await page.keyboard.press('Escape');
  await sleep(200);

  const scrollBefore = await page.evaluate(() => scrollY);
  await page.keyboard.press('Space');
  await sleep(300);
  const z3 = await zoomState(page);
  const scrollAfter = await page.evaluate(() => scrollY);
  check(z3.dialog, `${tag}: Space on the focused cover opens the viewer`);
  check(scrollAfter === scrollBefore, `${tag}: Space does not scroll the page`, `${scrollBefore} -> ${scrollAfter}`);
  await page.keyboard.press('Escape');
  await sleep(200);
  check((await zoomState(page)).focusOnStage, `${tag}: focus is back on the cover after Space + Escape`);
}

async function main(): Promise<void> {
  mkdirSync(shotsDir, { recursive: true });
  const headless = process.env.E2E_HEADED !== '1';

  // Baseline: the same page WITHOUT the extension.
  console.log('\n── baseline (no extension)');
  const plain = await chromium.launch({ channel: 'chromium', headless });
  const plainPage = await plain.newPage();
  const baselineErrors: string[] = [];
  plainPage.on('pageerror', (e) => baselineErrors.push(e.message));
  await goto(plainPage, '/t/1814');
  const baselineDl = await downloadBoxHtml(plainPage);
  await plain.close();
  console.log(`baseline .landing-dl captured (${baselineDl.length} chars), ${baselineErrors.length} page error(s)`);

  rmSync(profileDir, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium',
    headless,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    args: [`--disable-extensions-except=${out}`, `--load-extension=${out}`],
  });
  const art = new ArtTracker();
  art.attach(context);
  tracker = art;
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
  check(!!worker, 'extension service worker is running');

  const page = context.pages()[0] ?? (await context.newPage());
  const watch = watchPage(page);

  try {
    // ── 1. US retail
    console.log('\n── 1. /t/1814 US retail');
    art.mark = '1814-first';
    await goto(page, '/t/1814');
    const settled = await waitForCover(page);
    check(settled, '1814: cover settled');
    // Let the gallery mount before comparing the download box.
    await page.waitForSelector(GALLERY_HOST, { state: 'attached', timeout: 20_000 }).catch(() => null);
    const s1 = await coverState(page);
    check(s1.hostIsFirstChild, '1814: shadow host is the first child of .basic-meta');
    check(s1.enhanced, '1814: .basic-meta carries data-hshop-enhanced');
    check(s1.naturalWidth > 0 && !s1.placeholder, '1814: cover image loaded', `naturalWidth=${s1.naturalWidth}`);
    check(s1.src === 'https://art.gametdb.com/3ds/coverHQ/US/AZEE.jpg', '1814: cover from GameTDB coverHQ/US/AZEE.jpg', String(s1.src));
    check(!!s1.title && s1.alt === s1.title, '1814: alt equals the game title', `alt="${s1.alt}" title="${s1.title}"`);
    const dl = await downloadBoxHtml(page);
    check(dl === baselineDl, '1814: .landing-dl outerHTML identical to the run without the extension');
    const newErrors = watch.pageErrors.filter((e) => !baselineErrors.includes(e));
    check(newErrors.length === 0, '1814: no page errors beyond the baseline', newErrors.join(' | '));
    check(watch.extConsoleErrors.length === 0, '1814: no console errors from the extension', watch.extConsoleErrors.join(' | '));

    // ── 5. Gallery + lightbox (same page)
    console.log('\n── 5. gallery on /t/1814');
    const serial = 'CTR-P-AZEE';
    const hasSnaps = (libretroMap[serial] ?? []).length > 0;
    const galleryCount = await page.locator(GALLERY_HOST).count();
    if (!hasSnaps) {
      check(galleryCount === 0, '1814: no gallery when Libretro has no entry');
    } else {
      check(galleryCount === 1, '1814: gallery host present (Libretro entry exists)');
      await page.locator(`${GALLERY_HOST} .cs-gallery`).scrollIntoViewIfNeeded();
      const thumbsOk = await page
        .waitForFunction(
          (host) => {
            const imgs = [...(document.querySelector(host)?.shadowRoot?.querySelectorAll<HTMLImageElement>('img.cs-thumb-img') ?? [])];
            return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
          },
          GALLERY_HOST,
          { timeout: 20_000 },
        )
        .then(() => true)
        .catch(() => false);
      const thumbCount = await page.locator(`${GALLERY_HOST} img.cs-thumb-img`).count();
      check(thumbsOk, '1814: every gallery thumbnail loaded', `${thumbCount} thumbnail(s)`);

      const firstThumb = page.locator(`${GALLERY_HOST} button.cs-thumb`).first();
      await firstThumb.click();
      const dialog = page.locator(`${GALLERY_HOST} [role="dialog"]`);
      const opened = await dialog.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
      check(opened, '1814: clicking the first thumbnail opens a role=dialog');
      const lbImg = page.locator(`${GALLERY_HOST} img.cs-lightbox-img`);
      await page
        .waitForFunction(
          (host) => {
            const i = document.querySelector(host)?.shadowRoot?.querySelector<HTMLImageElement>('img.cs-lightbox-img');
            return !!i && i.complete && i.naturalWidth > 0;
          },
          GALLERY_HOST,
          { timeout: 10_000 },
        )
        .catch(() => null);
      await page.screenshot({ style: HIDE_DOWNLOAD_QR, path: join(shotsDir, 'lightbox-1440.png') });

      const before = await lbImg.getAttribute('src');
      await page.keyboard.press('ArrowRight');
      await sleep(300);
      const after = await lbImg.getAttribute('src');
      if (thumbCount > 1) check(!!before && before !== after, '1814: ArrowRight changes the lightbox image');
      else check(true, '1814: ArrowRight skipped (single screenshot)');

      let trapped = true;
      for (let i = 0; i < 8; i += 1) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate((host) => {
          const h = document.querySelector(host);
          const active = h?.shadowRoot?.activeElement ?? null;
          const dlg = h?.shadowRoot?.querySelector('[role="dialog"]');
          return document.activeElement === h && !!active && !!dlg && dlg.contains(active);
        }, GALLERY_HOST);
        if (!inside) trapped = false;
      }
      check(trapped, '1814: Tab keeps focus inside the dialog (8 presses)');

      await page.keyboard.press('Escape');
      const closed = await dialog.waitFor({ state: 'detached', timeout: 3_000 }).then(() => true).catch(async () => !(await dialog.isVisible()));
      check(closed, '1814: Escape closes the dialog');
      const focusBack = await page.evaluate((host) => {
        const h = document.querySelector(host);
        const first = h?.shadowRoot?.querySelector('button.cs-thumb');
        return document.activeElement === h && h?.shadowRoot?.activeElement === first;
      }, GALLERY_HOST);
      check(focusBack, '1814: focus returns to the first thumbnail');
    }

    // ── 5b. Cover zoom (same page)
    console.log('\n── 5b. cover zoom on /t/1814');
    await checkCoverZoom(page, '1814', s1.src);

    // ── 6. Idempotence
    console.log('\n── 6. idempotence');
    // Re-run the content-script logic in place: a committed path change on the same document.
    await page.evaluate(() => history.pushState(null, '', '/t/1814/'));
    await sleep(2_500);
    await waitForCover(page);
    await page.evaluate(() => history.pushState(null, '', '/t/1814'));
    await sleep(2_500);
    await waitForCover(page);
    const rerun = await coverState(page);
    check(rerun.hosts === 1 && rerun.hostIsFirstChild, 'idempotence: one cover host after in-page re-runs', `hosts=${rerun.hosts}`);
    check(rerun.galleryHosts <= 1, 'idempotence: at most one gallery host after in-page re-runs', `hosts=${rerun.galleryHosts}`);
    check(
      (await page.locator('.basic-meta').count()) === 1 && rerun.enhanced,
      'idempotence: single marked .basic-meta after re-runs',
    );

    // ── 8. Cache (second navigation in the same profile)
    console.log('\n── 8. cache');
    const first = art.during('1814-first');
    // Playwright reports the service worker's HEAD preflights as failed (ERR_ABORTED)
    // whatever the answer, so only a failed GET or an HTTP error counts as a miss here.
    const misses = new Set(
      first.filter((e) => (e.failed && e.method !== 'HEAD') || (e.status !== null && e.status >= 400)).map((e) => e.url),
    );
    const stored = await worker.evaluate(async () => {
      // @ts-expect-error chrome is the extension global inside the service worker
      return (await chrome.storage.local.get(null)) as Record<string, unknown>;
    });
    const coverEntry = stored['cover:AZEE'] as { value?: { kind?: string; url?: string } } | undefined;
    check(
      coverEntry?.value?.kind === 'image' && coverEntry.value.url === s1.src,
      'cache: winner stored under cover:AZEE',
      JSON.stringify(coverEntry?.value ?? null),
    );
    check('gallery:AZEE' in stored, 'cache: gallery list stored under gallery:AZEE');

    art.mark = '1814-second';
    await page.reload({ waitUntil: 'load' });
    await waitForCover(page);
    await sleep(2_000);
    const s2 = await coverState(page);
    const second = art.during('1814-second');
    const repeated = second.filter((e) => misses.has(e.url)).map((e) => e.url);
    check(repeated.length === 0, 'cache: 404 URLs from the first visit are not requested again', `${misses.size} miss(es) on first visit; repeated: ${repeated.join(', ')}`);
    const gametdbOthers = second.filter((e) => e.url.includes('art.gametdb.com') && e.url !== s1.src);
    check(s2.src === s1.src && s2.naturalWidth > 0, 'cache: second visit reuses the winner', String(s2.src));
    check(gametdbOthers.length === 0, 'cache: no other GameTDB probes on the second visit', gametdbOthers.map((e) => e.url).join(', '));
    const heads = second.filter((e) => e.method === 'HEAD');
    check(heads.length === 0, 'cache: no HEAD preflights on the second visit', heads.map((e) => e.url).join(', '));
    check(s2.hosts === 1, 'idempotence: one cover host after reload', `hosts=${s2.hosts}`);

    // ── 2. EU retail
    console.log('\n── 2. /t/98 EU retail');
    await goto(page, '/t/98');
    check(await waitForCover(page), '98: cover settled');
    const s98 = await coverState(page);
    check(s98.naturalWidth > 0 && !!s98.src && s98.src.includes('/3ds/') && s98.src.includes('/EN/'), '98: cover from GameTDB region EN', String(s98.src));

    // ── 3. Digital
    console.log('\n── 3. /t/18761 digital');
    art.mark = '18761';
    await goto(page, '/t/18761');
    check(await waitForCover(page), '18761: cover settled');
    await sleep(1_500);
    const s18761 = await coverState(page);
    check(s18761.naturalWidth > 0 && !s18761.placeholder, '18761: cover resolves', String(s18761.src));
    const retailOnly = art.during('18761').filter((e) => /\/3ds\/(coverfull|coverfullHQ|cart)\//.test(e.url));
    check(retailOnly.length === 0, '18761: no request to coverfull/cart', retailOnly.map((e) => e.url).join(', '));
    await page.screenshot({ style: HIDE_DOWNLOAD_QR, path: join(shotsDir, 'title-digital-18761-1440.png'), fullPage: true });

    // ── 4. Theme
    console.log('\n── 4. /t/15834 theme');
    art.mark = '15834';
    await goto(page, '/t/15834');
    await sleep(4_000);
    const themeHosts = await page.evaluate(([a, b]) => document.querySelectorAll(`${a},${b}`).length, [COVER_HOST, GALLERY_HOST] as const);
    check(themeHosts === 0, '15834: no extension host injected', `hosts=${themeHosts}`);
    check(!(await page.locator('[data-hshop-enhanced]').count()), '15834: no enhanced marker');
    check(art.during('15834').length === 0, '15834: no requests to the art hosts');

    // ── 4b. Related Content and the base-title fallback
    console.log('\n── 4b. related content + base-title fallback');
    const AXXP_HQ = 'https://art.gametdb.com/3ds/coverHQ/EN/AXXP.jpg';
    const relatedThumbs = (p: Page) =>
      p.evaluate((host) => {
        const rows = [...document.querySelectorAll<HTMLAnchorElement>('.related > a.list-entry')];
        return rows.map((a) => {
          const h = a.querySelector(`:scope > ${host}`);
          const img = h?.shadowRoot?.querySelector<HTMLImageElement>('img.cs-thumb-art') ?? null;
          return {
            href: a.getAttribute('href'),
            first: a.firstElementChild === h && !!h,
            state: h?.shadowRoot?.querySelector('.cs-thumb')?.getAttribute('data-state') ?? 'none',
            src: img && img.complete && img.naturalWidth > 0 ? img.currentSrc || img.src : null,
            interactive: h?.shadowRoot?.querySelectorAll('a, button, [tabindex], [role="button"]').length ?? 0,
          };
        });
      }, THUMB_HOST);

    // /t/6881 (Demo A, CTR-T-AXXP): rows 6882 (Demo B, CTR-T-AZVP: no art anywhere) and 650 (Base Title, CTR-P-AXXP).
    art.mark = 'related-6881';
    await goto(page, '/t/6881');
    check(await waitForCover(page), '6881: cover settled');
    await page.locator('.related').scrollIntoViewIfNeeded();
    const relSettled = await waitForThumbs(page, 45_000);
    const rel = await relatedThumbs(page);
    const relState = await listState(page);
    check(relSettled, '6881: every related thumbnail left its loading state', JSON.stringify(rel.map((r) => r.state)));
    check(rel.length === 2 && rel.every((r) => r.first), '6881: one thumbnail as the first child of each related row', JSON.stringify(rel));
    check(relState.a11yLeaks.length === 0, '6881: related thumbnails are decorative', relState.a11yLeaks.join(' | '));
    check(rel.every((r) => r.interactive === 0), '6881: nothing interactive inside the related row links');
    check(relState.styleTags === 1, '6881: exactly one row layout <style>', `found ${relState.styleTags}`);
    check(relState.overflow <= 0, '6881: no horizontal overflow at 1440', `${relState.overflow}px`);
    const demoB = rel.find((r) => r.href === '/t/6882');
    const base650 = rel.find((r) => r.href === '/t/650');
    check(!!demoB?.src && demoB.src.includes('/AXXP.'), '6881: Demo B row (CTR-T-AZVP, no own art) shows the same game\'s art', String(demoB?.src));
    check(!!base650?.src && base650.src.includes('/AXXP.'), '6881: Base Title row shows its art', String(base650?.src));
    check(
      art.during('related-6881').every((e) => !e.url.includes('/AZVP.') || e.method === 'HEAD' || e.status === 404 || e.failed),
      '6881: AZVP was only probed, never displayed',
    );
    // The card only: a full-page capture would paint hShop's fixed nav bar mid-page.
    await page.locator('.landing.sectioned-l').screenshot({ style: HIDE_DOWNLOAD_QR, path: join(shotsDir, 'related-6881-dark-1440.png') });

    // Clicking a related thumbnail follows its row link (to /t/6882).
    const demoHost = page.locator(`.related > a.list-entry[href="/t/6882"] > ${THUMB_HOST}`);
    await demoHost.scrollIntoViewIfNeeded();
    await tracker?.idle();
    await demoHost.click();
    await page.waitForURL((u) => u.pathname === '/t/6882', { timeout: 15_000 }).catch(() => null);
    check(new URL(page.url()).pathname === '/t/6882', 'related: clicking a thumbnail opens the row title page', new URL(page.url()).pathname);

    // /t/6882 itself: CTR-T-AZVP has no art; its Base Title CTR-P-AXXP does.
    check(await waitForCover(page), '6882: cover settled');
    const s6882 = await coverState(page);
    check(s6882.src === AXXP_HQ && !s6882.placeholder, '6882: demo without art shows its Base Title cover (coverHQ/EN/AXXP)', String(s6882.src));
    await checkCoverZoom(page, '6882', AXXP_HQ);

    // /t/20600: a demo whose base (CTR-N-KLRJ) has no art either: placeholder, no zoom affordance.
    art.mark = 'related-20600';
    await goto(page, '/t/20600');
    check(await waitForCover(page), '20600: cover settled');
    const s20600 = await coverState(page);
    check(s20600.placeholder, '20600: no verified art anywhere: the placeholder is shown', String(s20600.src));
    const z20600 = await zoomState(page);
    check(z20600.role === null && z20600.tabindex === null, '20600: the placeholder has no zoom affordance (no role, no tabindex)', JSON.stringify(z20600));
    await page.locator(`${COVER_HOST} .cs-stage`).click();
    await sleep(300);
    check(!(await zoomState(page)).dialog, '20600: clicking the placeholder opens nothing');
    await page.locator('.related').scrollIntoViewIfNeeded();
    await waitForThumbs(page, 30_000);
    const rel20600 = await relatedThumbs(page);
    check(rel20600.length === 1 && rel20600[0]?.state === 'placeholder', '20600: Base Title row without art keeps the placeholder', JSON.stringify(rel20600));

    // /t/20778 (DLC CTR-M-ALZE-00): its code already embeds the base game code ALZE.
    await goto(page, '/t/20778');
    check(await waitForCover(page), '20778: cover settled');
    const s20778 = await coverState(page);
    check(!!s20778.src && s20778.src.includes('/ALZE.') && !s20778.placeholder, '20778: DLC shows its base game art (ALZE)', String(s20778.src));
    await page.locator('.related').scrollIntoViewIfNeeded();
    await waitForThumbs(page, 30_000);
    const rel20778 = await relatedThumbs(page);
    check(rel20778.length === 2 && rel20778.every((r) => !!r.src && r.src.includes('/ALZE.')), '20778: Base Title and Update rows show the ALZE art', JSON.stringify(rel20778.map((r) => r.src)));

    // Phone width: related rows keep the listing layout without overflow.
    await page.setViewportSize({ width: 390, height: 844 });
    await goto(page, '/t/6881');
    await waitForCover(page);
    await page.locator('.related').scrollIntoViewIfNeeded();
    await waitForThumbs(page, 20_000);
    const relPhone = await listState(page);
    check(relPhone.overflow <= 0, '6881: no horizontal overflow at 390', `${relPhone.overflow}px`);
    await page.locator('.related').screenshot({ style: HIDE_DOWNLOAD_QR, path: join(shotsDir, 'related-6881-dark-390.png') });
    await page.setViewportSize({ width: 1440, height: 900 });

    // ── 9. Viewports and screenshots
    console.log('\n── 9. viewports and screenshots');
    for (const vp of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(vp);
      const w = vp.width;

      await goto(page, '/t/1814');
      await waitForCover(page);
      await page.waitForSelector(GALLERY_HOST, { state: 'attached', timeout: 10_000 }).catch(() => null);
      await sleep(800);
      await page.screenshot({ style: HIDE_DOWNLOAD_QR, path: join(shotsDir, `title-1814-dark-${w}.png`), fullPage: true });
      if (w === 390) {
        const geo = await page.evaluate((host) => {
          const h = document.querySelector(host)?.getBoundingClientRect();
          const p = document.querySelector('.basic-meta > p')?.getBoundingClientRect();
          return h && p ? { coverBottom: h.bottom, pTop: p.top, coverH: h.height } : null;
        }, COVER_HOST);
        check(!!geo && geo.coverH > 0 && geo.coverBottom <= geo.pTop + 0.5, '390: cover sits above the technical table', JSON.stringify(geo));
      }

      await context.addCookies([{ name: 'colormode', value: 'light', domain: 'hshop.erista.me', path: '/' }]);
      await goto(page, '/t/1814');
      await waitForCover(page);
      await sleep(800);
      const light = await page.evaluate(() => document.body.classList.contains('light-mode'));
      check(light, `${w}: light mode active via colormode cookie`);
      await page.screenshot({ style: HIDE_DOWNLOAD_QR, path: join(shotsDir, `title-1814-light-${w}.png`), fullPage: true });
      await context.clearCookies({ name: 'colormode' });

      await goto(page, '/t/18761');
      await waitForCover(page);
      await sleep(800);
      await page.screenshot({ style: HIDE_DOWNLOAD_QR, path: join(shotsDir, `title-digital-18761-${w}.png`), fullPage: true });

      await goto(page, '/t/1814');
      await waitForCover(page);
      const thumb = page.locator(`${GALLERY_HOST} button.cs-thumb`).first();
      if (await thumb.count()) {
        await thumb.scrollIntoViewIfNeeded();
        await thumb.click();
        await page
          .waitForFunction(
            (host) => {
              const i = document.querySelector(host)?.shadowRoot?.querySelector<HTMLImageElement>('img.cs-lightbox-img');
              return !!i && i.complete && i.naturalWidth > 0;
            },
            GALLERY_HOST,
            { timeout: 10_000 },
          )
          .catch(() => null);
        await sleep(400);
        await page.screenshot({ style: HIDE_DOWNLOAD_QR, path: join(shotsDir, `lightbox-${w}.png`) });
        await page.keyboard.press('Escape');
      }
    }
    check(true, 'screenshots saved to docs/screenshots/');

    // ── 10. Listing pages
    console.log('\n── 10. listing pages');
    await page.setViewportSize({ width: 1440, height: 900 });
    await context.clearCookies({ name: 'colormode' });

    // North America: main list (25 rows with codes) + top list (50 rows, no codes).
    art.mark = 'list-na';
    await goto(page, '/c/games/s/north-america');
    await page.waitForSelector(THUMB_HOST, { state: 'attached', timeout: 20_000 }).catch(() => null);
    await scrollLists(page);
    const naSettled = await waitForThumbs(page);
    const na = await listState(page);
    check(naSettled, 'list NA: every thumbnail left its loading state', JSON.stringify(na.states));
    check(na.hosts > 0 && na.hosts <= na.titleRows, 'list NA: thumbnails mounted on title rows', `${na.hosts} host(s) / ${na.titleRows} rows`);
    check(na.hostsPlaced, 'list NA: each host is the first child of an enhanced /t/ row');
    check(na.oneHostPerRow, 'list NA: at most one thumbnail per row');
    check(na.imagesLoaded >= 15, 'list NA: most thumbnails show box art', `${na.imagesLoaded} image(s) loaded`);
    check(na.a11yLeaks.length === 0, 'list NA: thumbnails are hidden from assistive tech (no doubled row name)', na.a11yLeaks.slice(0, 3).join(' | '));
    check(
      na.artSrcs.every((u) => !/\/3ds\/(coverHQ|coverM|coverfull|box|cart)\//.test(u)),
      'list NA: thumbnails use small art only (no coverHQ/coverM/box/cart)',
      na.artSrcs.filter((u) => /coverHQ|coverM/.test(u)).slice(0, 3).join(', '),
    );
    check(na.overflow <= 0, 'list NA: no horizontal overflow at 1440', `${na.overflow}px`);
    check(na.styleTags === 1, 'list NA: exactly one layout <style> in the document', `found ${na.styleTags}`);
    await page.screenshot({ path: join(shotsDir, 'list-na-dark-1440.png') });

    const stored2 = await worker.evaluate(async () => {
      // @ts-expect-error chrome is the extension global inside the service worker
      return (await chrome.storage.local.get(null)) as Record<string, unknown>;
    });
    const thumbKeys = Object.keys(stored2).filter((k) => k.startsWith('thumb:'));
    check(thumbKeys.length > 0, 'list NA: thumbnails cached under thumb: keys', `${thumbKeys.length} key(s)`);
    const coverStill = stored2['cover:AZEE'] as { value?: { url?: string } } | undefined;
    check(
      coverStill?.value?.url === 'https://art.gametdb.com/3ds/coverHQ/US/AZEE.jpg',
      'list NA: the title-page cover cache (cover:AZEE) keeps its HQ art',
      JSON.stringify(coverStill?.value ?? null),
    );

    // Idempotence: in-page path changes must not double any row.
    await page.evaluate(() => history.pushState(null, '', '/c/games/s/north-america/'));
    await sleep(1_500);
    await page.evaluate(() => history.pushState(null, '', '/c/games/s/north-america'));
    await sleep(2_000);
    const naAgain = await listState(page);
    check(naAgain.oneHostPerRow && naAgain.hostsPlaced, 'list idempotence: one host per row after in-page re-runs', `hosts=${naAgain.hosts}`);
    check(naAgain.styleTags === 1, 'list idempotence: still one layout <style>', `found ${naAgain.styleTags}`);

    // Clicking a thumbnail follows the row link.
    const firstHost = page.locator(THUMB_HOST).first();
    const rowHref = await firstHost.evaluate((h) => h.parentElement?.getAttribute('href') ?? '');
    await firstHost.scrollIntoViewIfNeeded();
    await firstHost.click();
    await page.waitForURL((u) => u.pathname === rowHref, { timeout: 15_000 }).catch(() => null);
    check(new URL(page.url()).pathname === rowHref, 'list: clicking a thumbnail opens the row title page', `${rowHref} -> ${new URL(page.url()).pathname}`);

    // Phone width: no overflow.
    await page.setViewportSize({ width: 390, height: 844 });
    await goto(page, '/c/games/s/north-america');
    await page.waitForSelector(THUMB_HOST, { state: 'attached', timeout: 20_000 }).catch(() => null);
    await waitForThumbs(page, 20_000);
    const naPhone = await listState(page);
    check(naPhone.overflow <= 0, 'list NA: no horizontal overflow at 390', `${naPhone.overflow}px`);
    await page.screenshot({ path: join(shotsDir, 'list-na-dark-390.png') });
    await page.setViewportSize({ width: 1440, height: 900 });

    // DSiWare: TWL codes resolve through GameTDB ds/.
    art.mark = 'list-dsiware';
    await goto(page, '/c/dsiware/s/north-america');
    await page.waitForSelector(THUMB_HOST, { state: 'attached', timeout: 20_000 }).catch(() => null);
    await waitForThumbs(page, 30_000);
    const dsi = await listState(page);
    check(dsi.hosts > 0, 'list DSiWare: thumbnails mounted', `${dsi.hosts} host(s)`);
    check(
      dsi.artSrcs.some((u) => u.startsWith('https://art.gametdb.com/ds/')),
      'list DSiWare: at least one thumbnail from GameTDB ds/',
      `${dsi.imagesLoaded} image(s); ${dsi.artSrcs.slice(0, 2).join(', ')}`,
    );

    // Themes: CTR-N-THEME has no art; nothing is injected and nothing is fetched.
    art.mark = 'list-themes';
    await goto(page, '/c/themes/s/north-america');
    await sleep(4_000);
    const themes = await listState(page);
    check(themes.hosts === 0, 'list themes: no thumbnail injected', `hosts=${themes.hosts}`);
    check(themes.styleTags === 0, 'list themes: no layout <style> injected');
    check(!(await page.locator('[data-hshop-enhanced]').count()), 'list themes: no enhanced marker');
    check(art.during('list-themes').length === 0, 'list themes: no requests to the art hosts');

    // Search results use the same rows.
    art.mark = 'list-search';
    await goto(page, '/search/results?q=mario&qt=Text');
    await page.waitForSelector(THUMB_HOST, { state: 'attached', timeout: 20_000 }).catch(() => null);
    await waitForThumbs(page, 30_000);
    const search = await listState(page);
    check(search.hosts > 0 && search.hostsPlaced, 'list search: thumbnails mounted on result rows', `${search.hosts} host(s) / ${search.titleRows} rows`);
    check(search.overflow <= 0, 'list search: no horizontal overflow', `${search.overflow}px`);

    // ── 7. Concurrency (whole run)
    console.log('\n── 7. concurrency');
    check(art.maxInFlight <= MAX_IN_FLIGHT, `max simultaneous in-flight art requests <= ${MAX_IN_FLIGHT}`, `observed ${art.maxInFlight}; peaks ${JSON.stringify(art.peaks)}`);

    const allNew = watch.pageErrors.filter((e) => !baselineErrors.includes(e));
    check(allNew.length === 0, 'whole run: no page errors beyond the baseline', allNew.join(' | '));
    check(watch.extConsoleErrors.length === 0, 'whole run: no console errors from the extension', watch.extConsoleErrors.join(' | '));
  } finally {
    await context.close();
  }
}

try {
  await main();
} catch (err) {
  check(false, 'e2e run crashed', err instanceof Error ? (err.stack ?? err.message) : String(err));
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) FAILED:\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('\nall checks PASSED');
