import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus, AlignLeft, AlignCenter, AlignRight, Bold, Italic,
  Loader2, Check, RefreshCw, Search, X, ChevronDown, ChevronUp,
} from "lucide-react";
import type { PliegoImage } from "@workspace/api-client-react";
import {
  FONTS, DEFAULT_PARAMS, TextParams,
  saveTextParams, loadTextParams,
  renderTextToCanvas, renderTextToBlob, measureText, computeFontSizeFromWidth,
} from "@/lib/textRender";
import { textParamsStore } from "@/lib/textParamsStore";

export type { TextParams };
export { saveTextParams, loadTextParams };

const WARPS = [
  { id: "none",       label: "—"      },
  { id: "arch-up",   label: "↑ Arco" },
  { id: "arch-down", label: "↓ Arco" },
  { id: "wave",      label: "Onda"   },
  { id: "squeeze",   label: "Inflar" },
  { id: "flag",      label: "Bandera"},
];


interface Props {
  pliegoId: number;
  selectedImage: PliegoImage | null;
  onImageAdded: () => void;
  onImageUpdated: () => void;
}

type SaveStatus = "idle" | "pending" | "saving" | "saved";

// ── tiny blob-url cache so multiple rerenders don't create many objects ──
let _lastBlobUrl: string | null = null;
function releasePrev() {
  if (_lastBlobUrl) { URL.revokeObjectURL(_lastBlobUrl); _lastBlobUrl = null; }
}

