import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildLibretroMap,
  compareNames,
  countSerials,
  parseDat,
  serializeLibretroMap,
} from '../src/lib/sources/libretro-map';

const SAMPLE = `clrmamepro (
\tname "Nintendo - Nintendo 3DS (Digital)"
\tversion "2026.10.07"
)

game (
\tname "3D Classics - Excitebike (USA) (Rev 1) (eShop)"
\tdescription "3D Classics - Excitebike (USA) (Rev 1) (eShop)"
\tregion "USA"
\tserial "CTR-N-SAEE"
\trom ( name "3D Classics - Excitebike (USA) (Rev 1) (eShop).3ds" size 1 crc 0 serial "CTR-N-SAEE" )
)

game (
\tname "3D Classics - Excitebike (USA) (eShop)"
\tregion "USA"
\tserial "CTR-N-SAEE"
\trom ( name "3D Classics - Excitebike (USA) (eShop).3ds" size 1 crc 0 serial "CTR-N-SAEE" )
)

game (
\tname "Batman - Arkham Origins Blackgate (USA) (En,Fr,Es)"
\tregion "USA"
\tserial "CTR-P-AZEE"
\trom ( name "x.3ds" size 1 crc 0 serial "CTR-P-AZEE" )
)

game (
\tname "Broken Serial (USA)"
\tserial "AJ8E"
)

game (
\tname "No Serial (USA)"
\trom ( name "y.3ds" size 1 )
)

game (
\tname "Some Game (USA) (Demo)"
\tserial "KTR-P-ABCE"
)
game (
\tname "Some Game (USA) (Kiosk)"
\tserial "KTR-P-ABCE"
)
game (
\tname "Some Game (USA) (Rev 2)"
\tserial "KTR-P-ABCE"
)
game (
\tname "Some Game (USA) (En,Fr,Es,Pt,De,It)"
\tserial "KTR-P-ABCE"
)
`;

describe('libretro DAT parsing', () => {
  it('counts only game-level serial lines', () => {
    expect(countSerials(SAMPLE)).toBe(8);
    expect(countSerials('game (\n\tname "x"\n)\n')).toBe(0);
  });

  it('keeps only blocks with a valid product-code serial', () => {
    const entries = parseDat(SAMPLE);
    expect(entries.map((e) => e.serial)).toEqual([
      'CTR-N-SAEE',
      'CTR-N-SAEE',
      'CTR-P-AZEE',
      'KTR-P-ABCE',
      'KTR-P-ABCE',
      'KTR-P-ABCE',
      'KTR-P-ABCE',
    ]);
    expect(entries[2]?.name).toBe('Batman - Arkham Origins Blackgate (USA) (En,Fr,Es)');
  });

  it('ranks names best-first and caps at 3', () => {
    const map = buildLibretroMap(parseDat(SAMPLE));
    expect(Object.keys(map)).toEqual(['CTR-N-SAEE', 'CTR-P-AZEE', 'KTR-P-ABCE']);
    expect(map['CTR-N-SAEE']).toEqual([
      '3D Classics - Excitebike (USA) (eShop)',
      '3D Classics - Excitebike (USA) (Rev 1) (eShop)',
    ]);
    expect(map['KTR-P-ABCE']).toEqual([
      'Some Game (USA) (En,Fr,Es,Pt,De,It)',
      'Some Game (USA) (Rev 2)',
      'Some Game (USA) (Demo)',
    ]);
  });

  it('prefers shorter names when nothing else differs', () => {
    expect(compareNames('Game (USA)', 'Game (USA) (En,Fr)')).toBeLessThan(0);
  });

  it('serialises stably', () => {
    const json = serializeLibretroMap({ B: ['b'], A: ['a', 'c'] });
    expect(json).toBe('{\n  "A": ["a","c"],\n  "B": ["b"]\n}\n');
    expect(JSON.parse(json)).toEqual({ A: ['a', 'c'], B: ['b'] });
  });
});

describe('generated public/libretro-3ds.json', () => {
  const map = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/libretro-3ds.json'), 'utf8'),
  ) as Record<string, string[]>;

  it('maps AZEE to the Batman No-Intro name', () => {
    expect(map['CTR-P-AZEE']?.[0]).toBe('Batman - Arkham Origins Blackgate (USA) (En,Fr,Es)');
  });

  it('prefers the non-Rev Excitebike for SAEE', () => {
    expect(map['CTR-N-SAEE']?.[0]).toBe('3D Classics - Excitebike (USA) (eShop)');
  });

  it('has only valid keys and at most 3 names each', () => {
    for (const [k, v] of Object.entries(map)) {
      expect(k).toMatch(/^(CTR|KTR)-[A-Z]-[A-Z0-9]{4}$/);
      expect(v.length).toBeGreaterThan(0);
      expect(v.length).toBeLessThanOrEqual(3);
    }
  });
});
