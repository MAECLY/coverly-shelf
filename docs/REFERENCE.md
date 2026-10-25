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
| `title-demo-eu-6881.html` | `/t/6881` (Demo A) Project X Zone, Related Content: Demo Title + Base Title | `CTR-T-AXXP` |
| `title-dlc-us-20778.html` | `/t/20778` Yo-kai Watch 3 Contents Data (DLC), Related Content: Base Title + Update Data | `CTR-M-ALZE-00` |
| `title-update-eu-2624.html` | `/t/2624` Word Puzzles by POWGI (update), Related Content: Demo Title + Base Title | `CTR-U-KWPP` |
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

### Related Content (`/t/{id}`)

Fetched 2026-10-25, one page at a time: `/t/6881`, `/t/6882` (demos),
`/t/650` (their base), `/t/20778` (DLC), `/t/20699` (its base), `/t/2624`
(update), `/t/9398`, `/t/20600`, `/t/9238` (demos) and `/t/2514` (kiosk demo).
Pages served without the Turnstile check carry no download link or token, so
the fixtures above are verbatim.

Many title pages end their left card with a `.related` box (`landing.css`:
`display: flex; flex-direction: column`). Its rows are `a.block-link.list-entry`
links built exactly like main-list rows (`list.css` is loaded on title pages
too), without the "content in … ➞ …" line and with a relation badge in the
row's `.base-info > .meta`:

```html
<div class="related">                       <!-- last child of .landing.sectioned-l -->
  <h3 class="bold">Related Content:</h3>
  <a class="block-link list-entry" href="/t/650">
    <div class="base-info">
      <h3 class="green bold nospace">Project X Zone</h3>
      <div class="meta">
        <div class="meta-content"><span class="bold">Relation: Base Title</span></div>
      </div>
    </div>
    <div class="meta">
      <div class="meta-content"><span class="green bold">650</span><span>ID</span></div>
      …
      <div class="meta-content"><span class="pink bold">CTR-P-AXXP</span><span>Product Code</span></div>
    </div>
  </a>
</div>
```

- Selectors: `SELECTORS.related.container` (`.landing.sectioned-l > .related`)
  and `SELECTORS.related.relation` (the badge); the rows are read with the
  listing-row selectors (`extractRelatedEntries` → `extractListEntries`).
- Relations seen (`RELATIONS` in `src/lib/selectors.ts`): `Base Title`,
  `Demo Title`, `Update Data`, `Downloadable Content`. The relation describes
  the row relative to the page: on a base game the rows are its demos, update
  and DLC; on a demo, the sibling demo shows as `Demo Title` and the base as
  `Base Title`.
- Not every page has the box: `/t/1814` and the kiosk demo `/t/2514`
  (`CTR-B-BXXP`) have none.
- Observed codes: `/t/6881` `CTR-T-AXXP` → rows `CTR-T-AZVP` (Demo B, Demo
  Title) and `CTR-P-AXXP` (Base Title). `/t/20778` `CTR-M-ALZE-00` → `CTR-P-ALZE`
  (Base Title), `CTR-U-ALZE` (Update Data). `/t/2624` `CTR-U-KWPP` →
  `CTR-T-KWPP` (Demo Title), `CTR-N-KWPP` (Base Title). `/t/20600`
  `CTR-T-KLRJ` → `CTR-N-KLRJ` (Base Title).
- Art (GameTDB, 2026-10-25): `AZVP` 404 in `coverHQ`/`cover` for `EN` and
  `US`; `AXXP` 200 in `coverHQ/EN` and `cover/EN`. `KLRJ`, `LPEJ` and `JFDJ`
  404 in `JA`, `EN` and `US` (no art for the demo or its base).

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

## Base-title fallback (`src/lib/related.ts`)

Applies only on title pages, and only with codes hShop itself prints. Every
step uses the normal cover chain (GameTDB by region, then Libretro) of one
exact product code, so the art is always verified; nothing is matched by name.

