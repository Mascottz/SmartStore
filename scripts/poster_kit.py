"""Shared drawing helpers for the SmartStore poster scripts."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "scripts", "fonts")
LOGO = os.path.join(ROOT, "public", "logo-smartstore.png")
OUT_DIR = os.path.join(ROOT, "marketing")

# brand palette, sampled from the logo plus the Nigerian flag green
INK = (7, 20, 16)
INK2 = (13, 38, 29)
DARK = (20, 32, 40)
GREEN = (1, 140, 97)
GREEN_HI = (34, 197, 134)
FLAG_GREEN = (0, 135, 81)
WHITE = (255, 255, 255)
CREAM = (247, 249, 246)
MUTED = (178, 206, 193)
GOLD = (226, 189, 130)


def M(weight, size):
    return ImageFont.truetype(os.path.join(FONTS, f"montserrat-latin-{weight}-normal.ttf"), size)


def P(size):
    return ImageFont.truetype(os.path.join(FONTS, "playfair-display-latin-700-normal.ttf"), size)


def text_width(text, font, tracking=0.0):
    d = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    return sum(d.textlength(c, font=font) for c in text) + tracking * max(len(text) - 1, 0)


def tracked(draw, xy, text, font, fill, tracking=0.0, center=False):
    """Letter-spaced text, drawn from the top-left (or centred on x)."""
    x, y = xy
    if center:
        x -= text_width(text, font, tracking) / 2
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking
    return x


def blend(img, fn):
    """Draw translucent shapes on their own layer so alpha actually blends."""
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    fn(ImageDraw.Draw(ov))
    return Image.alpha_composite(img, ov)


def vgradient(size, top, bottom):
    w, h = size
    base = Image.new("RGB", (1, h))
    px = base.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return base.resize((w, h), Image.BICUBIC)


def glow(img, center, radius, color, strength=0.45):
    layer = Image.new("L", img.size, 0)
    ImageDraw.Draw(layer).ellipse(
        [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius],
        fill=int(255 * strength),
    )
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.55))
    tint = Image.new(img.mode, img.size, color)
    return Image.composite(Image.blend(img, tint, 0.85), img, layer)


def weave(img, step=26, alpha=7, color=(255, 255, 255)):
    w, h = img.size
    tex = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    td = ImageDraw.Draw(tex)
    for i in range(-h, w + h, step):
        td.line([(i, 0), (i + h, h)], fill=color + (alpha,), width=1)
    return Image.alpha_composite(img.convert("RGBA"), tex)


def logo_mark(px):
    """The shopping-bag mark cropped out of the brand logo, white background removed."""
    src = Image.open(LOGO).convert("RGBA").crop((130, 12, 372, 304))
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    sp, op = src.load(), out.load()
    for y in range(src.size[1]):
        for x in range(src.size[0]):
            r, g, b, a = sp[x, y]
            if a < 10:
                continue
            ink = 255 - min(r, g, b)
            if ink < 8:
                continue
            op[x, y] = (r, g, b, min(255, int(ink * 1.25) + 40))
    return out.resize((px, px), Image.LANCZOS)


def flag_rail(draw, y, w, h):
    draw.rectangle([0, y, w / 3, y + h], fill=FLAG_GREEN)
    draw.rectangle([w / 3, y, 2 * w / 3, y + h], fill=WHITE)
    draw.rectangle([2 * w / 3, y, w, y + h], fill=FLAG_GREEN)


def arrow(draw, x, y, color, length=44, head=18, width=4):
    draw.line([x, y, x + length, y], fill=color, width=width)
    draw.polygon([(x + length, y - 10), (x + length + head, y), (x + length, y + 10)], fill=color)
    return x + length + head


def save(img, name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    img.convert("RGB").save(path, quality=96)
    print(path)
    return path
