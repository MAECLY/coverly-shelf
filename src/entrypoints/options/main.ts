/**
 * Options page: one "Cache" section with the retention choice, a live usage
 * readout drawn as a shelf of spines, and an inline two-step "Clear cache".
 * Every string comes from _locales via browser.i18n; the DOM is built with
 * createElement/textContent only.
 */
import { browser } from 'wxt/browser';
import { cacheUsage, clearCache, type CacheUsage } from '../../lib/cache';
import { getSettings, isRetention, setSettings, watchSettings, type Retention } from '../../lib/settings';

type MessageKey = Parameters<typeof browser.i18n.getMessage>[0];

function t(key: string, subs?: string | string[]): string {
  try {
    return browser.i18n.getMessage(key as MessageKey, subs) || '';
  } catch {
    return '';
  }
}

function uiLanguage(): string {
  try {
    return browser.i18n.getUILanguage() || 'en';
  } catch {
    return 'en';
  }
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const LABEL_KEY: Record<Retention, string> = {
  session: 'retentionSession',
  '1d': 'retention1d',
  '7d': 'retention7d',
  '30d': 'retention30d',
  forever: 'retentionForever',
};
const HINT_KEY: Record<Retention, string> = {
  session: 'retentionHintSession',
  '1d': 'retentionHint1d',
  '7d': 'retentionHint7d',
  '30d': 'retentionHint30d',
  forever: 'retentionHintForever',
};

const MAX_SPINES = 24;
const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

function localize(): void {
  const lang = uiLanguage();
  document.documentElement.lang = lang.split(/[-_]/)[0] ?? 'en';
  const title = t('optionsTitle');
  if (title) document.title = title;
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const msg = t(el.dataset.i18n ?? '');
    if (msg) el.textContent = msg;
  }
  let version = '';
  try {
    version = browser.runtime.getManifest().version;
  } catch {
    version = '';
  }
  $('version').textContent = version ? t('footerVersion', version) || `Version ${version}` : '';
}

export function formatBytes(bytes: number, lang: string): string {
  const units = ['byte', 'kilobyte', 'megabyte'] as const;
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  try {
    return new Intl.NumberFormat(lang, {
      style: 'unit',
      unit: units[i],
      unitDisplay: i === 0 ? 'long' : 'short',
      maximumFractionDigits: i === 0 ? 0 : 1,
    }).format(value);
  } catch {
    return `${Math.round(value)} ${['B', 'KB', 'MB'][i]}`;
  }
}

/** Deterministic spine shape for position `i`, so the shelf looks the same between reloads. */
function spineStyle(i: number): { w: number; h: number; c: string } {
  const n = Math.imul(i + 1, 2654435761) >>> 0;
  // Buckram shades only: the Manila plank stays the one warm accent.
  const palette = ['var(--cr-primary)', 'var(--cr-spine-3)', 'var(--cr-primary)', 'var(--cr-spine-4)'];
  return { w: 12 + (n % 4) * 3, h: 38 + ((n >>> 3) % 6) * 4, c: palette[(n >>> 7) % palette.length] ?? palette[0]! };
}

function renderShelf(usage: CacheUsage | null): void {
  const spines = $('spines');
  spines.classList.remove('is-clearing');
  spines.replaceChildren();
  const games = usage?.games ?? 0;
  if (games === 0) {
    for (let i = 0; i < 3; i += 1) {
      const ghost = document.createElement('div');
      ghost.className = 'spine is-ghost';
      ghost.style.setProperty('--h', `${40 + i * 6}px`);
      spines.append(ghost);
    }
    return;
  }
  const drawn = Math.min(games, MAX_SPINES);
  for (let i = 0; i < drawn; i += 1) {
    const s = spineStyle(i);
    const spine = document.createElement('div');
    spine.className = 'spine';
    spine.style.setProperty('--w', `${s.w}px`);
    spine.style.setProperty('--h', `${s.h}px`);
    spine.style.setProperty('--c', s.c);
    spine.style.setProperty('--i', String(drawn - i));
    spines.append(spine);
  }
  // The last book leans on the shelf, as in the Coverly Shelf mark.
  spines.lastElementChild?.classList.add('is-leaning');
  if (games > drawn) {
    const more = document.createElement('span');
    more.className = 'more';
    more.textContent = t('usageMore', String(games - drawn)) || `+${games - drawn}`;
    spines.append(more);
  }
}

