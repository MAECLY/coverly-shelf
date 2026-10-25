/**
 * Turns a resolved cover into what the UI can show. In background image mode
 * the art must become a data URL first; if that fails, the placeholder is
 * shown instead, never a broken image. Never rejects.
 */
import { displaySrc } from './probe';
import type { CoverResult } from './types';

export interface Displayable {
  result: CoverResult;
  /** Value for `<img src>`, or null for the placeholder. */
  src: string | null;
}

export async function toDisplayable(result: CoverResult): Promise<Displayable> {
  try {
    if (result.kind !== 'image') return { result, src: null };
    const src = await displaySrc(result.url);
    return src ? { result, src } : { result: { kind: 'placeholder' }, src: null };
  } catch {
    return { result: { kind: 'placeholder' }, src: null };
  }
}
