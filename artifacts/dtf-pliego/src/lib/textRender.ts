// ── Shared text rendering utilities ──────────────────────────────────────
// Used by TextPanel (preview) and CanvasArea (inline editor → re-upload)

export const FONTS: { family: string; weight: string }[] = [
  // ── Impact / Display ────────────────────────────────────────────────────
  { family: "Bebas Neue",        weight: "400" },
  { family: "Anton",             weight: "400" },
  { family: "Oswald",            weight: "700" },
  { family: "Barlow Condensed",  weight: "800" },
  { family: "Russo One",         weight: "400" },
  { family: "Racing Sans One",   weight: "400" },
  { family: "Bungee",            weight: "400" },
  { family: "Bangers",           weight: "400" },
  { family: "Black Ops One",     weight: "400" },
  { family: "Righteous",         weight: "400" },
  { family: "Squada One",        weight: "400" },
  { family: "Orbitron",          weight: "800" },
  { family: "Chakra Petch",      weight: "700" },
  { family: "Teko",              weight: "600" },
  { family: "Montserrat",        weight: "900" },
  { family: "Ultra",             weight: "400" },
  { family: "Alfa Slab One",     weight: "400" },
  { family: "Permanent Marker",  weight: "400" },
  { family: "Lobster",           weight: "400" },
  { family: "Pacifico",          weight: "400" },
  // ── Added batch 1 ───────────────────────────────────────────────────────
  { family: "Press Start 2P",    weight: "400" },
  { family: "Staatliches",       weight: "400" },
  { family: "Audiowide",         weight: "400" },
  { family: "Lilita One",        weight: "400" },
  { family: "Passion One",       weight: "900" },
  { family: "Fugaz One",         weight: "400" },
  { family: "Graduate",          weight: "400" },
  { family: "Special Elite",     weight: "400" },
  { family: "Cinzel Decorative", weight: "900" },
  { family: "Abril Fatface",     weight: "400" },
  { family: "Fjalla One",        weight: "400" },
  { family: "Faster One",        weight: "400" },
  { family: "Titan One",         weight: "400" },
  { family: "Changa One",        weight: "400" },
  { family: "Yanone Kaffeesatz", weight: "700" },
  { family: "Bowlby One SC",     weight: "400" },
  { family: "Pirata One",        weight: "400" },
  { family: "Boogaloo",          weight: "400" },
  { family: "Fredoka One",       weight: "400" },
  { family: "Sigmar One",        weight: "400" },
  // ── Added batch 2 ───────────────────────────────────────────────────────
  { family: "Rubik Mono One",         weight: "400" },
  { family: "Big Shoulders Display",  weight: "900" },
  { family: "Monoton",                weight: "400" },
  { family: "Creepster",              weight: "400" },
  { family: "Acme",                   weight: "400" },
  { family: "Exo 2",                  weight: "800" },
  { family: "Rampart One",            weight: "400" },
  { family: "Kaushan Script",         weight: "400" },
  { family: "Black Han Sans",         weight: "400" },
  { family: "Limelight",              weight: "400" },
];

export interface TextParams {
  text: string;
  fontFamily: string;
  fontSize: number;       // font height in cm (computed internally from outputWidthCm)
  outputWidthCm: number;  // target output width in cm — the user-facing SIZE control
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  letterSpacing: number;  // 0-30 %
  colorMode: "solid" | "gradient";
  solidColor: string;
  gradColor1: string;
  gradColor2: string;
  gradDir: "horizontal" | "vertical" | "diagonal";
  warpType: string;
  warpAmount: number;
  strokeOn: boolean;
  strokeColor: string;
  strokeWidth: number;
}

export const DEFAULT_PARAMS: TextParams = {
  text: "ERROR707",
  fontFamily: "Bebas Neue",
  fontSize: 2.5,
  outputWidthCm: 8,
  bold: false,
  italic: false,
  align: "center",
  letterSpacing: 0,
  colorMode: "solid",
  solidColor: "#ffffff",
  gradColor1: "#ff6b00",
  gradColor2: "#ffffff",
  gradDir: "horizontal",
  warpType: "none",
  warpAmount: 40,
  strokeOn: false,
  strokeColor: "#000000",
  strokeWidth: 3,
};

const STORAGE_KEY = (uploadId: number) => `dtf-text-params-${uploadId}`;

export function saveTextParams(uploadId: number, params: TextParams) {
  try { localStorage.setItem(STORAGE_KEY(uploadId), JSON.stringify(params)); } catch { /* */ }
}

export function loadTextParams(uploadId: number): TextParams | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(uploadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TextParams;
    // Backward compat: if old save has no outputWidthCm, derive it from fontSize
    if (!parsed.outputWidthCm && parsed.fontSize) {
      parsed.outputWidthCm = parsed.fontSize * 3; // rough approximation
    }
    return parsed;
  } catch { return null; }
}

