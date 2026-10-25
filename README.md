<p align="center">
  <a href="https://coverly-shelf.maecly.com/en/"><img src="design/icon/app.svg" width="96" height="96" alt="Coverly Shelf"></a>
</p>

<h1 align="center">Every game on the shelf gets its cover.</h1>

<p align="center">
  <b>Coverly Shelf</b> is a browser extension that adds box art and screenshots to 3DS title and listing pages on hShop.<br>
  Purely cosmetic: it never touches downloads or how the site works.
</p>

<p align="center">
  <b>Free</b> · <b>No account</b> · <b>Open source</b>
</p>

<p align="center">
  <a href="https://github.com/MAECLY/coverly-shelf/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/MAECLY/coverly-shelf?style=flat-square&label=release&color=0E5E6F&labelColor=1B1E1B"></a>
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-0E5E6F?style=flat-square&labelColor=1B1E1B"></a>
  <a href="#install"><img alt="Chrome, Edge and Brave" src="https://img.shields.io/badge/Chrome%20%C2%B7%20Edge%20%C2%B7%20Brave-MV3-0E5E6F?style=flat-square&labelColor=1B1E1B"></a>
  <a href="#how-it-stays-safe"><img alt="No telemetry" src="https://img.shields.io/badge/telemetry-none-0E5E6F?style=flat-square&labelColor=1B1E1B"></a>
</p>

<p align="center">
  <a href="https://coverly-shelf.maecly.com/en/"><b>Website</b></a> ·
  <a href="#install">Install</a> ·
  <a href="#how-it-stays-safe">Safety</a> ·
  <a href="#development">Development</a> ·
  <a href="https://github.com/MAECLY/coverly-roms">Coverly ROMs</a> ·
  <b>English</b> · <a href="README.es.md">Español</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/title-1814-dark-1440.png">
    <img src="docs/screenshots/title-1814-light-1440.png" width="100%" alt="The hShop page for Batman - Arkham Origins Blackgate with Coverly Shelf installed. The game's box stands to the right of the technical table, turned slightly so its spine shows, with an “Art: GameTDB” credit under it. Below the description, a Screenshots section shows two in-game captures credited to Libretro.">
  </picture>
</p>

