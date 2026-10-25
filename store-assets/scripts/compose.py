#!/usr/bin/env python3
"""Composes the Chrome Web Store listing images from the raw captures.

Takes the PNGs produced by capture.ts (store-assets/raw/) and builds, in
store-assets/images/:
  - screenshot-1..5.png   1280x800  (store screenshots, max 5)
  - promo-small.png        440x280  (small promo tile)
  - promo-marquee.png     1400x560  (marquee promo tile)

All outputs are flattened 24-bit RGB PNGs (no alpha), as the store requires.

Prerequisites: `pip install pillow` and a prior run of capture.ts.
Usage: python3 store-assets/scripts/compose.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'store-assets' / 'raw'
OUT = ROOT / 'store-assets' / 'images'
ICON = ROOT / 'public' / 'icon' / '128.png'

# Coverly palette (dark theme of the Coverly design tokens).
BG_TOP = (26, 30, 29)      # --cr-surface
BG_BOTTOM = (13, 15, 15)   # --cr-surface-sunken
TEAL = (14, 94, 111)       # --cr-primary (light)
TEAL_LIGHT = (93, 182, 196)  # --cr-primary (dark)
MANILA = (230, 193, 113)   # --cr-manila
TEXT = (236, 238, 234)     # --cr-text
MUTED = (168, 175, 171)    # --cr-text-secondary

SANS = '/System/Library/Fonts/Helvetica.ttc'
NAME = 'Coverly Shelf'


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(SANS, size, index=1 if bold else 0)
    except OSError:
        return ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', size)


def gradient(size: tuple[int, int]) -> Image.Image:
    """Diagonal brand gradient with a soft teal glow, as an RGBA canvas."""
    small = Image.new('RGB', (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126
            px[x, y] = tuple(
                round(BG_TOP[c] + (BG_BOTTOM[c] - BG_TOP[c]) * t) for c in range(3)
            )
    bg = small.resize(size, Image.BICUBIC).convert('RGBA')

    glow = Image.new('L', size, 0)
    d = ImageDraw.Draw(glow)
    w, h = size
    d.ellipse([w * 0.40, -h * 0.40, w * 1.25, h * 0.80], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(min(size) / 4))
    bg.paste(Image.new('RGB', size, TEAL), (0, 0), glow)
    return bg


def fit(img: Image.Image, max_w: int, max_h: int) -> Image.Image:
    scale = min(max_w / img.size[0], max_h / img.size[1])
    return img.resize((round(img.size[0] * scale), round(img.size[1] * scale)), Image.LANCZOS)


def card(img: Image.Image, radius: int = 22) -> Image.Image:
    """Rounds the capture's corners (returns RGBA)."""
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius, fill=255)
    out = img.convert('RGBA')
    out.putalpha(mask)
    return out


def paste_card(bg: Image.Image, capture: Image.Image, xy: tuple[int, int], radius: int = 22) -> None:
    """Pastes a rounded capture onto bg with a soft drop shadow."""
    shadow = Image.new('RGBA', bg.size, (0, 0, 0, 0))
    mask = Image.new('L', capture.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, capture.size[0] - 1, capture.size[1] - 1], radius, fill=160)
    shadow.paste((0, 0, 0, 160), (xy[0], xy[1] + 16), mask)
    bg.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(26)))
    bg.alpha_composite(card(capture, radius), xy)


def brand(bg: Image.Image, xy: tuple[int, int], icon_size: int, text_size: int) -> None:
    d = ImageDraw.Draw(bg)
    icon = Image.open(ICON).convert('RGBA').resize((icon_size, icon_size), Image.LANCZOS)
    bg.alpha_composite(icon, xy)
    f = font(text_size, bold=True)
    box = d.textbbox((0, 0), NAME, font=f)
    y = xy[1] + (icon_size - (box[3] - box[1])) // 2 - box[1]
    d.text((xy[0] + icon_size + round(icon_size * 0.35), y), NAME, font=f, fill=TEXT)


def save_rgb(img: Image.Image, name: str, size: tuple[int, int]) -> None:
    final = img.convert('RGB')
    assert final.size == size, f'{name}: {final.size} != {size}'
    path = OUT / name
    final.save(path, 'PNG')
    print(f'  wrote {path.relative_to(ROOT)}  {final.size[0]}x{final.size[1]} {final.mode}')


