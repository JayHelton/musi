#!/usr/bin/env python3
"""Generate Musi PWA icons — Atomic Purple GBC pocket buddy (matches boot splash)."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]

# Pixel rects from index.html boot-pixel-char (viewBox 0 0 32 32)
CHAR_RECTS = [
    (10, 2, 12, 2, "#6b2d8b"),
    (8, 4, 16, 2, "#6b2d8b"),
    (7, 6, 18, 16, "#8b3db8"),
    (7, 6, 18, 2, "#b45eff"),
    (9, 9, 14, 9, "#0b1020"),
    (10, 10, 12, 7, "#1a2744"),
    (12, 12, 2, 3, "#ffe14a"),
    (18, 12, 2, 3, "#ffe14a"),
    (14, 16, 4, 1, "#4da3ff"),
    (9, 20, 2, 2, "#e63946"),
    (12, 20, 2, 2, "#ffe14a"),
    (18, 20, 2, 2, "#4da3ff"),
    (21, 20, 2, 2, "#b45eff"),
    (3, 12, 4, 3, "#6b2d8b"),
    (2, 13, 2, 2, "#ffe14a"),
    (25, 12, 4, 3, "#6b2d8b"),
    (28, 11, 2, 2, "#4da3ff"),
    (10, 22, 4, 4, "#4a1d6e"),
    (18, 22, 4, 4, "#4a1d6e"),
    (10, 26, 5, 2, "#1a0a2e"),
    (17, 26, 5, 2, "#1a0a2e"),
    (15, 0, 2, 2, "#ffe14a"),
]

GRID = 32


def hex_rgb(color: str) -> tuple[int, int, int]:
    color = color.lstrip("#")
    return tuple(int(color[i : i + 2], 16) for i in (0, 2, 4))


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def lerp_color(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(lerp(c1[i], c2[i], t)) for i in range(3))


def draw_background(size: int, *, maskable: bool = False) -> Image.Image:
    """Atomic Purple GBC gradient + soft purple glow."""
    img = Image.new("RGB", (size, size))
    px = img.load()

    top = hex_rgb("#2a1045")
    mid = hex_rgb("#1a0a2e")
    bottom = hex_rgb("#0b1020")
    glow = (180, 94, 255)

    for y in range(size):
        t = y / max(size - 1, 1)
        if t < 0.45:
            base = lerp_color(top, mid, t / 0.45)
        else:
            base = lerp_color(mid, bottom, (t - 0.45) / 0.55)

        for x in range(size):
            # Radial purple wash from upper center
            dx = (x - size * 0.5) / size
            dy = (y - size * 0.28) / size
            dist = math.sqrt(dx * dx + dy * dy)
            glow_strength = max(0.0, 1.0 - dist * 1.35) * 0.22
            color = tuple(
                min(255, int(base[i] + glow[i] * glow_strength))
                for i in range(3)
            )
            px[x, y] = color

    if not maskable:
        # Subtle pixel grid (LCD shell texture)
        grid = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        gpx = grid.load()
        step = max(4, size // 64)
        line = (180, 140, 255, 18)
        for x in range(0, size, step):
            for y in range(size):
                gpx[x, y] = line
        for y in range(0, size, step):
            for x in range(size):
                gpx[x, y] = line
        img = Image.alpha_composite(img.convert("RGBA"), grid).convert("RGB")

    return img


def draw_character(
    img: Image.Image,
    *,
    scale: int,
    offset_x: int,
    offset_y: int,
    glow: bool = True,
) -> None:
    if glow and scale >= 4:
        glow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow_layer)
        pad = max(2, scale // 2)
        for x, y, w, h, color in CHAR_RECTS:
            if color in ("#ffe14a", "#b45eff", "#4da3ff"):
                gx = offset_x + x * scale - pad
                gy = offset_y + y * scale - pad
                gw = w * scale + pad * 2
                gh = h * scale + pad * 2
                glow_draw.rectangle([gx, gy, gx + gw, gy + gh], fill=(180, 94, 255, 40))
        glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=max(2, scale // 2)))
        img.paste(Image.alpha_composite(img.convert("RGBA"), glow_layer).convert("RGB"))

    draw = ImageDraw.Draw(img)
    for x, y, w, h, color in CHAR_RECTS:
        x0 = offset_x + x * scale
        y0 = offset_y + y * scale
        x1 = x0 + w * scale - 1
        y1 = y0 + h * scale - 1
        draw.rectangle([x0, y0, x1, y1], fill=hex_rgb(color))


def render_icon(size: int, *, maskable: bool = False) -> Image.Image:
    img = draw_background(size, maskable=maskable)

    # Maskable: keep buddy inside ~72% safe zone; standard: ~78%
    fill = 0.72 if maskable else 0.78
    scale = max(1, int((size * fill) / GRID))
    char_w = GRID * scale
    char_h = GRID * scale
    offset_x = (size - char_w) // 2
    offset_y = (size - char_h) // 2 + int(size * 0.02)

    draw_character(img, scale=scale, offset_x=offset_x, offset_y=offset_y)
    return img


def main() -> None:
    icons_dir = ROOT / "icons"
    icons_dir.mkdir(exist_ok=True)

    outputs = {
        icons_dir / "icon-192.png": (192, False),
        icons_dir / "icon-512.png": (512, False),
        icons_dir / "icon-maskable-512.png": (512, True),
        ROOT / "favicon.png": (512, False),
    }

    for path, (size, maskable) in outputs.items():
        render_icon(size, maskable=maskable).save(path, optimize=True)
        print(f"wrote {path.relative_to(ROOT)} ({size}x{size})")


if __name__ == "__main__":
    main()
