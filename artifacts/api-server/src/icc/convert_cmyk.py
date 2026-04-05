"""
Convert RGBA PNG → FOGRA39 CMYK and write RAW pixel bytes (no JPEG).

By writing raw bytes we avoid all JPEG CMYK inversion ambiguity:
  Pillow CMYK:  255 = full ink, 0 = no ink
  PDF default:  byte/255 → component value → 1.0 = full ink ✓
  No Decode array needed, no JPEG APP14 guessing.

The Node.js side reads the raw file, deflate-compresses it, and embeds it
as a FlateDecode image stream in the PDF.

Usage: python3 convert_cmyk.py <input_png> <output_raw> <fogra39_icc>
Output format: raw 8-bit CMYK pixels, top-to-bottom, width * height * 4 bytes
               first two bytes are width (big-endian uint32), then height,
               then the pixel data.
"""
import sys, struct
from PIL import Image, ImageCms

input_png  = sys.argv[1]
output_raw = sys.argv[2]
fogra_path = sys.argv[3] if len(sys.argv) > 3 else "src/icc/FOGRA39.icc"

img = Image.open(input_png)

# Composite RGBA onto white — transparent areas → no ink (white paper)
if img.mode == "RGBA":
    white = Image.new("RGB", img.size, (255, 255, 255))
    white.paste(img.convert("RGB"), mask=img.split()[3])
    rgb = white
else:
    rgb = img.convert("RGB")

# Convert sRGB → FOGRA39 CMYK via LCMS2
srgb  = ImageCms.createProfile("sRGB")
fogra = ImageCms.getOpenProfile(fogra_path)
transform = ImageCms.buildTransform(
    srgb, fogra, "RGB", "CMYK",
    renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
    # Black Point Compensation prevents shadow clipping: it scales the entire
    # lightness range so absolute black/white in sRGB maps correctly to the
    # darkest/lightest the FOGRA39 medium can reproduce, avoiding the
    # "darker shadows" artifact that appears without it.
    flags=ImageCms.Flags.BLACKPOINTCOMPENSATION,
)
cmyk = ImageCms.applyTransform(rgb, transform)

# Write: 4-byte width, 4-byte height, then raw CMYK pixels
w, h = cmyk.size
raw_pixels = cmyk.tobytes()  # CMYK interleaved, 4 bytes/pixel, 255=full ink

with open(output_raw, "wb") as f:
    f.write(struct.pack(">II", w, h))
    f.write(raw_pixels)
