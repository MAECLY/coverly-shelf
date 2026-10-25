/**
 * Pure parsing and ranking of libretro-database No-Intro DATs into the
 * serial → names map shipped as `public/libretro-3ds.json`.
 * Used by scripts/gen-libretro-map.ts and unit tests; never bundled at runtime.
 */

/** Same shape as the product-code regex used by the extractor. */
export const SERIAL_RE = /^(CTR|KTR)-[A-Z]-[A-Z0-9]{4}$/;
export const MAX_NAMES_PER_SERIAL = 3;

export type LibretroMap = Record<string, string[]>;

export interface DatEntry {
  name: string;
  serial: string;
}

/** Number of game-level `serial "..."` lines in a DAT (used to fail loudly on format changes). */
export function countSerials(dat: string): number {
  return (dat.match(/^[ \t]*serial "[^"]*"[ \t]*$/gm) ?? []).length;
}

/** Parses `game ( name "..." ... serial "..." )` blocks. Rom lines are ignored. */
export function parseDat(dat: string): DatEntry[] {
  const out: DatEntry[] = [];
  const blockRe = /^game \($([\s\S]*?)^\)/gm;
  for (const m of dat.matchAll(blockRe)) {
    const body = m[1] ?? '';
    const name = /^[ \t]*name "([^"]*)"[ \t]*$/m.exec(body)?.[1];
    const serialField = /^[ \t]*serial "([^"]*)"[ \t]*$/m.exec(body)?.[1];
    if (!name || !serialField) continue;
    for (const raw of serialField.split(/[,\s]+/)) {
      const serial = raw.trim().toUpperCase();
      if (SERIAL_RE.test(serial)) out.push({ name, serial });
    }
  }
  return out;
}

function rank(name: string): [number, number, number] {
  return [
    /\((Demo|Kiosk|Beta|Proto)\b/i.test(name) ? 1 : 0,
    /\(Rev\b/i.test(name) ? 1 : 0,
    name.length,
  ];
}

/** Best first: no Demo/Kiosk, then no Rev, then shortest, then alphabetical. */
export function compareNames(a: string, b: string): number {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) {
    const d = (ra[i] ?? 0) - (rb[i] ?? 0);
    if (d !== 0) return d;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Builds the map with sorted keys, de-duplicated names, best first, max 3 each. */
export function buildLibretroMap(entries: readonly DatEntry[]): LibretroMap {
  const bySerial = new Map<string, Set<string>>();
  for (const { name, serial } of entries) {
    let set = bySerial.get(serial);
    if (!set) bySerial.set(serial, (set = new Set()));
    set.add(name);
  }
  const map: LibretroMap = {};
  for (const serial of [...bySerial.keys()].sort()) {
    const names = [...(bySerial.get(serial) ?? [])].sort(compareNames);
    map[serial] = names.slice(0, MAX_NAMES_PER_SERIAL);
  }
  return map;
}

/** Stable JSON: one serial per line so diffs stay readable. */
export function serializeLibretroMap(map: LibretroMap): string {
  const lines = Object.keys(map)
    .sort()
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}