1. **Own code first.** The page and every related row first resolve their own
   code. A hit always wins. DLC (`CTR-M-XXXX-NN`) and updates (`CTR-U-XXXX`)
   need no special case: `extract.ts` already reads their game code `XXXX`,
   which is the base game's (`CTR-M-ALZE-00` → `ALZE`), and the Libretro step
   already asks for the base `P`/`N` serials first (`libretroSerials`).
2. **The page itself.** When the page is a derived release (distribution
   `T` demo, `U` update, `M` DLC, `B`/`H` kiosk build) and its own chain found
   nothing, it shows the art of the related row marked `Relation: Base Title`
   (the first such row with a usable code). Skipped when that row has the same
   artwork chain (same platform, game code and GameTDB region), which already
   missed. A retail (`P`) or digital (`N`) page never borrows art. Example:
   `/t/6882` `CTR-T-AZVP` (no art) → `CTR-P-AXXP` → `coverHQ/EN/AXXP.jpg`.
3. **A related row.** Its own code (thumbnail size). A row with the page's own
   artwork chain reuses the page's own result without a request. If that is
   the placeholder **and** the row's relation is `Base Title`, `Demo Title`,
   `Update Data` or `Downloadable Content` (the same game as the page):
   a. the Base Title row's code, unless the row is the Base Title itself or
      that code has the row's or the page's artwork chain;
   b. then the page's own resolved cover (after step 2).
   Any other relation (or a badge that cannot be read) keeps the placeholder.
4. If nothing has art, the existing placeholder is shown (`/t/20600`).

