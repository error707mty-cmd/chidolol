#!/usr/bin/env python3
"""
AI image processing server (FastAPI on port 8765).

Primary (cloud): Replicate API — lucataco/remove-bg + lucataco/real-esrgan
Fallback (local): rembg U2Net background removal + waifu2x cunet (ONNX) super-resolution

Endpoints:
  POST /remove-bg   — Background removal
  POST /enhance     — AI super-resolution upscale (x2 or x4)
  GET  /health      — Liveness check
"""
import os
import io
import sys
import time
import base64
import logging
import urllib.request

os.environ["NUMBA_DISABLE_JIT"] = "1"

import cv2
import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
log = logging.getLogger("ai_server")

# ── Runtime-adjustable AI config (all params editable via /config endpoint) ──
_cfg: dict = {
    # ── BACKGROUND REMOVAL — Auto-detection ──────────────────────────────────
    "remove_bg_mode": 0,             # 0=auto, 1=force luma-key, 2=force IS-Net
    "bg_dark_threshold": 40,         # border brightness < this → luma-key mode

    # ── BACKGROUND REMOVAL — Luma-key (dark/black backgrounds) ───────────────
    "luma_diff_threshold": 30,       # min per-channel diff from bg to be opaque
    "luma_erode_px": 0,              # erosion kernel size (0=disabled)
    "luma_dilate_px": 0,             # dilation kernel size (0=disabled)
    "luma_feather_px": 0,            # Gaussian feather radius on alpha (0=disabled)

    # ── BACKGROUND REMOVAL — IS-Net neural segmentation ──────────────────────
    "isnet_max_px": 512,             # max inference side in px (memory budget)
    "isnet_post_process_mask": 1,    # 1=enable rembg post-process mask cleanup
    "isnet_alpha_matting": 0,        # 1=enable alpha matting (hair/fur edges)
    "isnet_alpha_matting_fg": 240,   # foreground threshold for matting (200–255)
    "isnet_alpha_matting_bg": 10,    # background threshold for matting (0–30)
    "isnet_alpha_matting_ero": 10,   # erosion size for matting trimap (px)
    "isnet_erode_px": 0,             # post-mask erosion kernel (0=disabled)
    "isnet_feather_px": 0,           # post-mask Gaussian feather (0=disabled)
    "isnet_binary_threshold": 128,   # alpha binarization threshold (0–255)

    # ── UPSCALING — Pre-denoise bilateral filter ──────────────────────────────
    "denoise_d": 5,                  # bilateral neighborhood diameter
    "denoise_sigma": 20,             # sigmaColor and sigmaSpace

    # ── UPSCALING — LAB luminance sharpening (two-pass) ──────────────────────
    "sharpen_amount_fine": 0.60,     # fine-detail pass amount
    "sharpen_sigma_fine": 0.45,      # fine-detail pass Gaussian sigma
    "sharpen_amount_mid": 0.30,      # mid-tone pass amount
    "sharpen_sigma_mid": 1.20,       # mid-tone pass Gaussian sigma

    # ── UPSCALING — Perceptual colour lift ───────────────────────────────────
    "chroma_boost": 0.10,            # chroma/saturation lift (0=none, 0.5=+50%)
    "contrast_l": 0.04,              # luminance contrast lift (subtle)
    "vibrance_amount": 0.0,          # vibrance HSV boost (0=disabled)
    "clahe_enabled": 0,              # 1=enable CLAHE local contrast (can cause banding)
    "clahe_clip_limit": 3.5,         # CLAHE clip limit (1–8)

    # ── UPSCALING — Alpha channel post-processing ────────────────────────────
    "alpha_clean_threshold": 10,     # alpha binarization before erode/feather
    "alpha_erode_size": 3,           # erosion kernel size (px)
    "alpha_feather_sigma": 0.8,      # Gaussian feather sigma on alpha
}

# ── Replicate client (optional — only when token is set) ──────────────────────
try:
    import replicate as _replicate
    _REPLICATE_TOKEN = os.environ.get("REPLICATE_API_TOKEN", "").strip()
    if _REPLICATE_TOKEN:
        os.environ["REPLICATE_API_TOKEN"] = _REPLICATE_TOKEN
        _replicate_available = True
        log.info("Replicate API enabled — cloud AI active")
    else:
        _replicate_available = False
        log.info("No REPLICATE_API_TOKEN — using local models only")
except ImportError:
    _replicate_available = False
    log.warning("replicate package not installed — using local models only")

# ── waifu2x cunet ONNX model ──────────────────────────────────────────────────
import onnxruntime as _ort

# waifu2x cunet tiling constants (empirically derived from model I/O shape):
#   output_size = 2 * tile_size - 72  →  border = 36px per side in 2x space = 18px in orig space
_W2X_TILE       = 128   # input tile side (original resolution)
_W2X_BORDER_2X  = 36    # px removed per edge in 2x output space
_W2X_BORDER_O   = _W2X_BORDER_2X // 2   # = 18 px in original space
_W2X_STEP       = _W2X_TILE - _W2X_BORDER_O * 2  # = 92 px stride in original space

_w2x_session = None   # ort.InferenceSession
_w2x_inp_name = None  # str


