#!/usr/bin/env python3
"""Generate Musi PWA icons — classic compact Game Boy music mascot (32×36, boot splash)."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]

# Pixel rects from index.html boot-pixel-char (viewBox 0 0 32 32)
CHAR_RECTS = [
    (7, 2, 18, 1, "#A5C7C7"),
    (5, 3, 22, 1, "#A5C7C7"),
    (4, 4, 24, 1, "#A5C7C7"),
    (3, 5, 26, 30, "#A5C7C7"),
    (4, 35, 24, 1, "#A5C7C7"),
    (5, 36, 22, 1, "#A5C7C7"),
    (7, 37, 18, 1, "#A5C7C7"),
    (28, 4, 1, 32, "#7FA3A3"),
    (4, 35, 24, 1, "#7FA3A3"),
    (5, 36, 22, 1, "#7FA3A3"),
    (7, 37, 18, 1, "#7FA3A3"),
    (8, 2, 16, 1, "#C5DDD9"),
    (6, 3, 20, 1, "#C5DDD9"),
    (3, 5, 1, 30, "#C5DDD9"),
    (5, 4, 22, 14, "#2E2E2E"),
    (7, 6, 18, 10, "#B9E7E7"),
    (9, 7, 14, 2, "#1A1A1A"),
    (10, 9, 2, 4, "#1A1A1A"),
    (20, 9, 2, 4, "#1A1A1A"),
    (8, 12, 4, 3, "#1A1A1A"),
    (18, 12, 4, 3, "#1A1A1A"),
    (8, 20, 3, 1, "#2E2E2E"),
    (7, 21, 5, 2, "#2E2E2E"),
    (8, 23, 3, 1, "#2E2E2E"),
    (20, 20, 3, 3, "#D82E2E"),
    (16, 23, 3, 3, "#D82E2E"),
    (10, 28, 4, 2, "#2E2E2E"),
    (17, 28, 4, 2, "#2E2E2E"),
    (21, 32, 1, 1, "#2E2E2E"),
    (23, 32, 1, 1, "#2E2E2E"),
    (22, 33, 1, 1, "#2E2E2E"),
    (24, 33, 1, 1, "#2E2E2E"),
    (21, 34, 1, 1, "#2E2E2E"),
    (23, 34, 1, 1, "#2E2E2E")
]

GRID_W = 32
GRID_H = 40

# Android maskable icons: essential content must fit inside a centred circle of 40% radius.
MASKABLE_SAFE_RADIUS_FRAC = 0.4

GLOW_COLORS = {
    "#D82E2E": (216, 46, 46, 48),
    "#B9E7E7": (120, 210, 210, 36),
}

SMALL_ICON_THRESHOLD = 48
SMALL_ICON_RENDER_SIZE = 256


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
            accent = GLOW_COLORS.get(color)
            if accent:
                gx = offset_x + x * scale - pad
                gy = offset_y + y * scale - pad
                gw = w * scale + pad * 2
                gh = h * scale + pad * 2
                glow_draw.rectangle([gx, gy, gx + gw, gy + gh], fill=accent)
        glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=max(2, scale // 2)))
        img.paste(Image.alpha_composite(img.convert("RGBA"), glow_layer).convert("RGB"))

    draw = ImageDraw.Draw(img)
    for x, y, w, h, color in CHAR_RECTS:
        x0 = offset_x + x * scale
        y0 = offset_y + y * scale
        x1 = x0 + w * scale - 1
        y1 = y0 + h * scale - 1
        draw.rectangle([x0, y0, x1, y1], fill=hex_rgb(color))


def content_bbox_corners() -> list[tuple[int, int]]:
    min_x = min(x for x, _y, _w, _h, _c in CHAR_RECTS)
    max_x = max(x + w for x, _y, w, _h, _c in CHAR_RECTS)
    min_y = min(y for _x, y, _w, _h, _c in CHAR_RECTS)
    max_y = max(y + h for _x, y, _w, h, _c in CHAR_RECTS)
    return [(min_x, min_y), (max_x, min_y), (min_x, max_y), (max_x, max_y)]


def mascot_corner_max_radius(size: int, scale: int, offset_x: int, offset_y: int) -> float:
    """Farthest canvas distance from centre for the mascot silhouette bounding box."""
    cx = size / 2
    cy = size / 2
    max_dist = 0.0
    for px, py in content_bbox_corners():
        canvas_x = offset_x + px * scale
        canvas_y = offset_y + py * scale
        max_dist = max(max_dist, math.hypot(canvas_x - cx, canvas_y - cy))
    return max_dist


def layout_for_scale(size: int, scale: int) -> tuple[int, int, int]:
    offset_x = (size - GRID_W * scale) // 2
    offset_y = (size - GRID_H * scale) // 2 + int(size * 0.02)
    return scale, offset_x, offset_y


def maskable_scale(size: int) -> tuple[int, float]:
    """Pick the largest integer scale whose mascot fits inside the 40%-radius safe circle."""
    safe_radius = MASKABLE_SAFE_RADIUS_FRAC * size
    for scale in range((size * 2) // GRID_H, 0, -1):
        _, offset_x, offset_y = layout_for_scale(size, scale)
        if mascot_corner_max_radius(size, scale, offset_x, offset_y) <= safe_radius:
            fill = (scale * GRID_H) / size
            return scale, fill
    return 1, GRID_H / size


def standard_scale(size: int) -> int:
    fill = 0.78
    return max(1, int((size * fill) / GRID_H))


def render_icon_at(
    size: int,
    *,
    maskable: bool = False,
    decorations: bool = True,
) -> Image.Image:
    img = draw_background(size, maskable=maskable or not decorations)

    if maskable:
        scale, _fill = maskable_scale(size)
    else:
        scale = standard_scale(size)

    offset_x = (size - GRID_W * scale) // 2
    offset_y = (size - GRID_H * scale) // 2 + int(size * 0.02)

    draw_character(
        img,
        scale=scale,
        offset_x=offset_x,
        offset_y=offset_y,
        glow=decorations and not maskable,
    )
    return img


def render_icon(size: int, *, maskable: bool = False) -> Image.Image:
    if size <= SMALL_ICON_THRESHOLD:
        source = render_icon_at(SMALL_ICON_RENDER_SIZE, maskable=maskable, decorations=False)
        return source.resize((size, size), Image.Resampling.NEAREST)
    return render_icon_at(size, maskable=maskable, decorations=True)


def main() -> None:
    icons_dir = ROOT / "icons"
    icons_dir.mkdir(exist_ok=True)

    outputs: list[tuple[Path, int, bool]] = [
        (icons_dir / "icon-192.png", 192, False),
        (icons_dir / "icon-512.png", 512, False),
        (icons_dir / "icon-maskable-192.png", 192, True),
        (icons_dir / "icon-maskable-512.png", 512, True),
        (icons_dir / "apple-touch-icon-180.png", 180, False),
        (icons_dir / "favicon-32.png", 32, False),
        (icons_dir / "favicon-16.png", 16, False),
        (ROOT / "favicon.png", 512, False),
    ]

    maskable_scale_512, maskable_fill_512 = maskable_scale(512)
    safe_radius_512 = MASKABLE_SAFE_RADIUS_FRAC * 512
    _, ox, oy = layout_for_scale(512, maskable_scale_512)
    max_radius_512 = mascot_corner_max_radius(512, maskable_scale_512, ox, oy)
    print(
        f"maskable 512: scale={maskable_scale_512}, fill≈{maskable_fill_512:.4f}, "
        f"max mascot radius={max_radius_512:.2f}px (safe {safe_radius_512:.1f}px)"
    )

    for path, size, maskable in outputs:
        render_icon(size, maskable=maskable).save(path, optimize=True)
        print(f"wrote {path.relative_to(ROOT)} ({size}x{size})")


if __name__ == "__main__":
    main()
