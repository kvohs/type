#!/usr/bin/env python3
"""
Renders the type app icon: a black squircle with a lowercase Courier Prime
"t" in warm off-white and a burnt-orange round dot to its right.

Outputs:
  build/icon-1024.png            — the master 1024 PNG (dev dock icon)
  build/icon.iconset/*.png       — all sizes macOS expects for the iconset
  build/icon.icns                — the bundled icon used at .app build time

Requires PIL (pip install pillow). Mac-only for the final .icns step,
which shells out to /usr/bin/iconutil.

Run from the type repo root:
  python3 make-icon.py
"""

from PIL import Image, ImageDraw, ImageFont
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
ICONSET = os.path.join(BUILD, "icon.iconset")

SIZE = 1024
BG = (10, 10, 10, 255)            # near-black squircle, matches dark theme
INK = (240, 240, 235, 255)         # warm off-white "t"
ACCENT = (223, 90, 38, 255)        # type-accent burnt orange dot
FONT_SIZE = 720
GAP_FACTOR = 0.075                 # visual gap between t's right ink edge and dot's left

# Courier Prime needs to be installed. Falls back to system Courier if not present.
FONT_CANDIDATES = [
    os.path.expanduser("~/Library/Fonts/CourierPrime-Bold.ttf"),
    "/Library/Fonts/CourierPrime-Bold.ttf",
    "/System/Library/Fonts/Courier.ttc",
]


def find_font():
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    raise SystemExit("No Courier font found. Install Courier Prime Bold.")


def squircle_bg():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, SIZE, SIZE), radius=int(SIZE * 0.225), fill=BG)
    return img


def render_glyph(ch, color, font):
    """Render one glyph onto its own canvas, then crop to its actual ink bounds."""
    pad = 200
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    d.text((pad, pad), ch, font=font, fill=color)
    bbox = canvas.getbbox()
    return canvas.crop(bbox), bbox


def build_master():
    font = ImageFont.truetype(find_font(), FONT_SIZE)
    t_img, t_bbox = render_glyph("t", INK, font)
    _, p_bbox = render_glyph(".", ACCENT, font)

    img = squircle_bg()
    visual_gap = int(FONT_SIZE * GAP_FACTOR)
    dot_diam = int(FONT_SIZE * 0.20)
    total_w = t_img.width + visual_gap + dot_diam
    x0 = (SIZE - total_w) // 2
    y0 = (SIZE - t_img.height) // 2 - int(FONT_SIZE * 0.02)

    img.paste(t_img, (x0, y0), t_img)

    # vertically anchor dot to the typographic baseline so it reads as a period,
    # not a free-floating accent
    p_center_y_in_canvas = (p_bbox[1] + p_bbox[3]) / 2
    p_offset = p_center_y_in_canvas - t_bbox[3]
    period_cy = y0 + t_img.height + p_offset
    period_cx = x0 + t_img.width + visual_gap + dot_diam // 2

    # draw the dot with a slightly darker outer ring as pre-emphasis. macOS scales
    # icons through a Lanczos-family filter for display, which produces ~20%
    # overshoot at high-contrast edges. by giving the outermost ~6% of the dot a
    # color about 80% of the interior brightness, the overshoot can only peak at
    # ~96% of interior — never exceeding it, so no visible halo. the ring is too
    # thin (~3px at 256 display, ~1px at 128) to read as a design element.
    SS = 4
    canvas_px = dot_diam * SS
    dot_canvas = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))
    d = ImageDraw.Draw(dot_canvas)

    # outer ring: 80% of accent brightness, holds the same hue
    RING = tuple(int(c * 0.80) for c in ACCENT[:3]) + (255,)
    d.ellipse((0, 0, canvas_px - 1, canvas_px - 1), fill=RING)

    # interior at full accent, inset by 6% of dot diameter
    inset = int(canvas_px * 0.06)
    d.ellipse(
        (inset, inset, canvas_px - 1 - inset, canvas_px - 1 - inset),
        fill=ACCENT,
    )

    dot_small = dot_canvas.resize((dot_diam, dot_diam), Image.BOX)
    img.paste(
        dot_small,
        (period_cx - dot_diam // 2, int(period_cy - dot_diam / 2)),
        dot_small,
    )
    return img


# macOS expects these exact filenames in icon.iconset for iconutil to work
ICONSET_SIZES = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]


def write_iconset(master):
    os.makedirs(ICONSET, exist_ok=True)
    for name, px in ICONSET_SIZES:
        out = os.path.join(ICONSET, name)
        if px == SIZE:
            master.save(out, "PNG", optimize=True)
        else:
            master.resize((px, px), Image.BOX).save(out, "PNG", optimize=True)


def write_icns():
    out = os.path.join(BUILD, "icon.icns")
    subprocess.run(
        ["/usr/bin/iconutil", "-c", "icns", ICONSET, "-o", out],
        check=True,
    )


def main():
    master = build_master()
    master.save(os.path.join(BUILD, "icon-1024.png"), "PNG", optimize=True)
    print("wrote build/icon-1024.png")
    write_iconset(master)
    print(f"wrote {len(ICONSET_SIZES)} iconset files to build/icon.iconset/")
    if sys.platform == "darwin":
        write_icns()
        print("wrote build/icon.icns")
    else:
        print("(skipped .icns — iconutil is macOS-only)")


if __name__ == "__main__":
    main()