def _load_w2x():
    global _w2x_session, _w2x_inp_name
    if _w2x_session is None:
        model_path = os.path.join(_models_dir, "waifu2x_cunet_art_noise2_scale2x.onnx")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"waifu2x model not found: {model_path}")
        opts = _ort.SessionOptions()
        opts.inter_op_num_threads = 4
        opts.intra_op_num_threads = 4
        _w2x_session = _ort.InferenceSession(
            model_path, sess_options=opts, providers=["CPUExecutionProvider"]
        )
        _w2x_inp_name = _w2x_session.get_inputs()[0].name
        log.info("waifu2x cunet ONNX model loaded")
    return _w2x_session, _w2x_inp_name


def _waifu2x_2x(nchw: np.ndarray) -> np.ndarray:
    """
    2x upscale a CHW float32 RGB image [0,1] using waifu2x cunet tiling.
    Returns CHW float32 RGB [0,1] at 2x resolution.
    """
    sess, inp_name = _load_w2x()
    _, H, W = nchw.shape

    # Pad original image for edge context + right/bottom tile overflow
    padded = np.pad(
        nchw,
        ((0, 0), (_W2X_BORDER_O, _W2X_TILE), (_W2X_BORDER_O, _W2X_TILE)),
        mode="reflect",
    )

    out = np.zeros((3, H * 2, W * 2), dtype=np.float32)

    for ty in range(0, H, _W2X_STEP):
        for tx in range(0, W, _W2X_STEP):
            tile = padded[:, ty : ty + _W2X_TILE, tx : tx + _W2X_TILE]
            # Safety pad if somehow undersized (shouldn't happen with above padding)
            th, tw = tile.shape[1], tile.shape[2]
            if th < _W2X_TILE or tw < _W2X_TILE:
                tile = np.pad(
                    tile, ((0, 0), (0, _W2X_TILE - th), (0, _W2X_TILE - tw)), mode="edge"
                )

            tile_out = sess.run(None, {inp_name: tile[np.newaxis]})[0][0]  # CHW

            oy, ox = ty * 2, tx * 2
            oh = min(tile_out.shape[1], H * 2 - oy)
            ow = min(tile_out.shape[2], W * 2 - ox)
            out[:, oy : oy + oh, ox : ox + ow] = tile_out[:, :oh, :ow]

    return out


def _waifu2x_upscale(bgr: np.ndarray, scale: int) -> np.ndarray:
    """
    Upscale a BGR uint8 image by `scale` (2 or 4) using waifu2x cunet.
    For x4: two sequential 2x passes (waifu2x-standard chained approach).
    For x3: waifu2x 2x → Lanczos down to exact 3x.
    """
    h0, w0 = bgr.shape[:2]

    # ── Pre-denoise (gentle bilateral) — removes JPEG blocking and compression
    # artifacts before waifu2x so the model synthesises clean new detail.
    # Low sigmas (20) keep texture intact; waifu2x noise2 handles the rest.
    _sig = int(_cfg["denoise_sigma"])
    bgr = cv2.bilateralFilter(bgr, d=int(_cfg["denoise_d"]), sigmaColor=_sig, sigmaSpace=_sig)

    # BGR uint8 → RGB CHW float32 [0,1]
    rgb_f = bgr[:, :, ::-1].astype(np.float32) / 255.0
    nchw = np.transpose(rgb_f, (2, 0, 1))

    if scale == 4:
        nchw = _waifu2x_2x(nchw)   # 2x
        nchw = _waifu2x_2x(nchw)   # → 4x
    elif scale == 3:
        nchw = _waifu2x_2x(nchw)   # 2x
        # Lanczos resize from 2x down to exact 3x of original
        hwc = np.clip(np.transpose(nchw, (1, 2, 0)), 0, 1)
        bgr_2x = (hwc[:, :, ::-1] * 255).astype(np.uint8)
        bgr_3x = cv2.resize(bgr_2x, (w0 * 3, h0 * 3), interpolation=cv2.INTER_LANCZOS4)
        return bgr_3x
    else:  # scale == 2
        nchw = _waifu2x_2x(nchw)   # 2x

    # RGB CHW float32 → BGR uint8
    hwc = np.clip(np.transpose(nchw, (1, 2, 0)), 0, 1)
    return (hwc[:, :, ::-1] * 255).astype(np.uint8)


# ── Local SR models (FSRCNN) — Disabled for opencv-headless ──────────────────
# opencv-headless doesn't include dnn_superres module
# We'll use Replicate API or other online services instead
_sr_models: dict = {}
_models_dir: str = ""


# def _load_sr(scale: int) -> cv2.dnn_superres.DnnSuperResImpl:
#     """Disabled - requires opencv-contrib which is not headless"""
#     raise NotImplementedError("Local SR models disabled. Use Replicate API instead.")


from contextlib import asynccontextmanager

# ── rembg background removal (IS-Net / isnet-general-use) ─────────────────────
# isnet-general-use (IS-Net, ~179 MB ONNX) — IS-Net is the base architecture
# of InSPyReNet; significantly better than U2Net for complex edges, hair/fur,
# and semi-transparent objects. Runs reliably at 512 px inference resolution.
# Model cached at: ~/.local/share/.u2net/isnet-general-use.onnx
_rembg_session = None
_REMBG_MODEL = "isnet-general-use"

