import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string): string => readFileSync(resolve(__dirname, '..', file), 'utf8');

/** Message types the background worker answers, read from its dispatcher. */
const handled = [...read('src/entrypoints/background.ts').matchAll(/m\.type === '([a-z]+:[a-z]+)'/g)].map((m) => m[1]);

describe('README architecture', () => {
  it('reads the handled messages from the background worker', () => {
    expect(handled.length).toBeGreaterThanOrEqual(4);
  });

  it.each([
    ['README.md', ['', 'one', 'two', 'three', 'four', 'five', 'six'], /answers (\w+)\s+messages/],
    ['README.es.md', ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis'], /responde a (\w+)\s+mensajes/],
  ] as const)('%s lists every message the worker answers', (file, words, pattern) => {
    const text = read(file);
    const count = pattern.exec(text)?.[1];
    expect(count).toBe(words[handled.length]);
    for (const type of handled) expect(text).toContain(`\`${type}\``);
  });
});
