/**
 * Generates public/libretro-vc.json (Virtual Console game code → original
 * system + No-Intro name) with `bun run gen:vc`.
 *
 * 1. Crawls every hShop `/c/virtual-console/s/{slug}` listing sequentially
 *    (`?count=100&offset=N`, a pause between pages) and reads each row's
 *    product code, name and `Virtual Console: {system}` badge.
 * 2. Loads the original system's No-Intro DAT from libretro-database (the
 *    same source as scripts/gen-libretro-map.ts).
 * 3. Matches EXACTLY, after a deterministic normalisation
 *    (src/lib/sources/vc-map.ts), a No-Intro base name of that DAT: first the
 *    name the 3DS DATs give the title's serial (`CTR-N-PAAE` → `F-Zero -
 *    Maximum Velocity (USA) (GBA) (Virtual Console)`), then hShop's own name.
 *    The region variants are ordered by the code's region letter.
 * 4. HEADs each candidate's Named_Boxarts thumbnail on thumbnails.libretro.com
 *    one at a time and keeps the first that exists.
 * 5. Writes only verified hits and prints coverage per region and system.
 *
 * Env: GEN_VC_CACHE=dir keeps the hShop pages, DATs and HEAD answers there so
 * a re-run sends no request twice.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { LIBRETRO_VC_SYSTEMS, type LibretroVcSystem } from '../src/lib/config';
import { extractListEntries } from '../src/lib/extract';
import { SELECTORS, VC_BADGE_PREFIX } from '../src/lib/selectors';
import { libretroUrl } from '../src/lib/sources/libretro';
import { parseDat } from '../src/lib/sources/libretro-map';
import {
  indexDat,
  parseDatNames,
  serializeVcMap,
  vcCandidates,
  vcLookupKeys,
  vcSystemFor,
  type NoIntroName,
  type VcMap,
} from '../src/lib/sources/vc-map';

const SITE = 'https://hshop.erista.me';
const SLUGS = ['europe', 'france', 'germany', 'japan', 'korea', 'north-america', 'world'];
const PAGE_SIZE = 100;
const PAGE_PAUSE_MS = 2000;
const HEAD_PAUSE_MS = 150;
/** Candidates HEADed per title at most: the region variants of one exact name. */
const MAX_HEADS_PER_TITLE = 6;
const DAT_BASE = 'https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/no-intro/';
const UA = 'coverly-shelf gen-vc-map (+https://github.com/MAECLY/coverly-shelf)';
const OUT = fileURLToPath(new URL('../public/libretro-vc.json', import.meta.url));
const CACHE = process.env.GEN_VC_CACHE ?? null;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function cached(name: string): string | null {
  if (!CACHE) return null;
  const file = join(CACHE, name.replace(/[^\w.-]+/g, '_'));
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function remember(name: string, body: string): void {
  if (!CACHE) return;
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(join(CACHE, name.replace(/[^\w.-]+/g, '_')), body);
}

async function getText(url: string, cacheName: string, pause: number): Promise<string> {
  const hit = cached(cacheName);
  if (hit !== null) return hit;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (res.ok) {
      const body = await res.text();
      remember(cacheName, body);
      await sleep(pause);
      return body;
    }
    if (attempt >= 3) throw new Error(`GET ${url} → ${res.status}`);
    await sleep(pause * 5 * attempt);
  }
}

interface VcRow {
  slug: string;
  hshopId: string;
  productCode: string;
  gameCode: string;
  regionChar: string;
  name: string;
  badge: string | null;
}

function parseListing(html: string, slug: string): VcRow[] {
  const window = new Window({ url: `${SITE}/c/virtual-console/s/${slug}` });
  const doc = new window.DOMParser().parseFromString(html, 'text/html');
  const rows: VcRow[] = [];
  for (const entry of extractListEntries(doc as unknown as ParentNode, { pathname: `/c/virtual-console/s/${slug}` })) {
    if (!entry.info || !entry.hshopId || entry.anchor.closest(SELECTORS.list.topList)) continue;
    let badge: string | null = null;
    for (const b of entry.anchor.querySelectorAll(SELECTORS.list.badges)) {
      const text = (b.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text.startsWith(VC_BADGE_PREFIX)) badge = text.slice(VC_BADGE_PREFIX.length).trim();
    }
    rows.push({
      slug,
      hshopId: entry.hshopId,
      productCode: entry.info.productCode,
      gameCode: entry.info.gameCode,
      regionChar: entry.info.regionChar,
      name: entry.title,
      badge,
    });
  }
  void window.happyDOM.close();
  return rows;
}

