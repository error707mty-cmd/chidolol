import { useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  useUploadImage,
  useAddImageToPliego,
  useRemovePliegoImage,
  useAutoNestPliego,
  useUpdatePliego,
  getListPliegoImagesQueryKey,
  getGetPliegoStatsQueryKey,
  getGetPliegoPriceQueryKey,
  getGetPliegoQueryKey,
  Pliego,
  PliegoImage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useHistory } from "@/contexts/HistoryContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { UploadCloud, Loader2, LayoutGrid, Trash2, FolderOpen, RefreshCw, Download, Printer, Type, Eraser, Wand2, Lock, Unlock, ShoppingCart } from "lucide-react";
import { renderTextToBlob, saveTextParams, DEFAULT_PARAMS } from "@/lib/textRender";
import { textParamsStore } from "@/lib/textParamsStore";
import { Link } from "wouter";
import { toast } from "sonner";

interface Props {
  pliego: Pliego;
  images: PliegoImage[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  bgColor: string;
  onBgColorChange: (c: string) => void;
  trimTransparency: boolean;
  removeSemiTransparency: boolean;
  onTrimChange: (v: boolean) => void;
  onSemiChange: (v: boolean) => void;
  metersUsed?: number;
  totalPrice?: number;
  pricePerMeter?: number;
  onFitRequest?: () => void;
  eraserMode?: boolean;
  eraserSize?: number;
  eraserOpacity?: number;
  onEraserToggle?: () => void;
  onEraserSizeChange?: (v: number) => void;
  onEraserOpacityChange?: (v: number) => void;
  inpaintMode?: boolean;
  inpaintRadius?: number;
  onInpaintModeChange?: (v: boolean) => void;
  onInpaintRadiusChange?: (v: number) => void;
  mobile?: boolean;
}

export function SidebarLeft({
  pliego, images, selectedIds, onSelectionChange,
  bgColor, onBgColorChange,
  trimTransparency, removeSemiTransparency,
  onTrimChange, onSemiChange,
  metersUsed, totalPrice, pricePerMeter,
  onFitRequest,
  eraserMode = false, eraserSize = 30, eraserOpacity = 100,
  onEraserToggle, onEraserSizeChange, onEraserOpacityChange,
  inpaintMode = false, inpaintRadius = 5,
  onInpaintModeChange, onInpaintRadiusChange,
  mobile = false,
}: Props) {
  const { user, token } = useAuth();
  const isPro = user?.plan === "pro";
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorPickerRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadImage = useUploadImage();
  const addImageToPliego = useAddImageToPliego();
  const removePliegoImage = useRemovePliegoImage();
  const autoNest = useAutoNestPliego();
  const updatePliego = useUpdatePliego();
  const [exportingRgb,  setExportingRgb]  = useState(false);
  const [exportingCmyk, setExportingCmyk] = useState(false);
  const { push: pushHistory } = useHistory();

  const [widthInput, setWidthInput] = useState(pliego.widthCm.toString());
  const [heightInput, setHeightInput] = useState(pliego.heightCm.toString());
  const [dimensionLocked, setDimensionLocked] = useState(() => {
    try { return localStorage.getItem(`dim-lock-${pliego.id}`) === "1"; } catch { return false; }
  });
  const [addingText, setAddingText] = useState(false);

  const handleAddText = async () => {
    setAddingText(true);
    const addParams = { ...DEFAULT_PARAMS, text: "ERROR707" };
    try {
      const { blob, widthCm, heightCm } = await renderTextToBlob(addParams);
      const fd = new FormData();
      fd.append("file", blob, "texto.png");
      const upRes = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!upRes.ok) throw new Error();
      const upload = await upRes.json();
      const addRes = await fetch(`/api/pliegos/${pliego.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: upload.id, xCm: 1, yCm: 1, widthCm, heightCm, quantity: 1 }),
      });
      if (!addRes.ok) throw new Error();
      const newImage = await addRes.json();
      saveTextParams(upload.id, addParams);
      textParamsStore.set(upload.id, addParams);
      invalidateAll();
      onSelectionChange([newImage.id]);
      toast.success("Texto añadido · Doble clic para editar");
      pushHistory({
        label: `Añadir texto "ERROR707"`,
        undo: async () => {
          await fetch(`/api/pliegos/${pliego.id}/images/${newImage.id}`, { method: "DELETE" });
          invalidateAll();
        },
      });
    } catch {
      toast.error("Error al agregar texto");
    } finally {
      setAddingText(false);
    }
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoStatsQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoPriceQueryKey(pliego.id) });
  };

  const handleDimensionSave = () => {
    if (dimensionLocked) return;
    const w = parseFloat(widthInput);
    const h = parseFloat(heightInput);
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;
    updatePliego.mutate(
      { id: pliego.id, data: { widthCm: w, heightCm: h } },
      { onSuccess: (u) => queryClient.setQueryData(getGetPliegoQueryKey(pliego.id), u) }
    );
  };

  const toggleDimensionLock = () => {
    const next = !dimensionLocked;
    setDimensionLocked(next);
    try { localStorage.setItem(`dim-lock-${pliego.id}`, next ? "1" : "0"); } catch { /* noop */ }
    if (next) toast.info("Medidas bloqueadas");
    else toast.success("Medidas desbloqueadas");
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newIds: number[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const uploaded = await uploadImage.mutateAsync({ data: { file, trimTransparency, removeSemiTransparency } });
        const added = await addImageToPliego.mutateAsync({ id: pliego.id, data: { uploadId: uploaded.id } });
        newIds.push(added.id);
      } catch {
        toast.error(`Error al subir ${file.name}`);
      }
    }
    invalidateAll();
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploading(false);
    if (newIds.length > 0) {
      const pliegoId = pliego.id;
      pushHistory({
        label: `Subir ${newIds.length > 1 ? newIds.length + " imágenes" : "imagen"}`,
        undo: async () => {
          for (const id of newIds) {
            try { await fetch(`/api/pliegos/${pliegoId}/images/${id}`, { method: "DELETE" }); } catch { /* skip */ }
          }
          queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
        },
      });
      onSelectionChange(newIds);
      toast.success(`${newIds.length} imagen${newIds.length > 1 ? "es" : ""} añadida${newIds.length > 1 ? "s" : ""}`);
    }
  };

  const handleDuplicate = async () => {
    if (selectedIds.length === 0) return;
    const newIds: number[] = [];
    for (const sid of selectedIds) {
      const sel = images.find((img) => img.id === sid);
      if (!sel) continue;
      try {
        const added = await addImageToPliego.mutateAsync({
          id: pliego.id,
          data: { uploadId: sel.uploadId, xCm: sel.xCm + 1, yCm: sel.yCm + 1, widthCm: sel.widthCm, heightCm: sel.heightCm },
        });
        newIds.push(added.id);
      } catch { /* skip */ }
    }
    invalidateAll();
    if (newIds.length > 0) {
      const pliegoId = pliego.id;
      pushHistory({
        label: `Duplicar ${newIds.length > 1 ? newIds.length + " imágenes" : "imagen"}`,
        undo: async () => {
          for (const id of newIds) {
            try { await fetch(`/api/pliegos/${pliegoId}/images/${id}`, { method: "DELETE" }); } catch { /* skip */ }
          }
          queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
        },
      });
      toast.success(`${newIds.length} imagen${newIds.length > 1 ? "es" : ""} duplicada${newIds.length > 1 ? "s" : ""}`);
    }
  };

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    const toDelete = images.filter((img) => selectedIds.includes(img.id));
    const pliegoId = pliego.id;
    pushHistory({
      label: `Eliminar ${toDelete.length > 1 ? toDelete.length + " imágenes" : "imagen"}`,
      undo: async () => {
        for (const img of toDelete) {
          try {
            await fetch(`/api/pliegos/${pliegoId}/images`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ uploadId: img.uploadId, xCm: img.xCm, yCm: img.yCm, widthCm: img.widthCm, heightCm: img.heightCm, quantity: img.quantity ?? 1 }),
            });
          } catch { /* skip */ }
        }
        queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
      },
    });
    let count = 0;
    for (const sid of selectedIds) {
      try {
        await removePliegoImage.mutateAsync({ id: pliego.id, imageId: sid });
        count++;
      } catch { /* skip */ }
    }
    onSelectionChange([]);
    invalidateAll();
    if (count > 0) toast.success(`${count} imagen${count > 1 ? "es" : ""} eliminada${count > 1 ? "s" : ""}`);
  };

  const handleAutoNest = () => {
    const oldPositions = images.map((img) => ({ id: img.id, xCm: img.xCm, yCm: img.yCm }));
    const pliegoId = pliego.id;
    autoNest.mutate({ id: pliego.id }, {
      onSuccess: (r) => {
        pushHistory({
          label: "Auto-acomodar",
          undo: async () => {
            for (const pos of oldPositions) {
              try {
                await fetch(`/api/pliegos/${pliegoId}/images/${pos.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ xCm: pos.xCm, yCm: pos.yCm }),
                });
              } catch { /* skip */ }
            }
            queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
          },
        });
        invalidateAll();
        queryClient.invalidateQueries({ queryKey: getGetPliegoQueryKey(pliego.id) });
        if (r.newHeightCm !== undefined) setHeightInput(r.newHeightCm.toFixed(1));
        onFitRequest?.();
        if (r.unplacedCount > 0) {
          toast.warning(`${r.placedCount} acomodadas · ${r.unplacedCount} no caben en el ancho · alto: ${r.newHeightCm?.toFixed(1)} cm`);
        } else {
          const heightStr = r.newHeightCm !== undefined ? ` · alto: ${r.newHeightCm.toFixed(1)} cm` : "";
          toast.success(`${r.placedCount} imágenes acomodadas${heightStr}`);
        }
      },
      onError: () => toast.error("Error al auto-acomodar"),
    });
  };

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const authHeader = (): HeadersInit =>
    token ? { Authorization: `Bearer ${token}` } : {};

  const handleExportRgb = async () => {
    if (exportingRgb) return;
    setExportingRgb(true);
    try {
      const res = await fetch(`/api/pliegos/${pliego.id}/export-rgb`, {
        method: "POST",
        headers: authHeader(),
      });
      if (!res.ok) throw new Error("Error del servidor");
      const result = await res.json();
      triggerDownload(result.downloadUrl, result.filename || `pliego-${pliego.id}-RGB.png`);
      toast.success("PNG RGB descargado · Adobe RGB 1998 · 300 DPI");
    } catch {
      toast.error("Error al exportar PNG RGB");
    } finally {
      setExportingRgb(false);
    }
  };

  const handleExportCmyk = async () => {
    if (exportingCmyk) return;
    setExportingCmyk(true);
    try {
      const res = await fetch(`/api/pliegos/${pliego.id}/export-cmyk`, {
        method: "POST",
        headers: authHeader(),
      });
      if (!res.ok) throw new Error("Error del servidor");
      const result = await res.json();
      triggerDownload(result.downloadUrl, result.filename || `pliego-${pliego.id}-CMYK.pdf`);
      toast.success("PDF CMYK descargado · FOGRA39 · 300 DPI");
    } catch {
      toast.error("Error al exportar PDF CMYK");
    } finally {
      setExportingCmyk(false);
    }
  };

  const pixelW = Math.round((pliego.widthCm / 2.54) * pliego.dpi);
  const pixelH = Math.round((pliego.heightCm / 2.54) * pliego.dpi);
  const megapixels = ((pixelW * pixelH) / 1_000_000).toFixed(1);

  const bgOptions: { label: string; value: "transparent" | "white" | "black" }[] = [
    { label: "Transparente", value: "transparent" },
    { label: "Blanco", value: "white" },
    { label: "Negro", value: "black" },
  ];

  const hasSelection = selectedIds.length > 0;

  return (
    <aside
      className={mobile ? "w-full flex-1 overflow-y-auto flex flex-col text-sm" : "w-72 h-full flex flex-col border-r overflow-y-auto shrink-0 text-sm"}
      style={{
        backgroundColor: '#111115',
        borderColor: 'rgba(255,255,255,0.07)',
        background: 'linear-gradient(180deg, #131318 0%, #111115 100%)',
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <img
          src={`${import.meta.env.BASE_URL}logo-error707.png`}
          alt="ERROR707 ESTUDIO"
          className="logo-animate"
          style={{ height: 28, width: "auto", objectFit: "contain" }}
          draggable={false}
        />
        <div className="flex items-center gap-1">
          {user?.isAdmin && (
            <Link href="/admin/pos">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-green-400/80 hover:text-green-300 hover:bg-green-500/10 rounded-lg" title="Punto de Venta">
                <ShoppingCart className="h-3.5 w-3.5" />
              </Button>
            </Link>
          )}
          <Link href="/pliegos">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/40 hover:text-violet-300 hover:bg-violet-500/10 rounded-lg">
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* ── MEDIDAS ── */}
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] font-bold text-white/30 tracking-[0.2em] uppercase shrink-0 w-5 text-center">cm</span>
          <Input
            type="number" value={widthInput}
            onChange={(e) => !dimensionLocked && setWidthInput(e.target.value)}
            onBlur={handleDimensionSave}
            placeholder="Ancho"
            readOnly={dimensionLocked}
            className="h-6 text-[11px] px-2 text-white"
            style={{
              background: dimensionLocked ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${dimensionLocked ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}`,
              cursor: dimensionLocked ? 'not-allowed' : undefined,
              color: dimensionLocked ? 'rgba(255,255,255,0.35)' : undefined,
            }}
          />
          <span className="text-white/20 text-[10px] shrink-0">×</span>
          <Input
            type="number" value={heightInput}
            onChange={(e) => !dimensionLocked && setHeightInput(e.target.value)}
            onBlur={handleDimensionSave}
            placeholder="Alto"
            readOnly={dimensionLocked}
            className="h-6 text-[11px] px-2 text-white"
            style={{
              background: dimensionLocked ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${dimensionLocked ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}`,
              cursor: dimensionLocked ? 'not-allowed' : undefined,
              color: dimensionLocked ? 'rgba(255,255,255,0.35)' : undefined,
            }}
          />
          {/* Lock button */}
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 shrink-0 rounded transition-colors"
            style={{
              border: dimensionLocked
                ? '1px solid rgba(167,139,250,0.4)'
                : '1px solid rgba(255,255,255,0.07)',
              background: dimensionLocked ? 'rgba(124,58,237,0.18)' : undefined,
              color: dimensionLocked ? '#a78bfa' : 'rgba(255,255,255,0.3)',
            }}
            onClick={toggleDimensionLock}
            title={dimensionLocked ? "Desbloquear medidas" : "Bloquear medidas"}
          >
            {dimensionLocked
              ? <Lock className="h-2.5 w-2.5" />
              : <Unlock className="h-2.5 w-2.5" />}
          </Button>
          {/* Reset (hidden when locked) */}
          {!dimensionLocked && (
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 shrink-0 text-white/30 hover:text-violet-300 hover:bg-violet-500/10 rounded"
              style={{ border: '1px solid rgba(255,255,255,0.07)' }}
              onClick={() => {
                setWidthInput("58");
                setHeightInput("100");
                updatePliego.mutate(
                  { id: pliego.id, data: { widthCm: 58, heightCm: 100 } },
                  { onSuccess: (u) => queryClient.setQueryData(getGetPliegoQueryKey(pliego.id), u) }
                );
              }}
              title="Restablecer a 58×100 cm"
            >
              <RefreshCw className="h-2.5 w-2.5" />
            </Button>
          )}
        </div>
      </div>

      {/* ── SUBIR DISEÑOS ── */}
      <div className="px-3 pt-3 pb-2.5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div
          className="dtf-upload-zone relative rounded-xl overflow-hidden cursor-pointer group"
          style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(99,102,241,0.06) 100%)' }}
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        >
          <div
            className="dtf-upload-border absolute inset-0 rounded-xl border-2 border-dashed pointer-events-none transition-colors"
            style={{ borderColor: 'rgba(139,92,246,0.3)' }}
          />
          <div className="flex flex-col items-center justify-center py-5 gap-1.5 relative z-10">
            <div
              className="dtf-upload-icon w-10 h-10 rounded-full flex items-center justify-center mb-0.5"
              style={{ background: 'rgba(139,92,246,0.18)', boxShadow: '0 0 20px rgba(139,92,246,0.2)' }}
            >
              {uploading
                ? <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                : <UploadCloud className="h-5 w-5 text-violet-400" />}
            </div>
            <span className="text-[13px] font-semibold text-white/90 leading-tight">
              {uploading ? "Subiendo…" : "Subir Diseños"}
            </span>
            <span className="text-[9px] text-white/30 tracking-widest uppercase">PNG · JPG · SVG</span>
          </div>
          <input ref={fileInputRef} type="file" multiple accept=".png,.jpg,.jpeg,.svg" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>


        {/* ── Añadir texto ── */}
        <button
          onClick={handleAddText}
          disabled={addingText}
          className="group relative w-full flex items-center justify-center gap-2 rounded-xl py-2 px-2 mt-2 overflow-hidden transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.25)',
          }}
        >
          {addingText
            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
            : <Type className="h-3.5 w-3.5 text-indigo-400 transition-transform duration-200 group-hover:-translate-y-0.5" />}
          <span className="text-[11px] font-semibold text-indigo-200/80">
            {addingText ? "Añadiendo…" : "Añadir texto"}
          </span>
        </button>
      </div>

      {/* ── CONFIGURACIÓN ── */}
      <div className="px-3 py-3 flex-1 space-y-3">
        {/* Color de fondo */}
        <div className="space-y-1.5">
          <div className="dtf-section-header pl-3">
            <span className="text-[8px] font-bold text-white/35 tracking-[0.2em] uppercase">Color de Fondo</span>
          </div>
          {(() => {
            const isCustom = !["transparent","white","black"].includes(bgColor);
            const pickerValue = isCustom ? bgColor : "#e53e3e";
            const activeRing = "2px solid rgba(139,92,246,0.9)";
            const idleRing = "2px solid rgba(255,255,255,0.08)";
            const activeGlow = "0 0 10px rgba(139,92,246,0.3)";
            return (
              <div className="flex gap-1.5">
                {/* Transparente */}
                <button
                  onClick={() => onBgColorChange("transparent")}
                  title="Transparente"
                  className="flex-1 h-7 rounded-lg overflow-hidden relative transition-all hover:scale-105"
                  style={{
                    outline: bgColor === "transparent" ? activeRing : idleRing,
                    outlineOffset: "2px",
                    boxShadow: bgColor === "transparent" ? activeGlow : "none",
                  }}
                >
                  <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(45deg,#444 25%,transparent 25%),linear-gradient(-45deg,#444 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#444 75%),linear-gradient(-45deg,transparent 75%,#444 75%)", backgroundSize: "8px 8px", backgroundPosition: "0 0,0 4px,4px -4px,-4px 0", backgroundColor: "#2a2a2a" }} />
                </button>
                {/* Blanco */}
                <button
                  onClick={() => onBgColorChange("white")}
                  title="Blanco"
                  className="flex-1 h-7 rounded-lg transition-all hover:scale-105"
                  style={{
                    background: "#ffffff",
                    outline: bgColor === "white" ? activeRing : idleRing,
                    outlineOffset: "2px",
                    boxShadow: bgColor === "white" ? activeGlow : "none",
                  }}
                />
                {/* Negro */}
                <button
                  onClick={() => onBgColorChange("black")}
                  title="Negro"
                  className="flex-1 h-7 rounded-lg transition-all hover:scale-105"
                  style={{
                    background: "#111111",
                    outline: bgColor === "black" ? activeRing : idleRing,
                    outlineOffset: "2px",
                    boxShadow: bgColor === "black" ? activeGlow : "none",
                  }}
                />
                {/* Picker libre */}
                <button
                  onClick={() => colorPickerRef.current?.click()}
                  title="Color personalizado"
                  className={`flex-1 h-7 rounded-lg overflow-hidden relative transition-all hover:scale-105${!isCustom ? " swatch-rainbow" : ""}`}
                  style={{
                    outline: isCustom ? activeRing : idleRing,
                    outlineOffset: "2px",
                    boxShadow: isCustom ? `0 0 10px ${bgColor}55` : "none",
                    ...(isCustom ? { background: bgColor } : {}),
                  }}
                />
                <input
                  ref={colorPickerRef}
                  type="color"
                  value={pickerValue}
                  onChange={e => onBgColorChange(e.target.value)}
                  className="sr-only"
                  tabIndex={-1}
                />
              </div>
            );
          })()}
        </div>

        <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

        {/* Actions */}
        <div className="space-y-1.5">
          {/* Acomodar */}
          <button
            className="group relative w-full flex flex-col items-center justify-center gap-0.5 rounded-xl py-2.5 px-2 overflow-hidden transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed hover:scale-[1.03] active:scale-[0.97] btn-pulse-hover-violet"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.22) 0%, rgba(109,40,217,0.12) 100%)',
              border: '1px solid rgba(139,92,246,0.45)',
              boxShadow: autoNest.isPending
                ? '0 0 22px rgba(139,92,246,0.55), inset 0 1px 0 rgba(255,255,255,0.1)'
                : '0 0 0 rgba(139,92,246,0), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
            onClick={handleAutoNest}
            disabled={images.length === 0 || autoNest.isPending}
          >
            {autoNest.isPending
              ? <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
              : <LayoutGrid className="h-4 w-4 text-violet-300 transition-transform duration-200 group-hover:-translate-y-0.5" />}
            <span className="text-[11px] font-bold text-violet-200 leading-none tracking-wide">
              {autoNest.isPending ? "Procesando…" : "Acomodar"}
            </span>
            {autoNest.isPending && <div className="dtf-shimmer absolute inset-0 opacity-60" />}
          </button>

          {/* ── Eliminar + Borrador ── */}
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              className="flex-1 h-7 text-xs gap-1.5 bg-transparent transition-all hover:scale-[1.02]"
              style={{
                color: hasSelection ? 'rgba(248,113,113,0.9)' : 'rgba(255,255,255,0.2)',
                borderColor: hasSelection ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.07)',
              }}
              onClick={handleDelete}
              disabled={!hasSelection}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar{selectedIds.length > 1 ? ` (${selectedIds.length})` : ""}
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-7 text-xs gap-1.5 bg-transparent transition-all hover:scale-[1.02]"
              style={{
                color: eraserMode ? 'rgba(167,139,250,0.95)' : 'rgba(255,255,255,0.45)',
                borderColor: eraserMode ? 'rgba(139,92,246,0.55)' : 'rgba(255,255,255,0.07)',
                boxShadow: eraserMode ? '0 0 10px rgba(139,92,246,0.3)' : 'none',
              }}
              onClick={onEraserToggle}
            >
              <Eraser className="h-3.5 w-3.5" />
              Borrador
              {eraserMode && (
                <span className="ml-0.5 text-[9px] font-bold tracking-widest uppercase text-violet-300">ON</span>
              )}
            </Button>
          </div>

          {eraserMode && (
            <div className="px-0.5 space-y-2.5 pb-1 animate-panel-in">
              {/* Tamaño */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-white/40">Tamaño</span>
                  <span className="text-[10px] text-white/60 tabular-nums">{eraserSize}px</span>
                </div>
                <input
                  type="range" min={4} max={250} value={eraserSize}
                  onChange={(e) => onEraserSizeChange?.(parseInt(e.target.value))}
                  className="w-full h-[3px] rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: 'rgba(139,92,246,1)' }}
                />
              </div>
              {/* Opacidad */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-white/40">Opacidad</span>
                  <span className="text-[10px] text-white/60 tabular-nums">{eraserOpacity}%</span>
                </div>
                <input
                  type="range" min={1} max={100} value={eraserOpacity}
                  onChange={(e) => onEraserOpacityChange?.(parseInt(e.target.value))}
                  className="w-full h-[3px] rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: 'rgba(139,92,246,1)' }}
                />
              </div>

              {/* ── Separador + toggle Relleno inteligente ── */}
              <div style={{ height: 1, background: 'rgba(139,92,246,0.15)' }} />

              <button
                onClick={() => onInpaintModeChange?.(!inpaintMode)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  width: '100%', padding: '5px 7px', borderRadius: 6,
                  background: inpaintMode ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${inpaintMode ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.06)'}`,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <Wand2 style={{
                  width: 11, height: 11, flexShrink: 0,
                  color: inpaintMode ? 'rgba(167,139,250,1)' : 'rgba(255,255,255,0.35)',
                }} />
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
                  color: inpaintMode ? 'rgba(167,139,250,0.95)' : 'rgba(255,255,255,0.4)',
                  flex: 1, textAlign: 'left',
                }}>
                  Relleno inteligente
                </span>
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                  color: inpaintMode ? 'rgba(167,139,250,0.9)' : 'rgba(255,255,255,0.2)',
                  padding: '1px 4px', borderRadius: 3,
                  background: inpaintMode ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)',
                }}>
                  {inpaintMode ? 'ON' : 'OFF'}
                </span>
              </button>

              {inpaintMode && (
                <div className="space-y-1.5 pl-1 animate-panel-in">
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-white/40">Radio de relleno</span>
                    <span className="text-[10px] text-white/60 tabular-nums">{inpaintRadius}px</span>
                  </div>
                  <input
                    type="range" min={1} max={20} value={inpaintRadius}
                    onChange={(e) => onInpaintRadiusChange?.(parseInt(e.target.value))}
                    className="w-full h-[3px] rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: 'rgba(139,92,246,1)' }}
                  />
                  <p className="text-[9px] leading-tight" style={{ color: 'rgba(167,139,250,0.55)' }}>
                    Analiza los píxeles del entorno para reconstruir lo que había detrás del objeto borrado.
                  </p>
                </div>
              )}

              <p className="text-[9px] text-white/25 leading-tight">
                {inpaintMode
                  ? 'Pinta el área a eliminar → al soltar, OpenCV rellena inteligentemente.'
                  : 'Haz clic o arrastra sobre la imagen para borrar. Guarda al soltar.'}
              </p>
            </div>
          )}
        </div>

        {/* Cost card */}
        {metersUsed !== undefined && (
          <div className="dtf-cost-card px-3 py-2.5 space-y-1.5 animate-panel-in">
            {isPro && (
              <p className="text-[10px] font-semibold text-violet-300/70 leading-snug pb-0.5">
                Este sería el costo comprando con nosotros:
              </p>
            )}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-white/40">Largo usado</span>
              <span className="font-semibold text-white tabular-nums">{metersUsed.toFixed(2)} m</span>
            </div>
            {pricePerMeter !== undefined && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-white/30">Precio/metro</span>
                <span className="text-white/40 tabular-nums">${pricePerMeter.toLocaleString("es-CL")}</span>
              </div>
            )}
            {totalPrice !== undefined && (
              <>
                <div className="h-px" style={{ background: 'rgba(139,92,246,0.2)' }} />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-white/70">Costo material</span>
                  <span
                    className="text-[13px] font-black tabular-nums"
                    style={{ color: 'rgba(167,139,250,1)', textShadow: '0 0 12px rgba(139,92,246,0.6)' }}
                  >
                    ${totalPrice.toLocaleString("es-CL")}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Export ── */}
      <div className="px-3 pt-3 pb-2 shrink-0 flex flex-col gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>

        {/* Export label */}
        <p className="text-[10px] font-semibold uppercase tracking-widest opacity-30 pl-0.5 select-none">Exportar</p>

        {/* RGB + CMYK side-by-side — solo plan Pro */}
        {isPro && (
        <div className="flex gap-2">
          {/* RGB PNG */}
          <button
            className="group relative flex-1 flex flex-col items-center justify-center gap-0.5 rounded-xl py-2.5 px-2 overflow-hidden transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.22) 0%, rgba(109,40,217,0.12) 100%)',
              border: '1px solid rgba(139,92,246,0.45)',
              boxShadow: exportingRgb
                ? '0 0 22px rgba(139,92,246,0.55), inset 0 1px 0 rgba(255,255,255,0.1)'
                : '0 0 0 rgba(139,92,246,0), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
            onClick={handleExportRgb}
            disabled={exportingRgb || exportingCmyk || images.length === 0}
            title="PNG · Adobe RGB 1998 · 300 DPI · Fondo transparente"
          >
            {exportingRgb
              ? <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
              : <Download className="h-4 w-4 text-violet-300 transition-transform duration-200 group-hover:-translate-y-0.5" />}
            <span className="text-[11px] font-bold text-violet-200 leading-none tracking-wide">
              {exportingRgb ? "Exportando…" : "RGB"}
            </span>
            <span className="text-[9px] text-violet-400/60 leading-none font-medium">PNG</span>
            {exportingRgb && <div className="dtf-shimmer absolute inset-0 opacity-60" />}
          </button>

          {/* CMYK PDF */}
          <button
            className="group relative flex-1 flex flex-col items-center justify-center gap-0.5 rounded-xl py-2.5 px-2 overflow-hidden transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(5,150,105,0.10) 100%)',
              border: '1px solid rgba(16,185,129,0.4)',
              boxShadow: exportingCmyk
                ? '0 0 22px rgba(16,185,129,0.5), inset 0 1px 0 rgba(255,255,255,0.1)'
                : '0 0 0 rgba(16,185,129,0), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
            onClick={handleExportCmyk}
            disabled={exportingRgb || exportingCmyk || images.length === 0}
            title="PDF · FOGRA39 · 300 DPI · Fondo transparente"
          >
            {exportingCmyk
              ? <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
              : <Download className="h-4 w-4 text-emerald-300 transition-transform duration-200 group-hover:-translate-y-0.5" />}
            <span className="text-[11px] font-bold text-emerald-200 leading-none tracking-wide">
              {exportingCmyk ? "Exportando…" : "CMYK"}
            </span>
            <span className="text-[9px] text-emerald-400/60 leading-none font-medium">PDF</span>
            {exportingCmyk && <div className="dtf-shimmer absolute inset-0 opacity-60" />}
          </button>
        </div>
        )}

        {/* Mandar a Imprimir */}
        <button
          className="group relative w-full flex flex-col items-center justify-center gap-0.5 rounded-xl py-2.5 px-2 overflow-hidden transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed hover:scale-[1.03] active:scale-[0.97] animate-btn-border-pulse"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.22) 0%, rgba(67,56,202,0.12) 100%)',
            border: '1px solid rgba(129,140,248,0.5)',
            boxShadow: '0 0 0 rgba(99,102,241,0), inset 0 1px 0 rgba(255,255,255,0.07)',
          }}
          disabled={images.length === 0}
          title="Mandar pliego a impresión"
          onClick={() => toast.info("Función de impresión próximamente")}
        >
          <Printer className="h-4 w-4 text-indigo-300 transition-transform duration-200 group-hover:-translate-y-0.5" />
          <span className="text-[11px] font-bold text-indigo-200 leading-none tracking-wide">Imprimir!</span>
          <span className="text-[9px] text-indigo-400/60 leading-none font-medium">Próximamente</span>
        </button>
      </div>
    </aside>
  );
}
