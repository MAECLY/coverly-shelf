/**
 * Live sweep of EVERY hShop listing page with the BUILT extension (`bun run e2e:lists`).
 *
 * Discovers the subcategories from the 8 category roots, then loads the first
 * page of every subcategory, every category root and one search results page
 * in a real Chromium with the unpacked Chrome MV3 build, and checks:
 *
 * - every main-list row whose product code the extension can use
 *   (`CTR|KTR|TWL-X-XXXX`, not in a no-art category) carries exactly one
 *   thumbnail host, and rows with any other code (themes, free text) none;
 * - no broken image: every `<img>` in our shadow roots loaded (naturalWidth > 0),
 *   otherwise the placeholder is shown;
 * - "Top content" rows resolve (borrowed code or hShop lookup) once scrolled
 *   into view: none stays in its loading state;
 * - at most LOOKUP.maxConcurrent (2) hShop `/t/{id}` lookups and
 *   MAX_CONCURRENT_REQUESTS (4) artwork requests in flight at any time;
 * - no page errors beyond hShop's own, no console errors from the extension;
 * - no horizontal overflow at 1440 and at 390;
 * - row anchors still navigate (one click per category).
 *
 * Prints a coverage table (page → rows, images, placeholders) and saves
 * screenshots of games/north-america, games/japan, dsiware and virtual-console
 * at 1440 (dark + light) and 390 (dark + light) to docs/screenshots/.
 *
 * The title-page checks live in scripts/e2e.ts (`bun run e2e`).
 *
 * Env:
 * - E2E_HEADED=1         watch it run;
 * - E2E_SKIP_BUILD=1     reuse .output/chrome-mv3;
 * - E2E_LISTS_TOP=all    scroll the whole "Top content" box on every page
 *                        (default: on one subcategory per category, to keep
 *                        the number of hShop lookups polite);
 * - E2E_LISTS_ONLY=a,b   only pages whose path contains one of these strings.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';

const HIDE_DOWNLOAD_QR = '.landing-dl img { visibility: hidden !important; }';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '.output', 'chrome-mv3');
const shotsDir = join(root, 'docs', 'screenshots');
const SITE = 'https://hshop.erista.me';
const ART_HOSTS = ['art.gametdb.com', 'thumbnails.libretro.com'];
const THUMB_HOST = 'coverly-shelf-thumb';
const CATEGORIES = ['games', 'updates', 'dlc', 'virtual-console', 'dsiware', 'videos', 'extras', 'themes'];
/** Mirrors NO_ART_CATEGORIES in src/lib/config.ts. */
const NO_ART_CATEGORIES = ['themes'];
const SEARCH_PATH = '/search/results?q=mario&qt=Text';
const MAX_ART_IN_FLIGHT = 4;
const MAX_LOOKUPS_IN_FLIGHT = 2;
const SHOTS: { path: string; name: string }[] = [
  { path: '/c/games/s/north-america', name: 'na' },
  { path: '/c/games/s/japan', name: 'japan' },
  { path: '/c/dsiware/s/north-america', name: 'dsiware' },
  { path: '/c/virtual-console/s/north-america', name: 'vc' },
];

const failures: string[] = [];

