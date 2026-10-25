/**
 * End-to-end smoke check of the BUILT extension (`bun run e2e`).
 *
 * Builds the Chrome MV3 bundle and asserts the invariants the spec puts on
 * what actually ships: minimal permissions, a content script scoped to title
 * pages, shadow-root CSS that cannot leak into hShop's document, and a
 * well-formed Libretro serial map. It does not drive a browser; in-page
 * checks against hShop are done with Chrome DevTools MCP.
 *
 * Exits non-zero with a list of failures.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '.output', 'chrome-mv3');
const failures: string[] = [];

function check(ok: boolean, message: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
}

function sameSet(a: readonly string[] | undefined, b: readonly string[]): boolean {
  return Array.isArray(a) && a.length === b.length && b.every((x) => a.includes(x));
}

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
check(existsSync(cssPath), 'title.css is built');
const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';
check(!css.includes('@property'), 'title.css has no @property rules (WXT would move them into hShop\'s document)');
check(!css.includes('@font-face'), 'title.css declares no @font-face');

const jsPath = join(out, 'content-scripts', 'title.js');
const js = existsSync(jsPath) ? readFileSync(jsPath, 'utf8') : '';
check(js.length > 0, 'title.js is built');
check(!/\.innerHTML\s*=/.test(js), 'title.js never assigns innerHTML');

const mapPath = join(out, 'libretro-3ds.json');
let mapOk = false;
try {
  const map = JSON.parse(readFileSync(mapPath, 'utf8')) as Record<string, unknown>;
  const entries = Object.entries(map);
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

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
