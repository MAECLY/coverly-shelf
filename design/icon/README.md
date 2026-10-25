# Coverly Shelf icon: Boxed

These SVGs are copied from the landing repository
([MAECLY/coverly-shelf-landing `design/icon`](https://github.com/MAECLY/coverly-shelf-landing/tree/main/design/icon)),
which holds the full description of the mark, its geometry and its rules.
Keep both copies identical: edit the SVGs there first, then copy them here.

The Boxed mark is a variant of the Coverly ROMs mark (Lean-To): the same
cover leans on the same shelf, but the empty slot next to it is a closed box
with depth.

## Extension icons

`public/icon/{16,32,48,128}.png` are generated from this folder by
`bun scripts/icons.ts` (headless Chrome). WXT finds `public/icon/*.png` and
lists them under `icons` in the built manifest. Never edit the PNGs by hand.

| Size | Source | Why |
|---|---|---|
| 16, 32 | `favicon.svg` | Full-bleed tile with heavier seams, made to hold at toolbar sizes |
| 48, 128 | `app.svg` | Squircle with margin, as the Chrome Web Store and `chrome://extensions` expect |

## Files

| File | What it is |
|---|---|
| `app.svg` | 1024 canvas, Buckram squircle, paper cover and box, Manila shelf |
| `maskable.svg` | Full-bleed Buckram square, glyph inside the safe zone |
| `favicon.svg` | Full-bleed tile with heavier seams for 16-48 px |
| `mark.svg` | Glyph only in Buckram `#0E5E6F`, transparent |
| `mark-dark.svg` | Glyph only in Buckram dark `#5DB6C4` |
| `app-mono.svg` | Glyph only, one ink (`#000`) |
