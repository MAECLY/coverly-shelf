import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

const { openSettings } = await import('../src/entrypoints/background');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toolbar action', () => {
  it('opens the settings page', () => {
    const open = vi.spyOn(fakeBrowser.runtime, 'openOptionsPage').mockResolvedValue(undefined);
    openSettings();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('never throws when the page cannot be opened', async () => {
    vi.spyOn(fakeBrowser.runtime, 'openOptionsPage').mockRejectedValue(new Error('no'));
    expect(() => openSettings()).not.toThrow();
    vi.spyOn(fakeBrowser.runtime, 'openOptionsPage').mockImplementation(() => {
      throw new Error('sync');
    });
    expect(() => openSettings()).not.toThrow();
    await Promise.resolve();
  });
});