Results stay cached per code (`cover:`, `thumb:` keys), so the fallback adds
no cache entries of its own and costs no request once each code is cached.

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
  codes, so those map to `EN`. `R` (APNR) returned 404 in `RU` and `EN`.
  The other letters are covered in [Coverage](#coverage).
- 404 for missing art, `Cache-Control: max-age=2592000`, no CORS headers (fine
  for `<img>`, not readable with `fetch` from the page).
- Cover ratio: 160/144 ≈ 1.11, 768/680 ≈ 1.13 — wider than tall.

## Virtual Console (`/c/virtual-console/s/*`)

Surveyed 2026-10-25: all 691 VC titles (europe 163, france 1, germany 3,
japan 290, korea 3, north-america 197, world 34). The **first letter** of the
game code is the original system, always in agreement with the row badge
(`Virtual Console: …`, read via `SELECTORS.list.badges`):

| Letter | System (badge) | Titles |
|---|---|---|
| `T` | NES / Famicom (one Japanese row has no badge) | 241 |
| `R` | Game Boy | 179 |
| `Q` | Game Boy Color | 103 |
| `U` | SNES / Super Famicom (`KTR`, New 3DS only) | 80 |
| `G` | Game Gear | 54 |
| `P` | Game Boy Advance (30) or PC Engine (4, Japan, badge `TurboGrafx-16)`) | 34 |

No other letter is used. Region letters: `J` 287, `E` 197, `P` 163, `A` 39
(region-free Pokémon in every language), `D` 3, `F` 1, `Z` 1.

- **GameTDB does have VC art.** Live probes (`3ds/cover`, own region then
  `EN`): TAAE, RA4E, QAZE, TC8E, GADE, UAKE (`US`), TAAP (`EN`) all 200; only
  PAEE missed. A sample of 47 VC titles (10 per large region) had GameTDB art
  for 43; the 4 misses were Japanese. Earlier "0 art" readings came from the
  GameTDB outage.
- **Libretro fallback** (`public/libretro-vc.json`, `bun run gen:vc`): game
  code → `{system, name}` for the original system's `Named_Boxarts`. Built by
  `scripts/gen-vc-map.ts`, which crawls every VC listing (`?count=100`,
  11 pages, 2 s apart), loads the system's No-Intro DAT from
  libretro-database, and matches **exactly** after a fixed normalisation
  (strip ™ ® ©, unify quotes, collapse spaces, ignore case; `: ` ↔ ` - `;
  a leading "The" moved behind the title like No-Intro). Lookup keys, best
  first: the base of the No-Intro name the 3DS DATs give the title's serial
  (91 VC serials, e.g. `CTR-N-PAAE` → `F-Zero - Maximum Velocity (USA) (GBA)
  (Virtual Console)`), then hShop's name. Region variants follow the code's
  letter: `E` → `(USA)`, `(USA, …)`, `(World)`; `P` → `(Europe)`, `(…,
  Europe)`, `(World)`; `J` → `(Japan)`…; `D`/`F` add their country first.
  Betas, protos, demos and re-releases (e-Reader, Evercade, Switch Online,
  Classic Mini, collections) are never used. Every kept name was HEAD-checked
  on `thumbnails.libretro.com/{system}/Named_Boxarts/` (one request at a time).
- A thumbnail that exists can still show another product: `(… Virtual
  Console)` dumps are often filled with another release's box. The generator
  prints every chosen VC-tagged name for a visual review, and names that fail
  it go to `VC_ART_DENYLIST` (`src/lib/sources/vc-map.ts`), which the
  generator never picks. Reviewed 2026-10-25: PAJE, TBNP, TD5P show their own
  game; TAFE (`Donkey Kong - Original Edition (USA, Europe) (3DS Virtual
  Console)`) shows the PAL *Donkey Kong Classics* box, so it is denied and
  TAFE keeps the placeholder.
- Result: **279 of 691** titles (40%).

| hShop region | Titles | Verified | Exact name, no thumbnail | No exact name |
|---|---|---|---|---|
| europe | 163 | 108 (66%) | 1 | 54 |
| north-america | 197 | 153 (78%) | 1 | 43 |
| japan | 290 | 17 (6%) | 4 | 269 |
| korea | 3 | 1 | 0 | 2 |
| france, germany | 4 | 0 | 0 | 4 |
| world | 34 | 0 | 0 | 34 |

| System | Titles | Verified |
|---|---|---|
| Game Boy Advance | 30 | 27 (90%) |
| Game Gear | 54 | 26 (48%) |
| Game Boy | 179 | 79 (44%) |
| NES | 241 | 86 (36%) |
| Game Boy Color | 103 | 37 (36%) |
| SNES | 80 | 24 (30%) |
| PC Engine | 4 | 0 |

  Most misses are hShop names without No-Intro's ` - ` separator
  (`Castlevania III Dracula's Curse`), Japanese script (No-Intro names are
  romanized), or localized Pokémon names; they keep the placeholder (or the
  GameTDB art). Nothing is guessed.
- The resolver asks for it only after every GameTDB region missed, and only
  for `CTR`/`KTR` codes whose first letter is a VC letter
  (`VC_CODE_LETTERS`). Title pages also take `Named_Snaps`/`Named_Titles` of
  that system. Live `e2e:lists`: virtual-console/north-america 25/25 (24
  GameTDB, 1 Libretro VC).

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

## Coverage

Measured 2026-10-25 for the listing pages. Sample: the first 10 rows (fewer
when the subcategory is smaller) of all 19 `/c/games` subcategories plus
`/c/virtual-console`, `/c/dsiware`, `/c/updates` and `/c/dlc` region
subcategories: 332 rows. DLC and update rows carry the parent game's code
(`CTR-M-ABEP-00`, `CTR-U-AX3P`), so they resolve like the game: GameTDB
only uses the 4-character game code, and the Libretro step asks for the base
game's `CTR-P-…` then `CTR-N-…` serial before the row's own code (the No-Intro
map has almost no `M`/`U`/`T`/`B`/`H` serials).

How "exists" was decided: GameTDB banned this machine's IP after a burst of
HEAD requests (see the rate-limit note below), so the bulk check used the
Wayback Machine CDX index of `art.gametdb.com/{3ds,ds}/cover/` (6000 3DS and
≈1100 DSiWare `K…` covers archived with status 200) as a **lower bound**, plus
live checks through an external HTTP checker for every code quoted here and in
`src/lib/config.ts`. Libretro was checked against the full directory listings
of `thumbnails.libretro.com`.

| Rows | n | Chain before | Chain after `1fb2a37` + DSiWare |
|---|---|---|---|
| games/europe, france, germany, italy, spain, korea, kiosk-demos | 70 | 70 | 70 |
| games/north-america | 10 | 9 | 9 |
| games/japan | 10 | 5 | 5 |
| games/taiwan | 10 | 7 | 9 (`W` → `ZH`) |
| games/world | 10 | 7 | 7 |
| games/digital-demos | 10 | 8 | 8 |
| games/unknown-other | 10 | 1 | 1 (debug builds, E3 videos) |
| games/australia, canada, china, netherlands, russia, united-kingdom | 12 | 9 | 9 |
| virtual-console | 47 | 42 | 42 |
| updates | 30 | 29 | 29 |
| dlc | 49 | 42 | 44 |
| dsiware | 64 | 0 | 41 (GameTDB `ds`) |
| **Total** | **332** | **229 (69%)** | **274 (83%)** |

Whole eShop catalog (hax0kartik/3dsdb lists, `CTR/KTR-N/P` codes, same
lower-bound oracle): US 1071/1200 (89%), GB 1034/1129 (92%), JP 1053/1692
(62%), KR 218/232 (94%), TW 85/99 → 93/99 (86% → 94%) with `W` → `ZH`.

### Region letters (3DS, `cover`)

| Letter | Folder | Live 200s | Notes |
|---|---|---|---|
| `W` | `ZH` | ABRW, ADAW, KC2W, AJJW | 404 in `ZHTW`, `TW`, `EN`, `US`, `JA`. All 26 archived `W` codes are only in `ZH`. |
| `V` | `EN` | BLJV, BTMV, ALEV | |
| `X` | `EN` | BLSX, BLJX | 404 in `ES` |
| `Y` | `EN` | BLSY, KFPY | 404 in `FR`, `KO` |
| `A` | `EN` | BNDA, A2AA, KRXA | |
| `Z` | `EN` | AYWZ, BYGZ, BYHZ, BYSZ, AAHZ, AGKZ, AXCZ, ARMZ, ATHZ, ALEZ | Re-probed live 2026-10-25 on 12 codes: 10 in `EN` (AYWZ/BYGZ/BYHZ also `AU`, AXCZ also `ZH`), AS7Z (Canada) only `US` (the fallback), ALBZ nowhere; none only in `AU`/`ZH`/`KO` |
| `Y` | `EN` | BLSY, BTMY, AXRY, KGNY, ASCY, BG6Y, KFPY, APNY | 8/8 only in `EN` (404 in `KO`, `ZH`, `US`, `RU`) |
| `C` | — | — | JMKC, JREC (the only `C` codes) 404 in `ZH`, `EN`, `US`, `JA`, `other` |
| `R` | — | — | APNR (the only `R` code) 404 in `RU`, `EN`, `US`, `other` |
| `U` | — | — | no 3DS code on hShop ends in `U` (Australian games use `Z`); `U` is DSiWare only |

Folders that exist on GameTDB 3DS (archived counts): `EN` 1552, `US` 1197,
`JA` 1063, `DE` 505, `IT` 319, `FR` 293, `ES` 216, `NL` 156, `AU` 148, `KO` 127,
`PT` 102, `SE` 61, `DK` 59, `other` 52, `RU` 49, `FI` 47, `ZH` 31, `NO` 22.
`ZHTW`, `ZHCN`, `TW`, `CN` do not exist. Every code found in a localized
folder (`DE`, `FR`, …) is also in `EN` or `US`, so those folders never add a hit.

### Updates and DLC

Re-probed live on 2026-10-25 (GameTDB was reachable again; an earlier pass
during its outage gave false misses). Update (`CTR-U-XXXX`) and DLC
(`CTR-M-XXXX-NN`) rows use the base game's 4-character code, so the same
region chain applies. Two rows from every `/c/updates/s/*` and `/c/dlc/s/*`
subcategory, walked with the extension's own chain (`cover`, one region at a
time): **37 of 39 hit**. The misses are CTR-U-JUUJ (`demo-updates`) and
CTR-U-BX2Z (`unknown-other`).

