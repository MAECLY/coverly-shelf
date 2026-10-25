/**
 * Filters WXT's `wxt:locationchange` down to real, committed path changes.
 *
 * On Chrome, WXT listens to the Navigation API `navigate` event, which fires
 * when ANY navigation starts: full-page link clicks, form submits and
 * `<a download>` clicks included, before anything commits. hShop does plain
 * full-page loads, so reacting to every event would tear the UI down on each
 * outgoing click (the download button too) and rebuild it on the same page.
 *
 * The watcher only reports a change when, after the event has settled, the
 * document's committed pathname differs from the one we enhanced. Pending
 * cross-document navigations, downloads and hash/query-only changes are ignored.
 */
export interface PathWatcherOptions {
  /** The pathname the page was enhanced for. */
  initialPath: string;
  /** Reads the committed pathname (`location.pathname`). */
  currentPath: () => string;
  /** Runs a callback once the current navigation step has settled (e.g. `ctx.setTimeout(fn, 0)`). */
  defer: (fn: () => void) => void;
  /** Called with the new pathname when it really changed. */
  onChange: (path: string) => void;
}

export interface PathWatcher {
  /** Feed a `wxt:locationchange` event (only `newUrl` is read). */
  handle(event: { newUrl?: URL | null }): void;
  readonly path: string;
}

export function createPathWatcher({ initialPath, currentPath, defer, onChange }: PathWatcherOptions): PathWatcher {
  let path = initialPath;
  let pending = false;

  const check = (): void => {
    pending = false;
    const now = currentPath();
    if (now === path) return;
    path = now;
    onChange(now);
  };

  return {
    handle(event) {
      // Hash-only or query-only change on the page we already enhanced.
      if (event.newUrl && event.newUrl.pathname === path && currentPath() === path) return;
      if (pending) return;
      pending = true;
      defer(check);
    },
    get path() {
      return path;
    },
  };
}
