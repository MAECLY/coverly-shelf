/**
 * Rasterise the extension icons from design/icon/*.svg into public/icon/:
 *
 *   public/icon/16.png, 32.png    favicon.svg (heavier seams for small sizes)
 *   public/icon/48.png, 128.png   app.svg (squircle with margin)
 *   store-assets/images/icon-128.png  app.svg tile at 96x96 with 16 px
 *                                     transparent padding (Chrome Web Store)
 *
 * WXT picks up public/icon/<size>.png and lists them under `icons` in the
 * manifest. Needs Chrome or Chromium ($CHROME, or the usual install paths).
 * Run: bun scripts/icons.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ICON = join(REPO, 'design', 'icon');
const OUT = join(REPO, 'public', 'icon');
const STORE = join(REPO, 'store-assets', 'images');

// The Chrome Web Store wants a 96x96 square on a 128x128 transparent canvas.
// app.svg's tile spans 100..924 of its 1024 viewBox, so crop to it and draw it
// at 96 px. The tile is a dark Buckram, so a faint white glow keeps its edge
// readable on the store's dark theme, as the store guidelines suggest.
const STORE_ICON = { size: 128, art: 96, viewBox: '100 100 824 824', glow: 'drop-shadow(0 0 1px rgb(255 255 255 / 0.45))' };

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((p): p is string => Boolean(p));

function findChrome(): string {
  const hit = CANDIDATES.find((p) => existsSync(p));
  if (!hit) throw new Error('No Chrome/Chromium found: set $CHROME.');
  return hit;
}

function render(svgName: string, size: number, out: string, store = false): void {
  let svg = readFileSync(join(ICON, svgName), 'utf8');
  let css = `svg{display:block;width:${size}px;height:${size}px}`;
  if (store) {
    const pad = (size - STORE_ICON.art) / 2;
    svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${STORE_ICON.viewBox}"`);
    css = `svg{display:block;width:${STORE_ICON.art}px;height:${STORE_ICON.art}px;margin:${pad}px;filter:${STORE_ICON.glow}}`;
  }
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden}${css}</style></head><body>${svg}</body></html>`;
  const dir = mkdtempSync(join(tmpdir(), 'shelf-icon-'));
  try {
    const page = join(dir, 'page.html');
    writeFileSync(page, html);
    execFileSync(
      findChrome(),
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--force-color-profile=srgb',
        '--no-first-run',
        '--no-default-browser-check',
        '--virtual-time-budget=3000',
        `--user-data-dir=${join(dir, 'profile')}`,
        '--default-background-color=00000000',
        `--window-size=${size},${size}`,
        `--screenshot=${out}`,
        pathToFileURL(page).href,
      ],
      { stdio: 'ignore' },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

mkdirSync(OUT, { recursive: true });
const plan: Array<[string, number]> = [
  ['favicon.svg', 16],
  ['favicon.svg', 32],
  ['app.svg', 48],
  ['app.svg', 128],
];
for (const [svg, size] of plan) render(svg, size, join(OUT, `${size}.png`));
mkdirSync(STORE, { recursive: true });
render('app.svg', STORE_ICON.size, join(STORE, 'icon-128.png'), true);
console.log(`icons: wrote ${plan.map(([, s]) => `public/icon/${s}.png`).join(', ')}, store-assets/images/icon-128.png`);