| Subcategory | Rows | Chain | First hit |
|---|---|---|---|
| updates/france, dlc/france | ALZF, AFJF, JCVF | `EN` → `US` | `EN` (`FR` has none: AFJF 404) |
| updates/germany, dlc/germany | ALZD, ARHD, JCVD | `DE` → `EN` → `US` | `EN` |
| dlc/italy, updates/italy | JCVI, ALEV, BTMV | `IT`/`EN` → … | `EN` |
| updates/spain, dlc/spain | ALEX, ALZS, JCVS | `EN` → `US` | `EN` |
| updates/japan, dlc/japan | AQ2J, AP5J, BZMJ, BNUJ (+ A22J, AACJ, BASJ) | `JA` → `EN` → `US` | `JA` |
| updates/korea, dlc/korea | A9CK, AR6K, BYGK | `KO` → `EN` → `US` | `KO` |
| dlc/korea | BG6Y | `EN` → `US` | `EN` |
| updates/taiwan, dlc/china | AJJW, ABEW | `ZH` → `EN` → `US` | `ZH` |
| updates/taiwan, dlc/taiwan, australia | AH4Z, AAHZ, AMXZ, AYWZ, BYGZ | `EN` → `US` | `EN` |
| updates/world | AY6A, ECRA | `EN` → `US` | `EN` |
| updates/europe, dlc/europe | CAFP, KWPP, HMEP, KGBP | `EN` → `US` | `EN` |
| updates/north-america, dlc/north-america | BD3E, BC4E, KRJE, ALZE | `US` → `EN` | `US` |