function check(ok: boolean, message: string, detail?: string): boolean {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${message}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(message);
  return ok;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

const isArt = (url: string): boolean => ART_HOSTS.includes(hostOf(url));
/** The list content script's `/t/{id}` fetches (a click on a row is a document load, not this). */
const isLookup = (url: string, type?: string): boolean =>
  (type === 'Fetch' || type === 'XHR') &&
  hostOf(url) === 'hshop.erista.me' && /^\/t\/\d+\/?$/.test(new URL(url).pathname);

/**
 * In-flight bookkeeping for one class of request, from the page's own CDP
 * Network events: `requestWillBeSent` → `loadingFinished`/`loadingFailed`, all
 * on the browser's monotonic clock. Playwright's request events and
 * `request.timing()` mix a wall-clock start with a relative end and deliver
 * `requestfinished` late, which shows overlaps the page never made.
 *
 * IMAGE_MODE 'direct' (src/lib/config.ts) loads art from the page, so the page
 * session sees it; in 'background' mode it would come from the service worker.
 */
interface Span {
  url: string;
  start: number;
  end: number | null;
}

class Flight {
  private spans = new Map<string, Span>();
  private seen = new Set<string>();
  /** Later loads of a URL already counted: the shown <img> re-reading the probe's (cacheable) response. */
  repeats = 0;
  /** Loads the browser answered from its HTTP cache (art fetched on an earlier page): no request reached the host. */
  cached = 0;

  constructor(private readonly match: (url: string, type?: string) => boolean) {}

  async attach(page: Page): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    cdp.on('Network.requestWillBeSent', (e) => {
      const url = e.request.url;
      if (!this.match(url, e.type) || e.redirectResponse) return;
      if (this.seen.has(url)) {
        this.repeats += 1;
        return;
      }
      this.seen.add(url);
      this.spans.set(e.requestId, { url, start: e.timestamp, end: null });
    });
    const settle = (e: { requestId: string; timestamp: number }): void => {
      const span = this.spans.get(e.requestId);
      if (span && span.end === null) span.end = e.timestamp;
    };
    const fromCache = (requestId: string): void => {
      if (this.spans.delete(requestId)) this.cached += 1;
    };
    cdp.on('Network.requestServedFromCache', (e) => fromCache(e.requestId));
    cdp.on('Network.responseReceived', (e) => {
      if (e.response.fromDiskCache || e.response.fromPrefetchCache) fromCache(e.requestId);
    });
    cdp.on('Network.loadingFinished', settle);
    cdp.on('Network.loadingFailed', settle);
    await cdp.send('Network.enable');
  }

  get total(): number {
    return this.spans.size;
  }

  /** Most requests in flight at one instant since the last reset. */
  get peak(): number {
    const events: [number, number][] = [];
    for (const { start, end } of this.spans.values()) events.push([start, 1], [end ?? Number.POSITIVE_INFINITY, -1]);
    // Ends before starts at the same instant: back-to-back requests do not overlap.
    events.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let cur = 0;
    let max = 0;
    for (const [, d] of events) {
      cur += d;
      max = Math.max(max, cur);
    }
    return max;
  }

  reset(): void {
    this.spans.clear();
    this.seen.clear();
    this.repeats = 0;
    this.cached = 0;
  }

  /** Waits until nothing of this class is in flight (requests of the previous page). */
  async drain(timeout = 20_000): Promise<void> {
    const end = Date.now() + timeout;
    while ([...this.spans.values()].some((s) => s.end === null) && Date.now() < end) await sleep(100);
  }

  dump(): string {
    const spans = [...this.spans.values()];
    const t0 = Math.min(...spans.map((s) => s.start));
    const ms = (t: number | null): string => (t === null ? '…' : String(Math.round((t - t0) * 1000)));
    return spans.map((s) => `${new URL(s.url).pathname} ${ms(s.start)}-${ms(s.end)}`).join(', ');
  }
}

// ─── Page probes ────────────────────────────────────────────────────────────

interface Audit {
  mainRows: number;
  /** Main rows whose code the extension can use. */
  coded: number;
  /** Coded main rows without exactly one host. */
  codedWrong: string[];
  /** Main rows with an unusable code that still got a host. */
  uncodedWithHost: string[];
  mainImages: number;
  mainPlaceholders: number;
  mainLoading: number;
  topRows: number;
  topHosts: number;
  topImages: number;
  topPlaceholders: number;
  /** Top rows that came into view and are still loading. */
  topLoadingInView: number;
  /** Top rows whose id a main row shows but that have no host. */
  topBorrowMissing: string[];
  /** `<img>` in our shadow roots that is not a loaded image. */
  broken: string[];
  doubleHosts: number;
  misplaced: number;
  overflow: number;
  styleTags: number;
}

