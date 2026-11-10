# Chrome Web Store listing

Text for the store dashboard, in English (`en`). Copy each block into the
field named in its heading. The images for the listing are in
[images/](images/); [README.md](README.md) says which file goes in which field.

The store shows the description as plain text: line breaks are kept, Markdown
is not rendered, so the blocks below use none.

The store prints the summary right above the description, so the
description opens with its own line instead of repeating it, and names hShop
in its first sentence for search.

## Product details (Detalles del producto)

### Title (Título del paquete)

Taken from the manifest, not editable here:

```text
Coverly Shelf
```

### Summary (Resumen del paquete)

Taken from the manifest (88 of 132 characters):

```text
Box art and screenshots for 3DS game pages. Purely cosmetic: it never touches downloads.
```

### Description (Descripción)

```text
Turn hShop into a real game shelf: every 3DS game on hShop gets its cover.

Coverly Shelf adds the box art, in a 3D case, and a screenshot gallery to every 3DS title page on hShop (hshop.erista.me), and a cover thumbnail to every row of hShop's lists. Browse games, updates, DLC, Virtual Console and DSiWare by their covers instead of a wall of text.

It only changes how hShop looks. Download buttons, QR codes and links are never read, changed or clicked, and if anything goes wrong the page is left exactly as it was.

WHAT IT DOES ON HSHOP

• A box for every game. On an hShop title page, the game's cover appears next to the technical details as a small 3D box. It follows hShop's light or dark theme and fits on a phone-width window too.

• Zoom into the cover. Click the box (or press Enter on it) to see the art full size. Esc closes it.

• Thumbnails in every hShop list. Games, updates, DLC, Virtual Console, DSiWare, videos, extras and search results get a small cover at the start of each row, in the main list and in "Top content". Rows load their art only when they scroll near the screen.

• Related content too. Demos, updates and DLC listed under Related Content get thumbnails, and when one has no art of its own it shows the cover of the game hShop marks as its base title. Covers are never guessed by name.

• Screenshots, when there are any. Under the description, a Screenshots section shows the title screen and in-game captures, with a keyboard-friendly viewer.

• The right region first. The cover comes from the game's own region (US, Europe, Japan…), then the other English regions, then Libretro's box art. eShop-only titles, DSiWare and Virtual Console games are covered too. If nothing is found, a plain cover with the game's initials stands in, so the page never shows a broken image.

• Credits on the page. Every image says where it came from: "Art: GameTDB" or "Art: Libretro".

SETTINGS

Click the toolbar button to open the settings page (English and Spanish). Choose how long artwork is kept: this session, 1 day, 7 days, 30 days or until you clear it. The page shows how many games are cached and how much space they take, and Clear cache empties it right away.

QUIET AND FAST

The cover that worked is cached, misses included, so a second visit makes no new requests. Each image is checked with a small HEAD request before it is loaded, at most 4 image requests run at once, and expired entries are deleted once a day.

PRIVACY AND PERMISSIONS

• No analytics, no telemetry, no account, no server of ours.
• It stores only its cache and your settings, in the browser's own extension storage.
• Permissions: "storage", plus access to two image hosts only (art.gametdb.com and thumbnails.libretro.com).
• It runs only on hShop's title, listing and search pages (hshop.erista.me). No access to any other site.

OPEN SOURCE

Free and open source under the AGPL-3.0:
https://github.com/MAECLY/coverly-shelf

Website: https://coverly-shelf.maecly.com
Issues and feedback: https://github.com/MAECLY/coverly-shelf/issues

Coverly Shelf is an independent project. It is not affiliated with or endorsed by hShop, Nintendo, GameTDB or Libretro. Box art and screenshots belong to their respective owners and are loaded directly from GameTDB and Libretro.
```

### Category (Categoría)

**Entretenimiento** (`CATEGORY_EXTENSIONS_ENTERTAINMENT`, in the
"Estilo de vida" group). Coverly Shelf enhances browsing a game catalogue
with box art and screenshots, like the extensions that improve video or
streaming sites, which the store files under Entertainment. "Juegos" is for
extensions that are games, and "Funciones e interfaz" is for changes to
Chrome's own interface, so neither fits.

### Language (Idioma)

**Inglés – en**
