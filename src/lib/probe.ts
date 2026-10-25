/**
 * Checks whether an artwork URL actually serves an image, and turns a winning
 * URL into something an <img> can show. The only DOM-dependent part of the
 * resolver. In `background` mode the service worker fetches the bytes and the
 * resulting data URL is memoised so a probe and the later display share one
 * request.
 */
import { IMAGE_MODE } from './config';
import { requestImageDataResult, type ImageDataResult } from './messages';
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

function loadDirect(url: string, signal?: AbortSignal): Promise<ProbeOutcome> {
  return new Promise<ProbeOutcome>((resolve) => {
    if (signal?.aborted) {
      resolve('error');
      return;
    }
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
      signal?.removeEventListener('abort', onAbort);
      img.onload = null;
      img.onerror = null;
      if (outcome !== 'hit') img.src = '';
      resolve(outcome);
    };
    const timer = setTimeout(() => finish('error'), PROBE_TIMEOUT_MS);
    // Clearing src on abort cancels the download.
    const onAbort = (): void => finish('error');
    signal?.addEventListener('abort', onAbort, { once: true });
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

export interface ProbeOptions {
  /** Aborting it skips the probe if still queued and cancels it if loading: `error`. */
  signal?: AbortSignal;
}

/** Probe `url` and say whether it is a hit, a definite miss or unknown. Runs through the shared limiter; never rejects. */
export async function probeOutcome(url: string, { signal }: ProbeOptions = {}): Promise<ProbeOutcome> {
  try {
    if (signal?.aborted) return 'error';
    if (IMAGE_MODE === 'background') {
      const res = await fetchData(url);
      if (!res.ok) return 'error';
      return res.data !== null ? 'hit' : 'miss';
    }
    return await limit(() => loadDirect(url, signal), signal);
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