function audit(page: Page, noArt: boolean, topAll: boolean): Promise<Audit> {
  return page.evaluate(
    ({ host, noArt, topAll }) => {
      const CODE_RE = /\b(CTR|KTR|TWL)-([A-Z])-([A-Z0-9]{4})\b/;
      const text = (n: Element | null | undefined): string => (n?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const codeOf = (a: Element): string | null => {
        for (const mc of a.querySelectorAll(':scope > .meta > .meta-content')) {
          const spans = mc.querySelectorAll(':scope > span');
          if (spans.length >= 2 && text(spans[spans.length - 1]) === 'Product Code') return text(spans[0]);
        }
        return null;
      };
      const stateOf = (a: Element): string | null => {
        const hosts = a.querySelectorAll(`:scope > ${host}`);
        if (hosts.length === 0) return null;
        return hosts[0]?.shadowRoot?.querySelector('.cs-thumb')?.getAttribute('data-state') ?? 'none';
      };

      const all = [...document.querySelectorAll<HTMLAnchorElement>('a.list-entry[href^="/t/"]')];
      const topBox = document.querySelector('.list.top-list');
      const main = all.filter((a) => !topBox?.contains(a));
      const top = all.filter((a) => topBox?.contains(a));
      const r: Audit = {
        mainRows: main.length,
        coded: 0,
        codedWrong: [],
        uncodedWithHost: [],
        mainImages: 0,
        mainPlaceholders: 0,
        mainLoading: 0,
        topRows: top.length,
        topHosts: 0,
        topImages: 0,
        topPlaceholders: 0,
        topLoadingInView: 0,
        topBorrowMissing: [],
        broken: [],
        doubleHosts: 0,
        misplaced: 0,
        overflow: document.documentElement.scrollWidth - innerWidth,
        styleTags: document.querySelectorAll('style[data-coverly-shelf-list]').length,
      };
      const mainIds = new Set<string>();
      for (const a of main) {
        const href = a.getAttribute('href') ?? '?';
        const code = codeOf(a);
        const usable = !noArt && !!code && CODE_RE.test(code);
        if (code !== null) mainIds.add(href);
        const n = a.querySelectorAll(`:scope > ${host}`).length;
        if (usable) {
          r.coded += 1;
          if (n !== 1) r.codedWrong.push(`${href} ${code} hosts=${n}`);
        } else if (n > 0) r.uncodedWithHost.push(`${href} ${code ?? '(no code)'}`);
        const s = stateOf(a);
        if (s === 'image') r.mainImages += 1;
        else if (s === 'placeholder') r.mainPlaceholders += 1;
        else if (s !== null) r.mainLoading += 1;
      }
      const box = topBox?.getBoundingClientRect();
      for (const a of top) {
        const s = stateOf(a);
        const href = a.getAttribute('href') ?? '?';
        if (s !== null) r.topHosts += 1;
        if (s === 'image') r.topImages += 1;
        else if (s === 'placeholder') r.topPlaceholders += 1;
        else if (s !== null) {
          // Unless the whole box was scrolled, only rows visible at scrollTop 0 came into view.
          const rr = a.getBoundingClientRect();
          const visible = !!box && rr.bottom > box.top && rr.top < box.bottom;
          if (topAll || visible) r.topLoadingInView += 1;
        }
        if (!noArt && mainIds.has(href) && s === null && CODE_RE.test(codeOf(main.find((m) => m.getAttribute('href') === href)!) ?? '')) {
          r.topBorrowMissing.push(href);
        }
      }
      for (const h of document.querySelectorAll(host)) {
        const a = h.parentElement;
        if (!a || !a.matches('a.list-entry[href^="/t/"]') || a.firstElementChild !== h || !a.hasAttribute('data-hshop-enhanced')) {
          r.misplaced += 1;
        }
        for (const img of h.shadowRoot?.querySelectorAll('img') ?? []) {
          if (!(img.complete && img.naturalWidth > 0)) r.broken.push(`${a?.getAttribute('href') ?? '?'} ${img.currentSrc || img.src}`);
        }
      }
      for (const a of all) if (a.querySelectorAll(`:scope > ${host}`).length > 1) r.doubleHosts += 1;
      return r;
    },
    { host: THUMB_HOST, noArt, topAll },
  );
}

/** Scrolls the page (and, when asked, the whole top list) so rows come into view. */
async function scrollThrough(page: Page, topAll: boolean): Promise<void> {
  await page.evaluate(async (topAll) => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      scrollTo(0, y);
      await wait(150);
    }
    const top = document.querySelector('.list.top-list');
    if (top && topAll) {
      top.scrollIntoView({ block: 'center' });
      for (let y = 0; y < top.scrollHeight; y += 250) {
        top.scrollTop = y;
        await wait(250);
      }
      top.scrollTop = 0;
    }
    scrollTo(0, 0);
  }, topAll);
}

