#!/usr/bin/env python3
"""
Renders the iOS app icon: same "t." composition as the macOS icon, but
full-bleed on a square, opaque canvas — iOS applies its own squircle mask,
and App Store icons must not carry alpha or pre-rounded corners.

Reuses the glyph/dot rendering from the repo-root make-icon.py.

Run from anywhere:
  python3 ios/make-ios-icon.py
"""

import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import importlib.util
spec = importlib.util.spec_from_file_location("make_icon", os.path.join(os.path.dirname(HERE), "make-icon.py"))
mi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mi)

from PIL import Image

OUT = os.path.join(HERE, "type", "Assets.xcassets", "AppIcon.appiconset", "icon-ios-1024.png")


def main():
    master = mi.build_master()           # squircle with alpha corners
    # flatten onto a full-bleed square of the same background
    flat = Image.new("RGB", (mi.SIZE, mi.SIZE), mi.BG[:3])
    flat.paste(master, (0, 0), master)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    flat.save(OUT, "PNG", optimize=True)
    print(f"wrote {os.path.relpath(OUT, os.path.dirname(HERE))}")


if __name__ == "__main__":
    main()