// ── Low-level drawing helpers ─────────────────────────────────────────────

export function drawCheckerboard(ctx: CanvasRenderingContext2D, W: number, H: number, size = 10) {
  for (let iy = 0; iy < Math.ceil(H / size); iy++) {
    for (let ix = 0; ix < Math.ceil(W / size); ix++) {
      ctx.fillStyle = (ix + iy) % 2 === 0 ? "#2a2a35" : "#1a1a22";
      ctx.fillRect(ix * size, iy * size, size, size);
    }
  }
}

function applyWarp(src: ImageData, dst: ImageData, warpType: string, amount: number) {
  const w = src.width, h = src.height;
  const s = src.data, d = dst.data;
  const amt = (amount / 100) * h * 0.45;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sx = x, sy = y;
      if (warpType === "arch-up")   sy = y + amt * Math.sin(Math.PI * x / w);
      else if (warpType === "arch-down")  sy = y - amt * Math.sin(Math.PI * x / w);
      else if (warpType === "wave")  sy = y + amt * 0.45 * Math.sin(2.2 * Math.PI * x / w);
      else if (warpType === "squeeze") sx = x + amt * 0.45 * Math.sin(Math.PI * y / h);
      else if (warpType === "flag")  sy = y + amt * 0.35 * Math.sin(3 * Math.PI * x / w);

      const fx = Math.max(0, Math.min(w - 1, Math.floor(sx)));
      const fy = Math.max(0, Math.min(h - 1, Math.floor(sy)));
      const cx = Math.min(w - 1, fx + 1), cy = Math.min(h - 1, fy + 1);
      const tx = sx - Math.floor(sx), ty = sy - Math.floor(sy);
      const di = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v00 = s[(fy * w + fx) * 4 + c];
        const v10 = s[(fy * w + cx) * 4 + c];
        const v01 = s[(cy * w + fx) * 4 + c];
        const v11 = s[(cy * w + cx) * 4 + c];
        d[di + c] = Math.round(v00*(1-tx)*(1-ty) + v10*tx*(1-ty) + v01*(1-tx)*ty + v11*tx*ty);
      }
    }
  }
}

function drawWithSpacing(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, extra: number,
  align: "left" | "center" | "right", stroke: boolean,
  fill?: string | CanvasGradient,
) {
  const chars = [...text];
  let totalW = 0;
  for (const ch of chars) totalW += ctx.measureText(ch).width + extra;
  totalW -= extra;
  let curX = align === "center" ? x - totalW / 2 : align === "right" ? x - totalW : x;
  const savedAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (const ch of chars) {
    if (stroke) { ctx.strokeText(ch, curX, y); }
    else { if (fill) ctx.fillStyle = fill; ctx.fillText(ch, curX, y); }
    curX += ctx.measureText(ch).width + extra;
  }
  ctx.textAlign = savedAlign;
}

function fontString(params: TextParams, pxSize: number): string {
  const { italic, bold, fontFamily } = params;
  const wt = bold ? "900" : FONTS.find(f => f.family === fontFamily)?.weight ?? "400";
  return `${italic ? "italic " : ""}${wt} ${Math.round(pxSize)}px "${fontFamily}", sans-serif`;
}

// ── Core render function ──────────────────────────────────────────────────
// scale: how many px per cm (preview ≈ 10-15, export = 118)
// transparent: if true, skip background (for export PNG)
export async function renderTextToCanvas(
  canvas: HTMLCanvasElement,
  params: TextParams,
  scale: number,    // px per CM
  transparent = false,
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const {
    text, fontSize, align, letterSpacing, colorMode,
    solidColor, gradColor1, gradColor2, gradDir,
    warpType, warpAmount, strokeOn, strokeColor, strokeWidth,
  } = params;

  ctx.clearRect(0, 0, W, H);
  if (!transparent) drawCheckerboard(ctx, W, H);

  const pxSize = fontSize * scale;
  const fStr = fontString(params, pxSize);
  try { await document.fonts.load(fStr); } catch { /* */ }

  let fillStyle: string | CanvasGradient = solidColor;
  if (colorMode === "gradient") {
    const grd = gradDir === "horizontal"
      ? ctx.createLinearGradient(0, 0, W, 0)
      : gradDir === "vertical"
      ? ctx.createLinearGradient(0, 0, 0, H)
      : ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, gradColor1);
    grd.addColorStop(1, gradColor2);
    fillStyle = grd;
  }

  const lines = text.split("\n");
  const lineH = pxSize * 1.2;
  const totalTextH = lines.length * lineH;
  const startY = H / 2 - totalTextH / 2 + lineH / 2;
  const xPos = align === "left" ? Math.max(16, strokeWidth * 2 + 8) : align === "right" ? W - Math.max(16, strokeWidth * 2 + 8) : W / 2;
  const lsExtra = (letterSpacing / 100) * pxSize;

  const tmp = document.createElement("canvas");
  tmp.width = W; tmp.height = H;
  const tc = tmp.getContext("2d")!;
  tc.font = fStr;
  tc.textBaseline = "middle";
  tc.textAlign = align;

  for (let li = 0; li < lines.length; li++) {
    const lineY = startY + li * lineH;
    const lineText = lines[li];
    if (strokeOn) {
      tc.strokeStyle = strokeColor;
      tc.lineWidth = strokeWidth;
      tc.lineJoin = "round";
      if (letterSpacing === 0) tc.strokeText(lineText, xPos, lineY);
      else drawWithSpacing(tc, lineText, xPos, lineY, lsExtra, align, true);
    }
    tc.fillStyle = fillStyle;
    if (letterSpacing === 0) tc.fillText(lineText, xPos, lineY);
    else drawWithSpacing(tc, lineText, xPos, lineY, lsExtra, align, false, fillStyle);
  }

  if (warpType !== "none" && warpAmount > 0) {
    const srcData = tc.getImageData(0, 0, W, H);
    const dstData = ctx.createImageData(W, H);
    applyWarp(srcData, dstData, warpType, warpAmount);
    const tmp2 = document.createElement("canvas");
    tmp2.width = W; tmp2.height = H;
    tmp2.getContext("2d")!.putImageData(dstData, 0, 0);
    ctx.drawImage(tmp2, 0, 0);
  } else {
    ctx.drawImage(tmp, 0, 0);
  }
}

