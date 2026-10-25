/**
 * Background service worker: answers the two typed messages from
 * src/lib/messages.ts, and prunes stale cache entries at most once a day
 * when it starts (pruneCacheIfDue).
 * - `libretro:names` → No-Intro names for a serial, from the packaged map.
 * - `image:fetch`    → a data URL for an image on one of the two artwork hosts.
 *
 * It uses `sendResponse` + `return true` rather than returning a Promise, which
 * works the same in Chrome (no polyfill since WXT 0.20) and Firefox.
 */
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { pruneCacheIfDue } from '../lib/cache';
import { LIBRETRO } from '../lib/config';
import type { ExtMessage } from '../lib/messages';

/** Only these origins may be fetched on behalf of a content script. */
export const ALLOWED_IMAGE_ORIGINS: readonly string[] = [
  'https://art.gametdb.com',
  'https://thumbnails.libretro.com',
];
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export function isAllowedImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && ALLOWED_IMAGE_ORIGINS.includes(u.origin);
  } catch {
    return false;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

let mapPromise: Promise<Record<string, string[]>> | null = null;

function loadLibretroMap(): Promise<Record<string, string[]>> {
  mapPromise ??= fetch(browser.runtime.getURL(LIBRETRO.mapPath as Parameters<typeof browser.runtime.getURL>[0]))
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string[]>>) : {}))
    .catch(() => {
      mapPromise = null; // allow a retry on the next message
      return {};
    });
  return mapPromise;
}

export async function libretroNames(serial: string): Promise<string[]> {
  const map = await loadLibretroMap();
  const names = Object.hasOwn(map, serial) ? map[serial] : undefined;
  return Array.isArray(names) ? names.filter((n) => typeof n === 'string') : [];
}

export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  if (!isAllowedImageUrl(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: ctrl.signal,
    });
    if (!res.ok || !isAllowedImageUrl(res.url || url)) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!/^image\/[a-z0-9.+-]+$/.test(type)) return null;
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;
    return `data:${type};base64,${bytesToBase64(new Uint8Array(buf))}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function handleMessage(msg: unknown): Promise<unknown> | undefined {
  if (!msg || typeof msg !== 'object') return undefined;
  const m = msg as Partial<ExtMessage>;
  if (m.type === 'libretro:names' && typeof m.serial === 'string') return libretroNames(m.serial);
  if (m.type === 'image:fetch' && typeof m.url === 'string') return fetchImageAsDataUrl(m.url);
  return undefined;
}

export default defineBackground(() => {
  // Expired and old-version cache entries would otherwise stay in storage for good.
  void pruneCacheIfDue();
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Only our own extension pages and content scripts may ask.
    if (sender.id !== browser.runtime.id) return false;
    const pending = handleMessage(msg);
    if (!pending) return false;
    pending.then(sendResponse, () => sendResponse(null));
    return true;
  });
});
