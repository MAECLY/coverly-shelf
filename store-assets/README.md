# Chrome Web Store assets

Listing images for the store, plus the scripts that generate them.

## Contents

- `images/screenshot-1..5.png` — store screenshots, 1280×800, 24-bit RGB (no alpha):
  1. the 3D box next to the game details (dark theme),
  2. the screenshot viewer,
  3. the light theme,
  4. a digital (eShop) release,
  5. a phone-width page with the cover above the details.
- `images/promo-small.png` — small promo tile, 440×280.
- `images/promo-marquee.png` — marquee promo tile, 1400×560.
- `raw/` — 2× captures of the extension on live hShop title pages
  (`/t/1814`, `/t/18761`, `/t/98`), which the composed images are built from.
- `scripts/capture.ts` — launches Playwright Chromium with the built extension
  loaded (branded Chrome Stable no longer honors `--load-extension`), waits until
  the cover and the gallery have settled, and captures each state. hShop's
  download QR code carries a live token, so it is hidden in every capture; the
  fixed nav and footer are hidden in the card captures so they do not overlap.
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
dates) change between runs.