def _get_rembg_session():
    global _rembg_session
    if _rembg_session is None:
        from rembg import new_session
        log.info(f"Loading rembg {_REMBG_MODEL} model...")
        _rembg_session = new_session(_REMBG_MODEL)
        log.info(f"rembg {_REMBG_MODEL} model ready")
    return _rembg_session


def _sample_bg_color(pil_rgb: Image.Image) -> tuple:
    """
    Sample the background color from image borders (corners + edge midpoints).
    Returns the median RGB — robust against partial transparency at edges.
    """
    w, h = pil_rgb.size
    pts = [
        (0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
        (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2),
        (w // 4, 0), (3 * w // 4, 0), (w // 4, h - 1), (3 * w // 4, h - 1),
    ]
    samples = [pil_rgb.getpixel((x, y))[:3] for x, y in pts]
    rs = sorted(s[0] for s in samples)
    gs = sorted(s[1] for s in samples)
    bs = sorted(s[2] for s in samples)
    n = len(samples) // 2
    return (rs[n], gs[n], bs[n])


def _binarize_alpha(pil_rgba: Image.Image, threshold: int = 128) -> Image.Image:
    """
    Convert semi-transparent alpha to fully opaque or fully transparent.
    DTF/sublimation RIP printers require binary alpha — no grey fringing.
    Pixels with alpha > threshold → 255 (opaque); rest → 0 (transparent).
    """
    import numpy as np
    arr = np.array(pil_rgba)
    arr[:, :, 3] = np.where(arr[:, :, 3] > threshold, 255, 0)
    return Image.fromarray(arr, "RGBA")


def _remove_bg_luminance_key(pil_in: Image.Image, bg_color: tuple) -> bytes:
    """
    Color-difference luminance keying — the industry standard for graphics/logos
    on solid (especially dark/black) backgrounds.

    For each pixel:  alpha = max(R - bg_r, G - bg_g, B - bg_b)
    This means:
      • Pure background color → alpha = 0  (fully transparent)
      • White/bright foreground → alpha = 255  (fully opaque)
      • Metallic shadows (dark-but-not-bg) → semi-transparent  (correct compositing!)
      • The original RGB pixels are NOT modified — no color fringing.

    A mild gamma curve (^0.85) is applied so mid-grays don't over-fade.
    """
    import numpy as np
    rgb = np.array(pil_in.convert("RGB"), dtype=np.float32)
    bg = np.array(bg_color, dtype=np.float32)

    diff = np.clip(rgb - bg, 0, 255)          # per-channel difference from bg
    alpha = diff.max(axis=2)                   # take strongest channel
    alpha = np.clip(alpha, 0, 255)

    # Threshold → binary alpha (DTF RIP requires no semi-transparent pixels)
    alpha = np.where(alpha > int(_cfg["luma_diff_threshold"]), 255, 0).astype(np.uint8)

    # Optional morphological refinement
    erode_px  = int(_cfg["luma_erode_px"])
    dilate_px = int(_cfg["luma_dilate_px"])
    feather_px = int(_cfg["luma_feather_px"])

    if erode_px > 0:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (erode_px, erode_px))
        alpha = cv2.erode(alpha, k, iterations=1)
    if dilate_px > 0:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_px, dilate_px))
        alpha = cv2.dilate(alpha, k, iterations=1)
    if feather_px > 0:
        alpha_f = alpha.astype(np.float32) / 255.0
        alpha_f = cv2.GaussianBlur(alpha_f, (0, 0), float(feather_px))
        # Keep hard edges where original mask was solid, blend where it wasn't
        alpha = np.clip(alpha_f * 255, 0, 255).astype(np.uint8)

    r, g, b = pil_in.convert("RGB").split()
    result = Image.merge("RGBA", (r, g, b, Image.fromarray(alpha, "L")))
    buf = io.BytesIO()
    result.save(buf, "PNG")
    return buf.getvalue()


