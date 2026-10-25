/**
 * End-to-end checks of the BUILT extension (`bun run e2e`).
 *
 * 1. Builds the Chrome MV3 bundle and checks what actually ships (permissions,
 *    content-script scope, CSS that cannot leak, the Libretro serial map).
 * 2. Loads it into a real Chromium (Playwright, new headless) and drives the
 *    LIVE hshop.erista.me title pages: cover, regions, digital titles, themes,
 *    gallery + lightbox keyboard, idempotence, request concurrency, cache and
 *    responsive screenshots (saved to docs/screenshots/).
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
check(scripts.length === 1, 'exactly one content script');
check(sameSet(scripts[0]?.matches, ['*://hshop.erista.me/t/*']), 'content script matches only /t/* on hShop');
check(!scripts.some((s) => (s.css ?? []).length > 0), 'no manifest CSS is injected into hShop (cssInjectionMode "ui")');

const cssPath = join(out, 'content-scripts', 'title.css');
const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';
check(css.length > 0, 'title.css is built');
check(!css.includes('@property'), "title.css has no @property rules (WXT would move them into hShop's document)");
check(!css.includes('@font-face'), 'title.css declares no @font-face');

const jsPath = join(out, 'content-scripts', 'title.js');
const js = existsSync(jsPath) ? readFileSync(jsPath, 'utf8') : '';
check(js.length > 0, 'title.js is built');
check(!/\.innerHTML\s*=/.test(js), 'title.js never assigns innerHTML');

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
  log: { url: string; status: number | null; failed: boolean; mark: string }[] = [];
  private live = new Set<Request>();
  mark = '';

  attach(context: BrowserContext): void {
    context.on('request', (req) => {
      if (!isArt(req.url())) return;
      this.live.add(req);
      this.inFlight += 1;
      this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    });
    const settle = (req: Request, failed: boolean): void => {
      if (!this.live.delete(req)) return;
      this.inFlight -= 1;
      void (async () => {
        const res = failed ? null : await req.response().catch(() => null);
        this.log.push({ url: req.url(), status: res?.status() ?? null, failed, mark: this.mark });
      })();
    };
    context.on('requestfinished', (req) => settle(req, false));
    context.on('requestfailed', (req) => settle(req, true));
  }

  during(mark: string): { url: string; status: number | null; failed: boolean }[] {
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
    if (loc.startsWith('chrome-extension://') || /coverly|content-scripts\/title/i.test(text)) {
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

async function goto(page: Page, path: string): Promise<void> {
  await page.goto(`${SITE}${path}`, { waitUntil: 'load', timeout: 60_000 });
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
  const baselineDl = await plainPage.locator('.landing-dl').first().evaluate((el) => el.outerHTML);
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
    const dl = await page.locator('.landing-dl').first().evaluate((el) => el.outerHTML);
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
    const misses = new Set(first.filter((e) => e.failed || (e.status !== null && e.status >= 400)).map((e) => e.url));
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

    // ── 7. Concurrency (whole run)
    console.log('\n── 7. concurrency');
    check(art.maxInFlight <= MAX_IN_FLIGHT, `max simultaneous in-flight art requests <= ${MAX_IN_FLIGHT}`, `observed ${art.maxInFlight}`);

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
