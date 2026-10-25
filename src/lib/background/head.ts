/**
 * Background side of the image preflight (`image:head`): a HEAD request to an
 * allow-listed artwork host, so the page can discard 404s and non-images
 * without downloading a single image byte.
 *
 * Same rules as `image:fetch`: https only, the two artwork origins only (also
 * after redirects), no cookies, no referrer, `image/*` responses only.
 */
import { isAllowedImageUrl, isImageType, mediaType } from '../image-url';
import type { ImageHead } from '../messages';

const HEAD_TIMEOUT_MS = 8_000;

/** Parses a Content-Length header; null when absent or not a plain integer. */
function contentLength(header: string | null): number | null {
  if (header === null || !/^\s*\d+\s*$/.test(header)) return null;
  const n = Number(header);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * HEAD `url` and describe the answer. `ok` is true only for a 2xx `image/*`
 * response that ended on an allowed origin and does not declare an empty body.
 * A URL outside the allow-list is answered `{ ok: false, status: 0 }` without
 * any request. Returns null when there was no answer (network error, timeout),
 * so the caller can fall back to another probe. Never rejects.
 */
export async function headImage(url: string): Promise<ImageHead | null> {
  if (!isAllowedImageUrl(url)) return { ok: false, status: 0, contentType: null, length: null };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: ctrl.signal,
    });
    const type = mediaType(res.headers.get('content-type'));
    const length = contentLength(res.headers.get('content-length'));
    const ok = res.ok && isAllowedImageUrl(res.url || url) && isImageType(type) && length !== 0;
    return { ok, status: res.status, contentType: type || null, length };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
