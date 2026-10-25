/**
 * Typed runtime messaging between the content script and the background
 * service worker. The wrappers never reject: any failure becomes an empty
 * result so the page is left exactly as it was.
 */
import { browser } from 'wxt/browser';

export type ExtMessage =
  | { type: 'libretro:names'; serial: string }
  | { type: 'image:fetch'; url: string }
  | { type: 'image:head'; url: string };

/** Marks a messaging failure (no service worker, closed port, invalidated context). */
const FAILED: unique symbol = Symbol('messaging-failed');

async function send(message: ExtMessage): Promise<unknown> {
  try {
    return await browser.runtime.sendMessage(message);
  } catch {
    return FAILED;
  }
}

/**
 * No-Intro names for a serial, or null when the background could not be
 * reached. Callers that cache results use this to tell a transport failure
 * apart from "Libretro has no names" (an empty array). Never rejects.
 */
export async function requestLibretroNamesResult(serial: string): Promise<string[] | null> {
  const res = await send({ type: 'libretro:names', serial });
  if (!Array.isArray(res)) return null;
  return res.filter((n): n is string => typeof n === 'string');
}

export async function requestLibretroNames(serial: string): Promise<string[]> {
  return (await requestLibretroNamesResult(serial)) ?? [];
}

/** `ok: false` = the background could not be reached; `data: null` = it answered with no image. */
export type ImageDataResult = { ok: true; data: string | null } | { ok: false };

/** Like requestImageData, but tells a messaging failure apart from a definite miss. Never rejects. */
export async function requestImageDataResult(url: string): Promise<ImageDataResult> {
  const res = await send({ type: 'image:fetch', url });
  if (res === FAILED || res === undefined) return { ok: false };
  return { ok: true, data: typeof res === 'string' && res.startsWith('data:image/') ? res : null };
}

export async function requestImageData(url: string): Promise<string | null> {
  const res = await requestImageDataResult(url);
  return res.ok ? res.data : null;
}

/** What a HEAD preflight of an artwork URL found (see src/lib/background/head.ts). */
export interface ImageHead {
  /** 2xx, `image/*`, still on an allowed origin and not declared empty. */
  ok: boolean;
  /** HTTP status; 0 when the URL was refused without a request, 408 when the host did not answer in time. */
  status: number;
  /** Bare lower-cased media type, or null when the response had none. */
  contentType: string | null;
  /** Declared Content-Length, or null when absent. */
  length: number | null;
}

function isImageHead(value: unknown): value is ImageHead {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ok === 'boolean' &&
    typeof v.status === 'number' &&
    (v.contentType === null || typeof v.contentType === 'string') &&
    (v.length === null || typeof v.length === 'number')
  );
}

/**
 * HEAD preflight of an artwork URL, done by the background. Null when there is
 * no answer (messaging failure, or the HEAD itself failed for a network
 * reason), so the caller can fall back to loading the image. Never rejects.
 */
export async function requestImageHead(url: string): Promise<ImageHead | null> {
  const res = await send({ type: 'image:head', url });
  if (!isImageHead(res)) return null;
  return { ok: res.ok, status: res.status, contentType: res.contentType, length: res.length };
}
