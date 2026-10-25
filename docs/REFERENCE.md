# Reference material

Everything the code relies on about hShop, GameTDB and Libretro, as observed on
2026-10-25. Nothing in `src/` may use a selector, colour, font or URL pattern
that is not recorded here. When something is missing, the code says so with a
`TODO(reference)` comment.

## hShop (`https://hshop.erista.me`)

- Server-rendered HTML ("hShop site v3", assets `?v=2.10`). Navigation is plain
  full-page loads, not a SPA. The content script still listens for
  `wxt:locationchange` in case that changes.
- **CSP: none.** Neither `/` nor `/t/{id}` sends a `content-security-policy`
  header or `<meta http-equiv>`, so `<img>` tags pointing at external hosts load
  directly. The background fetch path exists only as a fallback (see
  `IMAGE_MODE` in `src/lib/config.ts`).
- The title page does **not** show a title icon, so the "hShop icon" step in the
  cover chain never fires today. Theme pages show a preview image
  (`.theme-preview img`), but they have no valid product code and are skipped.

### Fixtures

`test/fixtures/hshop/` holds verbatim copies (download links and tokens
redacted) of:

| File | Page | Product code |
|---|---|---|
| `title-retail-us-1814.html` | `/t/1814` Batman - Arkham Origins Blackgate | `CTR-P-AZEE` |
| `title-retail-eu-98.html` | `/t/98` same game, Europe | `CTR-P-AZEP` |
| `title-digital-us-18761.html` | `/t/18761` 3D Classics Excitebike | `CTR-N-SAEE` |
| `title-theme-15834.html` | `/t/15834` a theme | `CTR-N-THEME` (not a game code: the regex rejects it) |
| `list-games-north-america.html` | `/c/games/s/north-america` | 25 rows |
| `lists/*.html` | every listing variant, see "Listing pages" | |
| `css/*.css` | `dark`, `light`, `main`, `list`, `landing`, `sectioned` | |

### Title page structure (`/t/{id}`)

```html
<div class="sectioned-container">
  <div class="sectioned sectioned-autofit">
    <div class="landing sectioned-l">            <!-- display:flex; column -->
      <div class="title-name">
        <h2 class="green bold nospace">Batman - Arkham Origins Blackgate</h2>
        <h3 class="nospace">content in <a href="/c/games">games</a> ➞ <a href="/c/games/s/north-america">north-america</a></h3>
      </div>
      <div class="basic-meta">                    <!-- display:block -->
        <p>ID: <span class="green">1814</span></p>
        <p>Title ID: <span class="blue">00040000000D6B00</span></p>
        <p>Version: <span class="red">0.0.0 (0)</span></p>
        <p>Size: <span class="yellow">688.93 MiB, 5511 ⊡</span></p>
        <p>Product Code: <span class="pink">CTR-P-AZEE</span></p>
        ...
      </div>
      <div class="extended-meta">
        <div class="extended-meta-entry">
          <h3 class="bold">Description:</h3>
          <div class="description-container"><p>…</p></div>
        </div>
        <!-- optional: "Additional information", theme preview -->
      </div>
    </div>
    <div class="landing sectioned-r">…download box…</div>
  </div>
</div>
```

Layout facts that matter for injection:

- `.landing.sectioned-l` is a flex column, so a floated direct child is ignored.
  `.basic-meta` is a normal block, so a floated first child inside it works.
- `.sectioned` turns into a column under `max-width: 1200px` (hShop's own
  breakpoint).

### Listing pages (`/c/*`, `/search/results`)

Surveyed 2026-10-25: the 8 category roots, the first page of all 81
subcategories they link to, and one search results page. Fixtures (verbatim:
listing pages carry no download links, tokens or nonces) live in
`test/fixtures/hshop/lists/`:

