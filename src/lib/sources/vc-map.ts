/**
 * Pure rules behind `public/libretro-vc.json` (game code → original-system
 * No-Intro name), built by scripts/gen-vc-map.ts. GameTDB has no art for
 * Virtual Console codes, so their box art comes from the original system's
 * Libretro thumbnails. Matching is exact on purpose: a deterministic
 * normalisation of hShop's name must equal a No-Intro base name, nothing
 * fuzzy. Used by the generator and unit tests; never bundled at runtime.
 */
import { LIBRETRO_VC_SYSTEMS, type LibretroVcSystem } from '../config';

export interface VcEntry {
  /** Libretro system folder, one of LIBRETRO_VC_SYSTEMS. */
  system: LibretroVcSystem;
  /** No-Intro name whose Named_Boxarts thumbnail was verified. */
  name: string;
}

export type VcMap = Record<string, VcEntry>;

const [NES, SNES, GB, GBC, GBA, GG, PCE] = LIBRETRO_VC_SYSTEMS;

/**
 * hShop's badge text (`Virtual Console: {system}`) → Libretro system. The
 * PC Engine badge really reads `TurboGrafx-16)` on hShop (stray parenthesis).
 */
export const VC_BADGE_SYSTEMS: Readonly<Record<string, LibretroVcSystem>> = {
  NES,
  Famicom: NES,
  SNES,
  'Super Famicom': SNES,
  'Game Boy': GB,
  'Game Boy Color': GBC,
  'Game Boy Advance': GBA,
  'Game Gear': GG,
  'TurboGrafx-16': PCE,
  'TurboGrafx-16)': PCE,
};

/**
 * First letter of a VC game code → the systems it was seen with, surveyed on
 * all 691 hShop VC titles (2026-10-25): T NES/Famicom (240), R Game Boy (179),
 * Q Game Boy Color (103), U SNES/Super Famicom (80, New 3DS), G Game Gear (54),
 * P Game Boy Advance (30) or PC Engine (4, Japan only). No other letter is used.
 */
export const VC_LETTER_SYSTEMS: Readonly<Record<string, readonly LibretroVcSystem[]>> = {
  T: [NES],
  R: [GB],
  Q: [GBC],
  U: [SNES],
  G: [GG],
  P: [GBA, PCE],
};

/**
 * The system of a VC title: the badge when it agrees with the code's first
 * letter, else the letter alone when it names exactly one system. Null when
 * the two disagree or neither decides.
 */
export function vcSystemFor(gameCode: string, badge: string | null): LibretroVcSystem | null {
  const byLetter = VC_LETTER_SYSTEMS[gameCode.charAt(0)] ?? [];
  const byBadge = badge ? VC_BADGE_SYSTEMS[badge.trim()] : undefined;
  if (byBadge) return byLetter.includes(byBadge) ? byBadge : null;
  return byLetter.length === 1 ? (byLetter[0] ?? null) : null;
}

/**
 * No-Intro regions to accept for a VC region letter, best first. Each one is
 * tried alone (`(USA)`) and then inside a list (`(USA, Europe)`).
 */
export const VC_REGION_PREFS: Readonly<Record<string, readonly string[]>> = {
  E: ['USA', 'World'],
  P: ['Europe', 'World'],
  J: ['Japan', 'World'],
  D: ['Germany', 'Europe', 'World'],
  F: ['France', 'Europe', 'World'],
  K: ['Korea', 'World'],
  // Region-free (`world`) and Korean releases of Western games.
  A: ['World', 'USA', 'Europe'],
  Z: ['World', 'USA'],
};

