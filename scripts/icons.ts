/**
 * Rasterise the extension icons from design/icon/*.svg into public/icon/:
 *
 *   public/icon/16.png, 32.png    favicon.svg (heavier seams for small sizes)
 *   public/icon/48.png, 128.png   app.svg (squircle with margin)
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

function render(svgName: string, size: number, out: string): void {
  const svg = readFileSync(join(ICON, svgName), 'utf8');
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`;
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
console.log(`icons: wrote ${plan.map(([, s]) => `public/icon/${s}.png`).join(', ')}`);