def _local_remove_bg_rembg(input_bytes: bytes) -> tuple:
    """
    Smart background removal — auto-selects the best method:

    1. LUMINANCE KEYING (dark/black bg, <40 brightness):
       Perfect for DTF logos/graphics on black. No neural network needed.
       Preserves metallic drop-shadows as semi-transparent (correct).
       Returns source = "local-luma-key"

    2. IS-Net neural segmentation (light or complex backgrounds):
       Inference at max 512 px (RAM budget), mask bicubically upsampled to
       original resolution. Returns source = "local-isnet-general-use"

    Returns: (output_bytes, source_label)
    """
    from rembg import remove as rembg_remove

    pil_in = Image.open(io.BytesIO(input_bytes)).convert("RGBA")
    orig_w, orig_h = pil_in.size

    bg_r, bg_g, bg_b = _sample_bg_color(pil_in)
    bg_brightness = max(bg_r, bg_g, bg_b)
    log.info(f"remove-bg: bg sample RGB=({bg_r},{bg_g},{bg_b}) brightness={bg_brightness}")

    mode = int(_cfg["remove_bg_mode"])  # 0=auto, 1=luma-key, 2=IS-Net

    # ── Choose method ─────────────────────────────────────────────────────────
    use_luma = (mode == 1) or (mode == 0 and bg_brightness < int(_cfg["bg_dark_threshold"]))

    if use_luma:
        log.info(f"remove-bg: luma-key mode (forced={mode==1}, brightness={bg_brightness})")
        out_bytes = _remove_bg_luminance_key(pil_in, (bg_r, bg_g, bg_b))
        return out_bytes, "local-luma-key"

    # ── IS-Net neural segmentation ────────────────────────────────────────────
    log.info(f"remove-bg: IS-Net mode (forced={mode==2}, brightness={bg_brightness})")
    session = _get_rembg_session()
    MAX_INFER_PX = int(_cfg["isnet_max_px"])
    scale = min(MAX_INFER_PX / orig_w, MAX_INFER_PX / orig_h, 1.0)
    if scale < 1.0:
        infer_w = max(1, int(orig_w * scale))
        infer_h = max(1, int(orig_h * scale))
        infer_img = pil_in.resize((infer_w, infer_h), Image.LANCZOS)
        infer_buf = io.BytesIO()
        infer_img.convert("RGB").save(infer_buf, "PNG")
        infer_bytes = infer_buf.getvalue()
    else:
        infer_bytes = input_bytes

    use_matting = bool(int(_cfg["isnet_alpha_matting"]))
    result_bytes = rembg_remove(
        infer_bytes,
        session=session,
        post_process_mask=bool(int(_cfg["isnet_post_process_mask"])),
        alpha_matting=use_matting,
        alpha_matting_foreground_threshold=int(_cfg["isnet_alpha_matting_fg"]),
        alpha_matting_background_threshold=int(_cfg["isnet_alpha_matting_bg"]),
        alpha_matting_erode_size=int(_cfg["isnet_alpha_matting_ero"]),
    )
    result_small = Image.open(io.BytesIO(result_bytes)).convert("RGBA")

    if scale < 1.0:
        alpha_small = result_small.split()[3]
        alpha_full = alpha_small.resize((orig_w, orig_h), Image.BICUBIC)
        r, g, b, _ = pil_in.split()
        result_full = Image.merge("RGBA", (r, g, b, alpha_full))
    else:
        result_full = result_small

    # Optional post-mask morphological refinement (IS-Net path)
    import numpy as np
    arr = np.array(result_full)
    a = arr[:, :, 3]
    isnet_erode = int(_cfg["isnet_erode_px"])
    isnet_feather = int(_cfg["isnet_feather_px"])
    if isnet_erode > 0:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (isnet_erode, isnet_erode))
        a = cv2.erode(a, k, iterations=1)
    if isnet_feather > 0:
        a_f = a.astype(np.float32) / 255.0
        a_f = cv2.GaussianBlur(a_f, (0, 0), float(isnet_feather))
        a = np.clip(a_f * 255, 0, 255).astype(np.uint8)
    arr[:, :, 3] = a
    result_full = Image.fromarray(arr, "RGBA")

    # Binary alpha — DTF RIP requires no semi-transparent pixels
    result_final = _binarize_alpha(result_full, threshold=int(_cfg["isnet_binary_threshold"]))
    out_buf = io.BytesIO()
    result_final.save(out_buf, "PNG")
    return out_buf.getvalue(), f"local-{_REMBG_MODEL}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _models_dir
    _models_dir = os.path.join(os.path.dirname(__file__), "models")
    log.info(f"Models dir: {_models_dir}")
    import threading
    def warm_up():
        # Pre-load waifu2x cunet ONNX (primary SR model)
        try:
            _load_w2x()
        except Exception as e:
            log.warning(f"waifu2x warmup failed ({e}), local SR disabled")
            # FSRCNN disabled - opencv-headless doesn't support dnn_superres
        # Pre-load rembg so the first remove-bg request is fast
        try:
            _get_rembg_session()
        except Exception as e:
            log.warning(f"rembg warmup failed: {e}")
        log.info("Local models ready")
    threading.Thread(target=warm_up, daemon=True).start()
    yield


app = FastAPI(title="AI Image Server", lifespan=lifespan)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "replicate": _replicate_available,
        "sr_scales_loaded": list(_sr_models.keys()),
    }


# ── Config endpoints (admin-only gate enforced by the Node proxy) ─────────────

class ConfigPatch(BaseModel):
    # Background removal — detection
    remove_bg_mode: float | None = None
    bg_dark_threshold: float | None = None
    # Background removal — luma-key
    luma_diff_threshold: float | None = None
    luma_erode_px: float | None = None
    luma_dilate_px: float | None = None
    luma_feather_px: float | None = None
    # Background removal — IS-Net
    isnet_max_px: float | None = None
    isnet_post_process_mask: float | None = None
    isnet_alpha_matting: float | None = None
    isnet_alpha_matting_fg: float | None = None
    isnet_alpha_matting_bg: float | None = None
    isnet_alpha_matting_ero: float | None = None
    isnet_erode_px: float | None = None
    isnet_feather_px: float | None = None
    isnet_binary_threshold: float | None = None
    # Upscaling — denoise
    denoise_d: float | None = None
    denoise_sigma: float | None = None
    # Upscaling — sharpening
    sharpen_amount_fine: float | None = None
    sharpen_sigma_fine: float | None = None
    sharpen_amount_mid: float | None = None
    sharpen_sigma_mid: float | None = None
    # Upscaling — color
    chroma_boost: float | None = None
    contrast_l: float | None = None
    vibrance_amount: float | None = None
    clahe_enabled: float | None = None
    clahe_clip_limit: float | None = None
    # Upscaling — alpha
    alpha_clean_threshold: float | None = None
    alpha_erode_size: float | None = None
    alpha_feather_sigma: float | None = None