/** Waits until no host that came into view is still loading and every shown <img> finished. */
async function waitSettled(page: Page, topAll: boolean, timeout = 60_000): Promise<boolean> {
  return page
    .waitForFunction(
      ({ host, topAll }) => {
        const topBox = document.querySelector('.list.top-list');
        const box = topBox?.getBoundingClientRect();
        for (const h of document.querySelectorAll(host)) {
          const t = h.shadowRoot?.querySelector('.cs-thumb');
          if (!t) return false;
          const state = t.getAttribute('data-state');
          const a = h.parentElement;
          const inTop = !!a && !!topBox?.contains(a);
          if (state === 'loading') {
            if (!inTop || topAll) return false;
            const rr = a!.getBoundingClientRect();
            if (box && rr.bottom > box.top && rr.top < box.bottom) return false;
            continue;
          }
          if (state === 'image') {
            const img = h.shadowRoot?.querySelector('img');
            if (!img || !img.complete) return false;
          }
        }
        return true;
      },
      { host: THUMB_HOST, topAll },
      { timeout, polling: 300 },
    )
    .then(() => true)
    .catch(() => false);
}

async function goto(page: Page, path: string): Promise<void> {
  await page.goto(`${SITE}${path}`, { waitUntil: 'load', timeout: 60_000 });
}

