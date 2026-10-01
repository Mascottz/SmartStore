"""SmartStore product poster: a straight pitch, no seasonal reference.

Output 1080 x 1350, WhatsApp friendly.
Run: python3 scripts/poster_advert.py
"""
from PIL import Image, ImageDraw

from poster_kit import (
    DARK, GOLD, GREEN, GREEN_HI, MUTED, WHITE,
    M, P, arrow, blend, flag_rail, glow, logo_mark, save, text_width, tracked, vgradient,
)

W, H = 1080, 1350
PAD = 84
CREAM = (246, 248, 245)
INK_TXT = (18, 32, 27)
SOFT = (92, 112, 103)
PANEL = (9, 40, 30)


def check_row(d, x, y, title, note):
    r = 17
    d.ellipse([x, y, x + 2 * r, y + 2 * r], fill=GREEN)
    d.line([x + 9, y + 17, x + 14, y + 23], fill=WHITE, width=4)
    d.line([x + 14, y + 23, x + 25, y + 10], fill=WHITE, width=4)
    d.text((x + 52, y - 6), title, font=M(600, 28), fill=INK_TXT)
    d.text((x + 52, y + 30), note, font=M(400, 22), fill=SOFT)


def main():
    img = vgradient((W, H), (255, 255, 255), (232, 240, 234)).convert("RGB")
    img = glow(img, (960, 120), 460, (214, 238, 226), 0.55)
    img = glow(img, (60, 640), 420, (223, 241, 232), 0.45)
    img = img.convert("RGBA")

    # watermark mark, faint green
    wm = logo_mark(760)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.paste(wm, (W - 330, 300), wm)
    layer.putalpha(layer.split()[3].point(lambda v: int(v * 0.055)))
    img = Image.alpha_composite(img, layer)

    d = ImageDraw.Draw(img)
    flag_rail(d, 0, W, 10)

    # ---------- header ----------
    badge, bx, by = 86, PAD, 84
    mark = logo_mark(70)
    img.paste(mark, (bx, by + 6), mark)
    wf = M(800, 38)
    tx = bx + badge + 10
    d.text((tx, by + 16), "Smart", font=wf, fill=INK_TXT)
    d.text((tx + d.textlength("Smart", font=wf), by + 16), "Store", font=wf, fill=GREEN)
    tracked(d, (tx + 3, by + 62), "SMARTER MANAGEMENT , STRONGER BUSINESS", M(500, 13), SOFT, 2.0)

    chip_font, chip_text = M(600, 16), "SHOP MODE IS FREE"
    cw, ch = text_width(chip_text, chip_font, 2.6) + 48, 46
    cx, cy = W - PAD - cw, by + 18
    d.rounded_rectangle([cx, cy, cx + cw, cy + ch], radius=23, fill=(226, 242, 234), outline=(176, 214, 196), width=2)
    tracked(d, (cx + 24, cy + 14), chip_text, chip_font, GREEN, 2.6)

    # ---------- eyebrow + headline ----------
    y = 262
    d.line([PAD, y, PAD + 56, y], fill=GREEN, width=3)
    tracked(d, (PAD + 76, y - 10), "POS AND STORE MANAGEMENT", M(700, 18), GREEN, 4.6)

    y = 306
    h1 = P(96)
    d.text((PAD, y), "Run your shop", font=h1, fill=INK_TXT)
    y += 108
    d.text((PAD, y), "without ", font=h1, fill=INK_TXT)
    d.text((PAD + d.textlength("without ", font=h1), y), "guessing.", font=h1, fill=GREEN)

    y += 136
    sub = M(400, 26)
    for line in [
        "Every sale, every item on the shelf and every naira owed to you ;",
        "captured as it happens, waiting on your phone as plain numbers.",
    ]:
        d.text((PAD, y), line, font=sub, fill=SOFT)
        y += 40

    # ---------- feature rows ----------
    y += 44
    rows = [
        ("Sell in seconds at the counter", "Scan the barcode, take cash or transfer, print the receipt."),
        ("Never be surprised by empty shelves", "Live stock levels, low-stock alerts and expiry dates."),
        ("A Credit Book that remembers", "Who owes you, how much is left and every repayment made."),
        ("Profit you can actually see", "Daily revenue, top sellers, expenses and reports in one view."),
    ]
    for title, note in rows:
        check_row(d, PAD, y, title, note)
        y += 92

    # ---------- call to action ----------
    py1, py2 = H - 300, H - 128
    d.rounded_rectangle([PAD, py1, W - PAD, py2], radius=30, fill=PANEL)
    img = blend(img, lambda o: o.rounded_rectangle(
        [PAD + 14, py1 + 14, W - PAD - 14, py2 - 14], radius=20, outline=(255, 255, 255, 36), width=2))
    d = ImageDraw.Draw(img)

    tracked(d, (PAD + 48, py1 + 48), "START FREE TODAY", M(600, 17), GOLD, 4.0)
    d.text((PAD + 46, py1 + 82), "smartstoreng.shop", font=M(700, 44), fill=WHITE)

    cxc, cyc = W - PAD - 110, (py1 + py2) // 2
    d.ellipse([cxc - 46, cyc - 46, cxc + 46, cyc + 46], fill=GREEN_HI)
    arrow(d, cxc - 26, cyc, PANEL, length=28, head=14, width=5)

    # ---------- footer ----------
    tracked(d, (W / 2, H - 92), "SUPERMARKETS , BOUTIQUES , PHARMACIES , RESTAURANTS , SALONS",
            M(500, 15), SOFT, 3.0, center=True)
    tracked(d, (W / 2, H - 56), "BUILT IN NIGERIA , FOR NIGERIAN BUSINESS", M(600, 15), GREEN, 3.0, center=True)
    flag_rail(d, H - 10, W, 10)

    save(img, "smartstore-product-poster.png")


if __name__ == "__main__":
    main()