@app.get("/config")
def get_config():
    """Return the current runtime AI configuration."""
    return JSONResponse(content=_cfg)


@app.patch("/config")
def patch_config(body: ConfigPatch):
    """Update one or more config values in-place (no restart required)."""
    updated = {}
    for key, val in body.model_dump(exclude_none=True).items():
        if key in _cfg:
            _cfg[key] = val
            updated[key] = val
    log.info(f"Config updated: {updated}")
    return JSONResponse(content={"ok": True, "updated": updated, "config": _cfg})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _b64_to_data_uri(b64: str, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{b64}"


def _url_to_bytes(url: str) -> bytes:
    """Download image from URL (Replicate output)."""
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def _bytes_to_b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def _pil_size(data: bytes) -> tuple[int, int]:
    img = Image.open(io.BytesIO(data))
    return img.width, img.height


# ── Replicate: remove background ──────────────────────────────────────────────

def _replicate_remove_bg(image_bytes: bytes) -> bytes:
    """Call lucataco/remove-bg via Replicate cloud API."""
    import replicate
    b64 = base64.b64encode(image_bytes).decode()
    data_uri = _b64_to_data_uri(b64, "image/png")

    output = replicate.run(
        "lucataco/remove-bg:95fcc2a26489613799ad644830085050ee4d4d6e872970c138733da5d0e56662",
        input={"image": data_uri}
    )

    # output is a URL string or FileOutput object
    url = str(output) if not isinstance(output, str) else output
    result_bytes = _url_to_bytes(url)

    # Ensure we return PNG with alpha
    img = Image.open(io.BytesIO(result_bytes)).convert("RGBA")
    buf = io.BytesIO()
    img.save(buf, "PNG", compress_level=3)
    buf.seek(0)
    return buf.read()


# ── Replicate: Real-ESRGAN upscale ────────────────────────────────────────────

def _replicate_enhance(image_bytes: bytes, scale: int) -> bytes:
    """Call lucataco/real-esrgan via Replicate cloud API."""
    import replicate

    # Detect if image has alpha
    pil = Image.open(io.BytesIO(image_bytes))
    has_alpha = pil.mode == "RGBA"

    if has_alpha:
        # Save alpha, upscale RGB, then recompose
        alpha = np.array(pil.getchannel("A"))
        rgb_pil = pil.convert("RGB")
        rgb_buf = io.BytesIO()
        rgb_pil.save(rgb_buf, "PNG")
        rgb_bytes = rgb_buf.getvalue()
    else:
        rgb_bytes = image_bytes

    b64 = base64.b64encode(rgb_bytes).decode()
    data_uri = _b64_to_data_uri(b64, "image/png")

    output = replicate.run(
        "lucataco/real-esrgan:da708990ca0134469e38f6d8920194884218f2d5a37e1933e0d866a4392e2ca1",
        input={"image": data_uri, "upscale": scale}
    )

    url = str(output) if not isinstance(output, str) else output
    result_bytes = _url_to_bytes(url)
    result_pil = Image.open(io.BytesIO(result_bytes)).convert("RGB")

    if has_alpha:
        # Upscale alpha with Lanczos and recompose
        new_w, new_h = result_pil.size
        alpha_up = cv2.resize(alpha, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        _, alpha_clean = cv2.threshold(alpha_up, 10, 255, cv2.THRESH_BINARY)
        alpha_clean = cv2.GaussianBlur(alpha_clean, (3, 3), 0.8)
        alpha_clean = np.where(alpha_up > 10, alpha_clean, 0).astype(np.uint8)
        result_rgba = result_pil.convert("RGBA")
        result_rgba.putalpha(Image.fromarray(alpha_clean))
        buf = io.BytesIO()
        result_rgba.save(buf, "PNG", compress_level=3)
        buf.seek(0)
        return buf.read()
    else:
        buf = io.BytesIO()
        result_pil.save(buf, "PNG", compress_level=3)
        buf.seek(0)
        return buf.read()


# ── Local: background removal (GrabCut) ───────────────────────────────────────

def _sample_bg_color_cv(img: np.ndarray) -> tuple:
    """Sample bg color from BGR numpy array (used by GrabCut path)."""
    h, w = img.shape[:2]
    edge_pixels = []
    for x in range(w):
        edge_pixels.append(img[0, x])
        edge_pixels.append(img[h - 1, x])
    for y in range(h):
        edge_pixels.append(img[y, 0])
        edge_pixels.append(img[y, w - 1])
    arr = np.array(edge_pixels, dtype=np.float32)
    med = np.median(arr, axis=0)
    return float(med[0]), float(med[1]), float(med[2])


def _color_dist(img: np.ndarray, bg: tuple) -> np.ndarray:
    bg_arr = np.array(bg, dtype=np.float32)
    diff = img.astype(np.float32) - bg_arr
    return np.sqrt(np.sum(diff ** 2, axis=2))


def _local_remove_bg(input_bytes: bytes, tolerance: int = 30) -> bytes:
    """
    GrabCut-based background removal.
    tolerance 5–120 (default 30): lower = gentler (keep more), higher = more aggressive.
    """
    nparr = np.frombuffer(input_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Cannot decode image")

    h, w = img.shape[:2]
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    # ── 1. Detect background color from image edges ───────────────────────────
    bg_b, bg_g, bg_r = _sample_bg_color_cv(img)
    bg_rgb = (bg_r, bg_g, bg_b)
    dist = _color_dist(img_rgb, bg_rgb)
    max_dist = float(np.max(dist)) if np.max(dist) > 0 else 1.0

    # ── 2. Tolerance → threshold scaling ─────────────────────────────────────
    # Lower tolerance = higher threshold = harder to be classified as BG = gentler
    # tolerance=30 → factor=1.0 | tolerance=5 → factor≈1.6 | tolerance=120 → factor≈0.55
    tol_factor = max(0.55, min(1.6, 30.0 / max(float(tolerance), 5.0)))
    # Base multiplier 0.35 is more conservative than old 0.22
    threshold = max(15.0, min(90.0, max_dist * 0.35 * tol_factor))

    # ── 3. Build GrabCut trimap ───────────────────────────────────────────────
    # More conservative: only mark as definite BG if dist < 20% of threshold
    # (was 40% — that was the main cause of over-erasure)
    trimap = np.full((h, w), cv2.GC_PR_FGD, dtype=np.uint8)
    trimap[dist < threshold * 0.20] = cv2.GC_BGD
    trimap[dist > threshold * 2.0]  = cv2.GC_FGD  # only very-clearly-foreground

    # ── 4. Flood-fill connected BG from edges ─────────────────────────────────
    edge_pixels_bg = dist < threshold
    edge_mask = np.zeros((h, w), dtype=np.uint8)
    edge_mask[0, :]    = edge_pixels_bg[0, :]
    edge_mask[h - 1, :] = edge_pixels_bg[h - 1, :]
    edge_mask[:, 0]    = edge_pixels_bg[:, 0]
    edge_mask[:, w - 1] = edge_pixels_bg[:, w - 1]

    visited = np.zeros((h, w), dtype=bool)
    queue: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            if edge_mask[y, x]:
                queue.append((y, x))
                visited[y, x] = True

    dy = [-1, 1, 0, 0]
    dx = [0, 0, -1, 1]
    qi = 0
    while qi < len(queue):
        cy, cx = queue[qi]; qi += 1
        for d in range(4):
            ny, nx = cy + dy[d], cx + dx[d]
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                if dist[ny, nx] < threshold:
                    visited[ny, nx] = True
                    queue.append((ny, nx))

    trimap[visited] = cv2.GC_BGD

    # ── 5. GrabCut refinement ─────────────────────────────────────────────────
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    gc_mask = trimap.copy()
    try:
        cv2.grabCut(img, gc_mask, None, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        gc_mask = trimap

    fg_mask = np.where(
        (gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0
    ).astype(np.uint8)

    # ── 6. Morphological cleanup — gentler than before ────────────────────────
    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    kernel_open  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel_close, iterations=1)
    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN,  kernel_open,  iterations=1)

    # ── 7. Soft feathered alpha ───────────────────────────────────────────────
    alpha = fg_mask.astype(np.float32) / 255.0
    uncertain = (dist >= threshold * 0.20) & (dist <= threshold * 1.2)
    smooth_vals = np.clip((dist - threshold * 0.20) / (threshold * 1.0), 0.0, 1.0)
    alpha = np.where(uncertain, np.maximum(alpha, smooth_vals), alpha)
    # Feather edges with a slightly larger blur for cleaner transitions
    alpha = cv2.GaussianBlur(alpha, (5, 5), 1.0)
    alpha = np.clip(alpha, 0.0, 1.0)

    rgba = cv2.cvtColor(img, cv2.COLOR_BGR2RGBA)
    rgba[:, :, 3] = (alpha * 255).astype(np.uint8)

    pil_img = Image.fromarray(rgba, "RGBA")
    buf = io.BytesIO()
    pil_img.save(buf, "PNG", compress_level=3)
    buf.seek(0)
    return buf.read()


# ── Local: FSRCNN upscale ─────────────────────────────────────────────────────

def _nlm_denoise(img: np.ndarray) -> np.ndarray:
    """Mild denoising that preserves fine detail (pre-upscale)."""
    return cv2.fastNlMeansDenoisingColored(img, None, h=3, hColor=3, templateWindowSize=7, searchWindowSize=21)


def _unsharp(img: np.ndarray, sigma: float = 0.6, amount: float = 2.2) -> np.ndarray:
    """Single-radius unsharp mask (used internally by _sharpen_dtf)."""
    blurred = cv2.GaussianBlur(img, (0, 0), sigma)
    sharpened = cv2.addWeighted(img, amount, blurred, -(amount - 1.0), 0)
    return np.clip(sharpened, 0, 255).astype(np.uint8)


def _sharpen_dtf(img: np.ndarray) -> np.ndarray:
    """
    Dual-pass sharpening tuned for DTF textile printing:
      Pass 1 (fine, σ=0.4, ×1.8): recovers pixel-level crispness from FSRCNN.
      Pass 2 (mid,  σ=1.2, ×1.4): enhances visible edge contrast for print.
    Combined effect gives punchy detail that holds up at 300+ DPI.
    """
    # Pass 1 — micro detail (recover FSRCNN softness)
    p1 = _unsharp(img, sigma=0.4, amount=1.8)
    # Pass 2 — edge/macro contrast
    p2 = _unsharp(p1, sigma=1.2, amount=1.4)
    # Laplacian boost — adds crisp-edge "bite" without halos
    lap = cv2.Laplacian(p2, cv2.CV_64F, ksize=3)
    lap = np.clip(lap * 0.18, -60, 60).astype(np.float32)
    result = np.clip(p2.astype(np.float32) - lap, 0, 255).astype(np.uint8)
    return result


def _clahe_lab(img: np.ndarray, clip_limit: float = 3.5) -> np.ndarray:
    """CLAHE on the L channel of LAB — boosts local contrast without blowouts."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2Lab)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_Lab2BGR)


def _vibrance(img: np.ndarray, amount: float = 0.15) -> np.ndarray:
    """Mild saturation boost in HSV — richer colors for DTF output."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * (1.0 + amount), 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


def _boost_chroma(img: np.ndarray, chroma: float = 0.18, contrast_l: float = 0.06) -> np.ndarray:
    """
    Perceptual color enhancement in LAB space:
      - Chroma boost: scales a* and b* away from grey-neutral (128) → more vivid hues.
      - Mild L contrast: slight S-curve lift on midtones → depth without clipping.
    Operates entirely in perceptual LAB space so hue remains stable under boosting.
    """
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2Lab).astype(np.float32)
    l, a, b_ch = lab[:, :, 0], lab[:, :, 1], lab[:, :, 2]

    # Chroma: a* and b* are centred at 128 in OpenCV's 8-bit LAB
    a = np.clip(128.0 + (a - 128.0) * (1.0 + chroma), 0, 255)
    b_ch = np.clip(128.0 + (b_ch - 128.0) * (1.0 + chroma), 0, 255)

    # Subtle midtone contrast on L (raises shadows slightly, lifts midtones)
    if contrast_l > 0:
        l = np.clip(l + (l / 255.0 - 0.5) * contrast_l * 255.0 * 0.4, 0, 255)

    lab[:, :, 0] = l
    lab[:, :, 1] = a
    lab[:, :, 2] = b_ch
    return cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_Lab2BGR)


def _sharpen_luminance(img: np.ndarray, amount_fine: float = 0.60, amount_mid: float = 0.30) -> np.ndarray:
    """
    Two-pass luminance-only sharpening — natural quality, no halos or ringing.
    Operates entirely on the L* channel of LAB — a*/b* (color) never touched.

    Pass 1 (σ=0.45, fine): recovers waifu2x interpolation softness — micro texture.
    Pass 2 (σ=1.2,  mid):  visible edge acuity for 300 DPI DTF without over-processing.

    Amounts are intentionally moderate so waifu2x-synthesised detail is not destroyed.
    """
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2Lab)
    l, a, b_ch = cv2.split(lab)
    lf = l.astype(np.float32)

    # Pass 1 — fine texture recovery
    sigma_fine = float(_cfg.get("sharpen_sigma_fine", 0.45))
    blur1 = cv2.GaussianBlur(lf, (0, 0), sigma_fine)
    lf = np.clip(lf + (lf - blur1) * amount_fine, 0, 255)

    # Pass 2 — mid-range edge contrast
    sigma_mid = float(_cfg.get("sharpen_sigma_mid", 1.20))
    blur2 = cv2.GaussianBlur(lf, (0, 0), sigma_mid)
    lf = np.clip(lf + (lf - blur2) * amount_mid, 0, 255)

    l_out = lf.astype(np.uint8)
    return cv2.cvtColor(cv2.merge([l_out, a, b_ch]), cv2.COLOR_Lab2BGR)


