# Chrome Web Store assets

Listing images for the store, plus the scripts that generate them.

## Contents

- `images/screenshot-1..5.png` — store screenshots, 1280×800, 24-bit RGB (no alpha):
  1. the 3D box next to the game details (dark theme),
  2. a listing page with a cover thumbnail on every row (dark theme),
  3. the cover zoom: the box art full size over the page,
  4. the settings page: how long artwork is cached, and Clear cache,
  5. the light theme.
- `images/promo-small.png` — small promo tile, 440×280.
- `images/promo-marquee.png` — marquee promo tile, 1400×560.
- `raw/` — 2× captures the composed images are built from: the title page
  `/t/1814` (dark and light cards, cover zoom), the first five rows of
  `/c/games/s/north-america` sorted by downloads (1280 px wide), and the
  extension's own settings page (`options.html`, dark, with the cache filled
  by those visits).
- `scripts/capture.ts` — launches Playwright Chromium with the built extension
  loaded (branded Chrome Stable no longer honors `--load-extension`), waits until
  the cover, the gallery or every list thumbnail in the captured area has
  settled, and captures each state. hShop's download QR code carries a live
  token, so it is hidden in every capture of an hShop page; the fixed nav and
  footer are hidden in the card and list captures so they do not overlap. The
  settings page is shown with the English catalogue whatever the system
  language.
- `scripts/compose.py` — Pillow composition: rounds and shadows the captures
  over a Coverly-palette gradient, adds copy, and flattens everything to exact
  store sizes in 24-bit RGB.

## Regenerate

```bash
bun run build                               # produces .output/chrome-mv3
bunx playwright install chromium
bun store-assets/scripts/capture.ts         # -> store-assets/raw/
python3 -m venv .venv && . .venv/bin/activate
pip install pillow
python3 store-assets/scripts/compose.py     # -> store-assets/images/
```

The captures come from the live site, so the numbers on the page (downloads,
dates, the order of the most downloaded games) and the cache readout on the
settings page change between runs.
