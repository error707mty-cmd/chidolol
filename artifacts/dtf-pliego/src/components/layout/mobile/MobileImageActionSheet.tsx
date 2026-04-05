import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Pliego, PliegoImage,
  useUpdatePliegoImage, useRemovePliegoImage,
  getListPliegoImagesQueryKey, getGetPliegoStatsQueryKey, getGetPliegoPriceQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useHistory } from "@/contexts/HistoryContext";
import {
  X, Lock, Unlock, Minus, Plus, Trash2,
  Scissors, ZoomIn, ScanLine, Loader2, Check, Sparkles, Ruler, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

interface Props {
  pliego: Pliego;
  images: PliegoImage[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  onProcessingChange?: (ids: number[], task: string) => void;
}

type AiTask = "" | "fondo" | "2x" | "4x";

export function MobileImageActionSheet({
  pliego, images, selectedIds, onSelectionChange, onProcessingChange,
}: Props) {
  const queryClient = useQueryClient();
  const { push: pushHistory } = useHistory();
  const updateImage = useUpdatePliegoImage();
  const removeImage = useRemovePliegoImage();

  const selectedImg = selectedIds.length === 1
    ? images.find((i) => i.id === selectedIds[0]) ?? null
    : null;

  const isMulti = selectedIds.length > 1;
  const { token } = useAuth() as { token: string };
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");
  const [lockAspect, setLockAspect] = useState(true);
  const aspectRef = useRef(1);
  const [dimEdited, setDimEdited] = useState(false);
  const [aiTask, setAiTask] = useState<AiTask>("");
  const [aiSuccess, setAiSuccess] = useState(false);
  const [removeBgTolerance, setRemoveBgTolerance] = useState(18);
  const isProcessing = aiTask !== "";

  useEffect(() => {
    if (!selectedImg) return;
    setDimW(selectedImg.widthCm.toFixed(1));
    setDimH(selectedImg.heightCm.toFixed(1));
    aspectRef.current = selectedImg.widthCm / selectedImg.heightCm;
    setDimEdited(false);
  }, [selectedImg?.id, selectedImg?.widthCm, selectedImg?.heightCm]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoStatsQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoPriceQueryKey(pliego.id) });
  }, [queryClient, pliego.id]);

  const resetAll = useCallback(() => {
    queryClient.resetQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoStatsQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoPriceQueryKey(pliego.id) });
  }, [queryClient, pliego.id]);

  const flashSuccess = () => {
    setAiSuccess(true);
    setTimeout(() => setAiSuccess(false), 1800);
  };

  const cleanupOldUpload = async (id: number) => {
    try { await fetch(`/api/uploads/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }); } catch { /* ok */ }
  };

  // Dimension
  const handleWChange = (val: string) => {
    setDimW(val); setDimEdited(true);
    if (lockAspect) { const w = parseFloat(val); if (!isNaN(w) && w > 0) setDimH((w / aspectRef.current).toFixed(1)); }
  };
  const handleHChange = (val: string) => {
    setDimH(val); setDimEdited(true);
    if (lockAspect) { const h = parseFloat(val); if (!isNaN(h) && h > 0) setDimW((h * aspectRef.current).toFixed(1)); }
  };
  const commitDimension = () => {
    if (!selectedImg || !dimEdited) return;
    const w = parseFloat(dimW), h = parseFloat(dimH);
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;
    updateImage.mutate(
      { id: pliego.id, imageId: selectedImg.id, data: { widthCm: w, heightCm: h } },
      { onSuccess: () => { invalidate(); setDimEdited(false); toast.success(`${w.toFixed(1)} × ${h.toFixed(1)} cm`); }, onError: () => toast.error("Error al guardar medidas") }
    );
  };

  // Quantity
  const handleQtyChange = (delta: number) => {
    for (const img of images.filter((i) => selectedIds.includes(i.id))) {
      const newQty = Math.max(1, (img.quantity ?? 1) + delta);
      updateImage.mutate({ id: pliego.id, imageId: img.id, data: { quantity: newQty } }, { onSuccess: invalidate });
    }
  };

  // Delete
  const handleDelete = () => {
    const imgs = images.filter((i) => selectedIds.includes(i.id));
    for (const img of imgs) removeImage.mutate({ id: pliego.id, imageId: img.id }, { onSuccess: () => { onSelectionChange([]); invalidate(); } });
    toast.success(imgs.length === 1 ? "Imagen eliminada" : `${imgs.length} imágenes eliminadas`);
  };

  // Remove BG
  const handleRemoveBg = async () => {
    if (isProcessing) return;
    const selectedImgs = images.filter((i) => selectedIds.includes(i.id));
    if (!selectedImgs.length) return;
    const snapshot = selectedImgs.map((img) => ({ imgId: img.id, oldUploadId: img.uploadId, newUploadId: 0 }));
    const pliegoId = pliego.id;
    setAiTask("fondo"); onProcessingChange?.(selectedImgs.map((i) => i.id), "fondo");
    try {
      for (let i = 0; i < selectedImgs.length; i++) {
        const img = selectedImgs[i];
        const res = await fetch(`/api/uploads/${img.uploadId}/remove-bg`, { method: "POST", headers: authHeaders, body: JSON.stringify({ tolerance: removeBgTolerance }) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "failed"); }
        const newUpload = await res.json();
        snapshot[i].newUploadId = newUpload.id;
        const newAspect = newUpload.widthPx && newUpload.heightPx ? newUpload.widthPx / newUpload.heightPx : null;
        const newHeightCm = newAspect ? img.widthCm / newAspect : img.heightCm;
        await new Promise<void>((resolve, reject) => updateImage.mutate({ id: pliego.id, imageId: img.id, data: { uploadId: newUpload.id, heightCm: newHeightCm } }, {
          onSuccess: () => { queryClient.setQueryData(getListPliegoImagesQueryKey(pliego.id), (old: PliegoImage[] | undefined) => old?.map((item) => item.id === img.id ? { ...item, uploadId: newUpload.id, imageUrl: `${newUpload.imageUrl}?t=${Date.now()}`, heightCm: newHeightCm } : item) ?? old); resolve(); },
          onError: (err) => { if ((err as { status?: number }).status === 404) resolve(); else reject(err); },
        }));
      }
      resetAll(); flashSuccess();
      pushHistory({ label: "Quitar fondo", cleanup: () => { for (const { oldUploadId } of snapshot) cleanupOldUpload(oldUploadId); }, undo: async () => { for (const { imgId, oldUploadId, newUploadId } of snapshot) { await new Promise<void>((res) => updateImage.mutate({ id: pliegoId, imageId: imgId, data: { uploadId: oldUploadId } }, { onSuccess: () => res(), onError: () => res() })); if (newUploadId) cleanupOldUpload(newUploadId); } queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) }); } });
      toast.success(selectedImgs.length === 1 ? "Fondo eliminado" : `Fondo eliminado en ${selectedImgs.length} imágenes`);
    } catch { toast.error("Error al quitar el fondo. Intenta de nuevo."); }
    finally { setAiTask(""); onProcessingChange?.([], ""); }
  };

  // Upscale
  const handleUpscale = async (scale: 2 | 4) => {
    if (isProcessing) return;
    const selectedImgs = images.filter((i) => selectedIds.includes(i.id));
    if (!selectedImgs.length) return;
    const snapshot = selectedImgs.map((img) => ({ imgId: img.id, oldUploadId: img.uploadId, newUploadId: 0 }));
    const pliegoId = pliego.id;
    setAiTask(`${scale}x` as AiTask); onProcessingChange?.(selectedImgs.map((i) => i.id), `${scale}x`);
    try {
      for (let i = 0; i < selectedImgs.length; i++) {
        const img = selectedImgs[i];
        const res = await fetch(`/api/uploads/${img.uploadId}/upscale`, { method: "POST", headers: authHeaders, body: JSON.stringify({ scale }) });
        if (!res.ok) throw new Error("upscale failed");
        const newUpload = await res.json();
        snapshot[i].newUploadId = newUpload.id;
        await new Promise<void>((resolve, reject) => updateImage.mutate({ id: pliego.id, imageId: img.id, data: { uploadId: newUpload.id } }, {
          onSuccess: () => { const freshUrl = `${newUpload.imageUrl}?t=${Date.now()}`; queryClient.setQueryData(getListPliegoImagesQueryKey(pliego.id), (old: PliegoImage[] | undefined) => old?.map((item) => item.id === img.id ? { ...item, uploadId: newUpload.id, imageUrl: freshUrl, originalWidthPx: newUpload.widthPx, originalHeightPx: newUpload.heightPx } : item) ?? old); resolve(); },
          onError: (err) => { if ((err as { status?: number }).status === 404) resolve(); else reject(err); },
        }));
      }
      resetAll(); flashSuccess();
      pushHistory({ label: `Ampliar ${scale}×`, cleanup: () => { for (const { oldUploadId } of snapshot) cleanupOldUpload(oldUploadId); }, undo: async () => { for (const { imgId, oldUploadId, newUploadId } of snapshot) { await new Promise<void>((res) => updateImage.mutate({ id: pliegoId, imageId: imgId, data: { uploadId: oldUploadId } }, { onSuccess: () => res(), onError: () => res() })); if (newUploadId) cleanupOldUpload(newUploadId); } queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) }); } });
      toast.success(selectedImgs.length === 1 ? `Imagen ampliada ${scale}×` : `${selectedImgs.length} imágenes ampliadas ${scale}×`);
    } catch { toast.error(`Error al ampliar ${scale}×`); }
    finally { setAiTask(""); onProcessingChange?.([], ""); }
  };

  if (!selectedIds.length) return null;

  const qty = selectedImg?.quantity ?? 1;

  return createPortal(
    <>
      {/* Backdrop — more opaque so canvas stays clean */}
      <div
        onClick={() => onSelectionChange([])}
        style={{
          position: "fixed", inset: 0, zIndex: 40,
          background: "rgba(4,2,12,0.82)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          animation: "sheet-fade-in 0.18s ease",
        }}
      />

      {/* Action sheet */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50,
          maxHeight: "80dvh",
          display: "flex", flexDirection: "column",
          background: "linear-gradient(175deg,#1e1530 0%,#12101a 100%)",
          borderRadius: "24px 24px 0 0",
          borderTop: "1px solid rgba(139,92,246,0.3)",
          paddingBottom: "env(safe-area-inset-bottom,16px)",
          animation: "sheet-slide-up 0.3s cubic-bezier(0.22,1,0.36,1)",
          boxShadow: "0 -32px 80px rgba(0,0,0,0.8), 0 -1px 0 rgba(139,92,246,0.25)",
          overflow: "hidden",
        }}
      >
        {/* Drag handle */}
        <div style={{ flexShrink: 0, paddingTop: 12, paddingBottom: 4, display: "flex", justifyContent: "center" }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.18)" }} />
        </div>

        {/* ── HEADER ── */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 14,
          padding: "12px 20px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "linear-gradient(90deg,rgba(139,92,246,0.08),rgba(99,102,241,0.04),transparent)",
        }}>
          {/* Thumbnail */}
          {selectedImg?.imageUrl ? (
            <div style={{
              width: 62, height: 62, borderRadius: 14, flexShrink: 0, overflow: "hidden",
              background: "rgba(255,255,255,0.06)",
              border: "1.5px solid rgba(139,92,246,0.3)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <img src={selectedImg.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
          ) : (
            <div style={{
              width: 62, height: 62, borderRadius: 14, flexShrink: 0,
              background: "linear-gradient(135deg,rgba(139,92,246,0.2),rgba(99,102,241,0.1))",
              border: "1.5px solid rgba(139,92,246,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 26 }}>🖼</span>
            </div>
          )}

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.9)", lineHeight: 1.15, letterSpacing: "-0.01em" }}>
              {isMulti ? `${selectedIds.length} imágenes` : `${(selectedImg?.widthCm ?? 0).toFixed(1)} × ${(selectedImg?.heightCm ?? 0).toFixed(1)} cm`}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4, lineHeight: 1.3 }}>
              {isProcessing ? (
                <span style={{ color: "rgba(167,139,250,0.85)", fontWeight: 600 }}>Procesando con IA…</span>
              ) : aiSuccess ? (
                <span style={{ color: "rgba(74,222,128,0.85)", fontWeight: 600 }}>✓ Proceso completado</span>
              ) : isMulti ? (
                "Selección múltiple"
              ) : (
                `${qty} ${qty === 1 ? "copia" : "copias"} · arrastra para mover`
              )}
            </div>
          </div>

          {/* Processing indicator */}
          {(isProcessing || aiSuccess) && (
            <div style={{
              width: 38, height: 38, borderRadius: 11, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: aiSuccess ? "rgba(74,222,128,0.12)" : "rgba(139,92,246,0.18)",
              border: aiSuccess ? "1px solid rgba(74,222,128,0.35)" : "1px solid rgba(139,92,246,0.45)",
            }}>
              {aiSuccess
                ? <Check style={{ width: 18, height: 18, color: "rgba(74,222,128,1)" }} />
                : <Loader2 style={{ width: 18, height: 18, color: "rgba(192,168,255,1)", animation: "spin 1s linear infinite" }} />}
            </div>
          )}

          {/* Close */}
          <button
            onClick={() => onSelectionChange([])}
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
              transition: "all 0.15s",
            }}
          >
            <X style={{ width: 15, height: 15, color: "rgba(255,255,255,0.45)" }} />
          </button>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ── DIMENSIONES ── */}
          {selectedImg && !isMulti && (
            <Card icon={<Ruler style={{ width: 14, height: 14 }} />} label="Dimensiones">
              <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <DimField label="ANCHO" unit="cm" value={dimW} onChange={handleWChange} onBlur={commitDimension}
                    onStep={(d) => {
                      if (!selectedImg) return;
                      const curW = parseFloat(dimW) || 0;
                      const newW = Math.max(0.1, parseFloat((curW + d).toFixed(1)));
                      const newH = lockAspect && aspectRef.current > 0
                        ? parseFloat((newW / aspectRef.current).toFixed(1))
                        : parseFloat(dimH) || selectedImg.heightCm;
                      setDimW(newW.toFixed(1));
                      if (lockAspect) setDimH(newH.toFixed(1));
                      updateImage.mutate(
                        { id: pliego.id, imageId: selectedImg.id, data: { widthCm: newW, heightCm: newH } },
                        { onSuccess: () => { invalidate(); setDimEdited(false); toast.success(`${newW.toFixed(1)} × ${newH.toFixed(1)} cm`); }, onError: () => toast.error("Error al guardar") }
                      );
                    }}
                  />
                  <button
                    onClick={() => setLockAspect((v) => !v)}
                    style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: lockAspect ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.05)",
                      border: lockAspect ? "1.5px solid rgba(139,92,246,0.5)" : "1.5px solid rgba(255,255,255,0.12)",
                      transition: "all 0.2s",
                    }}
                  >
                    {lockAspect
                      ? <Lock style={{ width: 14, height: 14, color: "rgba(192,168,255,0.9)" }} />
                      : <Unlock style={{ width: 14, height: 14, color: "rgba(255,255,255,0.45)" }} />}
                  </button>
                  <DimField label="ALTO" unit="cm" value={dimH} onChange={handleHChange} onBlur={commitDimension}
                    onStep={(d) => {
                      if (!selectedImg) return;
                      const curH = parseFloat(dimH) || 0;
                      const newH = Math.max(0.1, parseFloat((curH + d).toFixed(1)));
                      const newW = lockAspect && aspectRef.current > 0
                        ? parseFloat((newH * aspectRef.current).toFixed(1))
                        : parseFloat(dimW) || selectedImg.widthCm;
                      setDimH(newH.toFixed(1));
                      if (lockAspect) setDimW(newW.toFixed(1));
                      updateImage.mutate(
                        { id: pliego.id, imageId: selectedImg.id, data: { widthCm: newW, heightCm: newH } },
                        { onSuccess: () => { invalidate(); setDimEdited(false); toast.success(`${newW.toFixed(1)} × ${newH.toFixed(1)} cm`); }, onError: () => toast.error("Error al guardar") }
                      );
                    }}
                  />
                </div>
                {dimEdited && (
                  <button
                    onClick={commitDimension}
                    style={{
                      width: "100%", height: 44, borderRadius: 12, cursor: "pointer",
                      background: "linear-gradient(135deg,rgba(139,92,246,0.55),rgba(99,102,241,0.4))",
                      border: "1.5px solid rgba(139,92,246,0.6)",
                      color: "rgba(255,255,255,0.95)", fontSize: 14, fontWeight: 700,
                      letterSpacing: "0.02em",
                    }}
                  >
                    Aplicar dimensiones
                  </button>
                )}
              </div>
            </Card>
          )}

          {/* ── CANTIDAD ── */}
          <Card icon={<Copy style={{ width: 14, height: 14 }} />} label="Cantidad de copias">
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px 16px" }}>
              <StepBtn onClick={() => handleQtyChange(-1)} variant="minus">
                <Minus style={{ width: 18, height: 18, color: "rgba(255,255,255,0.65)" }} />
              </StepBtn>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 40, fontWeight: 900, color: "rgba(255,255,255,0.92)", fontFamily: "monospace", lineHeight: 1 }}>
                  {isMulti ? "—" : qty}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 4, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  {isMulti ? "múltiple" : qty === 1 ? "copia" : "copias"}
                </div>
              </div>
              <StepBtn onClick={() => handleQtyChange(1)} variant="plus">
                <Plus style={{ width: 18, height: 18, color: "rgba(192,168,255,0.9)" }} />
              </StepBtn>
            </div>
          </Card>

          {/* ── HERRAMIENTAS IA ── */}
          <Card
            icon={isProcessing
              ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
              : aiSuccess ? <Check style={{ width: 14, height: 14, color: "rgba(74,222,128,1)" }} />
              : <Sparkles style={{ width: 14, height: 14 }} />}
            label={isProcessing ? "Procesando…" : "Herramientas IA"}
            labelAccent={isProcessing ? "rgba(192,168,255,0.9)" : aiSuccess ? "rgba(74,222,128,0.9)" : undefined}
          >
            <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Tolerance */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.12)" }}>
                <span style={{ fontSize: 10, color: "rgba(167,139,250,0.6)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Tolerancia</span>
                <input
                  type="range" min={5} max={120} step={1} value={removeBgTolerance}
                  onChange={(e) => setRemoveBgTolerance(Number(e.target.value))}
                  style={{ flex: 1, height: 4, accentColor: "rgba(139,92,246,1)", cursor: "pointer" }}
                />
                <span style={{ fontSize: 12, color: "rgba(167,139,250,0.9)", fontFamily: "monospace", fontWeight: 800, minWidth: 26, textAlign: "right" }}>
                  {removeBgTolerance}
                </span>
              </div>

              {/* Remove BG */}
              <AICard
                icon={<Scissors style={{ width: 20, height: 20 }} />}
                gradient="linear-gradient(135deg,rgba(139,92,246,0.6),rgba(99,102,241,0.4))"
                glow="rgba(139,92,246,0.5)"
                title="Quitar fondo"
                subtitle="Elimina el fondo de la imagen automáticamente"
                active={aiTask === "fondo"}
                disabled={isProcessing}
                onClick={handleRemoveBg}
              />

              {/* Upscale row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <AICard
                  icon={<ZoomIn style={{ width: 19, height: 19 }} />}
                  gradient="linear-gradient(135deg,rgba(99,102,241,0.6),rgba(79,70,229,0.4))"
                  glow="rgba(99,102,241,0.5)"
                  title="2× Upscale"
                  subtitle="Mayor resolución"
                  active={aiTask === "2x"}
                  disabled={isProcessing}
                  onClick={() => handleUpscale(2)}
                  compact
                />
                <AICard
                  icon={<ScanLine style={{ width: 19, height: 19 }} />}
                  gradient="linear-gradient(135deg,rgba(168,85,247,0.6),rgba(139,92,246,0.4))"
                  glow="rgba(168,85,247,0.5)"
                  title="4× Upscale"
                  subtitle="Máxima calidad"
                  active={aiTask === "4x"}
                  disabled={isProcessing}
                  onClick={() => handleUpscale(4)}
                  compact
                />
              </div>
            </div>
          </Card>

          {/* ── ELIMINAR ── */}
          <PressBtn
            onClick={handleDelete}
            disabled={isProcessing}
            style={{
              width: "100%", padding: "16px",
              borderRadius: 16, cursor: isProcessing ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              background: "rgba(239,68,68,0.08)", border: "1.5px solid rgba(239,68,68,0.22)",
              color: "rgba(239,68,68,0.8)", fontSize: 14, fontWeight: 700,
              opacity: isProcessing ? 0.35 : 1,
            }}
            pressStyle={{ background: "rgba(239,68,68,0.16)", transform: "scale(0.98)" }}
          >
            <Trash2 style={{ width: 17, height: 17 }} />
            {isMulti ? `Eliminar ${selectedIds.length} imágenes` : "Eliminar imagen"}
          </PressBtn>

          <div style={{ height: 8 }} />
        </div>
      </div>
    </>,
    document.body
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Card({ icon, label, labelAccent, children }: { icon: React.ReactNode; label: string; labelAccent?: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.025)" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "linear-gradient(90deg,rgba(139,92,246,0.08),transparent)",
      }}>
        <span style={{ color: labelAccent ?? "rgba(167,139,250,0.7)" }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: labelAccent ?? "rgba(167,139,250,0.7)" }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function DimField({ label, unit, value, onChange, onBlur, onStep }: { label: string; unit: string; value: string; onChange: (v: string) => void; onBlur: () => void; onStep?: (delta: number) => void }) {
  const [active, setActive] = useState<"minus" | "plus" | null>(null);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, textAlign: "center" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {/* − button */}
        <button
          onPointerDown={() => setActive("minus")} onPointerUp={() => setActive(null)} onPointerLeave={() => setActive(null)}
          onClick={() => onStep?.(-0.5)}
          style={{
            width: 32, height: 46, borderRadius: 10, flexShrink: 0, cursor: "pointer",
            border: "1.5px solid rgba(255,255,255,0.28)",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: active === "minus" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.13)",
            fontSize: 22, fontWeight: 400, lineHeight: 1, color: "#ffffff",
            transition: "background 0.12s, transform 0.1s",
            transform: active === "minus" ? "scale(0.9)" : "scale(1)",
            userSelect: "none",
          }}
        >−</button>
        {/* Input */}
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type="number" value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            style={{
              width: "100%", height: 46, padding: "0 20px 0 8px",
              borderRadius: 10, fontSize: 17, fontWeight: 800, fontFamily: "monospace",
              background: "rgba(255,255,255,0.07)", border: "1.5px solid rgba(255,255,255,0.14)",
              color: "rgba(255,255,255,0.92)", outline: "none", textAlign: "center",
            }}
          />
          <span style={{ position: "absolute", right: 5, bottom: 6, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", pointerEvents: "none", letterSpacing: "0.05em" }}>{unit}</span>
        </div>
        {/* + button */}
        <button
          onPointerDown={() => setActive("plus")} onPointerUp={() => setActive(null)} onPointerLeave={() => setActive(null)}
          onClick={() => onStep?.(0.5)}
          style={{
            width: 32, height: 46, borderRadius: 10, flexShrink: 0, cursor: "pointer",
            border: "1.5px solid rgba(139,92,246,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: active === "plus" ? "rgba(139,92,246,0.65)" : "rgba(139,92,246,0.38)",
            fontSize: 22, fontWeight: 400, lineHeight: 1, color: "#e0d4ff",
            transition: "background 0.12s, transform 0.1s",
            transform: active === "plus" ? "scale(0.9)" : "scale(1)",
            userSelect: "none",
          }}
        >+</button>
      </div>
    </div>
  );
}

function StepBtn({ onClick, variant, children }: { onClick: () => void; variant: "plus" | "minus"; children: React.ReactNode }) {
  const [p, setP] = useState(false);
  return (
    <button
      onClick={onClick}
      onPointerDown={() => setP(true)} onPointerUp={() => setP(false)} onPointerLeave={() => setP(false)}
      style={{
        width: 58, height: 58, borderRadius: 15, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: variant === "plus" ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.07)",
        border: variant === "plus" ? "1.5px solid rgba(139,92,246,0.35)" : "1.5px solid rgba(255,255,255,0.1)",
        transform: p ? "scale(0.9)" : "scale(1)",
        transition: "transform 0.12s cubic-bezier(0.22,1,0.36,1)",
      }}
    >{children}</button>
  );
}

function AICard({ icon, gradient, glow, title, subtitle, active, disabled, onClick, compact = false }: {
  icon: React.ReactNode; gradient: string; glow: string;
  title: string; subtitle: string; active: boolean; disabled: boolean; onClick: () => void; compact?: boolean;
}) {
  const [p, setP] = useState(false);
  return (
    <button
      onClick={onClick} disabled={disabled}
      onPointerDown={() => setP(true)} onPointerUp={() => setP(false)} onPointerLeave={() => setP(false)}
      style={{
        width: "100%",
        padding: compact ? "14px 12px" : "14px 14px",
        borderRadius: 14, textAlign: "left", cursor: disabled ? "default" : "pointer",
        display: "flex", flexDirection: compact ? "column" : "row",
        alignItems: compact ? "flex-start" : "center", gap: compact ? 8 : 12,
        border: active ? `1.5px solid ${glow}` : p ? "1.5px solid rgba(139,92,246,0.3)" : "1.5px solid rgba(255,255,255,0.09)",
        background: active ? `linear-gradient(135deg,rgba(139,92,246,0.2),rgba(99,102,241,0.12))` : p ? "rgba(139,92,246,0.1)" : "rgba(255,255,255,0.04)",
        opacity: disabled && !active ? 0.35 : 1,
        boxShadow: active ? `0 0 24px ${glow}40` : "none",
        transform: p && !disabled ? "scale(0.97)" : "scale(1)",
        transition: "all 0.14s cubic-bezier(0.22,1,0.36,1)",
        position: "relative", overflow: "hidden",
      }}
    >
      {active && <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(90deg,transparent,rgba(139,92,246,0.1),transparent)", backgroundSize: "200% 100%", animation: "ai-sweep 1.4s ease-in-out infinite" }} />}
      <div style={{
        width: compact ? 34 : 42, height: compact ? 34 : 42, borderRadius: compact ? 9 : 12, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: gradient, border: `1px solid ${glow}`,
        color: "rgba(255,255,255,0.95)", boxShadow: active ? `0 0 16px ${glow}80` : "none",
      }}>
        {active ? <Loader2 style={{ width: compact ? 16 : 19, height: compact ? 16 : 19, animation: "spin 1s linear infinite" }} /> : icon}
      </div>
      <div>
        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", lineHeight: 1.2 }}>
          {active ? "Procesando…" : title}
        </div>
        {!compact && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>{subtitle}</div>}
      </div>
    </button>
  );
}

function PressBtn({ onClick, disabled, style, pressStyle, children }: {
  onClick: () => void; disabled?: boolean; style: React.CSSProperties; pressStyle: React.CSSProperties; children: React.ReactNode;
}) {
  const [p, setP] = useState(false);
  return (
    <button
      onClick={onClick} disabled={disabled}
      onPointerDown={() => setP(true)} onPointerUp={() => setP(false)} onPointerLeave={() => setP(false)}
      style={{ ...style, ...(p && !disabled ? pressStyle : {}), transition: "all 0.15s cubic-bezier(0.22,1,0.36,1)" }}
    >{children}</button>
  );
}
