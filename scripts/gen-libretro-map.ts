/**
 * Generates public/libretro-3ds.json (serial → No-Intro names) from the
 * libretro-database No-Intro metadat DATs. Run with `bun scripts/gen-libretro-map.ts`.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildLibretroMap,
  countSerials,
  parseDat,
  serializeLibretroMap,
  type DatEntry,
} from '../src/lib/sources/libretro-map';

const BASE = 'https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/no-intro/';
const DATS = [
  'Nintendo - Nintendo 3DS.dat',
  'Nintendo - Nintendo 3DS (Digital).dat',
  'Nintendo - New Nintendo 3DS.dat',
];
const OUT = fileURLToPath(new URL('../public/libretro-3ds.json', import.meta.url));

const entries: DatEntry[] = [];
for (const file of DATS) {
  const url = BASE + encodeURIComponent(file);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const text = await res.text();
  const serials = countSerials(text);
  if (serials === 0) throw new Error(`No serial fields in "${file}": the DAT format changed, aborting.`);
  const parsed = parseDat(text);
  if (parsed.length === 0) throw new Error(`"${file}" has ${serials} serial lines but none parsed.`);
  console.log(`${file}: ${serials} serial lines, ${parsed.length} valid entries`);
  entries.push(...parsed);
}

const map = buildLibretroMap(entries);
const json = serializeLibretroMap(map);
writeFileSync(OUT, json);
const names = Object.values(map).reduce((n, l) => n + l.length, 0);
console.log(`Wrote ${OUT}: ${Object.keys(map).length} serials, ${names} names, ${json.length} bytes`);
