/**
 * Checks whether an artwork URL actually serves an image, and turns a winning
 * URL into something an <img> can show. The only DOM-dependent part of the
 * resolver. In `background` mode the service worker fetches the bytes and the
 * resulting data URL is memoised so a probe and the later display share one
 * request.
 */
import { IMAGE_MODE } from './config';
import { requestImageData } from './messages';
import { limit } from './queue';

const PROBE_TIMEOUT_MS = 10_000;

/** Background mode only: url → data URL (or null) from the service worker. */
const dataUrls = new Map<string, Promise<string | null>>();

function fetchData(url: string): Promise<string | null> {
  let pending = dataUrls.get(url);
  if (!pending) {
    pending = limit(() => requestImageData(url)).catch(() => null);
    dataUrls.set(url, pending);
  }
  return pending;
}

function loadDirect(url: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let img: HTMLImageElement;
    try {
      img = new Image();
    } catch {
      resolve(false);
      return;
    }
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      if (!ok) img.src = '';
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
    img.onload = () => finish(img.naturalWidth > 0);
    img.onerror = () => finish(false);
    try {
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.src = url;
    } catch {
      finish(false);
    }
  });
}

/** True when `url` loads as a non-empty image. Runs through the shared limiter; never rejects. */
export async function probeImage(url: string): Promise<boolean> {
  try {
    if (IMAGE_MODE === 'background') return (await fetchData(url)) !== null;
    return await limit(() => loadDirect(url));
  } catch {
    return false;
  }
}

/** The value to put in `img.src` for `url`, or null when it cannot be shown. Never rejects. */
export async function displaySrc(url: string): Promise<string | null> {
  try {
    if (IMAGE_MODE === 'background') return await fetchData(url);
    return url;
  } catch {
    return null;
  }
}