| File | URL | Main list | Top list | Why it is kept |
|---|---|---|---|---|
| `category-root-games.html` | `/c/games` | 19 subcategory rows | 50 | root variant (rows link to `/c/…/s/…`) |
| `games-japan.html` | `/c/games/s/japan` | 25 | 50 | "Also known as" `<h4>`, badge `.meta` inside `.base-info` |
| `games-digital-demos.html` | `/c/games/s/digital-demos` | 25 | 50 | `CTR-T-` demo codes |
| `dlc-north-america.html` | `/c/dlc/s/north-america` | 25 | 50 | `CTR-M-XXXX-00` DLC codes |
| `dsiware-north-america.html` | `/c/dsiware/s/north-america` | 25 | 50 | `TWL-N-` codes, Title ID `00048004…` |
| `virtual-console-north-america.html` | `/c/virtual-console/s/north-america` | 25 | 50 | VC badges, `KTR-N-` codes |
| `themes-north-america.html` | `/c/themes/s/north-america` | 25 | 50 | `CTR-N-THEME` (no art) |
| `updates-europe.html` | `/c/updates/s/europe` | 25 | 50 | `CTR-U-`/`KTR-U-` update codes |
| `extras-hb.html` | `/c/extras/s/hb` | 25 | 42 | free-form, non-Nintendo "codes" |
| `search-mario.html` | `/search/results?q=mario&qt=Text` | 25 | — | search variant: `.list` without `pre-top`, no top list, mixed categories |

The older `list-games-north-america.html` is the plain subcategory variant.

#### URLs

- Category roots: `/c/{category}` with `games`, `updates`, `dlc`,
  `virtual-console`, `dsiware`, `videos`, `extras`, `themes`.
- Subcategories: `/c/{category}/s/{slug}`. Slugs seen: regions
  (`north-america`, `europe`, `japan`, `korea`, `taiwan`, `china`, `australia`,
  `canada`, `france`, `germany`, `italy`, `spain`, `netherlands`, `russia`,
  `united-kingdom`, `world`, `unknown-other`) plus non-regions
  (`digital-demos`, `kiosk-demos`, `demo-updates`, `custom-dsiware`,
  `devapps-misc`, `hb`, `rom-hacks`, `translated-games`). A slug is **not**
  always a region, so a row's region must come from its product code first.
- Pagination: plain links `?count={10|25|50|100}&offset=N` ("show next 25").
  Sort (`#sort-method-sel`, `#sort-order-sel`) and count (`#countsel1`,
  `#countsel2`) are `<select>`s handled by `/js/scat-list.min.js` and
  `/js/paged.min.js`; every change is a full page load.
- Search: the form `#normal-form` is `GET /search/results` with `q` and `qt`
  (`Text`, `TitleID`, `ProductCode`, `UniqueID`); `/js/search.min.js` adds
  include/exclude filters as `i` / `e`. Results paginate with the same
  `count`/`offset` links.

#### Page structure

Subcategory page (`/c/{cat}/s/{slug}`):

```html
<div class="sortsel-container">…two <select>…</div>
<div class="list-container">
  <div class="list pre-top">
    <div class="next-container">showing 1 - 25 of 1560 … pagination…</div>
    <div class="elements">  a.list-entry × N (≤ count)  </div>
    <div class="next-container">…</div>
  </div>
</div>
<h2 class="align-center nospace">Top content in this subcategory:</h2>
<div class="list-container">
  <div class="list top-list">
    <div class="elements">  a.list-entry × min(50, titles)  </div>
  </div>
</div>
```

- Category root (`/c/{cat}`): same two lists, but the `.list.pre-top` rows are
  **subcategories** (`href="/c/{cat}/s/{slug}"`, meta = Size / Titles /
  Official / Legit / Downloads, `h3` without `nospace`). They are not titles and
  must be skipped. The top list holds 50 title rows (`/t/{id}`).
- Search results: one `.list` (classes exactly `list`, no `pre-top`), no
  top list, rows identical to subcategory rows. Rows mix categories
  (games, updates, VC, DSiWare, themes, …).
- Every subcategory page has both lists, even with 1 title. Top list size =
  `min(50, titles in subcategory)`, so it repeats rows of the main list on
  small subcategories.

Selectors that hold across all 90 pages:

