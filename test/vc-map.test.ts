import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIBRETRO_VC_SYSTEMS, VC_CODE_LETTERS } from '../src/lib/config';
import {
  VC_LETTER_SYSTEMS,
  indexDat,
  normaliseTitle,
  parseDatNames,
  parseNoIntroName,
  regionTier,
  serializeVcMap,
  titleForms,
  vcCandidates,
  vcLookupKeys,
  vcSystemFor,
} from '../src/lib/sources/vc-map';

const NES = 'Nintendo - Nintendo Entertainment System';
const GB = 'Nintendo - Game Boy';
const GBC = 'Nintendo - Game Boy Color';
const GBA = 'Nintendo - Game Boy Advance';
const PCE = 'NEC - PC Engine - TurboGrafx 16';

const DAT = `clrmamepro (
\tname "Nintendo - Nintendo Entertainment System"
)

game (
\tname "Super Mario Bros. (World)"
\tregion "World"
\trom ( name "Super Mario Bros. (World).nes" size 1 crc 0 )
)
game (
\tname "Super Mario Bros. (World)"
\trom ( name "Super Mario Bros. (World) [alt].nes" size 1 crc 0 )
)
game (
\tname "Balloon Fight (USA)"
)
game (
\tname "Balloon Fight (Europe)"
)
game (
\tname "Balloon Fight (Europe) (Virtual Console)"
)
game (
\tname "Balloon Fight (USA) (e-Reader)"
)
game (
\tname "Balloon Fight (Japan)"
)
game (
\tname "Ice Climber (USA) (e-Reader)"
)
game (
\tname "Ice Climber (USA, Europe, Asia) (En)"
)
game (
\tname "Excitebike (Japan, USA) (En)"
)
game (
\tname "Excitebike (Japan, USA) (En) (Rev 1)"
)
game (
\tname "Excitebike (Europe)"
)
game (
\tname "Legend of Zelda, The (USA)"
)
game (
\tname "Legend of Zelda, The (USA) (Rev 1)"
)
game (
\tname "Zelda II - The Adventure of Link (USA)"
)
game (
\tname "Kid Icarus (USA, Europe)"
)
game (
\tname "Kid Icarus (Europe) (Proto)"
)
game (
\tname "Metroid (USA) (Beta)"
)
game (
\tname "Excitebike (World) (Switch Online)"
)
`;

const index = indexDat(parseDatNames(DAT));

describe('vc-map normalisation', () => {
  it('strips trademark signs, unifies quotes, collapses spaces and lower-cases', () => {
    expect(normaliseTitle('  Kid Icarus™   Of Myths ®  ©')).toBe('kid icarus of myths');
    expect(normaliseTitle('Kirby’s  Dream Land™')).toBe("kirby's dream land");
    expect(normaliseTitle('Milon´s Secret Castle')).toBe("milon's secret castle");
    expect(normaliseTitle('“Quoted”')).toBe('"quoted"');
  });

  it('builds subtitle and article forms, and nothing looser', () => {
    expect(titleForms('Zelda II: The Adventure of Link')).toEqual([
      'zelda ii: the adventure of link',
      'zelda ii - the adventure of link',
    ]);
    expect(titleForms('The Legend of Zelda™')).toEqual(['the legend of zelda', 'legend of zelda, the']);
    expect(titleForms('The Legend of Zelda - Oracle of Ages')).toContain('legend of zelda, the - oracle of ages');
    // No separator is ever invented: hShop's "Castlevania III Dracula's Curse" stays as it is.
    expect(titleForms("Castlevania III Dracula's Curse")).toEqual(["castlevania iii dracula's curse"]);
    expect(titleForms('')).toEqual([]);
  });

  it('parses a No-Intro name into base key and region list', () => {
    expect(parseNoIntroName('Mach Rider (Japan, USA) (En)')).toEqual({
      name: 'Mach Rider (Japan, USA) (En)',
      key: 'mach rider',
      regions: ['Japan', 'USA'],
    });
    expect(parseNoIntroName('No Region')).toMatchObject({ key: 'no region', regions: [] });
  });

  it('puts the serial name base before hShop name forms', () => {
    expect(vcLookupKeys(['F-Zero - Maximum Velocity (USA) (GBA) (Virtual Console)'], 'F-Zero™ Maximum Velocity')).toEqual([
      'f-zero - maximum velocity',
      'f-zero maximum velocity',
    ]);
    expect(vcLookupKeys([], 'Golf')).toEqual(['golf']);
  });
});

describe('vc-map DAT index', () => {
  it('skips betas, protos and re-releases, and de-duplicates repeated games', () => {
    expect(index.get('super mario bros.')?.map((n) => n.name)).toEqual(['Super Mario Bros. (World)']);
    expect(index.get('metroid')).toBeUndefined();
    expect(index.get('kid icarus')?.map((n) => n.name)).toEqual(['Kid Icarus (USA, Europe)']);
    expect(index.get('ice climber')?.map((n) => n.name)).toEqual(['Ice Climber (USA, Europe, Asia) (En)']);
    expect(index.get('excitebike')?.map((n) => n.name)).not.toContain('Excitebike (World) (Switch Online)');
  });
});