let lastUsage: CacheUsage | null = null;

async function refreshUsage(): Promise<void> {
  const usage = await cacheUsage();
  lastUsage = usage;
  const lang = uiLanguage();
  const usageEl = $('usage');
  if (usage.games === 0) {
    usageEl.textContent = t('usageEmpty') || 'Nothing cached yet.';
  } else {
    const size = formatBytes(usage.bytes, lang);
    usageEl.textContent =
      usage.games === 1
        ? t('usageOne', size) || `1 game cached, ${size}`
        : t('usageMany', [new Intl.NumberFormat(lang).format(usage.games), size]) ||
          `${usage.games} games cached, ${size}`;
  }
  usageEl.dataset.bytes = String(usage.bytes);
  usageEl.dataset.entries = String(usage.entries);
  usageEl.dataset.games = String(usage.games);
  renderShelf(usage);
  const start = $<HTMLButtonElement>('clear-start');
  const empty = usage.entries === 0;
  start.disabled = empty;
  start.textContent = empty ? t('clearNothing') || 'Nothing to clear' : t('clearButton') || 'Clear cache';
}

function setStatus(text: string, error = false): void {
  const status = $('status');
  status.classList.toggle('is-error', error);
  // Clear first so the same message is announced again.
  status.textContent = '';
  requestAnimationFrame(() => {
    status.textContent = text;
  });
}

function showRetention(r: Retention): void {
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="retention"]')) {
    input.checked = input.value === r;
  }
  $('retention-hint').textContent = t(HINT_KEY[r]);
}

function wireRetention(): void {
  $('segments').addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name !== 'retention' || !isRetention(input.value)) return;
    const r = input.value;
    showRetention(r);
    void setSettings({ retention: r }).then(
      () => setStatus(t('retentionSaved', t(LABEL_KEY[r])) || 'Saved.'),
      () => setStatus(t('clearFailed'), true),
    );
  });
}

function wireClear(): void {
  const start = $<HTMLButtonElement>('clear-start');
  const confirm = $('clear-confirm');
  const yes = $<HTMLButtonElement>('clear-yes');
  const no = $<HTMLButtonElement>('clear-no');

  const close = (focusStart: boolean): void => {
    confirm.hidden = true;
    start.hidden = false;
    if (focusStart && !start.disabled) start.focus();
  };

  start.addEventListener('click', () => {
    start.hidden = true;
    confirm.hidden = false;
    setStatus('');
    no.focus();
  });
  no.addEventListener('click', () => close(true));
  confirm.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    }
  });
  yes.addEventListener('click', async () => {
    yes.disabled = true;
    try {
      const spines = $('spines');
      if (!reducedMotion() && (lastUsage?.games ?? 0) > 0) {
        spines.classList.add('is-clearing');
        await new Promise((r) => setTimeout(r, 420));
      }
      await clearCache();
      await refreshUsage();
      const after = lastUsage?.entries ?? 0;
      close(false);
      setStatus(after === 0 ? t('clearDone') || 'Cache cleared.' : t('clearFailed'), after !== 0);
      // Focus goes to the panel heading: the start button is now disabled.
      $('cache-heading').setAttribute('tabindex', '-1');
      $('cache-heading').focus();
    } catch {
      close(true);
      setStatus(t('clearFailed') || 'The cache could not be cleared.', true);
    } finally {
      yes.disabled = false;
    }
  });
}

function watchStorage(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => void refreshUsage(), 250);
  };
  try {
    browser.storage.onChanged.addListener((_changes, area) => {
      if (area === 'local' || area === 'session') schedule();
    });
  } catch {
    // no live updates
  }
  watchSettings((s) => showRetention(s.retention));
}

async function main(): Promise<void> {
  localize();
  wireRetention();
  wireClear();
  watchStorage();
  showRetention((await getSettings()).retention);
  await refreshUsage();
  document.body.dataset.ready = 'true';
}

void main();