// ── Measure natural text size ─────────────────────────────────────────────
export async function measureText(params: TextParams, scale: number): Promise<{ w: number; h: number }> {
  const { text, fontSize, letterSpacing } = params;
  const pxSize = fontSize * scale;
  const fStr = fontString(params, pxSize);
  try { await document.fonts.load(fStr); } catch { /* */ }

  const mc = document.createElement("canvas").getContext("2d")!;
  mc.font = fStr;
  const lsExtra = (letterSpacing / 100) * pxSize;
  const lines = text.split("\n");
  let maxW = 0;
  for (const l of lines) {
    const lw = letterSpacing === 0
      ? mc.measureText(l).width
      : [...l].reduce((a, ch) => a + mc.measureText(ch).width + lsExtra, 0) - lsExtra;
    if (lw > maxW) maxW = lw;
  }
  const lineH = pxSize * 1.2;
  return { w: maxW, h: lines.length * lineH };
}

// ── Compute fontSize (font height) from target output width ──────────────
// Returns the font height in cm that makes the rendered output exactly `targetWidthCm` wide
export async function computeFontSizeFromWidth(
  params: TextParams,
  targetWidthCm: number,
): Promise<number> {
  const DPI_CM = 300 / 2.54;
  const strokePad = params.strokeOn ? params.strokeWidth * 4 : 0;
  // Measure at fontSize=1cm to get natural width ratio (px per cm of font height)
  const refParams = { ...params, fontSize: 1 };
  const nat = await measureText(refParams, DPI_CM);
  if (nat.w <= 0) return 1;
  // Solve: nat.w * fontSize + 2 * fontSize * DPI_CM * 0.25 + strokePad = targetWidthCm * DPI_CM
  // fontSize * (nat.w + 0.5 * DPI_CM) = targetWidthCm * DPI_CM - strokePad
  const num = targetWidthCm * DPI_CM - strokePad;
  const den = nat.w + 0.5 * DPI_CM;
  return Math.max(0.05, num / den);
}

// ── Export-quality blob ───────────────────────────────────────────────────
export async function renderTextToBlob(
  params: TextParams,
): Promise<{ blob: Blob; widthCm: number; heightCm: number }> {
  const DPI_CM = 300 / 2.54; // px per cm at 300 DPI ≈ 118.1
  const { strokeOn, strokeWidth, warpType, warpAmount } = params;

  const nat = await measureText(params, DPI_CM);
  const PAD_X = Math.round(params.fontSize * DPI_CM * 0.25);
  const PAD_Y = Math.round(params.fontSize * DPI_CM * 0.22);
  const strokePad = strokeOn ? strokeWidth * 4 : 0;
  const warpPad = warpType !== "none" ? Math.round((warpAmount / 100) * nat.h * 0.55) : 0;

  const fullW = Math.max(4, Math.round(nat.w) + PAD_X * 2 + strokePad);
  const fullH = Math.max(4, Math.round(nat.h) + PAD_Y * 2 + warpPad * 2 + strokePad);

  const canvas = document.createElement("canvas");
  canvas.width = fullW;
  canvas.height = fullH;
  await renderTextToCanvas(canvas, params, DPI_CM, true);

  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => b ? res(b) : rej(new Error("toBlob failed")), "image/png"),
  );

  return {
    blob,
    widthCm: fullW / DPI_CM,
    heightCm: fullH / DPI_CM,
  };
}
