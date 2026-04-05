import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  Search, X, ChevronDown, Check,
} from "lucide-react";
import { textParamsStore } from "@/lib/textParamsStore";
import {
  FONTS, DEFAULT_PARAMS, computeFontSizeFromWidth,
  renderTextToBlob, saveTextParams, type TextParams,
} from "@/lib/textRender";


const WARP_OPTIONS = [
  { id: "none", label: "—" },
  { id: "arch-up", label: "↑" },
  { id: "arch-down", label: "↓" },
  { id: "wave", label: "~" },
  { id: "squeeze", label: "●" },
  { id: "flag", label: "⚑" },
] as const;

type SaveStatus = "idle" | "pending" | "saving" | "saved";

export interface TextToolbarProps {
  onImageUpdated: () => void;
}

export function TextToolbar({ onImageUpdated }: TextToolbarProps) {
  const [params, setParams] = useState<TextParams>({ ...DEFAULT_PARAMS });
  const [uploadId, setUploadId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Font dropdown
  const [fontOpen, setFontOpen] = useState(false);
  const [fontSearch, setFontSearch] = useState("");
  const [hoveredFont, setHoveredFont] = useState<string | null>(null);
  const fontBtnRef = useRef<HTMLButtonElement>(null);
  const fontPanelRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 60, left: 8 });

  const settingFontSizeRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const livePreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBlobUrl = useRef<string | null>(null);
  const uploadIdRef = useRef<number | null>(null);
  uploadIdRef.current = uploadId;

  // ── Subscribe to store (when a text image is selected) ────────────
  useEffect(() => {
    const unsub = textParamsStore.subscribeParams((uid, p) => {
      setUploadId(uid);
      if (p) {
        setParams(prev => {
          if (JSON.stringify(prev) === JSON.stringify(p)) return prev;
          return { ...p };
        });
        setSaveStatus("idle");
      } else {
        setUploadId(null);
        setParams({ ...DEFAULT_PARAMS });
        setSaveStatus("idle");
      }
      if (!p) { setFontOpen(false); setFontSearch(""); }
    });
    const { uploadId: uid, params: p } = textParamsStore.get();
    setUploadId(uid);
    setParams(p ? { ...p } : { ...DEFAULT_PARAMS });
    return unsub;
  }, []);

  // ── Close font dropdown on outside click ─────────────────────────
  useEffect(() => {
    if (!fontOpen) return;
    const handler = (e: MouseEvent) => {
      const inD = fontPanelRef.current?.contains(e.target as Node);
      const inB = fontBtnRef.current?.contains(e.target as Node);
      if (!inD && !inB) setFontOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [fontOpen]);

  // ── Width → font size ─────────────────────────────────────────────
  useEffect(() => {
    if (settingFontSizeRef.current) return;
    let cancelled = false;
    computeFontSizeFromWidth(params, params.outputWidthCm).then(fs => {
      if (cancelled) return;
      settingFontSizeRef.current = true;
      setParams(prev => {
        const next = { ...prev, fontSize: fs };
        if (uploadIdRef.current !== null) textParamsStore.set(uploadIdRef.current, next);
        return next;
      });
      setTimeout(() => { settingFontSizeRef.current = false; }, 50);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.outputWidthCm, params.text, params.fontFamily, params.bold, params.italic,
      params.letterSpacing, params.strokeOn, params.strokeWidth]);

  // ── Live canvas preview (debounced 120ms) ─────────────────────────
  useEffect(() => {
    if (!uploadId) return;
    if (livePreviewTimerRef.current) clearTimeout(livePreviewTimerRef.current);
    livePreviewTimerRef.current = setTimeout(async () => {
      try {
        const { blob } = await renderTextToBlob(params);
        if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current);
        const url = URL.createObjectURL(blob);
        lastBlobUrl.current = url;
        textParamsStore.setPreview(uploadId, url);
      } catch { /* ignore */ }
    }, 120);
    return () => { if (livePreviewTimerRef.current) clearTimeout(livePreviewTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, uploadId]);

  // ── Auto-save when editing (debounced 1.8s) ──────────────────────
  useEffect(() => {
    const uid = uploadIdRef.current;
    if (!uid) return;
    setSaveStatus("pending");
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const { blob } = await renderTextToBlob(params);
        const form = new FormData();
        form.append("file", blob, "texto.png");
        const res = await fetch(`/api/uploads/${uid}/replace`, { method: "POST", body: form });
        if (!res.ok) throw new Error();
        saveTextParams(uid, params);
        setSaveStatus("saved");
        onImageUpdated();
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch { setSaveStatus("idle"); }
    }, 1800);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // ── Set param helper ──────────────────────────────────────────────
  const set = useCallback(<K extends keyof TextParams>(key: K, val: TextParams[K]) => {
    setParams(prev => {
      const next = { ...prev, [key]: val };
      if (uploadIdRef.current !== null) textParamsStore.set(uploadIdRef.current, next);
      return next;
    });
  }, []);

  const filteredFonts = useMemo(() =>
    fontSearch.trim()
      ? FONTS.filter(f => f.family.toLowerCase().includes(fontSearch.toLowerCase()))
      : FONTS,
    [fontSearch],
  );

  const activeFont = hoveredFont ?? params.fontFamily;
  const isEditing = uploadId !== null;

  // Status dot
  const StatusDot = () => {
    if (!isEditing || saveStatus === "idle") return null;
    const color = saveStatus === "saved" ? "#4ade80" : saveStatus === "saving" ? "#818cf8" : "#f59e0b";
    const label = saveStatus === "saved" ? "Guardado" : saveStatus === "saving" ? "Guardando…" : "Pendiente";
    return (
      <div className="flex items-center gap-1 shrink-0" title={label}>
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
        <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
      </div>
    );
  };

  return (
    <div
      className="w-full shrink-0"
      style={{
        overflow: "hidden",
        height: isEditing ? 44 : 0,
        opacity: isEditing ? 1 : 0,
        transition: "height 280ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease",
        background: "rgba(13,13,20,0.98)",
        borderBottom: isEditing ? "1px solid rgba(255,255,255,0.07)" : "none",
        backdropFilter: "blur(12px)",
        zIndex: 50,
        position: "relative",
        willChange: "height, opacity",
      }}
    >
      {/* ── Formatting tools (horizontal scroll) ─────────────────── */}
      <div className="flex items-center h-11 px-3 gap-1.5 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}>

        {/* ── FONT SELECTOR ─────────────────────────────────── */}
        <div className="relative shrink-0">
          <button
            ref={fontBtnRef}
            onClick={() => {
              if (!fontOpen && fontBtnRef.current) {
                const r = fontBtnRef.current.getBoundingClientRect();
                setDropdownPos({ top: r.bottom + 4, left: r.left });
              }
              setFontOpen(v => !v);
            }}
            className="flex items-center gap-2 h-8 px-3 rounded-lg transition-all"
            style={{
              background: fontOpen ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.06)",
              border: fontOpen ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.1)",
              color: "#e0e7ff", minWidth: 110, maxWidth: 160,
            }}
          >
            <span className="text-[12px] truncate flex-1 text-left"
              style={{ fontFamily: `"${activeFont}", sans-serif` }}>
              {activeFont}
            </span>
            <ChevronDown size={11} className="shrink-0 text-white/70" />
          </button>

          {fontOpen && createPortal(
            <div ref={fontPanelRef} className="rounded-xl overflow-hidden shadow-2xl"
              style={{
                position: "fixed", top: dropdownPos.top, left: dropdownPos.left,
                width: 240, zIndex: 99999,
                background: "rgba(14,14,26,0.99)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.12)",
              }}>
              <div className="p-2 border-b border-white/5">
                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  <input autoFocus type="text" value={fontSearch}
                    onChange={e => setFontSearch(e.target.value)}
                    placeholder="Buscar fuente…"
                    className="w-full h-7 pl-7 pr-7 text-[11px] rounded-lg outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
                  />
                  {fontSearch && (
                    <button onClick={() => setFontSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 280, scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
                {filteredFonts.map(f => {
                  const isActive = params.fontFamily === f.family;
                  const isHov = hoveredFont === f.family;
                  return (
                    <button key={f.family}
                      onMouseEnter={() => {
                        setHoveredFont(f.family);
                        if (uploadId !== null) textParamsStore.set(uploadId, { ...params, fontFamily: f.family });
                      }}
                      onMouseLeave={() => {
                        setHoveredFont(null);
                        if (uploadId !== null) textParamsStore.set(uploadId, params);
                      }}
                      onClick={() => {
                        set("fontFamily", f.family);
                        setHoveredFont(null);
                        setFontOpen(false);
                        setFontSearch("");
                      }}
                      className="w-full flex items-center px-3 py-1.5 transition-colors text-left"
                      style={{
                        background: isHov ? "rgba(99,102,241,0.15)" : isActive ? "rgba(99,102,241,0.08)" : "transparent",
                        borderLeft: isActive || isHov ? "2px solid rgba(99,102,241,0.5)" : "2px solid transparent",
                      }}>
                      <span className="flex-1 truncate text-[13px]"
                        style={{ fontFamily: `"${f.family}", sans-serif`, fontWeight: f.weight, color: isHov ? "#c7d2fe" : isActive ? "#e0e7ff" : "rgba(255,255,255,0.6)" }}>
                        {f.family}
                      </span>
                      <span className="shrink-0 ml-2 text-[11px] opacity-35"
                        style={{ fontFamily: `"${f.family}", sans-serif`, fontWeight: f.weight }}>AaBb</span>
                      {isActive && <Check size={11} className="shrink-0 ml-1.5 text-indigo-400" />}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )}
        </div>

        <Div />

        {/* ── SIZE (cm) ─────────────────────────────────────── */}
        <div className="flex items-center shrink-0 h-8 rounded-lg overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}>
          <Btn onClick={() => set("outputWidthCm", Math.max(0.5, +(params.outputWidthCm - 0.5).toFixed(1)))}>−</Btn>
          <input type="number" min={0.5} max={60} step={0.5}
            value={params.outputWidthCm}
            onChange={e => set("outputWidthCm", parseFloat(e.target.value) || 1)}
            className="w-12 h-8 text-[11px] text-center font-mono text-violet-200/90 bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <Btn onClick={() => set("outputWidthCm", Math.min(60, +(params.outputWidthCm + 0.5).toFixed(1)))}>+</Btn>
        </div>
        <span className="text-[9px] text-white/20 shrink-0">cm</span>

        <Div />

        {/* ── BOLD / ITALIC ─────────────────────────────────── */}
        {([
          { key: "bold" as const, label: "B", style: { fontWeight: 900 } },
          { key: "italic" as const, label: "I", style: { fontStyle: "italic" } },
        ] as const).map(({ key, label, style }) => (
          <button key={key} onClick={() => set(key, !params[key])}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[13px] transition-all shrink-0"
            style={{
              ...style,
              background: params[key] ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.05)",
              border: params[key] ? "1px solid rgba(99,102,241,0.45)" : "1px solid rgba(255,255,255,0.08)",
              color: params[key] ? "#c4b5fd" : "#4b5563",
            }}>
            {label}
          </button>
        ))}

        <Div />

        {/* ── ALIGNMENT ─────────────────────────────────────── */}
        {(["left", "center", "right"] as const).map(a => {
          const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
          return (
            <button key={a} onClick={() => set("align", a)}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all shrink-0"
              style={{
                background: params.align === a ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.05)",
                border: params.align === a ? "1px solid rgba(99,102,241,0.45)" : "1px solid rgba(255,255,255,0.08)",
                color: params.align === a ? "#c4b5fd" : "#4b5563",
              }}>
              <Icon size={12} />
            </button>
          );
        })}

        <Div />

        {/* ── COLOR ─────────────────────────────────────────── */}
        {/* solid/gradient toggle */}
        <div className="flex items-center gap-0.5 shrink-0">
          {(["solid", "gradient"] as const).map(m => (
            <button key={m} onClick={() => set("colorMode", m)}
              className="h-7 px-2 text-[9px] font-semibold rounded-md transition-all"
              style={{
                background: params.colorMode === m ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.04)",
                border: params.colorMode === m ? "1px solid rgba(99,102,241,0.45)" : "1px solid rgba(255,255,255,0.07)",
                color: params.colorMode === m ? "#c4b5fd" : "#4b5563",
              }}>
              {m === "solid" ? "Sólido" : "Degr."}
            </button>
          ))}
        </div>

        {params.colorMode === "solid" ? (
          <Swatch value={params.solidColor} onChange={v => set("solidColor", v)} />
        ) : (
          <>
            <Swatch value={params.gradColor1} onChange={v => set("gradColor1", v)} />
            <Swatch value={params.gradColor2} onChange={v => set("gradColor2", v)} />
            {(["horizontal", "vertical", "diagonal"] as const).map(d => (
              <button key={d} onClick={() => set("gradDir", d)}
                className="w-7 h-7 text-[10px] rounded-md transition-all flex items-center justify-center"
                style={{
                  background: params.gradDir === d ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.04)",
                  border: params.gradDir === d ? "1px solid rgba(99,102,241,0.45)" : "1px solid rgba(255,255,255,0.07)",
                  color: params.gradDir === d ? "#c4b5fd" : "#4b5563",
                }}>
                {d === "horizontal" ? "↔" : d === "vertical" ? "↕" : "↗"}
              </button>
            ))}
          </>
        )}

        <Div />

        {/* ── LETTER SPACING ────────────────────────────────── */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] text-white/20 select-none">AV</span>
          <input type="range" min={0} max={30} step={1} value={params.letterSpacing}
            onChange={e => set("letterSpacing", parseInt(e.target.value))}
            style={{ width: 56, accentColor: "#818cf8", height: 2, cursor: "pointer" }} />
        </div>

        <Div />

        {/* ── WARP ──────────────────────────────────────────── */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[9px] text-white/20 mr-0.5">Warp</span>
          {WARP_OPTIONS.map(({ id, label }) => (
            <button key={id} onClick={() => set("warpType", id)}
              className="w-7 h-8 flex items-center justify-center rounded-md text-[12px] transition-all"
              style={{
                background: params.warpType === id ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.04)",
                border: params.warpType === id ? "1px solid rgba(99,102,241,0.45)" : "1px solid rgba(255,255,255,0.06)",
                color: params.warpType === id ? "#c4b5fd" : "#374151",
              }}>
              {label}
            </button>
          ))}
        </div>
        {params.warpType !== "none" && (
          <input type="range" min={5} max={80} step={1} value={params.warpAmount}
            onChange={e => set("warpAmount", parseInt(e.target.value))}
            style={{ width: 52, accentColor: "#818cf8", height: 2, cursor: "pointer" }} />
        )}

        <Div />

        {/* ── STROKE ────────────────────────────────────────── */}
        <button
          onClick={() => set("strokeOn", !params.strokeOn)}
          className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg shrink-0 transition-all text-[11px] font-semibold"
          style={{
            background: params.strokeOn ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
            border: params.strokeOn ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.07)",
            color: params.strokeOn ? "#a5b4fc" : "#374151",
          }}>
          Borde
        </button>
        {params.strokeOn && (
          <>
            <Swatch value={params.strokeColor} onChange={v => set("strokeColor", v)} />
            <input type="number" min={1} max={40} step={1} value={params.strokeWidth}
              onChange={e => set("strokeWidth", parseInt(e.target.value) || 1)}
              title="Grosor borde"
              className="w-10 h-8 text-[11px] text-center font-mono bg-transparent border rounded-lg outline-none text-violet-200/80 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}
            />
          </>
        )}

        <Div />

        {/* Save status */}
        <StatusDot />
      </div>
    </div>
  );
}

// ── tiny shared atoms ──────────────────────────────────────────────────────
function Div() {
  return <div className="w-px h-5 bg-white/8 shrink-0" />;
}
function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="w-6 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/8 transition-colors text-sm">
      {children}
    </button>
  );
}
function Swatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative cursor-pointer shrink-0 rounded-md overflow-hidden"
      style={{ width: 28, height: 28, background: value, border: "1px solid rgba(255,255,255,0.15)" }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
    </label>
  );
}