/** Page errors hShop throws on its own (no extension), memoised per path. */
const baselineCache = new Map<string, string[]>();
async function baselineErrors(path: string, headless: boolean): Promise<string[]> {
  const hit = baselineCache.get(path);
  if (hit) return hit;
  const browser = await chromium.launch({ channel: 'chromium', headless });
  try {
    const p = await browser.newPage();
    const errs: string[] = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await goto(p, path);
    await sleep(2_000);
    baselineCache.set(path, errs);
    return errs;
  } finally {
    await browser.close();
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

interface Row {
  page: string;
  a: Audit;
  lookups: number;
  lookupPeak: number;
  artPeak: number;
  overflow390: number;
}

function pad(s: string | number, n: number, right = false): string {
  const v = String(s);
  return right ? v.padStart(n) : v.padEnd(n);
}

function printTable(rows: Row[]): void {
  console.log('\n── coverage (first page of each listing)');
  const head =
    `${pad('page', 40)} ${pad('main', 4, true)} ${pad('coded', 5, true)} ${pad('img', 4, true)} ${pad('ph', 3, true)}` +
    ` │ ${pad('top', 3, true)} ${pad('hosts', 5, true)} ${pad('img', 4, true)} ${pad('ph', 3, true)} │ ${pad('lkp', 4, true)} ${pad('main%', 6, true)}`;
  console.log(head);
  console.log('─'.repeat(head.length));
  let main = 0;
  let coded = 0;
  let img = 0;
  let ph = 0;
  let top = 0;
  let topHosts = 0;
  let topImg = 0;
  let topPh = 0;
  for (const r of rows) {
    const a = r.a;
    const pct = a.coded ? `${Math.round((100 * a.mainImages) / a.coded)}%` : '—';
    console.log(
      `${pad(r.page, 40)} ${pad(a.mainRows, 4, true)} ${pad(a.coded, 5, true)} ${pad(a.mainImages, 4, true)} ${pad(a.mainPlaceholders, 3, true)}` +
        ` │ ${pad(a.topRows, 3, true)} ${pad(a.topHosts, 5, true)} ${pad(a.topImages, 4, true)} ${pad(a.topPlaceholders, 3, true)} │ ${pad(r.lookups, 4, true)} ${pad(pct, 6, true)}`,
    );
    main += a.mainRows;
    coded += a.coded;
    img += a.mainImages;
    ph += a.mainPlaceholders;
    top += a.topRows;
    topHosts += a.topHosts;
    topImg += a.topImages;
    topPh += a.topPlaceholders;
  }
  console.log('─'.repeat(head.length));
  const pct = coded ? `${Math.round((100 * img) / coded)}%` : '—';
  console.log(
    `${pad(`TOTAL (${rows.length} pages)`, 40)} ${pad(main, 4, true)} ${pad(coded, 5, true)} ${pad(img, 4, true)} ${pad(ph, 3, true)}` +
      ` │ ${pad(top, 3, true)} ${pad(topHosts, 5, true)} ${pad(topImg, 4, true)} ${pad(topPh, 3, true)} │ ${pad('', 4, true)} ${pad(pct, 6, true)}`,
  );
  console.log('main = title rows of the main list, coded = rows with a usable code, img/ph = thumbnails showing art / placeholder,');
  console.log('top = "Top content" rows, hosts = top rows with a thumbnail (others not scrolled into view or without code), lkp = hShop lookups.');
}

async function main(): Promise<void> {
  if (process.env.E2E_SKIP_BUILD !== '1') {
    const build = spawnSync('bunx', ['wxt', 'build'], { cwd: root, stdio: 'inherit' });
    if (build.status !== 0) throw new Error('wxt build failed');
  }
  mkdirSync(shotsDir, { recursive: true });
  const headless = process.env.E2E_HEADED !== '1';
  const topAllEverywhere = process.env.E2E_LISTS_TOP === 'all';
  const only = (process.env.E2E_LISTS_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const profileDir = mkdtempSync(join(tmpdir(), 'coverly-e2e-lists-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium',
    headless,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    args: [`--disable-extensions-except=${out}`, `--load-extension=${out}`],
  });
  const art = new Flight((url) => isArt(url));
  const lookups = new Flight(isLookup);
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
  check(!!worker, 'extension service worker is running');

  const page = context.pages()[0] ?? (await context.newPage());
  await art.attach(page);
  await lookups.attach(page);
  const pageErrors: string[] = [];
  const extErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const loc = msg.location().url ?? '';
    const t = msg.text();
    if (loc.startsWith('chrome-extension://') || /coverly|content-scripts\/(title|list)/i.test(t)) extErrors.push(`${t} @ ${loc}`);
  });

  const rows: Row[] = [];
  try {
    // ── Discover every subcategory from the category roots.
    console.log('\n── discovery');
    const pages: { path: string; category: string; topAll: boolean; navCheck: boolean }[] = [];
    for (const cat of CATEGORIES) {
      await goto(page, `/c/${cat}`);
      const subs = await page.evaluate(
        (cat) =>
          [...new Set([...document.querySelectorAll('.list.pre-top a.list-entry')].map((a) => a.getAttribute('href') ?? ''))].filter((h) =>
            h.startsWith(`/c/${cat}/s/`),
          ),
        cat,
      );
      console.log(`${cat}: ${subs.length} subcategories`);
      check(subs.length > 0, `discovery: /c/${cat} lists subcategories`);
      pages.push({ path: `/c/${cat}`, category: cat, topAll: topAllEverywhere, navCheck: false });
      subs.forEach((path, i) =>
        pages.push({
          path,
          category: cat,
          // One full "Top content" scroll per category (+ Japan, the weakest region).
          topAll: topAllEverywhere || i === 0 || path === '/c/games/s/japan',
          navCheck: i === 0,
        }),
      );
    }
    pages.push({ path: SEARCH_PATH, category: 'search', topAll: false, navCheck: true });
    const selected = only.length ? pages.filter((p) => only.some((o) => p.path.includes(o))) : pages;
    console.log(`${selected.length} page(s) to check`);

    for (const target of selected) {
      const { path, category, topAll } = target;
      const noArt = NO_ART_CATEGORIES.includes(category);
      console.log(`\n── ${path}${topAll ? ' (whole top list)' : ''}`);
      await art.drain();
      await lookups.drain();
      art.reset();
      lookups.reset();
      const errsBefore = pageErrors.length;
      const extBefore = extErrors.length;

      await page.setViewportSize({ width: 1440, height: 900 });
      await goto(page, path);
      if (!noArt) await page.waitForSelector(THUMB_HOST, { state: 'attached', timeout: 15_000 }).catch(() => null);
      else await sleep(2_500);
      await scrollThrough(page, topAll);
      const settled = await waitSettled(page, topAll);
      const a = await audit(page, noArt, topAll);
      await page.setViewportSize({ width: 390, height: 844 });
      await sleep(400);
      const overflow390 = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      await page.setViewportSize({ width: 1440, height: 900 });
      const row: Row = { page: path, a, lookups: lookups.total, lookupPeak: lookups.peak, artPeak: art.peak, overflow390 };
      rows.push(row);

      const p = path;
      check(settled, `${p}: every thumbnail in view settled`, `main loading=${a.mainLoading}, top loading in view=${a.topLoadingInView}`);
      check(a.codedWrong.length === 0, `${p}: each of the ${a.coded} coded row(s) has exactly one thumbnail`, a.codedWrong.slice(0, 3).join(' | '));
      check(a.uncodedWithHost.length === 0, `${p}: rows without a usable code are left alone`, a.uncodedWithHost.slice(0, 3).join(' | '));
      check(a.doubleHosts === 0 && a.misplaced === 0, `${p}: hosts are single first children of enhanced rows`, `double=${a.doubleHosts} misplaced=${a.misplaced}`);
      check(a.broken.length === 0, `${p}: no broken image in our shadow roots`, a.broken.slice(0, 3).join(' | '));
      check(a.mainLoading === 0 && a.topLoadingInView === 0, `${p}: no row left loading after it came into view`);
      if (!noArt) check(a.topBorrowMissing.length === 0, `${p}: top rows shown in the main list borrow its thumbnail`, a.topBorrowMissing.slice(0, 3).join(' | '));
      if (topAll && !noArt && a.topRows > 0) {
        check(a.topHosts > 0, `${p}: "Top content" rows resolve when scrolled into view`, `${a.topHosts}/${a.topRows} with a thumbnail, ${lookups.total} lookup(s)`);
      }
      if (noArt) check(a.styleTags === 0 && a.topHosts === 0, `${p}: no-art category gets no thumbnail and no <style>`);
      else check(a.styleTags === (a.coded + a.topHosts > 0 ? 1 : 0), `${p}: one layout <style> at most`, `found ${a.styleTags}`);
      check(lookups.peak <= MAX_LOOKUPS_IN_FLIGHT, `${p}: hShop lookups in flight <= ${MAX_LOOKUPS_IN_FLIGHT}`, `peak ${lookups.peak}, total ${lookups.total}${lookups.peak > MAX_LOOKUPS_IN_FLIGHT ? `: ${lookups.dump()}` : ''}`);
      check(art.peak <= MAX_ART_IN_FLIGHT, `${p}: artwork requests in flight <= ${MAX_ART_IN_FLIGHT}`, `peak ${art.peak}, ${art.total} request(s), ${art.repeats} re-read(s), ${art.cached} from the HTTP cache${art.peak > MAX_ART_IN_FLIGHT ? `: ${art.dump()}` : ''}`);
      check(a.overflow <= 0, `${p}: no horizontal overflow at 1440`, `${a.overflow}px`);
      check(overflow390 <= 0, `${p}: no horizontal overflow at 390`, `${overflow390}px`);

      const newErrs = pageErrors.slice(errsBefore);
      if (newErrs.length) {
        const base = await baselineErrors(path, headless);
        const extra = newErrs.filter((e) => !base.includes(e));
        check(extra.length === 0, `${p}: no page errors beyond hShop's own`, extra.join(' | '));
      } else check(true, `${p}: no page errors`);
      const newExt = extErrors.slice(extBefore);
      check(newExt.length === 0, `${p}: no console errors from the extension`, newExt.join(' | '));

      if (target.navCheck && a.coded + a.topHosts > 0) {
        const host = page.locator(`.list:not(.top-list) a.list-entry > ${THUMB_HOST}`).first();
        const href = await host.evaluate((h) => h.parentElement?.getAttribute('href') ?? '');
        await host.scrollIntoViewIfNeeded();
        await host.click();
        await page.waitForURL((u) => u.pathname === href, { timeout: 15_000 }).catch(() => null);
        check(new URL(page.url()).pathname === href, `${p}: clicking a thumbnail follows the row link`, `${href} -> ${new URL(page.url()).pathname}`);
      }
    }

    // ── Screenshots
    if (!only.length) {
      console.log('\n── screenshots');
      for (const { path, name } of SHOTS) {
        for (const scheme of ['dark', 'light'] as const) {
          if (scheme === 'light') {
            await context.addCookies([{ name: 'colormode', value: 'light', domain: 'hshop.erista.me', path: '/' }]);
          } else await context.clearCookies({ name: 'colormode' });
          for (const vp of [
            { width: 1440, height: 900 },
            { width: 390, height: 844 },
          ]) {
            await page.setViewportSize(vp);
            await goto(page, path);
            await page.waitForSelector(THUMB_HOST, { state: 'attached', timeout: 15_000 }).catch(() => null);
            await waitSettled(page, false, 30_000);
            const light = await page.evaluate(() => document.body.classList.contains('light-mode'));
            check(light === (scheme === 'light'), `${path}: ${scheme} mode active at ${vp.width}`);
            await sleep(400);
            await page.screenshot({ style: HIDE_DOWNLOAD_QR, path: join(shotsDir, `list-${name}-${scheme}-${vp.width}.png`) });
          }
        }
      }
      await context.clearCookies({ name: 'colormode' });
      check(true, 'listing screenshots saved to docs/screenshots/');
    }

    const stored = await worker.evaluate(async () => {
      // @ts-expect-error chrome is the extension global inside the service worker
      return (await chrome.storage.local.get(null)) as Record<string, unknown>;
    });
    const cooldown = stored['hshop:cooldown'];
    console.log(`\nhShop cooldown during the run: ${cooldown === undefined ? 'never' : JSON.stringify(cooldown)}`);
    console.log(`cache keys: ${Object.keys(stored).length} (lookup: ${Object.keys(stored).filter((k) => k.startsWith('lookup:')).length}, thumb: ${Object.keys(stored).filter((k) => k.startsWith('thumb:')).length})`);
  } finally {
    printTable(rows);
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (err) {
  check(false, 'e2e:lists run crashed', err instanceof Error ? (err.stack ?? err.message) : String(err));
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) FAILED:\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('\nall listing checks PASSED');
