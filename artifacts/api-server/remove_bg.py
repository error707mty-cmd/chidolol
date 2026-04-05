#!/usr/bin/env python3
"""
AI Background Removal — rembg with U2Net neural network.

Uses a deep-learning segmentation model (U2Net) for pixel-perfect background
removal. Handles complex subjects (hair, fur, semi-transparent edges, shadows).
Alpha matting is applied for images ≤2MP; for larger images alpha matting is
skipped to save memory while still getting quality AI segmentation.

Usage: python3 remove_bg.py <input_path> <output_path>
"""
import sys
import os

os.environ["NUMBA_DISABLE_JIT"] = "1"

import io
from PIL import Image


def remove_background(input_path: str, output_path: str) -> None:
    from rembg import remove, new_session

    with open(input_path, "rb") as f:
        input_data = f.read()

    img_check = Image.open(io.BytesIO(input_data))
    w, h = img_check.size
    pixels = w * h
    img_check.close()

    session = new_session("u2net")

    # Alpha matting gives better edge quality but uses more memory.
    # Skip for images > 2MP to avoid OOM.
    use_alpha_matting = pixels <= 2_000_000

    output_data = remove(
        input_data,
        session=session,
        alpha_matting=use_alpha_matting,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=10,
    )

    img = Image.open(io.BytesIO(output_data)).convert("RGBA")
    img.save(output_path, "PNG", compress_level=3)

    final_w, final_h = img.size
    print(f"OK {final_w}x{final_h}", flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: remove_bg.py <input> <output>", file=sys.stderr)
        sys.exit(1)

    _, inp, outp = sys.argv
    try:
        remove_background(inp, outp)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
