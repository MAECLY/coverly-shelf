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

### Listing row (`a.list-entry`), for the next iteration

```html
<a href="/t/1814" class="list-entry block-link">
  <div class="base-info">
    <h3 class="green bold nospace">Batman - Arkham Origins Blackgate</h3>
    <h4>content in <span class="green bold">games</span> ➞ <span class="green bold">north-america</span></h4>
  </div>
  <div class="meta">
    <div class="meta-content"><span class="green bold">1814</span><span>ID</span></div>
    <div class="meta-content"><span class="blue bold">00040000000D6B00</span><span>Title ID</span></div>
    <div class="meta-content"><span class="pink bold">CTR-P-AZEE</span><span>Product Code</span></div>
    ...
  </div>
</a>
```

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
