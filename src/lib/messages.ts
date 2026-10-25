/**
 * Typed runtime messaging between the content script and the background
 * service worker. The wrappers never reject: any failure becomes an empty
 * result so the page is left exactly as it was.
 */
import { browser } from 'wxt/browser';

export type ExtMessage = { type: 'libretro:names'; serial: string } | { type: 'image:fetch'; url: string };

async function send(message: ExtMessage): Promise<unknown> {
  try {
    return await browser.runtime.sendMessage(message);
  } catch {
    return undefined;
  }
}

export async function requestLibretroNames(serial: string): Promise<string[]> {
  const res = await send({ type: 'libretro:names', serial });
  return Array.isArray(res) ? res.filter((n): n is string => typeof n === 'string') : [];
}

export async function requestImageData(url: string): Promise<string | null> {
  const res = await send({ type: 'image:fetch', url });
  return typeof res === 'string' && res.startsWith('data:image/') ? res : null;
}
