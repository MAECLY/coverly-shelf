# Chrome Web Store listing

Text for the store dashboard, in English (`en`). Copy each block into the
field named in its heading. The images for the listing are in
[images/](images/); [README.md](README.md) says which file goes in which field.

The store shows the description as plain text: line breaks are kept, Markdown
is not rendered, so the blocks below use none.

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
Every game on the shelf gets its cover.

Coverly Shelf adds box art and screenshots to the 3DS title and listing pages of hShop (hshop.erista.me). It is purely cosmetic: it only adds images to the page and never reads, changes or clicks downloads, QR codes or links.

WHAT IT DOES

• A box for every game. On a title page, the game's cover appears next to the technical details as a small 3D box. It follows the site's light or dark theme and fits on a phone-width window too.

• Zoom into the cover. Click the box (or press Enter on it) to see the art full size. Esc closes it.

• Thumbnails in every list. Games, updates, DLC, Virtual Console, DSiWare and search results get a small cover at the start of each row. Rows load their art only when they scroll near the screen.

• Related content too. Demos, updates and DLC listed under Related Content get thumbnails, and when one has no art of its own it shows the cover of the game the site marks as its base title. Covers are never guessed by name.

• Screenshots, when there are any. Under the description, a Screenshots section shows the title screen and in-game captures, with a keyboard-friendly viewer.

• The right region first. The cover comes from the game's own region, then the other English regions, then Libretro's box art. If nothing is found, a plain cover with the game's initials stands in, so the page never shows a broken image.

• Credits on the page. Every image says where it came from: "Art: GameTDB" or "Art: Libretro".

SETTINGS

Click the toolbar button to open the settings page (English and Spanish). Choose how long artwork is kept: this session, 1 day, 7 days, 30 days or until you clear it. The page shows how many games are cached and how much space they take, and Clear cache empties it right away.

QUIET AND FAST

The cover that worked is cached, misses included, so a second visit makes no new requests. Each image is checked with a small HEAD request before it is loaded, at most 4 image requests run at once, and expired entries are deleted once a day.

PRIVACY AND PERMISSIONS

• No analytics, no telemetry, no account, no server of ours.
• It stores only its cache and your settings, in the browser's own extension storage.
• Permissions: "storage", plus access to two image hosts only (art.gametdb.com and thumbnails.libretro.com).
• It runs only on hshop.erista.me title, listing and search pages. No access to any other site.

OPEN SOURCE

Free and open source under the AGPL-3.0:
https://github.com/MAECLY/coverly-shelf

Website: https://coverly-shelf.maecly.com
Issues and feedback: https://github.com/MAECLY/coverly-shelf/issues

Coverly Shelf is an independent project. It is not affiliated with or endorsed by hShop, Nintendo, GameTDB or Libretro. Box art and screenshots belong to their respective owners and are loaded directly from GameTDB and Libretro.
```

### Category (Categoría)

**Funciones e interfaz** (`CATEGORY_FUNCTIONALITY_AND_UI`, in the
"Personalizar Chrome" group). The extension changes how a site's pages look,
which is what this category covers. "Entretenimiento" is the alternative if
the store asks for a content category instead.

### Language (Idioma)

**Inglés – en**