async function crawl(): Promise<VcRow[]> {
  const rows: VcRow[] = [];
  for (const slug of SLUGS) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const url = `${SITE}/c/virtual-console/s/${slug}?count=${PAGE_SIZE}&offset=${offset}`;
      const page = parseListing(await getText(url, `vc-${slug}-${offset}.html`, PAGE_PAUSE_MS), slug);
      rows.push(...page);
      console.log(`hShop ${slug} offset ${offset}: ${page.length} rows`);
      if (page.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

const headMemo = new Map<string, boolean>(
  Object.entries(JSON.parse(cached('heads.json') ?? '{}') as Record<string, boolean>),
);

/** True when Libretro serves a non-empty PNG at `url`. Sequential and paced. */
async function exists(url: string): Promise<boolean> {
  const known = headMemo.get(url);
  if (known !== undefined) return known;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { method: 'HEAD', headers: { 'user-agent': UA } });
      await sleep(HEAD_PAUSE_MS);
      if (res.status >= 500 && attempt < 3) continue;
      const type = (res.headers.get('content-type') ?? '').toLowerCase();
      const ok = res.status === 200 && type.startsWith('image/') && res.headers.get('content-length') !== '0';
      if (res.status !== 200 && res.status !== 404) throw new Error(`HEAD ${url} → ${res.status}`);
      headMemo.set(url, ok);
      return ok;
    } catch (err) {
      if (attempt >= 3) throw err;
      await sleep(2000 * attempt);
    }
  }
}

const rows = await crawl();
const byCode = new Map<string, VcRow>();
for (const row of rows) if (!byCode.has(row.gameCode)) byCode.set(row.gameCode, row);
console.log(`${rows.length} VC rows, ${byCode.size} distinct game codes`);

const indexes = new Map<LibretroVcSystem, Map<string, NoIntroName[]>>();
for (const system of LIBRETRO_VC_SYSTEMS) {
  const dat = await getText(DAT_BASE + encodeURIComponent(`${system}.dat`), `${system}.dat`, 500);
  const names = parseDatNames(dat);
  if (names.length === 0) throw new Error(`No game names in "${system}.dat": the DAT format changed, aborting.`);
  indexes.set(system, indexDat(names));
  console.log(`${system}.dat: ${names.length} names`);
}

/** The 3DS DATs list some VC titles by serial: their names are exact keys. */
const serialNames = new Map<string, string[]>();
for (const file of ['Nintendo - Nintendo 3DS (Digital).dat', 'Nintendo - Nintendo 3DS.dat']) {
  const dat = await getText(DAT_BASE + encodeURIComponent(file), file, 500);
  for (const { name, serial } of parseDat(dat)) {
    const list = serialNames.get(serial) ?? [];
    list.push(name);
    serialNames.set(serial, list);
  }
}

type Outcome = 'verified' | 'no-thumbnail' | 'no-match' | 'no-system';
const map: VcMap = {};
const outcomes: { row: VcRow; system: LibretroVcSystem | null; outcome: Outcome }[] = [];
for (const row of byCode.values()) {
  const system = vcSystemFor(row.gameCode, row.badge);
  if (!system) {
    outcomes.push({ row, system, outcome: 'no-system' });
    continue;
  }
  const keys = vcLookupKeys(serialNames.get(row.productCode) ?? [], row.name);
  const names = vcCandidates(indexes.get(system) ?? new Map(), keys, row.regionChar);
  if (names.length === 0) {
    outcomes.push({ row, system, outcome: 'no-match' });
    continue;
  }
  let hit: string | null = null;
  for (const name of names.slice(0, MAX_HEADS_PER_TITLE)) {
    if (await exists(libretroUrl('cover', name, system))) {
      hit = name;
      break;
    }
  }
  if (hit) map[row.gameCode] = { system, name: hit };
  outcomes.push({ row, system, outcome: hit ? 'verified' : 'no-thumbnail' });
}
remember('heads.json', JSON.stringify(Object.fromEntries(headMemo)));

const json = serializeVcMap(map);
writeFileSync(OUT, json);

function table(title: string, key: (o: (typeof outcomes)[number]) => string): void {
  const groups = new Map<string, Record<Outcome | 'total', number>>();
  for (const o of outcomes) {
    const k = key(o);
    const g = groups.get(k) ?? { total: 0, verified: 0, 'no-thumbnail': 0, 'no-match': 0, 'no-system': 0 };
    g.total++;
    g[o.outcome]++;
    groups.set(k, g);
  }
  console.log(`\n${title}`);
  console.log('| Group | Titles | Verified | Exact name, no thumbnail | No exact name | No system |');
  console.log('|---|---|---|---|---|---|');
  let t = 0;
  let v = 0;
  for (const [k, g] of [...groups.entries()].sort()) {
    t += g.total;
    v += g.verified;
    const pct = ((100 * g.verified) / g.total).toFixed(0);
    console.log(`| ${k} | ${g.total} | ${g.verified} (${pct}%) | ${g['no-thumbnail']} | ${g['no-match']} | ${g['no-system']} |`);
  }
  console.log(`| **Total** | **${t}** | **${v} (${((100 * v) / t).toFixed(0)}%)** | | | |`);
}
table('Coverage per hShop region', (o) => o.row.slug);
table('Coverage per original system', (o) => o.system ?? `unknown (${o.row.badge ?? 'no badge'})`);
console.log(`\nWrote ${OUT}: ${Object.keys(map).length} game codes, ${json.length} bytes`);
