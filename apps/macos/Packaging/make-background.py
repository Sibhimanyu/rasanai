#!/usr/bin/env python3
"""Render the RasanAI Studio DMG background (660x420 pt) at 1x and 2x and
combine them into background.tiff with `tiffutil -cathidpicheck`.

Needs Pillow. Run:  python3 make-background.py   (from anywhere)
Icon slots, in window points: app (170,205), Applications (490,205), 128pt icons.
package-dmg.sh uses the same numbers; keep them in sync.
"""
import math, os, random, subprocess, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 660, 420
APP, DEST = (170, 205), (490, 205)
INDIGO, TURMERIC, RICE = (0x1B, 0x1F, 0x5E), (0xEF, 0xB2, 0x1A), (0xF1, 0xF0, 0xEC)
SS = 4  # supersampling for hand-drawn strokes

def font(size_px, weight):
    path = os.path.join(HERE, "fonts", "Montserrat-VF.ttf")
    try:
        f = ImageFont.truetype(path, size_px)
        f.set_variation_by_axes([weight])
        return f
    except Exception:
        for p in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/SFNS.ttf"):
            if os.path.exists(p):
                return ImageFont.truetype(p, size_px)
        return ImageFont.load_default()

def bezier(p, t):
    u = 1 - t
    return tuple(u**3*p[0][i] + 3*u*u*t*p[1][i] + 3*u*t*t*p[2][i] + t**3*p[3][i] for i in range(2))

def stroke(layer, pts_fn, width_fn, color, s, n=240):
    """Tapered brush stroke: discs along a curve, width_fn(t) in points."""
    d = ImageDraw.Draw(layer)
    for k in range(n + 1):
        t = k / n
        x, y = pts_fn(t)
        r = width_fn(t) / 2 * s
        d.ellipse((x*s - r, y*s - r, x*s + r, y*s + r), fill=color)

def tracked(draw, xy, text, fnt, fill, spacing):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + spacing
    return x

def render(scale):
    s = scale
    w, h = W*s, H*s
    # --- paper: rice, a faint warm glow behind the icon row, soft vignette, fine grain
    img = Image.new("RGB", (w, h), RICE)
    rg = Image.radial_gradient("L").resize((w, h), Image.BICUBIC)  # 0 centre -> 255 corners
    vig = rg.point(lambda v: max(0, v - 110) * 14 // 145)         # darken only toward the edges
    img = ImageChops.subtract(img, Image.merge("RGB", (vig, vig, vig)))
    glow = Image.new("L", (w, h), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse((60*s, 110*s, (W-60)*s, 300*s), fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(55*s)).point(lambda v: v * 38 // 255)
    img = Image.composite(Image.new("RGB", (w, h), (0xFF, 0xFC, 0xF4)), img, glow)
    random.seed(7)
    grain = Image.effect_noise((w, h), 24).convert("L").point(lambda v: 128 + (v - 128) // 10)
    img = ImageChops.overlay(img, Image.merge("RGB", (grain, grain, grain))).convert("RGBA")

    # --- lockup, top-left
    lock = Image.open(os.path.join(HERE, "lockup-indigo.png"))
    lh = round(15*s); lw = round(lock.width * lh / lock.height)
    lock = lock.resize((lw, lh), Image.LANCZOS)
    img.alpha_composite(lock, (round(32*s), round(30*s)))
    txt = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(txt)
    # --- top-right tag
    f = font(round(8*s), 600)
    tag = "STUDIO FOR MAC"
    tw = sum(d.textlength(c, font=f) + 1.6*s for c in tag) - 1.6*s
    tracked(d, (W*s - 32*s - tw, 30*s + 3.2*s), tag, f, INDIGO + (140,), 1.6*s)

    # --- hand-drawn turmeric arrow between the slots
    big = Image.new("RGBA", (w*SS//1, h*SS//1), (0, 0, 0, 0))
    s2 = s * SS
    P = [(250, 222), (296, 182), (352, 230), (410, 200)]
    curve = lambda t: bezier(P, t)
    taper = lambda t: 1.3 + 3.6*math.sin(math.pi*min(1, t*1.15))**0.8 * (1 - 0.25*t)
    col = TURMERIC + (255,)
    stroke(big, curve, taper, col, s2)
    tip = curve(1.0); prev = curve(0.96)
    ang = math.atan2(tip[1]-prev[1], tip[0]-prev[0])
    for sign, ln, bend in ((1, 25, 4.5), (-1, 22, -3.5)):
        a = ang + math.pi - sign*math.radians(34)
        end = (tip[0] + ln*math.cos(a), tip[1] + ln*math.sin(a))
        mid = ((tip[0]+end[0])/2 + bend*math.cos(a+math.pi/2), (tip[1]+end[1])/2 + bend*math.sin(a+math.pi/2))
        ctrl = [tip, mid, mid, end]
        stroke(big, lambda t, c=ctrl: bezier(c, t), lambda t: 3.9 - 2.1*t, col, s2, n=60)
    # a small ink dot where the stroke begins
    r = 2.2*s2; x0, y0 = P[0][0]*s2 - 12*s2, P[0][1]*s2 + 3*s2
    ImageDraw.Draw(big).ellipse((x0-r, y0-r, x0+r, y0+r), fill=TURMERIC + (170,))
    arrow = big.resize((w, h), Image.LANCZOS)
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow.putalpha(arrow.getchannel("A").filter(ImageFilter.GaussianBlur(2.2*s)).point(lambda v: v*40//255))
    shadow = ImageChops.offset(shadow, 0, round(1.5*s))
    img.alpha_composite(shadow)
    img.alpha_composite(arrow)

    d = ImageDraw.Draw(txt)
    # --- caption (below the Finder icon labels)
    f = font(round(12.5*s), 500)
    cap = "Drag RasanAI Studio to Applications"
    cw = d.textlength(cap, font=f)
    d.text(((W*s - cw)/2, 311*s), cap, font=f, fill=INDIGO + (200,))
    # --- footer
    d.line((32*s, 344*s, (W-32)*s, 344*s), fill=INDIGO + (26,), width=max(1, round(0.6*s)))
    f = font(round(8.6*s), 400)
    foot = "First launch: if macOS stops it, open System Settings › Privacy & Security and choose Open Anyway."
    fw = d.textlength(foot, font=f)
    d.text(((W*s - fw)/2, 357*s), foot, font=f, fill=INDIGO + (135,))
    img.alpha_composite(txt)
    return img.convert("RGB")

def main():
    p1, p2 = os.path.join(HERE, "background.png"), os.path.join(HERE, "background@2x.png")
    render(1).save(p1, dpi=(72, 72)); render(2).save(p2, dpi=(144, 144))
    out = os.path.join(HERE, "background.tiff")
    subprocess.run(["tiffutil", "-cathidpicheck", p1, p2, "-out", out], check=True, stderr=subprocess.DEVNULL)
    print(out)

if __name__ == "__main__":
    sys.exit(main())