Live `e2e:lists` (first page, main list): updates/france 7/7, dlc/japan
19/25.

#### Sibling-region fallback: rejected

Trying the same 3-letter stem with another region letter (a `J` code falling
back to its `E`/`P` sibling) is **not** used. In the No-Intro 3DS DATs, 351
stems have both a `J` and an `E`/`P` serial; 116 share the base name and most
of the other 235 are translations of the same game, but not all:
`CTR-P-AT8J` is *Tamagotchi no Doki Doki Dream Omisetchi* while `CTR-N-AT8P`
is *Urban Trial Freestyle*. One counterexample is enough to show a stem does
not identify a game, so a sibling cover could be another game's box.

### DSiWare (`TWL-N-XXXX`)

Re-verified live on 2026-10-25 with KYRJ, K7TV, KAIV, KKGP, KZXJ and 20 codes
from every DSiWare subcategory (KSRE, KD7E, KVWE, KJQJ, K6AJ, KK4J, KEHV,
KEWV, KZPV, K3TK, KWPK, KIWU, KTFU, KHDF, KBID, KHDD, KCNI, KPBS, KNRH,
Z2AT), probing `cover` in `US`, `EN`, `JA` and the letter's language folder
(`DE`, `FR`, `IT`, `ES`, `NL`, `KO`, `AU`), then `coverS`, `coverM`,
`coverHQ`, `box`:

- **20 of 25 have art**, and each of those has **all five types** in exactly
  **one** folder: `E` → `US` (3/3), `J` → `JA` (4/5, KZXJ none), every other
  letter → `EN` (13/13 for `P`, `V`, `U`, `D`, `I`, `S`, `H`; KGHO (`O`) too).
  No code was in a second folder, and no language folder (`DE`, `FR`, `IT`,
  `ES`, `NL`, `AU`, `KO`) had anything.
- Misses: KZXJ, K3TK, KWPK (Korean `K` codes never have art), KHDF, KHDD
  (localized releases of KHDx), Z2AT (`unknown-other`).
- So the chain is the single folder (`GAMETDB_DS.fallbackRegions` is empty):
  the `EN`/`US` fallbacks only added misses. Title pages try `coverHQ` then
  `cover`, list rows `cover`.
