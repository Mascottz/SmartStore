"""SmartStore greeting poster: Happy New Month + Nigeria Independence Day.

A goodwill card, not an advert. Output 1080 x 1350, WhatsApp friendly.
Run: python3 scripts/poster_new_month.py
"""
from PIL import Image, ImageDraw

from poster_kit import (
    GOLD, GREEN_HI, INK, INK2, MUTED, WHITE,
    M, P, blend, flag_rail, glow, logo_mark, save, text_width, tracked, vgradient, weave,
)

W, H = 1080, 1350
PAD = 86


def main():
    img = vgradient((W, H), INK, INK2).convert("RGB")
    img = glow(img, (900, 150), 520, (6, 120, 86), 0.40)
    img = glow(img, (90, 1210), 480, (4, 90, 66), 0.26)
    img = weave(img)

    # oversized bag mark, barely there
    wm = logo_mark(820)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.paste(wm, (W - 430, H - 520), wm)
    layer.putalpha(layer.split()[3].point(lambda v: int(v * 0.07)))
    img = Image.alpha_composite(img.convert("RGBA"), layer)

    d = ImageDraw.Draw(img)
    bar = 12
    flag_rail(d, 0, W, bar)
    flag_rail(d, H - bar, W, bar)

    # ---------- header ----------
    badge, bx, by = 92, PAD, 96
    d.ellipse([bx, by, bx + badge, by + badge], fill=WHITE)
    mark = logo_mark(62)
    img.paste(mark, (bx + 15, by + 15), mark)

    wf = M(800, 40)
    tx = bx + badge + 24
    d.text((tx, by + 14), "Smart", font=wf, fill=WHITE)
    d.text((tx + d.textlength("Smart", font=wf), by + 14), "Store", font=wf, fill=GREEN_HI)
    tracked(d, (tx + 3, by + 62), "SMARTER MANAGEMENT , STRONGER BUSINESS", M(500, 13), MUTED, 2.0)

    chip_font, chip_text = M(600, 17), "01 . 10 . 2026"
    chip_w, chip_h = text_width(chip_text, chip_font, 2.4) + 52, 50
    cx, cy = W - PAD - chip_w, by + 20
    img = blend(img, lambda o: o.rounded_rectangle(
        [cx, cy, cx + chip_w, cy + chip_h], radius=25, outline=(255, 255, 255, 70), width=2))
    d = ImageDraw.Draw(img)
    tracked(d, (cx + 26, cy + 15), chip_text, chip_font, (226, 240, 233), 2.4)

    # ---------- eyebrow ----------
    y = 336
    d.line([PAD, y, PAD + 64, y], fill=GOLD, width=3)
    tracked(d, (PAD + 86, y - 11), "NIGERIA AT 66 ; INDEPENDENCE DAY", M(700, 20), GOLD, 5.0)

    # ---------- headline ----------
    y = 388
    h1 = P(118)
    d.text((PAD, y), "Happy", font=h1, fill=WHITE)
    y += 132
    d.text((PAD, y), "New ", font=h1, fill=WHITE)
    d.text((PAD + d.textlength("New ", font=h1), y), "Month", font=h1, fill=GREEN_HI)

    # ---------- rule ----------
    y += 192
    img = blend(img, lambda o: o.line([PAD, y, W - PAD - 252, y], fill=(255, 255, 255, 55), width=1))
    d = ImageDraw.Draw(img)
    d.regular_polygon((W - PAD - 222, y, 9), n_sides=4, rotation=0, fill=GOLD)
    tracked(d, (W - PAD - 188, y - 10), "OCTOBER 2026", M(700, 16), MUTED, 3.0)

    # ---------- the wish ----------
    y += 52
    body = M(400, 28)
    for line in [
        "Sixty-six years on, we celebrate Nigeria and the people",
        "who carry her ; your courage, your kindness, your hustle.",
        "May this new month be gentle with you: peace at home,",
        "favour in your work and good news you did not expect.",
    ]:
        d.text((PAD, y), line, font=body, fill=(216, 234, 225))
        y += 48

    y += 54
    d.text((PAD, y), "Happy Independence Day, Nigeria.", font=P(52), fill=GREEN_HI)

    y += 94
    d.text((PAD, y), "With love, from everyone at SmartStore.", font=M(500, 24), fill=MUTED)

    # ---------- footer ----------
    fy = H - 112
    img = blend(img, lambda o: o.line([PAD, fy, W - PAD, fy], fill=(255, 255, 255, 45), width=1))
    d = ImageDraw.Draw(img)
    tracked(d, (PAD, fy + 32), "SMARTSTORENG.SHOP", M(600, 18), (205, 226, 216), 3.2)
    tracked(d, (W - PAD - 232, fy + 34), "BUILT IN NIGERIA", M(500, 16), MUTED, 3.0)
    fx = W - PAD - 22
    for i, col in enumerate(((0, 135, 81), WHITE, (0, 135, 81))):
        d.rectangle([fx + i * 8, fy + 28, fx + i * 8 + 5, fy + 50], fill=col)

    save(img, "smartstore-october-2026-happy-new-month.png")


if __name__ == "__main__":
    main()