def _clean_alpha(alpha: np.ndarray) -> np.ndarray:
    """Erode + feather alpha channel after upscaling (params from _cfg)."""
    thr = int(_cfg["alpha_clean_threshold"])
    ero = max(1, int(_cfg["alpha_erode_size"]))
    sig = float(_cfg["alpha_feather_sigma"])
    _, binary = cv2.threshold(alpha, thr, 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ero, ero))
    eroded = cv2.morphologyEx(binary, cv2.MORPH_ERODE, kernel, iterations=1)
    feathered = cv2.GaussianBlur(eroded, (0, 0), sig)
    return np.where(eroded > 0, feathered, 0).astype(np.uint8)


def _local_enhance(input_bytes: bytes, scale: int) -> bytes:
    nparr = np.frombuffer(input_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Cannot decode image")

    has_alpha = (len(img.shape) == 3 and img.shape[2] == 4)
    if has_alpha:
        alpha = img[:, :, 3]
        rgb = img[:, :, :3]
    else:
        alpha = None
        rgb = img

    # ── Super-resolution upscale ──────────────────────────────────────────────
    # Primary: waifu2x cunet (ONNX) — superior quality for DTF vector/art graphics.
    # x4 = two chained 2x passes (standard waifu2x practice).
    # x3 = waifu2x 2x → Lanczos resize to exact 3x.
    # Fallback: FSRCNN (if waifu2x model missing/fails).
    try:
        rgb = _waifu2x_upscale(rgb, scale)
    except Exception as e:
        log.error(f"waifu2x failed ({e}), and FSRCNN fallback is disabled")
        # Fallback to simple Lanczos if waifu2x fails
        h0, w0 = rgb.shape[:2]
        rgb = cv2.resize(rgb, (w0 * scale, h0 * scale), interpolation=cv2.INTER_LANCZOS4)
        log.info(f"Using Lanczos {scale}x fallback")

    # ── Post-processing for print quality ─────────────────────────────────────
    # 1. Moderate LAB luminance sharpening — two passes, low amounts.
    #    Adds just enough crispness without destroying waifu2x-synthesised detail.
    #    CLAHE skipped: creates banding in flat-color DTF areas.
    rgb = _sharpen_luminance(rgb,
                            amount_fine=float(_cfg["sharpen_amount_fine"]),
                            amount_mid=float(_cfg["sharpen_amount_mid"]))
    # 2. Subtle perceptual colour lift — keeps skin tones and gradients natural.
    rgb = _boost_chroma(rgb,
                        chroma=float(_cfg["chroma_boost"]),
                        contrast_l=float(_cfg["contrast_l"]))
    # 3. Optional vibrance boost (HSV saturation)
    vib = float(_cfg.get("vibrance_amount", 0.0))
    if vib > 0:
        rgb = _vibrance(rgb, amount=vib)
    # 4. Optional CLAHE local contrast (disabled by default — can cause DTF banding)
    if int(_cfg.get("clahe_enabled", 0)):
        rgb = _clahe_lab(rgb, clip_limit=float(_cfg.get("clahe_clip_limit", 3.5)))

    # ── Alpha channel upscaling ───────────────────────────────────────────────
    if has_alpha and alpha is not None:
        new_h, new_w = rgb.shape[:2]
        up_alpha = cv2.resize(alpha, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        up_alpha = _clean_alpha(up_alpha)
        result = cv2.merge([rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2], up_alpha])
    else:
        result = rgb

    ok, buf = cv2.imencode(".png", result, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    if not ok:
        raise ValueError("Failed to encode output image")
    return buf.tobytes()


# ── API endpoints ─────────────────────────────────────────────────────────────

class RemoveBgRequest(BaseModel):
    image_b64: str
    tolerance: int = 30  # 5=very gentle, 30=default, 120=aggressive


@app.post("/remove-bg")
def remove_bg(req: RemoveBgRequest):
    try:
        input_bytes = base64.b64decode(req.image_b64)
    except Exception:
        raise HTTPException(400, "Invalid base64 image")

    t = time.time()

    if _replicate_available:
        try:
            log.info("remove-bg: using Replicate (lucataco/remove-bg)")
            output_bytes = _replicate_remove_bg(input_bytes)
            source = "replicate"
        except Exception as e:
            log.warning(f"Replicate remove-bg failed ({e}), falling back to local")
            output_bytes, source = _local_remove_bg_rembg(input_bytes)
    else:
        output_bytes, source = _local_remove_bg_rembg(input_bytes)

    result_img = Image.open(io.BytesIO(output_bytes))
    elapsed = time.time() - t
    log.info(f"remove-bg [{source}]: {result_img.width}x{result_img.height} in {elapsed:.2f}s")

    return JSONResponse({
        "result_b64": base64.b64encode(output_bytes).decode(),
        "width": result_img.width,
        "height": result_img.height,
        "elapsed_ms": round(elapsed * 1000),
        "source": source,
    })


class EnhanceRequest(BaseModel):
    image_b64: str
    scale: int = 4


@app.post("/enhance")
def enhance(req: EnhanceRequest):
    scale = req.scale
    if scale not in (2, 3, 4):
        raise HTTPException(400, "scale must be 2, 3, or 4")

    try:
        input_bytes = base64.b64decode(req.image_b64)
    except Exception:
        raise HTTPException(400, "Invalid base64 image")

    # Safety: refuse images that would produce >50 MP output (OOM risk).
    src_img = Image.open(io.BytesIO(input_bytes))
    src_pixels = src_img.width * src_img.height
    output_pixels = src_pixels * (scale ** 2)
    if output_pixels > 50_000_000:
        raise HTTPException(413, f"Image too large for x{scale} upscale: {src_img.width}x{src_img.height} → "
                                 f"{src_img.width * scale}x{src_img.height * scale} ({output_pixels // 1_000_000}MP > 50MP limit)")

    t = time.time()

    if _replicate_available:
        try:
            log.info(f"enhance x{scale}: using Replicate (Real-ESRGAN)")
            output_bytes = _replicate_enhance(input_bytes, scale)
            source = "replicate-esrgan"
        except Exception as e:
            log.warning(f"Replicate enhance failed ({e}), falling back to waifu2x")
            output_bytes = _local_enhance(input_bytes, scale)
            source = "local-waifu2x"
    else:
        log.info(f"enhance x{scale}: using local waifu2x cunet")
        output_bytes = _local_enhance(input_bytes, scale)
        source = "local-waifu2x"

    result_img = Image.open(io.BytesIO(output_bytes))
    elapsed = time.time() - t
    log.info(f"enhance x{scale} [{source}]: {result_img.width}x{result_img.height} in {elapsed:.2f}s")

    return JSONResponse({
        "result_b64": base64.b64encode(output_bytes).decode(),
        "width": result_img.width,
        "height": result_img.height,
        "elapsed_ms": round(elapsed * 1000),
        "source": source,
    })


if __name__ == "__main__":
    import uvicorn
    _models_dir = os.path.join(os.path.dirname(__file__), "models")
    port = int(os.environ.get("AI_SERVER_PORT", "8765"))
    log.info(f"Starting AI server on port {port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
