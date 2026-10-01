"""Generate the SmartStore "Happy New Month + Nigeria Independence Day" poster.

Output: marketing/smartstore-october-2026-happy-new-month.png (1080 x 1350, WhatsApp friendly)
Run: python3 scripts/poster_new_month.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = "/home/user/fonts/ttf"
LOGO = os.path.join(ROOT, "public", "logo-smartstore.png")
OUT_DIR = os.path.join(ROOT, "marketing")
W, H = 1080, 1350

INK = (7, 20, 16)
INK2 = (13, 38, 29)
GREEN = (1, 140, 97)
GREEN_HI = (34, 197, 134)
FLAG_GREEN = (0, 135, 81)
WHITE = (255, 255, 255)
MUTED = (178, 206, 193)
GOLD = (226, 189, 130)


def f(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


M = lambda w, s: f(f"montserrat-latin-{w}-normal.ttf", s)
P = lambda w, s: f(f"playfair-display-latin-{w}-normal.ttf", s)


def measure(draw, text, font):
    b = draw.textbbox((0, 0), text, font=font)
    return b[2] - b[0], b[3] - b[1]


def tracked(draw, xy, text, font, fill, tracking=0, anchor="ls"):
    """Draw letter-spaced text. anchor: ls (left baseline-ish top) or ms (centred)."""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * max(len(text) - 1, 0)
    x, y = xy
    if anchor == "ms":
        x -= total / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + tracking
    return total


def vgradient(size, top, bottom):
    w, h = size
    base = Image.new("RGB", (1, h))
    px = base.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return base.resize((w, h), Image.BICUBIC)


def radial_glow(size, center, radius, color, strength=0.55):
    w, h = size
    layer = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(layer)
    d.ellipse(
        [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius],
        fill=int(255 * strength),
    )
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.55))
    glow = Image.new("RGB", (w, h), color)
    return glow, layer


def logo_mark(px):
    """Bag mark cropped out of the brand logo, white background removed."""
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


def blend(img, fn):
    """Draw translucent shapes on their own layer so alpha actually blends."""
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    fn(ImageDraw.Draw(ov))
    return Image.alpha_composite(img, ov)


def main():
    img = vgradient((W, H), INK, INK2).convert("RGB")

    # soft brand glow, top right and bottom left
    for center, radius, color, s in (
        ((900, 150), 520, (6, 120, 86), 0.40),
        ((90, 1200), 480, (4, 90, 66), 0.26),
    ):
        glow, mask = radial_glow((W, H), center, radius, color, s)
        img = Image.composite(Image.blend(img, glow, 0.85), img, mask)

    # fine diagonal weave texture
    tex = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(tex)
    for i in range(-H, W + H, 26):
        td.line([(i, 0), (i + H, H)], fill=(255, 255, 255, 7), width=1)
    img = Image.alpha_composite(img.convert("RGBA"), tex)

    # oversized watermark of the bag mark
    wm = logo_mark(820)
    wmf = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wmf.paste(wm, (W - 430, H - 520), wm)
    wmf.putalpha(wmf.split()[3].point(lambda v: int(v * 0.07)))
    img = Image.alpha_composite(img, wmf)

    d = ImageDraw.Draw(img)

    # Nigerian flag rail across the very top
    bar_h = 12
    d.rectangle([0, 0, W / 3, bar_h], fill=FLAG_GREEN)
    d.rectangle([W / 3, 0, 2 * W / 3, bar_h], fill=WHITE)
    d.rectangle([2 * W / 3, 0, W, bar_h], fill=FLAG_GREEN)

    PAD = 86

    # ---------- header ----------
    badge = 92
    bx, by = PAD, 96
    d.ellipse([bx, by, bx + badge, by + badge], fill=WHITE)
    mark = logo_mark(62)
    img.paste(mark, (bx + 15, by + 15), mark)

    wf = M(800, 40)
    tx = bx + badge + 24
    w1 = d.textlength("Smart", font=wf)
    d.text((tx, by + 14), "Smart", font=wf, fill=WHITE)
    d.text((tx + w1, by + 14), "Store", font=wf, fill=GREEN_HI)
    tracked(d, (tx + 3, by + 62), "SMARTER MANAGEMENT , STRONGER BUSINESS", M(500, 13), MUTED, 2.0)

    # date chip, right aligned
    chip_font = M(600, 17)
    chip_text = "01 . 10 . 2026"
    cw = tracked(ImageDraw.Draw(Image.new("RGB", (1, 1))), (0, 0), chip_text, chip_font, WHITE, 2.4)
    chip_w, chip_h = cw + 52, 50
    cx1, cy1 = W - PAD - chip_w, by + 20
    img = blend(img, lambda o: o.rounded_rectangle(
        [cx1, cy1, cx1 + chip_w, cy1 + chip_h], radius=25, outline=(255, 255, 255, 70), width=2))
    d = ImageDraw.Draw(img)
    tracked(d, (cx1 + 26, cy1 + 15), chip_text, chip_font, (226, 240, 233), 2.4)

    # ---------- independence eyebrow ----------
    y = 330
    d.line([PAD, y, PAD + 64, y], fill=GOLD, width=3)
    tracked(d, (PAD + 86, y - 11), "NIGERIA AT 66 ; INDEPENDENCE DAY", M(700, 20), GOLD, 5.0)

    # ---------- headline ----------
    y = 382
    h1 = P(700, 118)
    d.text((PAD, y), "Happy", font=h1, fill=WHITE)
    y += 132
    w_new = d.textlength("New ", font=h1)
    d.text((PAD, y), "New ", font=h1, fill=WHITE)
    d.text((PAD + w_new, y), "Month", font=h1, fill=GREEN_HI)

    # ---------- rule with diamond ----------
    y += 190
    img = blend(img, lambda o: o.line([PAD, y, W - PAD - 252, y], fill=(255, 255, 255, 55), width=1))
    d = ImageDraw.Draw(img)
    d.regular_polygon((W - PAD - 222, y, 9), n_sides=4, rotation=0, fill=GOLD)
    tracked(d, (W - PAD - 188, y - 10), "OCTOBER 2026", M(700, 16), MUTED, 3.0)

    # ---------- body copy ----------
    y += 48
    body = M(400, 27)
    lines = [
        "October opens with freedom in the air ; green, white, green",
        "and a fresh page in the ledger. Here is to full shelves, faster",
        "queues, honest books and customers who keep coming back.",
    ]
    for ln in lines:
        d.text((PAD, y), ln, font=body, fill=(214, 232, 223))
        y += 46

    # ---------- wish line ----------
    y += 34
    wish = M(700, 31)
    d.text((PAD, y), "Happy Independence Day, Nigeria.", font=wish, fill=WHITE)

    # ---------- arrow tagline card ----------
    y += 112
    card_h = 112
    def _card(o):
        o.rounded_rectangle([PAD, y, W - PAD, y + card_h], radius=24, fill=(255, 255, 255, 16))
        o.rounded_rectangle([PAD, y, W - PAD, y + card_h], radius=24, outline=(255, 255, 255, 46), width=2)
    img = blend(img, _card)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([PAD, y + 18, PAD + 5, y + card_h - 18], radius=3, fill=GREEN_HI)

    tag = M(600, 26)
    ty = y + 25
    tx = PAD + 36
    d.text((tx, ty), "Sell smarter this month", font=tag, fill=WHITE)
    aw = d.textlength("Sell smarter this month", font=tag)
    # hand drawn arrow
    ax = tx + aw + 22
    ay = ty + 18
    d.line([ax, ay, ax + 44, ay], fill=GREEN_HI, width=4)
    d.polygon([(ax + 44, ay - 10), (ax + 62, ay), (ax + 44, ay + 10)], fill=GREEN_HI)
    d.text((ax + 78, ty), "grow stronger", font=M(700, 26), fill=GREEN_HI)
    tracked(d, (tx, ty + 46), "POS , INVENTORY , CREDIT BOOK , REPORTS", M(500, 15), MUTED, 3.0)

    # ---------- footer ----------
    fy = H - 118
    img = blend(img, lambda o: o.line([PAD, fy, W - PAD, fy], fill=(255, 255, 255, 45), width=1))
    d = ImageDraw.Draw(img)
    tracked(d, (PAD, fy + 34), "SMARTSTORENG.SHOP", M(700, 20), WHITE, 3.4)
    tracked(d, (W - PAD - 232, fy + 36), "BUILT IN NIGERIA", M(500, 16), MUTED, 3.0)

    # small flag tick by the footer, right edge
    fx, fh = W - PAD - 22, 22
    for i, col in enumerate((FLAG_GREEN, WHITE, FLAG_GREEN)):
        d.rectangle([fx + i * 8, fy + 30, fx + i * 8 + 5, fy + 30 + fh], fill=col)

    # bottom flag rail
    d.rectangle([0, H - bar_h, W / 3, H], fill=FLAG_GREEN)
    d.rectangle([W / 3, H - bar_h, 2 * W / 3, H], fill=WHITE)
    d.rectangle([2 * W / 3, H - bar_h, W, H], fill=FLAG_GREEN)

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "smartstore-october-2026-happy-new-month.png")
    img.convert("RGB").save(out, quality=96)
    print(out)


if __name__ == "__main__":
    main()
