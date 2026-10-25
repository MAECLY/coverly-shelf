import { describe, expect, it } from 'vitest';
import { createLimiter } from '../src/lib/queue';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('createLimiter', () => {
  it('never runs more than max tasks at once', async () => {
    const run = createLimiter(4);
    let inFlight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 10 }, (_, i) =>
      run(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5 + (i % 3) * 3));
        inFlight--;
        return i;
      }),
    );
    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(peak).toBe(4);
    expect(inFlight).toBe(0);
  });

  it('starts queued tasks only when a slot frees up', async () => {
    const run = createLimiter(2);
    const releases: Array<() => void> = [];
    const started: number[] = [];
    const all = [0, 1, 2].map((i) =>
      run(
        () =>
          new Promise<void>((r) => {
            started.push(i);
            releases.push(r);
          }),
      ),
    );
    await tick();
    expect(started).toEqual([0, 1]);
    releases[0]!();
    await tick();
    expect(started).toEqual([0, 1, 2]);
    releases[1]!();
    releases[2]!();
    await Promise.all(all);
  });

  it('frees the slot when a task rejects or throws synchronously', async () => {
    const run = createLimiter(1);
    await expect(run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(
      run(() => {
        throw new Error('sync');
      }),
    ).rejects.toThrow('sync');
    await expect(run(async () => 'ok')).resolves.toBe('ok');
  });
});
