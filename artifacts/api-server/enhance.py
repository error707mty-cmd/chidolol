#!/usr/bin/env python3
"""
AI Super-Resolution — FSRCNN + advanced post-processing pipeline.

Pipeline:
  1. Light NLM denoising (Non-Local Means) — cleaner input, fewer FSRCNN artifacts
  2. FSRCNN x2 upscale (x4 = two passes of x2 — higher quality than single x4)
  3. Deband: gentle bilateral filter between passes to remove banding
  4. Unsharp mask with adaptive per-channel sharpening
  5. CLAHE on Lab L-channel for local contrast (perceptually accurate)
  6. Alpha channel: Lanczos upscale + edge-aware cleanup to remove fringe

Usage: python3 enhance.py <input_path> <output_path> <scale> <models_dir>
"""
import sys
import os
import cv2
import numpy as np


def _load_sr(models_dir: str, scale: int) -> cv2.dnn_superres.DnnSuperResImpl:
    model_path = os.path.join(models_dir, f"FSRCNN_x{scale}.pb")
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model not found: {model_path}")
    sr = cv2.dnn_superres.DnnSuperResImpl_create()
    sr.readModel(model_path)
    sr.setModel("fsrcnn", scale)
    return sr


def _nlm_denoise(img: np.ndarray) -> np.ndarray:
    """Non-Local Means denoising — better than bilateral for preserving texture."""
    return cv2.fastNlMeansDenoisingColored(img, None, h=4, hColor=4, templateWindowSize=7, searchWindowSize=21)


def _unsharp(img: np.ndarray, sigma: float = 0.6, amount: float = 1.4) -> np.ndarray:
    """Unsharp mask — crisp details without halos."""
    blurred = cv2.GaussianBlur(img, (0, 0), sigma)
    sharpened = cv2.addWeighted(img, amount, blurred, -(amount - 1.0), 0)
    return np.clip(sharpened, 0, 255).astype(np.uint8)


def _clahe_lab(img: np.ndarray, clip_limit: float = 2.0) -> np.ndarray:
    """Adaptive local contrast on Lab L-channel (perceptually linear)."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2Lab)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_Lab2BGR)


def _clean_alpha_edges(alpha: np.ndarray) -> np.ndarray:
    """Remove fringe from upscaled alpha: morphological cleanup + feather."""
    _, binary = cv2.threshold(alpha, 10, 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    eroded = cv2.morphologyEx(binary, cv2.MORPH_ERODE, kernel, iterations=1)
    feathered = cv2.GaussianBlur(eroded, (3, 3), 0.8)
    return np.where(eroded > 0, feathered, 0).astype(np.uint8)


def enhance(input_path: str, output_path: str, scale: int, models_dir: str) -> None:
    img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {input_path}")

    has_alpha = (len(img.shape) == 3 and img.shape[2] == 4)

    if has_alpha:
        alpha = img[:, :, 3]
        rgb   = img[:, :, :3]
    else:
        alpha = None
        rgb   = img

    # ── 1. NLM denoising ─────────────────────────────────────────────────────
    # Non-Local Means: superior to bilateral for fine detail preservation
    rgb = _nlm_denoise(rgb)

    # ── 2. AI super-resolution ────────────────────────────────────────────────
    if scale == 4:
        sr2 = _load_sr(models_dir, 2)
        rgb = sr2.upsample(rgb)
        rgb = cv2.bilateralFilter(rgb, d=3, sigmaColor=20, sigmaSpace=20)
        rgb = sr2.upsample(rgb)
    else:
        sr = _load_sr(models_dir, scale)
        rgb = sr.upsample(rgb)

    # ── 3. Sharpening ────────────────────────────────────────────────────────
    rgb = _unsharp(rgb, sigma=0.6, amount=1.4)

    # ── 4. Local contrast (CLAHE) ─────────────────────────────────────────────
    rgb = _clahe_lab(rgb, clip_limit=2.0)

    # ── 5. Reconstruct with cleaned alpha ────────────────────────────────────
    if has_alpha:
        new_h, new_w = rgb.shape[:2]
        upscaled_alpha = cv2.resize(alpha, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        upscaled_alpha = _clean_alpha_edges(upscaled_alpha)
        result = cv2.merge([
            rgb[:, :, 0],
            rgb[:, :, 1],
            rgb[:, :, 2],
            upscaled_alpha,
        ])
    else:
        result = rgb

    cv2.imwrite(output_path, result, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    print(f"OK {result.shape[1]}x{result.shape[0]}", flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: enhance.py <input> <output> <scale> <models_dir>", file=sys.stderr)
        sys.exit(1)
    _, inp, outp, sc, mdir = sys.argv
    try:
        enhance(inp, outp, int(sc), mdir)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