- Live `e2e:lists`: dsiware/north-america 25/25.

- `https://art.gametdb.com/ds/{type}/{region}/{gameCode}.{ext}`. For KQ9E:
  `cover` jpg, `coverS` **png**, `coverM` jpg, `coverHQ` jpg, `box` png all 200;
  `coverS` as jpg is 404.
- Region folders: `E` → `US` (KF8E), `J` → `JA` (KG4J), every other letter →
  `EN` (KASV, KMQF, KBID, KFMU, KNRH, KKGP; 404 in `FR`, `DE`, `AU`, `NL`).
  Korean `K` codes (KZIK, KDUK…) have no art: korea DSiWare is 0/10.
- Libretro does not help: `Nintendo - Nintendo DSi.dat` has 1060 entries keyed
  by bare game code (`serial "KJUJ"`), but only 13 DSi thumbnails exist and 9
  of the DAT names match a `Nintendo - Nintendo DS` boxart.

### Thumbnail sizes for list rows

| URL | Pixels | Bytes |
|---|---|---|
| `3ds/cover/US/AZEE.jpg` | 160×144 | 11 135 |
| `3ds/coverM/US/AZEE.jpg` | 400×352 | 52 707 |
| `3ds/coverHQ/US/AZEE.jpg` | 768×680 | 188 576 |
| `ds/cover/US/K29E.jpg` | 160×144 | 10 885 |
| `ds/coverS/US/KQ9E.png` | 128×115 | 13 432 |
| `ds/coverM/US/K29E.jpg` | 400×352 | 44 428 |
| `ds/coverHQ/US/K29E.jpg` | 768×680 | 108 590 |

List rows should probe and show **`cover` only** (≈11 KB, sharp up to ~80 px
CSS height on 2× screens). `coverHQ` is ~17× heavier and gives no extra hit:
both types exist for the same codes.

### Libretro on listing pages

- `public/libretro-3ds.json` has 2632 serials; 1698 of them have a
  `Named_Boxarts` file. **None** of the 720 eShop-only serials do: the 3DS
  thumbnail set has no `(eShop)` names at all, so Libretro only helps retail
  rows that GameTDB lacks. `Nintendo - New Nintendo 3DS (Digital).dat` has no
  serials. `thumbnails.libretro.com/Nintendo - Nintendo 3DS (Digital)/` is empty.
- Libretro still answers when GameTDB is unreachable, which makes it the only
  fallback during a GameTDB ban.

### Rate limit (important)

`art.gametdb.com` dropped all TCP connections from this machine for ≈50 min
after roughly a thousand HEAD requests at concurrency 8 (and again minutes
after it came back, while other agents were browsing hShop with the
extension). External checkers reached it fine at the same time, so it is a
per-IP ban, and while it lasts every cover on every page fails. A listing page
has up to 25 + 50 rows and today's chain tries up to 6 GameTDB URLs per row, so
one page view can mean ~450 requests. Keep it far below that: `cover` only,
one probe per row in the common case (own region first), lazy probes for
rows in view, the top list reusing the main list's results, misses cached for
the TTL, and no more than `MAX_CONCURRENT_REQUESTS` in flight.

### Sources checked and rejected

- **Nintendo eShop CDNs** (`samurai.ctr.shop.nintendo.net`,
  `kanzashi-wup.cdn.nintendo.net`, `idbe-ctr.cdn.nintendo.net`): they answer,
  but with Nintendo's private CA (`unknown CA` TLS alert), so a browser `<img>`
  fails; IDBE icons are also AES-encrypted. The icons are archived on the
  Wayback Machine (`https://web.archive.org/web/2022id_/https://kanzashi-wup.cdn.nintendo.net/i/{hash}.jpg`,
  72×72 or 384×384), and samurai maps the eShop UID from 3dsdb to that hash.
  Verified for JCPJ, J2YJ, JLEJ, JU9J, KDHJ (all GameTDB misses), but it means
  scraping Nintendo's private API at build time, hotlinking archive.org, and
  showing Nintendo-hosted icons rather than box art: not used.
