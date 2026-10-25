/**
 * Tiny promise limiter so the artwork hosts never see more than a handful of
 * requests at once from a single page.
 */
import { MAX_CONCURRENT_REQUESTS } from './config';

/**
 * Runs `task` once a slot is free. With a `signal`, a task still waiting when
 * the signal aborts never runs: it rejects with an `AbortError` and gives its
 * place up at once, so a torn-down page sends no queued request.
 */
export type Limiter = <T>(task: () => Promise<T>, signal?: AbortSignal) => Promise<T>;

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

export function createLimiter(max: number): Limiter {
  const cap = Math.max(1, Math.floor(max));
  let active = 0;
  const waiting: Array<() => void> = [];

  const next = (): void => {
    if (active >= cap) return;
    const start = waiting.shift();
    if (start) start();
  };

  return <T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const start = (): void => {
        signal?.removeEventListener('abort', onAbort);
        active++;
        let result: Promise<T>;
        try {
          result = Promise.resolve(task());
        } catch (error) {
          result = Promise.reject(error);
        }
        result.then(resolve, reject).finally(() => {
          active--;
          next();
        });
      };
      const onAbort = (): void => {
        const at = waiting.indexOf(start);
        if (at === -1) return;
        waiting.splice(at, 1);
        reject(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      waiting.push(start);
      next();
    });
}

/** Shared limiter for every probe and image fetch made from the page. */
export const limit: Limiter = createLimiter(MAX_CONCURRENT_REQUESTS);