export function TextPanel({ pliegoId, selectedImage, onImageAdded, onImageUpdated }: Props) {
  const [params, setParams] = useState<TextParams>(DEFAULT_PARAMS);
  const [editingImage, setEditingImage] = useState<PliegoImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [outputDims, setOutputDims] = useState<{ w: number; h: number } | null>(null);
  const [fontSearch, setFontSearch] = useState("");
  const [hoveredFont, setHoveredFont] = useState<string | null>(null);
  const [fontPanelOpen, setFontPanelOpen] = useState(true);

  const settingFontSizeRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const livePreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingImageRef = useRef<PliegoImage | null>(null);
  editingImageRef.current = editingImage;

  const previewRef = useRef<HTMLCanvasElement>(null);

  // ── helper: update local params ────────────────────────────────────
  const set = useCallback(<K extends keyof TextParams>(key: K, val: TextParams[K]) =>
    setParams(p => ({ ...p, [key]: val })), []);

  // ── Load saved params when selected image changes ──────────────────
  useEffect(() => {
    if (!selectedImage) {
      setEditingImage(null);
      setSaveStatus("idle");
      textParamsStore.clear();
      return;
    }
    const saved = loadTextParams(selectedImage.uploadId);
    if (saved) {
      const merged = { ...DEFAULT_PARAMS, ...saved };
      setParams(merged);
      setEditingImage(selectedImage);
      setSaveStatus("idle");
      // Register in store so TextToolbar can see it
      textParamsStore.set(selectedImage.uploadId, merged);
    } else {
      setEditingImage(null);
      textParamsStore.clear();
    }
  }, [selectedImage?.id]);

  // ── Listen to store changes from TextToolbar ───────────────────────
  useEffect(() => {
    const unsub = textParamsStore.subscribeParams((uid, storeParams) => {
      if (!storeParams || uid !== editingImageRef.current?.uploadId) return;
      // Only sync if store was updated by toolbar (different from local)
      setParams(prev => {
        if (JSON.stringify(prev) === JSON.stringify(storeParams)) return prev;
        return { ...storeParams };
      });
    });
    return unsub;
  }, []);

  // ── Width-based font size ──────────────────────────────────────────
  useEffect(() => {
    if (settingFontSizeRef.current) return;
    let cancelled = false;
    computeFontSizeFromWidth(params, params.outputWidthCm).then(fs => {
      if (cancelled) return;
      settingFontSizeRef.current = true;
      setParams(p => ({ ...p, fontSize: fs }));
      setTimeout(() => { settingFontSizeRef.current = false; }, 50);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.outputWidthCm, params.text, params.fontFamily, params.bold, params.italic,
      params.letterSpacing, params.strokeOn, params.strokeWidth]);

  // ── Sync params to store (so toolbar stays in sync) ───────────────
  useEffect(() => {
    if (!editingImage) return;
    textParamsStore.set(editingImage.uploadId, params);
  }, [params, editingImage]);

  // ── Render sidebar preview ─────────────────────────────────────────
  const renderPreview = useCallback(async (overrideFont?: string | null) => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const previewParams = overrideFont ? { ...params, fontFamily: overrideFont } : params;
    const PW = canvas.offsetWidth || 240;
    const BASE_SCALE = 10;
    const strokePad = previewParams.strokeOn ? previewParams.strokeWidth * 2 : 0;
    const warpPad = previewParams.warpType !== "none"
      ? (previewParams.warpAmount / 100) * previewParams.fontSize * BASE_SCALE * 0.55 : 0;
    const nat = await measureText(previewParams, BASE_SCALE);
    const natW = nat.w + strokePad * 2 + 24;
    const natH = nat.h + strokePad * 2 + warpPad * 2 + 16;
    const fitScale = Math.min((PW * 0.94) / natW, (180 * 0.94) / natH, 2) * BASE_SCALE;
    const lineH = previewParams.fontSize * fitScale * 1.2;
    const totalH = previewParams.text.split("\n").length * lineH;
    const warpPad2 = previewParams.warpType !== "none"
      ? (previewParams.warpAmount / 100) * totalH * 0.55 : 0;
    const sp2 = previewParams.strokeOn ? previewParams.strokeWidth * 2 : 0;
    const H = Math.max(72, Math.round(totalH + sp2 + warpPad2 * 2 + 20));
    canvas.width = Math.round(PW);
    canvas.height = H;
    await renderTextToCanvas(canvas, previewParams, fitScale, false);

    if (!overrideFont) {
      const DPI_CM = 300 / 2.54;
      const n2 = await measureText(previewParams, DPI_CM);
      const PAD_X = previewParams.fontSize * DPI_CM * 0.25;
      const PAD_Y = previewParams.fontSize * DPI_CM * 0.22;
      const sp = previewParams.strokeOn ? previewParams.strokeWidth * 4 : 0;
      const wp = previewParams.warpType !== "none"
        ? (previewParams.warpAmount / 100) * n2.h * 0.55 : 0;
      const fw = Math.max(4, n2.w + PAD_X * 2 + sp);
      const fh = Math.max(4, n2.h + PAD_Y * 2 + wp * 2 + sp);
      setOutputDims({ w: fw / DPI_CM, h: fh / DPI_CM });
    }
  }, [params]);

  useEffect(() => {
    if (!hoveredFont) renderPreview(null);
  }, [params, hoveredFont, renderPreview]);

  useEffect(() => {
    if (hoveredFont) renderPreview(hoveredFont);
    else renderPreview(null);
  }, [hoveredFont, renderPreview]);

  // ── Generate live preview blob URL for canvas (debounced 120ms) ───
  useEffect(() => {
    if (!editingImage) return;
    if (livePreviewTimerRef.current) clearTimeout(livePreviewTimerRef.current);
    livePreviewTimerRef.current = setTimeout(async () => {
      try {
        const { blob } = await renderTextToBlob(params);
        releasePrev();
        const url = URL.createObjectURL(blob);
        _lastBlobUrl = url;
        textParamsStore.setPreview(editingImage.uploadId, url);
      } catch { /* ignore */ }
    }, 120);
    return () => { if (livePreviewTimerRef.current) clearTimeout(livePreviewTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, editingImage?.uploadId]);

  // Clean up live preview when switching away from editing
  useEffect(() => {
    if (!editingImage) {
      releasePrev();
    }
  }, [editingImage]);

  // ── Auto-save to server (debounced 1.8s) ──────────────────────────
  useEffect(() => {
    if (!editingImageRef.current) return;
    if (saveStatus === "saving") return;
    setSaveStatus("pending");
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const img = editingImageRef.current;
      if (!img) return;
      setSaveStatus("saving");
      (async () => {
        try {
          const { blob } = await renderTextToBlob(params);
          const form = new FormData();
          form.append("file", blob, "texto.png");
          const res = await fetch(`/api/uploads/${img.uploadId}/replace`, {
            method: "POST", body: form,
          });
          if (!res.ok) throw new Error("replace failed");
          saveTextParams(img.uploadId, params);
          setSaveStatus("saved");
          onImageUpdated();
          setTimeout(() => setSaveStatus("idle"), 2000);
        } catch { setSaveStatus("idle"); }
      })();
    }, 1800);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // ── Add new text to pliego ─────────────────────────────────────────
  const handleAdd = async () => {
    if (!params.text.trim()) { toast.error("Escribe algún texto primero"); return; }
    setBusy(true);
    try {
      const { blob, widthCm, heightCm } = await renderTextToBlob(params);
      const fd = new FormData();
      fd.append("file", blob, "texto.png");
      const upRes = await fetch(`/api/uploads`, { method: "POST", body: fd });
      if (!upRes.ok) throw new Error("Upload failed");
      const upload = await upRes.json();
      const addRes = await fetch(`/api/pliegos/${pliegoId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: upload.id, xCm: 1, yCm: 1, widthCm, heightCm, quantity: 1 }),
      });
      if (!addRes.ok) throw new Error("Add failed");
      saveTextParams(upload.id, params);
      // Register new image in store
      textParamsStore.set(upload.id, params);
      toast.success("Texto agregado al pliego");
      onImageAdded();
    } catch { toast.error("Error al agregar texto"); }
    finally { setBusy(false); }
  };

  // ── Filter fonts ───────────────────────────────────────────────────
  const filteredFonts = useMemo(() =>
    fontSearch.trim()
      ? FONTS.filter(f => f.family.toLowerCase().includes(fontSearch.toLowerCase()))
      : FONTS,
    [fontSearch]
  );

  const isEditing = editingImage !== null;
  const activeFont = hoveredFont ?? params.fontFamily;

  const Swatch = ({ value, onChange, size = 30 }: { value: string; onChange: (v: string) => void; size?: number }) => (
    <label className="relative cursor-pointer rounded-lg shrink-0 overflow-hidden"
      style={{
        width: size, height: size, background: value,
        border: "2px solid rgba(255,255,255,0.22)",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
        display: "block",
      }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
    </label>
  );

  return (
    <div className="flex flex-col text-sm" style={{ background: "rgba(0,0,0,0.18)" }}>

      {/* ── LIVE PREVIEW ──────────────────────────────────────── */}
      <div className="relative" style={{ background: "#0a0a12", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <canvas ref={previewRef} style={{ display: "block", width: "100%", height: "auto", minHeight: 72 }} />
        {outputDims && (
          <div className="absolute bottom-1.5 right-2 text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: "rgba(0,0,0,0.55)", color: "rgba(255,255,255,0.38)", backdropFilter: "blur(4px)" }}>
            {outputDims.w.toFixed(1)} × {outputDims.h.toFixed(1)} cm
          </div>
        )}
        {isEditing && (
          <div className="absolute top-1.5 left-2 flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(99,102,241,0.22)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.35)" }}>
            Editando
          </div>
        )}
        {hoveredFont && (
          <div className="absolute bottom-1.5 left-2 text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(99,102,241,0.3)", color: "#c7d2fe", border: "1px solid rgba(99,102,241,0.4)" }}>
            {hoveredFont}
          </div>
        )}
      </div>

      {/* ── TEXTAREA ──────────────────────────────────────────── */}
      <div className="px-2.5 pt-2.5 pb-2">
        <textarea
          value={params.text}
          onChange={e => set("text", e.target.value)}
          placeholder="Escribe tu texto…"
          rows={2}
          style={{
            fontFamily: `"${activeFont}", sans-serif`,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 8, color: "#eeeeff", fontSize: 13,
            padding: "7px 10px", resize: "none", outline: "none",
            width: "100%", boxSizing: "border-box", lineHeight: 1.4,
          }}
        />
      </div>

      {/* ── FORMAT BAR ────────────────────────────────────────── */}
      <div className="px-2.5 pb-2.5 flex items-center gap-1 flex-wrap">
        {/* Width (ancho) */}
        <div className="flex items-center rounded-lg overflow-hidden shrink-0"
          style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}>
          <button onClick={() => set("outputWidthCm", Math.max(0.5, +(params.outputWidthCm - 0.5).toFixed(1)))}
            className="w-6 h-7 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors text-sm">−</button>
          <input type="number" min={0.5} max={60} step={0.5} value={params.outputWidthCm}
            onChange={e => set("outputWidthCm", parseFloat(e.target.value) || 1)}
            className="w-12 h-7 text-[11px] text-center font-mono text-violet-200/90 bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button onClick={() => set("outputWidthCm", Math.min(60, +(params.outputWidthCm + 0.5).toFixed(1)))}
            className="w-6 h-7 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors text-sm">+</button>
        </div>
        <span className="text-[9px] text-white/25 shrink-0">cm</span>

        <div className="w-px h-5 bg-white/10 shrink-0 mx-0.5" />

        {/* Bold / Italic */}
        {[
          { key: "bold" as const, icon: <Bold size={11} />, title: "Negrita" },
          { key: "italic" as const, icon: <Italic size={11} />, title: "Cursiva" },
        ].map(({ key, icon, title }) => (
          <button key={key} onClick={() => set(key, !params[key])} title={title}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
            style={{
              background: params[key] ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.05)",
              border: params[key] ? "1px solid rgba(139,92,246,0.55)" : "1px solid rgba(255,255,255,0.09)",
              color: params[key] ? "#c4b5fd" : "#6b7280",
            }}>
            {icon}
          </button>
        ))}

        <div className="w-px h-5 bg-white/10 shrink-0 mx-0.5" />

        {/* Alignment */}
        {(["left", "center", "right"] as const).map(a => {
          const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
          return (
            <button key={a} onClick={() => set("align", a)}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
              style={{
                background: params.align === a ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.05)",
                border: params.align === a ? "1px solid rgba(139,92,246,0.55)" : "1px solid rgba(255,255,255,0.09)",
                color: params.align === a ? "#c4b5fd" : "#6b7280",
              }}>
              <Icon size={11} />
            </button>
          );
        })}

        {/* Letter spacing */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <span className="text-[8px] text-white/25 select-none">AV</span>
          <input type="range" min={0} max={30} step={1} value={params.letterSpacing}
            onChange={e => set("letterSpacing", parseInt(e.target.value))}
            style={{ width: 44, accentColor: "#818cf8", height: 2, cursor: "pointer" }} />
        </div>
      </div>

      {/* ── FONT PICKER ──────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => setFontPanelOpen(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.03] transition-colors"
          style={{ background: "transparent" }}>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold tracking-[0.15em] text-white/30 uppercase">Fuente</span>
            <span className="text-[10px] text-white/50" style={{ fontFamily: `"${params.fontFamily}", sans-serif` }}>
              {params.fontFamily}
            </span>
          </div>
          <div className="text-white/70">{fontPanelOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</div>
        </button>

        {fontPanelOpen && (
          <div>
            {/* Search */}
            <div className="relative mx-2.5 mb-1.5">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
              <input type="text" value={fontSearch} onChange={e => setFontSearch(e.target.value)}
                placeholder="Buscar fuente…"
                className="w-full h-7 pl-7 pr-7 text-[11px] text-white/70 placeholder:text-white/20 rounded-lg outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
              />
              {fontSearch && (
                <button onClick={() => setFontSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Font list — Canva style */}
            <div className="overflow-y-auto" style={{ maxHeight: 220, scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
              {filteredFonts.length === 0
                ? <div className="px-3 py-4 text-[10px] text-white/25 text-center">Sin resultados</div>
                : filteredFonts.map(f => {
                    const isActive = params.fontFamily === f.family;
                    const isHov = hoveredFont === f.family;
                    return (
                      <button key={f.family}
                        onMouseEnter={() => setHoveredFont(f.family)}
                        onMouseLeave={() => setHoveredFont(null)}
                        onClick={() => { set("fontFamily", f.family); setHoveredFont(null); }}
                        className="w-full flex items-center px-3 py-1.5 transition-colors text-left"
                        style={{
                          background: isHov ? "rgba(99,102,241,0.12)" : isActive ? "rgba(99,102,241,0.07)" : "transparent",
                          borderLeft: isActive || isHov ? "2px solid rgba(99,102,241,0.5)" : "2px solid transparent",
                        }}>
                        <span className="flex-1 min-w-0 truncate text-[13px] leading-tight"
                          style={{ fontFamily: `"${f.family}", sans-serif`, fontWeight: f.weight, color: isActive ? "#e0e7ff" : isHov ? "#c7d2fe" : "rgba(255,255,255,0.65)" }}>
                          {f.family}
                        </span>
                        <span className="shrink-0 text-[11px] ml-2 opacity-40"
                          style={{ fontFamily: `"${f.family}", sans-serif`, fontWeight: f.weight, color: "rgba(255,255,255,0.6)" }}>
                          AaBbCc
                        </span>
                        {isActive && <Check size={12} className="shrink-0 ml-2 text-indigo-400" />}
                      </button>
                    );
                  })
              }
            </div>
          </div>
        )}
      </div>

      {/* ── COLOR ──────────────────────────────────────────────── */}
      <div className="px-2.5 py-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[9px] font-bold tracking-[0.15em] text-white/30 uppercase flex-1">Color</span>
          {(["solid", "gradient"] as const).map(m => (
            <button key={m} onClick={() => set("colorMode", m)}
              className="px-2 h-5 text-[9px] font-semibold rounded-md transition-all"
              style={{
                background: params.colorMode === m ? "rgba(139,92,246,0.28)" : "rgba(255,255,255,0.04)",
                color: params.colorMode === m ? "#c4b5fd" : "#4b5563",
                border: params.colorMode === m ? "1px solid rgba(139,92,246,0.45)" : "1px solid rgba(255,255,255,0.07)",
              }}>
              {m === "solid" ? "Sólido" : "Degradado"}
            </button>
          ))}
        </div>
        {params.colorMode === "solid" ? (
          <div className="flex items-center gap-2">
            <Swatch value={params.solidColor} onChange={v => set("solidColor", v)} size={32} />
            <span className="text-[10px] font-mono text-white/40">{params.solidColor.toUpperCase()}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-1">
              {(["horizontal", "vertical", "diagonal"] as const).map(d => (
                <button key={d} onClick={() => set("gradDir", d)}
                  className="flex-1 h-6 text-[9px] font-semibold rounded-md transition-all"
                  style={{
                    background: params.gradDir === d ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.04)",
                    color: params.gradDir === d ? "#c4b5fd" : "#4b5563",
                    border: params.gradDir === d ? "1px solid rgba(139,92,246,0.4)" : "1px solid rgba(255,255,255,0.06)",
                  }}>
                  {d === "horizontal" ? "↔" : d === "vertical" ? "↕" : "↗"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Swatch value={params.gradColor1} onChange={v => set("gradColor1", v)} size={28} />
              <div className="flex-1 h-5 rounded-md" style={{
                background: `linear-gradient(${params.gradDir === "horizontal" ? "to right" : params.gradDir === "vertical" ? "to bottom" : "135deg"}, ${params.gradColor1}, ${params.gradColor2})`,
                border: "1px solid rgba(255,255,255,0.07)",
              }} />
              <Swatch value={params.gradColor2} onChange={v => set("gradColor2", v)} size={28} />
            </div>
          </div>
        )}
      </div>

      {/* ── BORDE ─────────────────────────────────────────────── */}
      <div className="px-2.5 py-2.5 flex items-center gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => set("strokeOn", !params.strokeOn)}
          className="flex items-center gap-1.5 shrink-0"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          <div className="w-8 h-4 rounded-full relative transition-all"
            style={{ background: params.strokeOn ? "#7c3aed" : "rgba(255,255,255,0.12)" }}>
            <div className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all"
              style={{ left: params.strokeOn ? "17px" : "2px", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
          </div>
          <span className="text-[9px] text-white/35">Borde</span>
        </button>
        {params.strokeOn && (
          <>
            <Swatch value={params.strokeColor} onChange={v => set("strokeColor", v)} size={26} />
            <input type="range" min={1} max={12} step={1} value={params.strokeWidth}
              onChange={e => set("strokeWidth", parseInt(e.target.value))}
              className="flex-1" style={{ accentColor: "#818cf8", height: 2, cursor: "pointer" }} />
            <span className="text-[9px] font-mono text-white/35 min-w-[14px] text-right">{params.strokeWidth}</span>
          </>
        )}
      </div>

      {/* ── DEFORMAR ──────────────────────────────────────────── */}
      <div className="px-2.5 py-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-bold tracking-[0.15em] text-white/30 uppercase">Deformar</span>
          {params.warpType !== "none" && (
            <span className="text-[9px] font-mono text-violet-300/70">{params.warpAmount}%</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {WARPS.map(w => (
            <button key={w.id} onClick={() => set("warpType", w.id)}
              className="px-2 h-6 text-[9px] font-bold rounded-md transition-all"
              style={{
                background: params.warpType === w.id ? "rgba(139,92,246,0.28)" : "rgba(255,255,255,0.04)",
                color: params.warpType === w.id ? "#c4b5fd" : "#4b5563",
                border: params.warpType === w.id ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.06)",
              }}>
              {w.label}
            </button>
          ))}
        </div>
        {params.warpType !== "none" && (
          <input type="range" min={5} max={100} step={5} value={params.warpAmount}
            onChange={e => set("warpAmount", parseInt(e.target.value))}
            style={{ width: "100%", accentColor: "#818cf8", height: 3, borderRadius: 8, cursor: "pointer" }} />
        )}
      </div>

      {/* ── BOTTOM ACTION ─────────────────────────────────────── */}
      <div className="px-2.5 pb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {saveStatus !== "idle" && (
          <div className="flex items-center gap-1 py-1.5 text-[9px]"
            style={{ color: saveStatus === "saved" ? "#4ade80" : "#a78bfa" }}>
            {saveStatus === "pending" && <span className="opacity-60">● Auto-guardando…</span>}
            {saveStatus === "saving" && <><Loader2 size={9} className="animate-spin" /><span>Guardando…</span></>}
            {saveStatus === "saved"  && <><Check size={9} /><span>Guardado</span></>}
          </div>
        )}
        <button onClick={handleAdd} disabled={busy || !params.text.trim()}
          className="w-full flex items-center justify-center gap-1.5 font-semibold mt-1.5 transition-all"
          style={{
            padding: "9px 0", borderRadius: 10,
            background: busy ? "rgba(139,92,246,0.1)" : "linear-gradient(135deg, rgba(109,40,217,0.65), rgba(79,70,229,0.65))",
            border: "1px solid rgba(139,92,246,0.5)",
            color: busy || !params.text.trim() ? "rgba(167,139,250,0.35)" : "#e9d5ff",
            cursor: busy || !params.text.trim() ? "not-allowed" : "pointer",
            fontSize: 11,
            boxShadow: busy ? "none" : "0 0 18px rgba(139,92,246,0.15)",
          }}>
          {busy
            ? <><RefreshCw size={11} className="animate-spin" /> Procesando…</>
            : <><Plus size={11} /> {isEditing ? "Agregar nuevo" : "Agregar al pliego"}</>}
        </button>
      </div>
    </div>
  );
}
