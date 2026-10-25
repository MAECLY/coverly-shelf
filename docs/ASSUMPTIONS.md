# Assumptions to verify

What Coverly Shelf 0.1.0 assumes about hShop, GameTDB and Libretro that has
not been fully confirmed, and how to check each one on the real site. Facts
that *were* verified live on 2026-10-25 are in [REFERENCE.md](REFERENCE.md).

Find the open markers in the code with:

```sh
grep -rn "TODO(reference)" src docs
```

## Open `TODO(reference)` markers

| Where | Assumption | How to verify |
|---|---|---|
| `src/lib/config.ts` (`REGION_BY_CHAR`) | Game codes ending in `C`, `R` or `U` have no region mapping, so they fall back to the hShop slug, then `EN`, then `US`. Their only 3DS codes (JMKC, JREC, APNR) have no GameTDB art in any folder, and no 3DS code ends in `U`. | When hShop lists a new `C`/`R`/`U` title, check `art.gametdb.com/3ds/cover/{ZH,RU,AU,EN,US}/{code}.jpg` and add the letter only for a folder that answers 200. |
| `src/lib/config.ts` (`REGION_BY_HSHOP_SLUG`) | The breadcrumb slugs `china`, `taiwan`, `france`, `germany`, `italy`, `spain`, `netherlands`, `russia` and `world` are not mapped. They are only used when the region letter is unknown. | On hShop, open `/c/games` and list every region slug in use. Check that each new slug actually exists before adding it. |
| `src/entrypoints/title.content/style.css` (`--cs-shade`) | hShop has no shadow token, so the box spine and drop shadow use `--clevel-3`. | If hShop adds a shadow or elevation token in a future site version, switch to it. Compare both themes with the box on screen. |
| `docs/REFERENCE.md` (Shadows) | Same as above: the 3D box shadow is our own. | Same as above. |

## hShop markup and behaviour

| Assumption | Why it matters | How to verify |
|---|---|---|
| Every selector in `src/lib/selectors.ts` matches hShop site v3 (assets `?v=2.10`). | If the markup changes, the extension does nothing (by design) instead of breaking the page. | Load the unpacked build on `/t/1814`, `/t/98` and `/t/18761`. The box and gallery must show; `document.querySelectorAll('[data-hshop-enhanced]').length` must be `1`. |
| The technical table labels are exactly `Title ID` and `Product Code`. | The product code is read from these rows. | Same pages: the box must appear. If hShop renames a label, no box appears and `META_LABELS` needs updating. |
| hShop sends no Content Security Policy. | Images load straight from GameTDB and Libretro (`IMAGE_MODE = 'direct'`). | `curl -sI https://hshop.erista.me/t/1814 \| grep -i content-security` must print nothing. If a CSP with `img-src` appears, set `IMAGE_MODE` to `'background'` and re-test. |
| Navigation is full page loads, not a SPA. | The content script re-runs only on committed path changes. | Click between titles and use Back/Forward: there must be exactly one box per page. |
| Title pages show no title icon, so the “hShop icon” step of the cover chain never fires. | It is coded but unused today. | If hShop starts showing an icon on `/t/` pages, record its selector in REFERENCE.md and pass its URL as `hshopIconUrl`. |
| Themes and homebrew have no valid product code. | They are skipped. | Open `/t/15834` (a theme): no box, no gallery, no requests to the art hosts. |
| Related Content rows say `Relation: Base Title`, `Demo Title`, `Update Data` or `Downloadable Content`, and a row hShop marks with one of those is the same game as the page. | Only those rows may borrow the Base Title's or the page's art (docs/REFERENCE.md, "Base-title fallback"); other rows keep the placeholder. | Open `/t/6881`, `/t/20778` and `/t/2624`: every related row shows a thumbnail, and Demo B on `/t/6881` shows Project X Zone's cover. A new relation label shows up as a placeholder until it is added to `RELATIONS`. |

## Behaviour still to check by hand

These passed in the Playwright run (`bun run e2e`, Chromium, live site) but are
worth one look in an everyday Chrome with the unpacked build:

- No `<style wxt-shadow-root-document-styles>` element appears in
  `document.head` on a title page.
- Clicking **Direct Download** does not make the cover flicker or re-render.
- The box spine is visible in both themes, at desktop width and at 390 px.
- The lightbox: left and right arrows move, Esc closes, focus returns to the
  thumbnail.

## Design choices that could be reversed

- **The spine is on the right.** The box turns with `rotateY(-18deg)`, which
  brings the right edge forward, so the spine sits there. A real 3DS case has
  its spine on the left. To change it, turn the box to `rotateY(18deg)` and
  move the spine back to the left edge in `style.css`.

## Known limits

- **Cache of misses.** A cover that was missing is not asked for again for
  7 days. Transport failures (timeouts, messaging errors) are not cached, but in
  direct mode an `<img>` error cannot tell a 404 from a network error, so both
  count as a miss. In background mode the service worker returns `null` for a
  404 and for a network error alike.
- **Concurrency.** At most 4 art requests run at once. The live run peaked at
  exactly 4, because the page's own `<img>` loads (cover, thumbnails, lightbox)
  count alongside the probes. A UI change that loads more images at once could
  go over.
- **Cache test coverage.** The “no repeated 404” check runs on `/t/1814`, whose
  first candidate wins, so it never sees a 404. A title whose cover falls back
  further would test that path for real.
- **Background image mode** (`IMAGE_MODE = 'background'`) is unit-tested but
  has not been exercised in a real Chrome build. Check `sendResponse` with
  `return true` once before relying on it.

## Firefox

- The Firefox MV2 build compiles, with two WXT warnings: no
  `browser_specific_settings.gecko.data_collection_permissions`, and no gecko
  extension ID. Pick an ID (for example under the MAECLY domain) and set both
  in `wxt.config.ts` before submitting to AMO.
- It has not been loaded as an add-on yet.

## Releases and the landing page

- There is no GitHub release yet, so `releases/latest` links (README and the
  landing) show an empty page until v0.1.0 is published with
  `coverly-shelf-0.1.0-chrome.zip` attached (`bun run zip`).
- The custom domain `coverly-shelf.maecly.com` needs its DNS record: run
  `scripts/ops/add_dns.sh` in the landing repository
  ([MAECLY/coverly-shelf-landing](https://github.com/MAECLY/coverly-shelf-landing)).
  Until then the landing is at `https://coverly-shelf-landing.vercel.app`.
