/**
 * Checks whether an artwork URL actually serves an image, and turns a winning
 * URL into something an <img> can show. The only DOM-dependent part of the
 * resolver. In `background` mode the service worker fetches the bytes and the
 * resulting data URL is memoised so a probe and the later display share one
 * request.
 *
 * In `direct` mode an artwork URL is first preflighted with a HEAD request made
 * by the background (`image:head`), so 404s and non-images are discarded
 * without downloading any image bytes. Only when that HEAD gets no usable
 * answer (messaging failure, network error, a host that refuses HEAD) does the
 * probe fall back to loading the image in an <img>. HEAD and fallback share one
 * slot of the shared limiter, so the hosts still see at most 4 requests at once.
 */
import { IMAGE_MODE } from './config';
import { isAllowedImageUrl } from './image-url';
import { requestImageDataResult, requestImageHead, type ImageDataResult, type ImageHead } from './messages';
import { limit } from './queue';

const PROBE_TIMEOUT_MS = 10_000;

/**
 * What a probe found out:
 * - `hit`: the URL serves a non-empty image;
 * - `miss`: a definite answer that it does not (load error, 404, empty image);
 * - `error`: no answer (timeout, messaging failure). Not worth caching as a miss.
 */
export type ProbeOutcome = 'hit' | 'miss' | 'error';

/** Background mode only: url → data URL (or null) from the service worker. */
const dataUrls = new Map<string, Promise<ImageDataResult>>();

function fetchData(url: string): Promise<ImageDataResult> {
  let pending = dataUrls.get(url);
  if (!pending) {
    pending = limit(() => requestImageDataResult(url)).catch((): ImageDataResult => ({ ok: false }));
    dataUrls.set(url, pending);
    // A transport failure is not remembered: a later call may reach the worker.
    void pending.then((res) => {
      if (!res.ok && dataUrls.get(url) === pending) dataUrls.delete(url);
    });
  }
  return pending;
}

function loadDirect(url: string): Promise<ProbeOutcome> {
  return new Promise<ProbeOutcome>((resolve) => {
    let img: HTMLImageElement;
    try {
      img = new Image();
    } catch {
      resolve('error');
      return;
    }
    let done = false;
    const finish = (outcome: ProbeOutcome): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      if (outcome !== 'hit') img.src = '';
      resolve(outcome);
    };
    const timer = setTimeout(() => finish('error'), PROBE_TIMEOUT_MS);
    img.onload = () => finish(img.naturalWidth > 0 ? 'hit' : 'miss');
    img.onerror = () => finish('miss');
    try {
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.src = url;
    } catch {
      finish('error');
    }
  });
}

/**
 * Turns a HEAD preflight into a probe outcome, or `fallback` when it says
 * nothing and the image itself must be loaded:
 * - no answer, a refused request (status 0) or a host without HEAD (405/501) → `fallback`;
 * - an `ok` answer (2xx `image/*` on an allowed origin) → `hit`;
 * - a timeout, rate limit or server error (408/429/5xx) → `error`, so it is not cached as a miss;
 * - anything else (404, 200 text/html, off-host redirect, empty body) → `miss`.
 */
export function headVerdict(head: ImageHead | null): ProbeOutcome | 'fallback' {
  if (!head || head.status === 0 || head.status === 405 || head.status === 501) return 'fallback';
  if (head.ok) return 'hit';
  if (head.status === 408 || head.status === 429 || head.status >= 500) return 'error';
  return 'miss';
}

/** Direct mode: HEAD preflight through the background, <img> load only when it gives no answer. */
async function probeDirect(url: string): Promise<ProbeOutcome> {
  if (!isAllowedImageUrl(url)) return loadDirect(url);
  const verdict = headVerdict(await requestImageHead(url).catch(() => null));
  return verdict === 'fallback' ? loadDirect(url) : verdict;
}

/** Probe `url` and say whether it is a hit, a definite miss or unknown. Runs through the shared limiter; never rejects. */
export async function probeOutcome(url: string): Promise<ProbeOutcome> {
  try {
    if (IMAGE_MODE === 'background') {
      const res = await fetchData(url);
      if (!res.ok) return 'error';
      return res.data !== null ? 'hit' : 'miss';
    }
    return await limit(() => probeDirect(url));
  } catch {
    return 'error';
  }
}

/** True when `url` loads as a non-empty image. Runs through the shared limiter; never rejects. */
export async function probeImage(url: string): Promise<boolean> {
  return (await probeOutcome(url)) === 'hit';
}

/** The value to put in `img.src` for `url`, or null when it cannot be shown. Never rejects. */
export async function displaySrc(url: string): Promise<string | null> {
  try {
    if (IMAGE_MODE === 'background') {
      const res = await fetchData(url);
      return res.ok ? res.data : null;
    }
    return url;
  } catch {
    return null;
  }
}
