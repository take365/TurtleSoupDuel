#!/usr/bin/env python3
from __future__ import annotations
import os
from pathlib import Path
from PIL import Image

BASE = Path(__file__).resolve().parents[1] / 'web' / 'public' / 'characters'
MAX_W = 1024  # px

def optimize_png(path: Path) -> tuple[int, int, int]:
    """Resize if wider than MAX_W and save optimized. Returns (orig_bytes, new_bytes, width)."""
    orig = path.stat().st_size
    try:
        im = Image.open(path)
        im.load()
    except Exception as e:
        return (orig, orig, 0)

    w, h = im.size
    if w > MAX_W:
        nh = int(h * (MAX_W / w))
        im = im.resize((MAX_W, nh), Image.LANCZOS)

    # Try palette quantization for PNG size reduction (keeps alpha via RGBA->P)
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGBA') if 'A' in im.getbands() else im.convert('RGB')
    try:
        qim = im.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
        save_img = qim
    except Exception:
        save_img = im

    save_img.save(path, optimize=True)
    new = path.stat().st_size
    return (orig, new, w)

def main() -> None:
    if not BASE.is_dir():
        print(f"No characters dir: {BASE}")
        return
    total_before = total_after = 0
    changed = 0
    for p in BASE.rglob('*.png'):
        ob, nb, w = optimize_png(p)
        total_before += ob
        total_after += nb
        if nb < ob:
            changed += 1
            ratio = (1 - nb/ob) * 100 if ob else 0
            print(f"optimized: {p.relative_to(BASE)}  -{ratio:.1f}%")
        else:
            print(f"kept:      {p.relative_to(BASE)}")
    diff = total_before - total_after
    print(f"Done. Files: {changed} optimized. Saved {diff/1024:.1f} KB (from {total_before/1024:.1f} KB to {total_after/1024:.1f} KB)")

if __name__ == '__main__':
    main()