/** Strips ™ ® ©, unifies quotes and apostrophes, collapses whitespace, lower-cases. */
export function normaliseTitle(name: string): string {
  return name
    .normalize('NFC')
    .replace(/[™®©]/g, '')
    .replace(/[‘’ʼ´`]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** `the legend of zelda - x` → `legend of zelda, the - x` (No-Intro's article rule). */
function moveArticle(title: string): string | null {
  if (!title.startsWith('the ')) return null;
  const cut = title.indexOf(' - ');
  const head = cut < 0 ? title : title.slice(0, cut);
  const rest = cut < 0 ? '' : title.slice(cut);
  return `${head.slice(4)}, the${rest}`;
}

/**
 * Every exact form of an hShop name to look up, normalised: as is, with
 * `: ` subtitles written ` - ` (and back), and with a leading "The" moved
 * behind the main title like No-Intro does.
 */
export function titleForms(hshopName: string): string[] {
  const n = normaliseTitle(hshopName);
  if (!n) return [];
  const base = [n, n.replace(/\s*:\s+/g, ' - '), n.replace(/ - /g, ': ')];
  const forms: string[] = [];
  for (const f of base) {
    forms.push(f);
    const moved = moveArticle(f);
    if (moved) forms.push(moved);
  }
  return [...new Set(forms)];
}

export interface NoIntroName {
  name: string;
  /** Text before the first ` (`, normalised. */
  key: string;
  /** Regions of the first parenthesis, e.g. `['USA', 'Europe']`. */
  regions: string[];
}

/** Parses a No-Intro name into its normalised base and region list. */
export function parseNoIntroName(name: string): NoIntroName {
  const cut = name.indexOf(' (');
  const base = cut < 0 ? name : name.slice(0, cut);
  const first = cut < 0 ? '' : (/^ \(([^)]*)\)/.exec(name.slice(cut))?.[1] ?? '');
  const regions = first
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  return { name, key: normaliseTitle(base), regions };
}

/** Dumps that are not the released game: never used for art. */
const EXCLUDED_TAGS = /\((?:[^)]*\b)?(?:Beta|Proto|Demo|Sample|Kiosk|Pirate|Unl|Aftermarket|Hack|Promo|Program|Debug|Test)\b/i;
/**
 * Later re-releases whose Libretro box art is a card, a compilation or another
 * product's box (e-Reader cards, Evercade, Switch Online, …): never used.
 */
const RERELEASE_TAGS =
  /\((?:[^)]*\b)?(?:e-Reader|Animal Crossing|Evercade|Switch|Classic Mini|Limited Run Games|Collector's Series|Collection|Arcade Archives)\b/i;

/**
 * No-Intro names whose Libretro Named_Boxarts thumbnail exists but shows
 * another product, reviewed by eye. The generator never picks them, so the
 * title keeps the placeholder instead of wrong art. `(… Virtual Console)`
 * dumps are the usual suspects: Libretro often fills them with another
 * release's box. Add a name here with the reason, then run `bun run gen:vc`.
 */
export const VC_ART_DENYLIST: ReadonlyMap<string, string> = new Map([
  [
    'Donkey Kong - Original Edition (USA, Europe) (3DS Virtual Console)',
    'shows the PAL "Donkey Kong Classics" box (Donkey Kong + Donkey Kong Jr.), another product (reviewed 2026-10-25)',
  ],
]);

/** `game ( name "…" … )` names of a No-Intro DAT. */
export function parseDatNames(dat: string): string[] {
  const out: string[] = [];
  for (const m of dat.matchAll(/^game \($([\s\S]*?)^\)/gm)) {
    const name = /^[ \t]*name "([^"]*)"[ \t]*$/m.exec(m[1] ?? '')?.[1];
    if (name) out.push(name);
  }
  return out;
}

/** Normalised base name → every usable No-Intro name with that base. */
export function indexDat(names: readonly string[]): Map<string, NoIntroName[]> {
  const index = new Map<string, NoIntroName[]>();
  for (const name of names) {
    if (EXCLUDED_TAGS.test(name) || RERELEASE_TAGS.test(name) || VC_ART_DENYLIST.has(name)) continue;
    const parsed = parseNoIntroName(name);
    if (!parsed.key || parsed.regions.length === 0) continue;
    let list = index.get(parsed.key);
    if (!list) index.set(parsed.key, (list = []));
    // Some DATs list a game twice (one block per ROM set): keep one.
    if (!list.some((n) => n.name === name)) list.push(parsed);
  }
  return index;
}

/** 0-based tier of a name for a region letter, or -1 when its region is not accepted. */
export function regionTier(regions: readonly string[], regionChar: string): number {
  const prefs = VC_REGION_PREFS[regionChar] ?? [];
  for (let i = 0; i < prefs.length; i++) {
    const want = prefs[i] ?? '';
    if (regions.length === 1 && regions[0] === want) return i * 2;
    if (regions.length > 1 && regions.includes(want)) return i * 2 + 1;
  }
  return -1;
}

function rank(n: NoIntroName, tier: number): [number, number, number, number] {
  return [tier, /Virtual Console/i.test(n.name) ? 1 : 0, /\(Rev\b/i.test(n.name) ? 1 : 0, n.name.length];
}

/**
 * Lookup keys for a VC title, best first: the base of every No-Intro name the
 * 3DS DATs give its serial (`F-Zero - Maximum Velocity (USA) (GBA) (Virtual
 * Console)` → `f-zero - maximum velocity`), then the forms of hShop's name.
 */
export function vcLookupKeys(serialNames: readonly string[], hshopName: string): string[] {
  const keys = serialNames.map((n) => parseNoIntroName(n).key).filter(Boolean);
  return [...new Set([...keys, ...titleForms(hshopName)])];
}

/**
 * No-Intro names for a VC title, best first: the first key that is an exact
 * base name of the system's DAT, its variants filtered and ordered by the
 * region letter's preferences. Empty when nothing matches exactly.
 */
export function vcCandidates(
  index: ReadonlyMap<string, readonly NoIntroName[]>,
  keys: readonly string[],
  regionChar: string,
): string[] {
  for (const form of keys) {
    const variants = index.get(form);
    if (!variants) continue;
    const ranked = variants
      .map((n) => ({ n, r: rank(n, regionTier(n.regions, regionChar)) }))
      .filter((x) => x.r[0] >= 0)
      .sort((a, b) => {
        for (let i = 0; i < a.r.length; i++) {
          const d = (a.r[i] ?? 0) - (b.r[i] ?? 0);
          if (d !== 0) return d;
        }
        return a.n.name < b.n.name ? -1 : a.n.name > b.n.name ? 1 : 0;
      });
    if (ranked.length > 0) return ranked.map((x) => x.n.name);
  }
  return [];
}

/** Stable JSON: one game code per line so diffs stay readable. */
export function serializeVcMap(map: VcMap): string {
  const lines = Object.keys(map)
    .sort()
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}