def screenshot(raw_name: str, title: str, subtitle: str, out_name: str) -> None:
    size = (1280, 800)
    bg = gradient(size)
    capture = fit(Image.open(RAW / raw_name), 680, 660)
    x_card = 1280 - capture.size[0] - 60
    paste_card(bg, capture, (x_card, (800 - capture.size[1]) // 2))

    d = ImageDraw.Draw(bg)
    x = 80
    title_font = font(44, bold=True)
    sub_font = font(22)
    title_box = d.multiline_textbbox((x, 0), title, font=title_font, spacing=10)
    sub_box = d.multiline_textbbox((x, 0), subtitle, font=sub_font, spacing=8)
    block = (title_box[3] - title_box[1]) + 34 + (sub_box[3] - sub_box[1])
    y = (800 - block) // 2 - 20
    d.rounded_rectangle([x, y - 34, x + 56, y - 26], 4, fill=MANILA)
    d.multiline_text((x, y), title, font=title_font, fill=TEXT, spacing=10)
    d.multiline_text((x, y + (title_box[3] - title_box[1]) + 34), subtitle, font=sub_font, fill=MUTED, spacing=8)
    assert max(title_box[2], sub_box[2]) < x_card - 30, f'{out_name}: copy overlaps the capture'

    brand(bg, (x, 704), 36, 24)
    save_rgb(bg, out_name, size)


def promo_small() -> None:
    size = (440, 280)
    bg = gradient(size)
    d = ImageDraw.Draw(bg)
    icon = Image.open(ICON).convert('RGBA').resize((88, 88), Image.LANCZOS)
    bg.alpha_composite(icon, ((440 - 88) // 2, 40))
    for text, f, y, color in [
        (NAME, font(36, bold=True), 146, TEXT),
        ('Every game on the shelf', font(18), 196, MUTED),
        ('gets its cover.', font(18), 220, MUTED),
    ]:
        w = d.textlength(text, font=f)
        d.text(((440 - w) // 2, y), text, font=f, fill=color)
    save_rgb(bg, 'promo-small.png', size)


def promo_marquee() -> None:
    size = (1400, 560)
    bg = gradient(size)
    capture = fit(Image.open(RAW / 'card-dark.png'), 640, 470)
    paste_card(bg, capture, (1400 - capture.size[0] - 100, (560 - capture.size[1]) // 2))

    d = ImageDraw.Draw(bg)
    x = 100
    brand(bg, (x, 130), 84, 58)
    d.rounded_rectangle([x, 262, x + 64, 270], 4, fill=MANILA)
    d.text((x, 294), 'Every game on the shelf gets its cover.', font=font(30, bold=True), fill=TEXT)
    d.text((x, 344), '3D box art and screenshots for 3DS game pages.', font=font(24), fill=MUTED)
    d.text((x, 380), 'Purely cosmetic · No tracking · Open source', font=font(20), fill=TEAL_LIGHT)
    save_rgb(bg, 'promo-marquee.png', size)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    screenshot(
        'card-dark.png',
        'Every game gets\nits cover',
        'Box art as a 3D box, right next\nto the game details.',
        'screenshot-1.png',
    )
    screenshot(
        'lightbox.png',
        'Screenshots,\nfull size',
        'A gallery under the description,\nwith a keyboard-friendly viewer.',
        'screenshot-2.png',
    )
    screenshot(
        'card-light.png',
        'Light or dark,\nit fits in',
        'Built from the site’s own colours,\nso it follows the theme toggle.',
        'screenshot-3.png',
    )
    screenshot(
        'card-digital.png',
        'Digital releases\ntoo',
        'eShop titles get their own art.\nIf nothing is found, the page\nstays exactly as it was.',
        'screenshot-4.png',
    )
    screenshot(
        'mobile.png',
        'Small screens\nincluded',
        'Below 768 px the cover moves\nabove the details.',
        'screenshot-5.png',
    )
    promo_small()
    promo_marquee()


if __name__ == '__main__':
    main()