describe('vc-map region choice', () => {
  it('ranks a region alone, then inside a list, per preference', () => {
    expect(regionTier(['USA'], 'E')).toBe(0);
    expect(regionTier(['USA', 'Europe'], 'E')).toBe(1);
    expect(regionTier(['World'], 'E')).toBe(2);
    expect(regionTier(['Japan'], 'E')).toBe(-1);
    expect(regionTier(['Europe'], 'P')).toBe(0);
    expect(regionTier(['USA'], 'P')).toBe(-1);
    expect(regionTier(['Japan'], 'J')).toBe(0);
    expect(regionTier(['Germany'], 'D')).toBe(0);
    expect(regionTier(['Europe'], 'D')).toBe(2);
    expect(regionTier(['France'], 'F')).toBe(0);
    expect(regionTier(['USA'], 'X')).toBe(-1);
  });

  it('E → (USA), then (USA, …), then (World)', () => {
    expect(vcCandidates(index, titleForms('Balloon Fight™'), 'E')).toEqual(['Balloon Fight (USA)']);
    expect(vcCandidates(index, titleForms('Excitebike'), 'E')).toEqual([
      'Excitebike (Japan, USA) (En)',
      'Excitebike (Japan, USA) (En) (Rev 1)',
    ]);
    expect(vcCandidates(index, titleForms('Super Mario Bros.™'), 'E')).toEqual(['Super Mario Bros. (World)']);
  });

  it('P → (Europe) before its Virtual Console dump; J → (Japan)', () => {
    expect(vcCandidates(index, titleForms('Balloon Fight'), 'P')).toEqual([
      'Balloon Fight (Europe)',
      'Balloon Fight (Europe) (Virtual Console)',
    ]);
    expect(vcCandidates(index, titleForms('Balloon Fight'), 'J')).toEqual(['Balloon Fight (Japan)']);
  });

  it('prefers the unrevised dump and moves a leading "The"', () => {
    expect(vcCandidates(index, titleForms('The Legend of Zelda™'), 'E')).toEqual([
      'Legend of Zelda, The (USA)',
      'Legend of Zelda, The (USA) (Rev 1)',
    ]);
  });

  it('matches subtitles written with a colon', () => {
    expect(vcCandidates(index, titleForms('Zelda II: The Adventure of Link'), 'E')).toEqual([
      'Zelda II - The Adventure of Link (USA)',
    ]);
  });

  it('never matches a near miss or a region the letter does not accept', () => {
    expect(vcCandidates(index, titleForms('Zelda II The Adventure of Link'), 'E')).toEqual([]);
    expect(vcCandidates(index, titleForms('Super Mario Bros'), 'E')).toEqual([]);
    expect(vcCandidates(index, titleForms('Kid Icarus'), 'J')).toEqual([]);
    expect(vcCandidates(index, titleForms('Metroid'), 'E')).toEqual([]);
  });
});

describe('vc-map system', () => {
  it('takes the badge when it agrees with the code letter', () => {
    expect(vcSystemFor('RA4E', 'Game Boy')).toBe(GB);
    expect(vcSystemFor('QAZE', 'Game Boy Color')).toBe(GBC);
    expect(vcSystemFor('TAAE', 'Famicom')).toBe(NES);
    expect(vcSystemFor('PAEE', 'Game Boy Advance')).toBe(GBA);
    expect(vcSystemFor('PNDJ', 'TurboGrafx-16)')).toBe(PCE);
  });

  it('falls back to an unambiguous letter, and refuses conflicts', () => {
    expect(vcSystemFor('TAZJ', null)).toBe(NES);
    expect(vcSystemFor('PAEE', null)).toBeNull(); // GBA or PC Engine
    expect(vcSystemFor('RA4E', 'Game Boy Color')).toBeNull();
    expect(vcSystemFor('AZEE', null)).toBeNull();
  });

  it('keeps the runtime letter list in step with the generator', () => {
    expect([...VC_CODE_LETTERS].sort()).toEqual(Object.keys(VC_LETTER_SYSTEMS).sort());
  });
});

describe('public/libretro-vc.json', () => {
  const raw = readFileSync(resolve(__dirname, '../public/libretro-vc.json'), 'utf8');
  const map = JSON.parse(raw) as Record<string, { system: string; name: string }>;

  it('only holds VC game codes with a listed system and a No-Intro name', () => {
    const keys = Object.keys(map);
    expect(keys.length).toBeGreaterThan(200);
    for (const [code, entry] of Object.entries(map)) {
      expect(code).toMatch(/^[A-Z0-9]{4}$/);
      expect(VC_CODE_LETTERS).toContain(code.charAt(0));
      expect(LIBRETRO_VC_SYSTEMS as readonly string[]).toContain(entry.system);
      expect(entry.name).toMatch(/ \([^)]+\)/);
      expect(Object.keys(entry).sort()).toEqual(['name', 'system']);
    }
  });

  it('is serialised stably', () => {
    expect(serializeVcMap(map as Parameters<typeof serializeVcMap>[0])).toBe(raw);
  });

  it('keeps the exact names verified on 2026-10-25', () => {
    expect(map.PAAE).toEqual({ system: GBA, name: 'F-Zero - Maximum Velocity (USA, Europe)' });
    expect(map.TC8E).toEqual({ system: NES, name: 'Mach Rider (Japan, USA) (En)' });
  });
});
