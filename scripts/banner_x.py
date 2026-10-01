"""SmartStore X (Twitter) header, 1500 x 500.

Keeps the bottom-left corner clear for the profile photo overlap.
Run: python3 scripts/banner_x.py
"""
from PIL import Image, ImageDraw

from poster_kit import (
    GOLD, GREEN_HI, INK, INK2, MUTED, WHITE,
    M, P, blend, glow, logo_mark, save, text_width, tracked, vgradient, weave,
)

W, H = 1500, 500


def main():
    img = vgradient((W, H), INK, INK2).convert("RGB")
    img = glow(img, (1340, 90), 520, (6, 125, 88), 0.42)
    img = glow(img, (260, 470), 420, (4, 92, 68), 0.26)
    img = weave(img, step=24, alpha=6)

    # oversized bag mark on the right, barely there
    wm = logo_mark(560)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.paste(wm, (W - 430, -70), wm)
    layer.putalpha(layer.split()[3].point(lambda v: int(v * 0.09)))
    img = Image.alpha_composite(img.convert("RGBA"), layer)

    d = ImageDraw.Draw(img)

    # slim brand rail down the left edge, green over gold
    d.rectangle([0, 0, 7, H * 0.62], fill=GREEN_HI)
    d.rectangle([0, H * 0.62, 7, H], fill=GOLD)

    # ---------- wordmark, top left, clear of the avatar ----------
    bx, by, badge = 74, 54, 78
    d.ellipse([bx, by, bx + badge, by + badge], fill=WHITE)
    mark = logo_mark(54)
    img.paste(mark, (bx + 12, by + 12), mark)

    wf = M(800, 36)
    tx = bx + badge + 22
    d.text((tx, by + 10), "Smart", font=wf, fill=WHITE)
    d.text((tx + d.textlength("Smart", font=wf), by + 10), "Store", font=wf, fill=GREEN_HI)
    tracked(d, (tx + 3, by + 54), "SMARTER MANAGEMENT , STRONGER BUSINESS", M(500, 12), MUTED, 1.9)

    # ---------- divider ----------
    img = blend(img, lambda o: o.line([580, 92, 580, 408], fill=(255, 255, 255, 48), width=1))
    d = ImageDraw.Draw(img)
    d.regular_polygon((580, 250, 7), n_sides=4, rotation=0, fill=GOLD)

    # ---------- message ----------
    x = 640
    tracked(d, (x + 2, 118), "POS , INVENTORY , CREDIT BOOK , REPORTS", M(700, 16), GOLD, 4.4)

    h1 = P(66)
    d.text((x, 158), "Run your shop", font=h1, fill=WHITE)
    d.text((x, 234), "without ", font=h1, fill=WHITE)
    d.text((x + d.textlength("without ", font=h1), 234), "guessing.", font=h1, fill=GREEN_HI)

    d.text((x + 2, 330), "Every sale, every item, every naira owed to you ; in one place.",
           font=M(400, 23), fill=(206, 228, 217))

    # ---------- domain pill, bottom right ----------
    pf, pt = M(600, 20), "smartstoreng.shop"
    pw, ph = text_width(pt, pf, 1.6) + 72, 56
    px, py = W - 74 - pw, H - 74 - ph + 10
    img = blend(img, lambda o: o.rounded_rectangle(
        [px, py, px + pw, py + ph], radius=28, fill=(255, 255, 255, 14), outline=(255, 255, 255, 70), width=2))
    d = ImageDraw.Draw(img)
    tracked(d, (px + 36, py + 17), pt, pf, WHITE, 1.6)

    # flag tick and origin line, sitting beside the pill
    label, lf = "BUILT IN NIGERIA", M(500, 14)
    lw = text_width(label, lf, 2.6)
    ly = py + 20
    tracked(d, (px - 40 - lw, ly), label, lf, MUTED, 2.6)
    fx = px - 40 - lw - 42
    for i, col in enumerate(((0, 135, 81), WHITE, (0, 135, 81))):
        d.rectangle([fx + i * 8, ly - 2, fx + i * 8 + 5, ly + 18], fill=col)

    save(img, "smartstore-x-header.png")


if __name__ == "__main__":
    main()
