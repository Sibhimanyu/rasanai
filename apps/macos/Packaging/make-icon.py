#!/usr/bin/env python3
"""Renders the macOS app icon (AppIcon-1024.png) from the RasanAI mark.

Follows Apple's macOS icon grid: an 824 px plate centred on a 1024 canvas with a soft
drop shadow, so the Dock shows it at the same size as other apps. The glyph sits
slightly below centre because its weight is in the top bar; this gives it more room
at the top than the full-bleed web mark has.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

S = 4                      # supersampling
CANVAS, PLATE, RADIUS = 1024, 824, 185
INDIGO, RICE = (0x1B, 0x1F, 0x5E, 255), (0xF1, 0xF0, 0xEC, 255)
GLYPH_HEIGHT = 0.58 * PLATE  # glyph source box is 102 x 126 units
OPTICAL_DROP = 22            # px below true centre

def main() -> None:
    size = CANVAS * S
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inset = (CANVAS - PLATE) // 2 * S
    box = (inset, inset, size - inset, size - inset)

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((box[0], box[1] + 12 * S, box[2], box[3] + 12 * S), RADIUS * S, fill=(0, 0, 0, 90))
    out.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14 * S)))

    plate = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(plate)
    draw.rounded_rectangle(box, RADIUS * S, fill=INDIGO)

    scale = GLYPH_HEIGHT / 126 * S
    left = (CANVAS - 102 * GLYPH_HEIGHT / 126) / 2 * S
    top = ((CANVAS - GLYPH_HEIGHT) / 2 + OPTICAL_DROP) * S
    p = lambda pts: [(left + x * scale, top + y * scale) for x, y in pts]
    # Same geometry as docs/assets/logo/rasanai-mark.svg.
    draw.polygon(p([(0, 0), (102, 0), (102, 62), (38, 126), (23.858, 111.858), (82, 53.716), (82, 20), (20, 20), (20, 82), (0, 82)]), fill=RICE)
    draw.polygon(p([(36, 31), (60, 46), (36, 61)]), fill=RICE)
    # The SVG's 3-unit round-join stroke: thick edges plus round caps at each corner.
    corners = p([(36, 31), (60, 46), (36, 61)])
    for a, b in zip(corners, corners[1:] + corners[:1]):
        draw.line([a, b], fill=RICE, width=int(3 * scale))
    r = 1.5 * scale
    for x, y in corners:
        draw.ellipse((x - r, y - r, x + r, y + r), fill=RICE)
    out.alpha_composite(plate)

    target = Path(__file__).with_name("AppIcon-1024.png")
    out.resize((CANVAS, CANVAS), Image.LANCZOS).save(target)
    print(target)

if __name__ == "__main__":
    main()