| What | Selector |
|---|---|
| Main list rows (subcategory) | `.list.pre-top > .elements > a.list-entry[href^="/t/"]` |
| Main list rows (search) | `.list:not(.top-list) > .elements > a.list-entry[href^="/t/"]` |
| Top list rows | `.list.top-list > .elements > a.list-entry[href^="/t/"]` |
| Any title row | `a.list-entry[href^="/t/"]` (excludes subcategory rows on roots) |
| Row classes | always exactly `list-entry block-link` (3398 rows checked) |

#### Main-list title row (subcategory and search)

```html
<a href="/t/19093" class="list-entry block-link">
  <div class="base-info">
    <h3 class="green bold nospace">マリオカート７</h3>
    <!-- optional: romanized name, before the breadcrumb -->
    <h4>Also known as: <span class="green">Mariokāto 7</span> (+<span class="green bold">1</span> other names)</h4>
    <h4>content in <span class="green bold">games</span> ➞ <span class="green bold">japan</span></h4>
    <!-- optional: badge box, one .meta-content per flag, single span -->
    <div class="meta">
      <div class="meta-content"><span class="green bold">Virtual Console: <span class="yellow bold">Game Boy Color</span></span></div>
    </div>
  </div>
  <div class="meta">
    <div class="meta-content"><span class="green bold">19093</span><span>ID</span></div>
    <div class="meta-content"><span class="green bold">Pirate Legit</span><span>Content Type</span></div>
    <div class="meta-content"><span class="blue bold">0004000000030600</span><span>Title ID</span></div>
    <div class="meta-content hover-meta">
      <span class="yellow bold hover-default">632.78 MiB</span><span class="yellow bold hover-on">5062 ⊡</span><span>Size</span>
    </div>
    <div class="meta-content"><span class="red bold">2.4.0 (2112)</span><span>Version</span></div>
    <div class="meta-content"><span class="pink bold">CTR-P-AMKJ</span><span>Product Code</span></div>
  </div>
</a>
```

- The outer `.meta` always has the same six entries in this order: ID,
  Content Type (`Standard`, `Pirate Legit`, `Legit`), Title ID, Size
  (`hover-meta`), Version, Product Code. 1089/1089 main-list rows have both a
  Title ID and a Product Code.
- Read values by label: the **last** `<span>` of a `.meta-content` is the
  label, the first is the value. Use
  `:scope > .meta > .meta-content` (direct child of the row). The current
  `SELECTORS.list.metaContent` (`.meta > .meta-content`) also matches the
  badge box inside `.base-info`, whose entries have a single span and no label.