> [!NOTE]
> **Early days, said plainly.** Coverly Shelf 0.1.0 enhances title pages
> (`/t/…`) and listing pages (`/c/…`, search results). It has been tested end
> to end in Chromium on the live site, not yet in Firefox. If a page looks wrong, an
> [issue](https://github.com/MAECLY/coverly-shelf/issues) with its URL helps a lot.

---

## What it does

**A box for every game.** On a title page, the game's cover appears next to
the technical table as a small 3D box, turned so the spine shows. It follows
hShop's own light or dark theme, and on a phone it sits above the table.

**Zoom into the cover.** Click the box, or focus it with Tab and press Enter
or Space, to see the art full size (GameTDB's high-quality scan when it
exists). Esc closes the viewer and focus goes back to the box. The plain
placeholder cover is not clickable.

**Thumbnails in every list.** Every listing page (games, updates, DLC, Virtual
Console, DSiWare, videos, extras and search results) gets a small cover at the
start of each row, in the main list and in the “Top content” list. Rows load
their art only when they scroll near the screen.

**Related content too.** On a title page, every row of the Related Content box
(its demos, update, DLC or base game) gets the same thumbnail.

**Demos, updates and DLC borrow their game's cover.** When a demo, update, DLC
or kiosk build has no art of its own, it shows the cover of the row hShop marks
as its Base Title (for example, the second Project X Zone demo shows Project X
Zone's cover). A related row only borrows art when hShop says it is the same
game; no cover is ever guessed by name.

**Screenshots, when there are any.** Under the description, a Screenshots
section shows the game's title screen and in-game captures. Click one to open
it large: the left and right arrow keys move between shots, Esc closes, and
focus stays inside the viewer until you close it.

**The right region first.** The cover comes from the game's own region
(read from its product code, for example `CTR-P-AZEE` → US), then from the
other English regions, then from Libretro's box art. DSiWare titles use
GameTDB's DS covers. If nothing is found, a
plain cover with the game's initials stands in, so the page never shows a
broken image.

**Digital-only titles too.** eShop games (`CTR-N-…`) get their cover; the
extension skips the art types that only exist for retail releases.

**Credits on the page.** Every image says where it came from
(“Art: GameTDB”, “Art: Libretro”).

**Quiet and fast.** The winning cover and the screenshot list are cached
(7 days by default), misses included, so a second visit makes no new requests
and missing art is not asked for again. Each candidate image is first checked
with a small HEAD request, so missing art is ruled out without downloading
it. At most 4 image requests run at once, and at most 2 requests to hShop
itself (only for “Top content” rows that show no product code). Expired
entries are deleted once a day, so the cache does not keep growing.

**Settings.** Click the extension's toolbar button to open its settings page
(English and Spanish). Choose how long artwork is kept: this session, 1 day,
7 days, 30 days or until you clear it. The page shows how many games are cached
and how much space they take, and **Clear cache** empties it right away (after
a confirmation).

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/lightbox-1440.png" alt="The screenshot viewer open over the page, showing the Batman title screen large with previous and next arrows and a “1 / 2” counter."></td>
    <td width="50%"><img src="docs/screenshots/title-digital-18761-1440.png" alt="The hShop page for 3D Classics Excitebike, a digital-only title, with its cover box next to the technical table."></td>
  </tr>
  <tr>
    <td align="center"><sub>The screenshot viewer</sub></td>
    <td align="center"><sub>A digital-only title (3D Classics Excitebike)</sub></td>
  </tr>
</table>

## How it stays safe

- **Cosmetic only.** It adds its own elements to the page (the cover, the
  screenshots, one thumbnail per row), each in its own shadow root, plus
  `data-hshop-enhanced` markers and, on pages with thumbnails, one small
  `<style>` that makes room for them, and nothing else. It does not read, change or click the download
  buttons, the QR code or any link. If anything fails (the page layout
  changed, an image is missing, the network is down), it removes what it
  added and the page stays exactly as it was.
- **Minimal permissions.** The manifest asks for `storage` (the cache and the
  settings) and host access to two image hosts only: `art.gametdb.com` and
  `thumbnails.libretro.com`. The content scripts run only on
  `hshop.erista.me/t/*`, `/c/*` and `/search/results*`. No `tabs`, no
  `<all_urls>`, no access to other sites. The toolbar button needs no
  permission.
- **No tracking.** No analytics, no telemetry, no account, no server of ours.
  The only requests it makes are for images on those two hosts, plus a
  title page of hShop itself for a “Top content” row that shows no product
  code. The table that
  maps product codes to Libretro names ships inside the extension.
- **Open source.** Every line is here, under the AGPL-3.0.

## Install

Coverly Shelf is not in the Chrome Web Store yet. Install it from a release:

1. Download `coverly-shelf-<version>-chrome.zip` from the
   [latest release](https://github.com/MAECLY/coverly-shelf/releases/latest)
   and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`)
   and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.
4. Open any game or list on [hShop](https://hshop.erista.me/), for example a
   page under `/t/` or `/c/`.

To update, unzip the new release over the same folder and press the reload
button on the extension's card.

## Development

You need [Bun](https://bun.sh/) 1.4 or newer and Chrome or Chromium.

```sh
bun install            # install dependencies (also runs `wxt prepare`)
bun run dev            # start Chrome with the extension loaded, with live reload
bun run check          # typecheck, unit tests (vitest + happy-dom) and a production build
bun run build          # build into .output/chrome-mv3
bun run zip            # build the release zip into .output/
bun run gen:libretro   # regenerate public/libretro-3ds.json from libretro-database
bun run gen:vc         # regenerate public/libretro-vc.json (crawls hShop's VC listings, HEADs Libretro)
bun run e2e            # build, then drive the extension on the live site with Playwright
bun run e2e:lists      # sweep every listing page with the built extension (long)
bun run e2e:options    # check the settings page and the toolbar action
bun scripts/icons.ts   # re-render public/icon/*.png from design/icon/
```

To try a build in your everyday browser: run `bun run build`, open
`chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and
pick `.output/chrome-mv3`. After a rebuild, press the reload button on the
card.

`bun run e2e` needs network access: it loads real hShop pages and real art. It
saves the screenshots in [docs/screenshots](docs/screenshots). Set
`E2E_HEADED=1` to watch it run.

Firefox builds exist (`bun run build:firefox`) but are untested and are not
ready for AMO yet.

### Architecture

```
extract  →  sources  →  resolver  →  ui
```

| Step | Files | What it does |
|---|---|---|
| **extract** | `src/lib/extract.ts`, `selectors.ts`, `lookup.ts` | Reads the title, product code, title ID and region from title pages, listing rows and Related Content rows. No product code (themes, homebrew) means nothing to do. |
| **sources** | `src/lib/sources/gametdb.ts`, `libretro.ts`, `vc-map.ts`, `public/libretro-3ds.json`, `public/libretro-vc.json` | Turns a game into ordered image URLs: GameTDB covers by region, Libretro box art, title screens and snaps by No-Intro name (Virtual Console titles from their original system). |
| **resolver** | `src/lib/resolver.ts`, `related.ts`, `probe.ts`, `queue.ts`, `cache.ts`, `settings.ts` | Tries the candidates in order (HEAD preflight first, first hit wins, 4 at a time at most), applies the base-title fallback and caches the result for the chosen time. |
| **ui** | `src/ui/*`, `src/entrypoints/{title,list}.content/`, `options/` | Draws the box, the zoom viewer, the placeholder, the gallery, the row thumbnails and the settings page, with hShop's own colour tokens. |

The background service worker (`src/entrypoints/background.ts`) answers three
messages: Libretro names for a product code, the HEAD preflight of an artwork
URL (`image:head`), and an image fetch kept for the day hShop adds a Content
Security Policy (`IMAGE_MODE` in `src/lib/config.ts`). It also opens the
settings page from the toolbar button and sweeps expired cache entries.

Every selector, colour and URL pattern the code uses is recorded in
[docs/REFERENCE.md](docs/REFERENCE.md). What still has to be checked against
the real site is listed in [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

## Credits

- [GameTDB](https://www.gametdb.com/), for the 3DS cover art.
- [Libretro](https://www.libretro.com/):
  [libretro-thumbnails](https://github.com/libretro-thumbnails/libretro-thumbnails)
  for box art, title screens and screenshots, and
  [libretro-database](https://github.com/libretro/libretro-database) for the
  No-Intro names behind them.
- [WXT](https://wxt.dev/), [Tailwind CSS](https://tailwindcss.com/),
  [Vitest](https://vitest.dev/) and [Playwright](https://playwright.dev/).

Images are loaded from their hosts at view time; the extension ships none.
Game art belongs to its owners. hShop is not affiliated with this project.
Sources, URL patterns and what was verified: [docs/REFERENCE.md](docs/REFERENCE.md).

## Licence

Coverly Shelf is free software, licensed under the
[GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`).
Copyright © 2026 Miguel Angel Esparza Calero (MAECLY).

Part of the Coverly family. Its sibling,
[Coverly ROMs](https://github.com/MAECLY/coverly-roms), fills in the missing
cover art on your handheld's SD card.

---

<p align="center">
  <sub>Made by Miguel Angel Esparza Calero · <a href="https://coverly-shelf.maecly.com/en/">coverly-shelf.maecly.com</a></sub>
</p>
