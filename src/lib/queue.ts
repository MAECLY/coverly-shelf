/**
 * Tiny promise limiter so the artwork hosts never see more than a handful of
 * requests at once from a single page.
 */
import { MAX_CONCURRENT_REQUESTS } from './config';

export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

export function createLimiter(max: number): Limiter {
  const cap = Math.max(1, Math.floor(max));
  let active = 0;
  const waiting: Array<() => void> = [];

  const next = (): void => {
    if (active >= cap) return;
    const start = waiting.shift();
    if (start) start();
  };

  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      waiting.push(() => {
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
      });
      next();
    });
}

/** Shared limiter for every probe and image fetch made from the page. */
export const limit: Limiter = createLimiter(MAX_CONCURRENT_REQUESTS);
