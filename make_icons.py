#!/usr/bin/env python3
"""Draw the Share2PDF icon as PNG files (needs Pillow: pkg install python-pillow).

Writes next to this script:
  icon-192.png, icon-512.png       rounded icon (transparent corners)
  icon-maskable-512.png            full-bleed black, for Android adaptive icons
  apple-touch-icon.png (180)       full-bleed black, for iOS
  favicon-32.png                   browser tab icon
Same shapes as icon.svg (512 x 512 grid).
"""
import os
from PIL import Image, ImageDraw

SS = 4  # draw at 4x, then shrink for smooth edges
HERE = os.path.dirname(os.path.abspath(__file__))
BLACK, WHITE, FOLD = (0, 0, 0, 255), (255, 255, 255, 255), (168, 168, 168, 255)


def render(size, rounded):
    n = size * SS
    k = n / 512.0
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def pts(*p):
        return [(x * k, y * k) for x, y in p]

    # background
    if rounded:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=112 * k, fill=BLACK)
    else:
        d.rectangle([0, 0, n, n], fill=BLACK)
    # speech bubble with a tail, then cut its top-right corner
    d.rounded_rectangle([136 * k, 126 * k, 376 * k - 1, 336 * k - 1], radius=28 * k, fill=WHITE)
    d.polygon(pts((240, 336), (164, 392), (164, 336)), fill=WHITE)
    d.polygon(pts((312, 126), (380, 126), (380, 194)), fill=BLACK)
    d.polygon(pts((312, 126), (312, 190), (376, 190)), fill=FOLD)  # folded corner
    # download arrow and tray
    d.rectangle([242 * k, 168 * k, 270 * k - 1, 236 * k], fill=BLACK)
    d.polygon(pts((206, 228), (306, 228), (256, 282)), fill=BLACK)
    d.rounded_rectangle([206 * k, 296 * k, 306 * k - 1, 312 * k - 1], radius=8 * k, fill=BLACK)
    return img.resize((size, size), Image.LANCZOS)


def save(name, size, rounded):
    img = render(size, rounded)
    if not rounded:
        img = img.convert("RGB")
    img.save(os.path.join(HERE, name), optimize=True)
    print("wrote", name)


if __name__ == "__main__":
    save("icon-192.png", 192, True)
    save("icon-512.png", 512, True)
    save("icon-maskable-512.png", 512, False)
    save("apple-touch-icon.png", 180, False)
    save("favicon-32.png", 32, True)