- **hax0kartik/3dsdb**: JSON lists (title ID, eShop UID, product code, name)
  per region, no images and no licence. Useful only as a key source.
- **hShop**: pages show no title icons (no `<img>` besides its own UI).
- No public, title-ID-indexed 3DS icon set on GitHub or a CDN was found.

## Extension behaviour

What the code does with the facts above, for reviewers.

### Title pages (`/t/*`)

- **Cover** (`coverly-shelf-cover`, first child of `.basic-meta`): full-size
  chain, `coverHQ` then `cover` per region, then Libretro, then the
  placeholder; base-title fallback as above.
- **Cover zoom.** While real art is shown, the box (`.cs-stage`) is a button:
  `role="button"`, `tabindex="0"`, `aria-label="View box art for {title} full
  size"`, `aria-haspopup="dialog"`, a zoom-in cursor and a green focus ring.
  Click, Enter or Space opens the art in the same lightbox as the screenshots
  (`variant: 'art'`, smooth scaling, sized by the art's own aspect ratio,
  dialog named "Box art viewer: {title}", image alt "{title} box art", close
  button "Close box art"). Esc or a
  backdrop click closes it, Tab stays inside it, and focus returns to the box.
  The URL is the resolved one, which is GameTDB `coverHQ` whenever it exists
  (the full-size chain tries it first in every region), else what the box
  shows. The placeholder never gets the affordance, and a box whose image
  fails to load loses it. Content-script strings are English (only the
  options page is localised).
- **Screenshots** (`coverly-shelf-gallery`), unchanged.
- **Related Content.** Each `.related` row with a usable code gets the same
  thumbnail host as a listing row (first child of the `<a>`, decorative,
  nothing interactive inside, shared layout `<style>` from
  `src/ui/thumb-layout.ts`), resolved lazily within 400 px of the viewport.

### Listing pages (`/c/*`, `/search/results`)

A thumbnail on every title row of every category (games, updates, DLC,
virtual console, DSiWare, videos, extras and search results), main list and
"Top content" list. Themes (`CTR-N-THEME`) and free-form codes get nothing.
`thumb` size (`cover` only), lazy, top-list rows looked up through hShop at
most 2 at a time with a cooldown on 429/5xx/challenge (`src/lib/lookup.ts`).

### Requests

- At most `MAX_CONCURRENT_REQUESTS` (4) artwork requests and
  `LOOKUP.maxConcurrent` (2) hShop lookups at once.
- **HEAD preflight** (`image:head`, `src/lib/background/head.ts`): in `direct`
  mode a candidate URL is first checked with a HEAD request from the service
  worker (https, the two artwork origins only, also after redirects, no
  cookies, no referrer). A 2xx `image/*` answer is a hit and a 404/410 or a
  non-image a miss, both without downloading image bytes; 408/429/5xx count as
  unknown (not cached); no answer, 403/405/501, or a 2xx without type or
  length falls back to loading the image in an `<img>`. The winning image is
  then loaded once more through the same limiter for display.

### Settings page (`options.html`) and toolbar button

- Opens from the extension's toolbar button (a popup-less `action`, no extra
  permission) or from the browser's extension details.
- **Keep cached artwork:** This session, 1 day, 7 days (default), 30 days or
  Until I clear it (`session`/`1d`/`7d`/`30d`/`forever`, stored in
  `storage.sync` with a `storage.local` fallback, `src/lib/settings.ts`).
  `session` keeps entries in `storage.session`; the others in `storage.local`
  with that TTL (`src/lib/cache.ts`). hShop lookups keep their own 30-day TTL.
- **Usage:** a live readout of how many games are cached and how much space
  they take.
- **Clear cache:** a two-step inline confirmation that removes every artwork
  entry and lookup at once (the hShop cooldown and sweep bookkeeping stay).
- Expired and old-version entries are swept by the background at most once a
  day.
- English and Spanish (`public/_locales`).