- Variants inside `.base-info` (counts over the 81 subcategory pages):
  plain (65 pages), badge `.meta` (31: "Physical release only",
  "Installer application", "May require locale emulation", "Compatible only
  with New 3DS systems", "Virtual Console: {system}"), "Also known as" `<h4>`
  (8 pages, nearly every Japanese row), both (4). The breadcrumb `<h4>` is
  therefore **not** always the first `h4`; find it by text `content in` or take
  the last `h4`.
- The name is `.base-info > h3` text (HTML entities, often Japanese/Chinese
  script). The romanized "Also known as" name is the first `span.green` of the
  `h4` that starts with `Also known as:` (a possible name-search key for
  Japanese rows; not verified against Libretro).

#### Top-list row

```html
<a href="/t/989" class="list-entry block-link">
  <div class="base-info">
    <h3>1. <span class="green bold">ブレイブリーデフォルト - フォーザ・シークウェル</span></h3>
    <h4>Also known as: <span class="green">Bureiburīdeforuto - fōza shīkuu~eru</span></h4>  <!-- optional -->
  </div>
  <div class="meta">
    <div class="meta-content"><span class="yellow bold">257171</span><span>Downloads</span></div>
  </div>
</a>
```

- No product code, Title ID, breadcrumb or ID: the only identity is the
  `/t/{id}` in `href`. The name is `h3 > span.green` (the `h3` text starts with
  the rank `N. `). To resolve art, either reuse a main-list row with the same
  `href` on the same page, or cache `/t/{id}` → product code from earlier
  visits; fetching the title page per row is a site request and should not be
  done in bulk.
- The top list is a scroll box: `max-height: 500px; overflow: scroll` (see
  layout below), so lazy loading must observe intersection with that box
  (an `IntersectionObserver` with `root: null` already accounts for the
  clipping ancestor).

#### Product codes per category

Format is `{platform}-{distribution}-{gameCode}`; the game code's 4th
character is the region letter. Observed on the first page of every
subcategory:

| Category | Platform-distribution | Title ID high | Notes |
|---|---|---|---|
| games | `CTR-P` retail, `CTR-N` / `KTR-N` digital, `KTR-P` New 3DS retail | `00040000`, `00040002` (demos) | `digital-demos` = `CTR-T`, `kiosk-demos` = `CTR-B` (+2 `CTR-H`) |
| updates | `CTR-U`, `KTR-U` | `0004000E` | game code = the base game's |
| dlc | `CTR-M-XXXX-NN` (`KTR-M-…-00` too) | `0004008C` | **5th segment** (`-00`, `-01`, `-02`); `XXXX` = base game code (e.g. `CTR-M-BYGE-00` ↔ game `BYGE`) |
| virtual-console | `CTR-N`, `KTR-N`; `world` mixes in `CTR-P` | `00040000` | system in a badge ("Virtual Console: Game Boy Color") |
| dsiware | `TWL-N` only (all 124 rows) | `00048004` | GameTDB `ds/` folder, not `3ds/` |
| videos | `CTR-N` only | `00040000` | |
| themes | `CTR-N-THEME` on every row | `00040000` | not a game code; no art |
| extras | mostly `CTR-P`/`CTR-N`/`CTR-U`/`KTR-*`, plus free text | mixed | seen: `DevMenu 2x`, `DrawAttack`, `CTR-HB-PICK`, `CTR-Vid`, `CTR-P-BBB`, `CTR-N-PICROSS-S`, `MOD-P-BT8J`, `MOD-M-BT8J-00`, `MC-N3DS-FRII-DLC`, `homuhomu`, `code` |
| search | anything above | | |

Region letters seen per subcategory (main list): north-america `E` (one
DSiWare `O`); europe `P` plus `D`/`I`/`V`/`Y`/`Z`; japan `J`; korea `K`
(+`Y`/`Z`); taiwan `W`/`Z`; china `C`/`W`; australia `U`/`Z`; canada `Z`;
france `F`; germany `D`; italy `I`/`V`; spain `S`/`X`; netherlands `H`;
russia `R`; united-kingdom `X`; world `A`; unknown-other `A`/`T`/`X`/`Y`/`Z`.

Parsing consequences (for `src/lib/extract.ts`):

- The current `PRODUCT_CODE_RE` (`\b(CTR|KTR)-([A-Z])-([A-Z0-9]{4})\b`)
  already parses DLC as its base game (`CTR-M-BYGE-00` → `BYGE`), rejects
  `CTR-N-THEME` (no word boundary after `THEM`), rejects `TWL-*`, and rejects
  `CTR-P-BBB`, `MOD-*`, free text. Keep the trailing `\b`: a pattern without it
  turns `CTR-N-THEME` into game code `THEM`.
- DSiWare needs `TWL` added plus the GameTDB `ds` platform folder.

#### Layout of `a.list-entry` (from `list.css` and `main.css`, `?v=2.10`)

Global: `* { box-sizing: border-box }`; `a { text-decoration: none }`;
`a.block-link { font-size: initial !important }`; `h3 { margin: 0 0 8px }`,
`h4 { margin: 0 0 6px }`, `.nospace { margin: 0 !important; padding: 0 !important }`.
Subcategory pages also load `scat-list.css` (only `.sortsel-container`,
`.sel-container`), search loads `search-results.css` (only `.edit-query*`);
neither touches rows.

Desktop (> 1200px):

- `.list`: flex column, `width: 80%` (`.list.full` 100%), `padding: 10px`,
  `border-radius: 15px`, `background: var(--clevel-1)`.
  `.list.top-list`: `max-height: 500px !important; overflow: scroll;
  overflow-x: hidden`.
- `.elements`: flex column.
- `.list-entry`: `display: flex; flex-wrap: wrap; justify-content:
  space-between; width: 100%; padding: 10px; border-radius: 10px;
  margin-bottom: 10px` (0 on `:last-of-type`); background `--clevel-2`,
  `--clevel-2-hover` on hover; `transition: var(--fade)`.
- `.base-info`: flex column, `width: 50%`, `padding: 5px 10px 5px 5px`.
  A nested `.base-info > .meta` is `flex-direction: column; flex: 1 !important;
  justify-content: flex-end`; its entries get `margin: 0 0 10px` (last 0).
- `.list-entry > .meta`: `display: flex; flex-wrap: wrap; width: 50%;
  padding-left: 10px; align-self: flex-end`.
- `.meta-content`: `inline-flex` column, centred, `flex: 1 0 25%`,
  `padding: 5px; margin: 5px; border-radius: 5px`, background `--clevel-1`;
  spans `white-space: nowrap`, value `font-size: var(--basic-font-size)`,
  label `0.85em`.

Mobile (`max-width: 1200px`, the only breakpoint that touches lists; the
`max-height: 500px` query only unpins header/footer):

- `.list { width: 100% }`; `.list-entry { flex-direction: column }`;
  `.list-entry > .meta, .base-info { width: 100% }`; `.list-entry > .meta
  { padding: 0 }`; `.base-info { padding: 5px }`; `.next-container` becomes a
  column. `main` padding becomes `65px var(--half-spacing)`.

Where a thumbnail fits without breaking the row:

- The two children are 50% + 50% of a wrapping flex row. Any extra
  **in-flow child of `a.list-entry`** overflows the line: on desktop it pushes
  `.meta` (or itself) onto a new line. A thumbnail inserted there must come
  with a width cut on `.base-info` from the extension's own stylesheet, e.g.
  host `flex: 0 0 W` and `.base-info { width: calc(50% - W - gap) }`, scoped to
  rows carrying the enhanced attribute so nothing changes when the extension
  is absent or fails.
- `.base-info` is a flex column, so a `float` inside it is ignored (same trap
  as `.landing.sectioned-l`). A thumbnail as first child of `.base-info` sits
  **above** the `h3`, which costs row height but needs no width math.
- Least invasive placement: a host as first child of `a.list-entry`, styled
  `flex: 0 0 W; align-self: center` plus the `.base-info` width cut above on
  desktop; under 1200px the row is a column, so the host stacks above
  `.base-info` (use `align-self: flex-start` and a smaller W there, or switch
  the row to `flex-direction: row; flex-wrap: wrap` only for the header part).
- The host is inside an `<a>`: clicks on it navigate to `/t/{id}`. Do not stop
  propagation; do not put interactive elements in it.
- Top-list rows are short (one `h3`, sometimes one `h4`, and a single
  Downloads chip), inside a 500px scroll box: keep the thumbnail there small
  (≈ row height, 48–64px tall) so the box still shows several rows.
- Main-list row height is driven by the wrapped meta chips (`flex: 1 0 25%`
  plus margins fits three per line, so six chips make two lines on desktop).
  TODO(reference): measure the rendered row height before choosing the
  thumbnail height; covers are ≈ 1.11 wider than tall.

### Design tokens

Colour tokens are custom properties on **`body.dark-mode`** and
**`body.light-mode`** (not `:root`). Custom properties inherit through the
shadow boundary, so the shadow root can use `var(--green)` and follows the
user's light/dark toggle automatically.

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#1c2020` | `#ececec` |
| `--bw` / `--wb` | `black` / `white` | `white` / `black` |
| `--clevel-1` (cards) | `#373737` | `#cecece` |
| `--clevel-1-hover` | `#404040` | `#b0b0b0` |
| `--clevel-2` (list rows) | `#535353` | `#eee` |
| `--clevel-2-hover` | `#717171` | `white` |
| `--clevel-3` | `#202020` | `#9f9f9f` |
| `--green` | `#3fff4f` | `#036011` |
| `--yellow` | `#ffe300` | `#605503` |
| `--blue` | `#00f3ff` | `#00595e` |
| `--red` | `#ff8e8e` | `#7d0101` |
| `--pink` | `#ff66fd` | `#80267e` |
| `--orange` | `#ff8800` | `#f95b0e` |

On `:root` (`main.css`): `--main-spacing: 25px`, `--half-spacing`,
`--quarter-spacing`, `--basic-font-size: 1.15em`, `--fade: background-color 0.5s ease`.

- Font: `font-family: "Nunito", sans-serif`, loaded by hShop with `@font-face`
  (weights 900, bold/800, 700…). The shadow root inherits it; it must not
  declare its own `@font-face`.
- Radii: cards `10px` (`.sectioned-l/r`, `.list-entry`), list `15px`,
  buttons `5px`, small elements `4px`/`8px`.
- Shadows: hShop uses none. TODO(reference): the 3D box shadow is our own,
  built from `--bw` with low alpha.
- `theme-color` meta: `#18ff00`.

## GameTDB (`https://art.gametdb.com/3ds/{type}/{region}/{gameCode}.{ext}`)

Probed with `AZEE` (retail), `AREE` (retail), `SAEE` (digital, `N`):

| Type | Ext | Size seen | AZEE | AREE | SAEE (N) |
|---|---|---|---|---|---|
| `cover` | jpg | 160×144 | ✓ | ✓ | ✓ |
| `coverM` | jpg | — | ✓ | ✓ | ✓ |
| `coverHQ` | jpg | 768×680 | ✓ | ✓ | ✓ |
| `coverfull` | jpg | 340×144 (front+back+spine) | ✓ | ✓ | ✗ |
| `coverfullHQ` | jpg | — | ✓ | ✓ | ✗ |
| `box` | png | 240×216, flat front inside a case outline | ✓ | ✓ | ✓ |
| `cart` | png | — | ✗ | ✓ | ✗ |
| `box3D`, `3D`, `disc` | — | — | ✗ | ✗ | ✗ |

- There is **no rendered 3D box** for 3DS; the 3D effect is pure CSS.
- `coverfull*` and `cart` are retail-only; they are skipped when the
  distribution letter is `N`.
- Regions verified: `US` (AZEE), `EN` (AZEP, and the New 3DS `KTR-P-CFMP`),
  `JA` (BZLJ). `JCPJ` (digital, JA) returned 404, so misses are normal.
- European language letters (cover probes, 2026-10-25): every `D`/`F`/`S`/`I`/`H`
  code tried exists under `EN` (e.g. AD3F, AKKS, AL8I, AKKH). Some also have a
  localized cover: `DE` for `D` (AA3D, ADPD, AF2D, AF8D, AFJD) and `IT` for `I`
  (AE2I, AEEI, AKKI, AWTI). `FR`, `ES` and `NL` had no hit for `F`/`S`/`H`
  codes, so those map to `EN`. `R` (APNR) returned 404 in `RU` and `EN`;
  `U`/`C`/`W`/`Z` remain unverified.
- 404 for missing art, `Cache-Control: max-age=2592000`, no CORS headers (fine
  for `<img>`, not readable with `fetch` from the page).
- Cover ratio: 160/144 ≈ 1.11, 768/680 ≈ 1.13 — wider than tall.

## Libretro

- Thumbnails: `https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%203DS/{Named_Boxarts|Named_Snaps|Named_Titles}/{name}.png`.
  Verified 200 for all three with
  `Batman - Arkham Origins Blackgate (USA) (En,Fr,Es)`.
- Names come from libretro-database's No-Intro metadat, which **does** carry
  serials (`serial "CTR-P-AZEE"`):
  - `metadat/no-intro/Nintendo - Nintendo 3DS.dat` (≈4100 serial lines)
  - `metadat/no-intro/Nintendo - Nintendo 3DS (Digital).dat` (≈1900)
  - `metadat/no-intro/Nintendo - New Nintendo 3DS.dat` (20)
- One serial can map to several names (e.g. `CTR-N-SAEE` → `(Rev 1) (eShop)`
  and `(eShop)`), so the generated map stores a short, ordered list.
- Thumbnail file names replace `&*/:\`<>?\|` with `_`.
