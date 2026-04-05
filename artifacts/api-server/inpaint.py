#!/usr/bin/env python3
"""
Inpainting via OpenCV — cv2.inpaint (Telea / Navier-Stokes).

The algorithm reads the surrounding pixel colours and textures to
intelligently reconstruct what would be behind the painted region.

Usage:
  python3 inpaint.py <original_path> <mask_path> <output_path> [radius] [method]

  original_path : Path to the original PNG/JPG image.
  mask_path     : Path to the binary mask PNG (white = fill this area).
  output_path   : Where to write the result PNG.
  radius        : Inpaint neighbourhood radius in pixels (default: 5).
  method        : "telea" (default) or "ns" (Navier-Stokes).

Exit codes: 0 = success, 1 = error.
"""
import sys
import os
import cv2
import numpy as np

MAX_SIDE = 4000   # auto-downscale for very large images to protect RAM

def load_image(path: str) -> np.ndarray:
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError(f"Cannot read image: {path}")
    h, w = img.shape[:2]
    if max(h, w) > MAX_SIDE:
        scale = MAX_SIDE / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img

def load_mask(path: str, target_shape) -> np.ndarray:
    mask_raw = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if mask_raw is None:
        raise FileNotFoundError(f"Cannot read mask: {path}")
    h, w = target_shape[:2]
    if mask_raw.shape[:2] != (h, w):
        mask_raw = cv2.resize(mask_raw, (w, h), interpolation=cv2.INTER_NEAREST)
    _, mask_bin = cv2.threshold(mask_raw, 127, 255, cv2.THRESH_BINARY)
    # Slight dilation to avoid leftover border fringe artefacts
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask_bin = cv2.dilate(mask_bin, kernel, iterations=1)
    return mask_bin

def inpaint(original_path: str, mask_path: str, output_path: str,
            radius: int = 5, method: str = "telea") -> None:
    img = load_image(original_path)
    mask = load_mask(mask_path, img.shape)

    has_alpha = img.ndim == 3 and img.shape[2] == 4
    if has_alpha:
        bgr   = img[:, :, :3]
        alpha = img[:, :, 3]
    else:
        bgr   = img if img.ndim == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        alpha = None

    flag = cv2.INPAINT_TELEA if method.lower() == "telea" else cv2.INPAINT_NS
    result_bgr = cv2.inpaint(bgr, mask, inpaintRadius=radius, flags=flag)

    if alpha is not None:
        # Fill masked alpha region with full opacity in the result
        result_alpha = alpha.copy()
        result_alpha[mask == 255] = 255
        result = cv2.merge([result_bgr, result_alpha])
    else:
        result = result_bgr

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    cv2.imwrite(output_path, result, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    print(f"Inpainted: {output_path}", file=sys.stderr)

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: inpaint.py <original> <mask> <output> [radius] [method]", file=sys.stderr)
        sys.exit(1)
    orig   = sys.argv[1]
    mask_p = sys.argv[2]
    out    = sys.argv[3]
    rad    = int(sys.argv[4]) if len(sys.argv) > 4 else 5
    meth   = sys.argv[5] if len(sys.argv) > 5 else "telea"
    try:
        inpaint(orig, mask_p, out, rad, meth)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
