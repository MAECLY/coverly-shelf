/**
 * The rules every artwork URL and response must pass, shared by the background
 * fetchers (image:fetch, image:head) and the content-script probe. Pure: no
 * browser APIs, so both contexts can import it.
 */

/** Only these origins may be fetched on behalf of a content script. */
export const ALLOWED_IMAGE_ORIGINS: readonly string[] = [
  'https://art.gametdb.com',
  'https://thumbnails.libretro.com',
];

export function isAllowedImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && ALLOWED_IMAGE_ORIGINS.includes(u.origin);
  } catch {
    return false;
  }
}

/** The bare, lower-cased media type of a Content-Type header (`image/jpeg; q=1` → `image/jpeg`), or '' when absent. */
export function mediaType(header: string | null | undefined): string {
  return (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/** True for a well-formed `image/*` media type. */
export function isImageType(type: string): boolean {
  return /^image\/[a-z0-9.+-]+$/.test(type);
}
