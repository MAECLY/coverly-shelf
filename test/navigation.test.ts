import { describe, expect, it } from 'vitest';
import { createPathWatcher } from '../src/lib/navigation';

function setup(initial = '/t/1814') {
  let committed = initial;
  const queue: (() => void)[] = [];
  const changes: string[] = [];
  const watcher = createPathWatcher({
    initialPath: initial,
    currentPath: () => committed,
    defer: (fn) => queue.push(fn),
    onChange: (p) => changes.push(p),
  });
  const flush = () => queue.splice(0).forEach((fn) => fn());
  const commit = (p: string) => {
    committed = p;
  };
  const url = (p: string) => new URL(`https://hshop.erista.me${p}`);
  return { watcher, flush, commit, changes, url };
}

describe('createPathWatcher', () => {
  it('ignores a navigation that starts but has not committed (download or full-page click)', () => {
    const { watcher, flush, changes, url } = setup();
    watcher.handle({ newUrl: url('/content/1814/download') });
    flush();
    expect(changes).toEqual([]);
    expect(watcher.path).toBe('/t/1814');
  });

  it('ignores hash-only and query-only changes', () => {
    const { watcher, flush, changes, url } = setup();
    watcher.handle({ newUrl: url('/t/1814#qr') });
    watcher.handle({ newUrl: url('/t/1814?x=1') });
    flush();
    expect(changes).toEqual([]);
  });

  it('reports a committed same-document path change once', () => {
    const { watcher, flush, commit, changes, url } = setup();
    watcher.handle({ newUrl: url('/t/98') });
    watcher.handle({ newUrl: url('/t/98') });
    commit('/t/98');
    flush();
    expect(changes).toEqual(['/t/98']);
    watcher.handle({ newUrl: url('/t/98#a') });
    flush();
    expect(changes).toEqual(['/t/98']);
  });
});
