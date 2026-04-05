import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  useUpdatePliegoImage,
  useAutoNestPliego,
  useAddImageToPliego,
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
import { Loader2, Sparkles, Scissors, ZoomIn, Lock, Unlock, Ruler, ChevronDown, ChevronUp, ChevronRight, Check, Layers } from "lucide-react";
import { toast } from "sonner";
import { loadTextParams, DEFAULT_PARAMS } from "@/lib/textRender";
import { textParamsStore } from "@/lib/textParamsStore";

interface Props {
  pliego: Pliego;
  images: PliegoImage[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  onProcessingChange?: (ids: number[], task: string) => void;
  mobile?: boolean;
  hideAITools?: boolean;
}


type AiTask = "" | "fondo" | "2x" | "4x" | "semitono";

export function SidebarRight({ pliego, images, selectedIds, onSelectionChange, onProcessingChange, mobile = false, hideAITools = false }: Props) {
  const queryClient = useQueryClient();
  const updateImage = useUpdatePliegoImage();
  const autoNest = useAutoNestPliego();
  const addImage = useAddImageToPliego();
  const autoNestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { push: pushHistory } = useHistory();

  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiTask, setAiTask] = useState<AiTask>("");
  const [aiSuccess, setAiSuccess] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [semitoneOpen, setSemitoneOpen] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [semitoneColor, setSemitoneColor] = useState("#181818");
  const [semitoneTramaLPI, setSemitoneTramaLPI] = useState(30);
  const [semitoneAngleDeg, setSemitoneAngleDeg] = useState(7);
  const [semitoneDotShape, setSemitoneDotShape] = useState<"round" | "ellipse" | "square" | "diamond" | "line">("round");
  const [semitoneHardness, setSemitoneHardness] = useState(1);
  const [semitoneTolerancia, setSemitoneTolerancia] = useState(30);
  const [removeBgTolerance, setRemoveBgTolerance] = useState(18);

  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");
  const [lockAspect, setLockAspect] = useState(true);
  const aspectRef = useRef(1);
  const [focusedGroupIdx, setFocusedGroupIdx] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const singleSelected = selectedIds.length === 1
    ? images.find((img) => img.id === selectedIds[0]) ?? null
    : null;

  const { token } = useAuth() as { token: string };
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };


  useEffect(() => {
    if (!singleSelected) return;
    setDimW(singleSelected.widthCm.toFixed(1));
    setDimH(singleSelected.heightCm.toFixed(1));
    aspectRef.current = singleSelected.widthCm / singleSelected.heightCm;
  }, [singleSelected?.id, singleSelected?.widthCm, singleSelected?.heightCm]);

  useEffect(() => {
    if (!singleSelected?.uploadId) {
      textParamsStore.clear();
      return;
    }
    const saved = loadTextParams(singleSelected.uploadId);
    if (saved) {
      // Populate store so TextToolbar (top bar) loads the params
      textParamsStore.set(singleSelected.uploadId, { ...DEFAULT_PARAMS, ...saved });
    } else {
      textParamsStore.clear();
    }
  }, [singleSelected?.id]);

  const handleWChange = (val: string) => {
    setDimW(val);
    const w = parseFloat(val);
    if (lockAspect && !isNaN(w) && w > 0 && aspectRef.current > 0) {
      setDimH((w / aspectRef.current).toFixed(1));
    }
  };

  const handleHChange = (val: string) => {
    setDimH(val);
    const h = parseFloat(val);
    if (lockAspect && !isNaN(h) && h > 0 && aspectRef.current > 0) {
      setDimW((h * aspectRef.current).toFixed(1));
    }
  };

  const saveDimensions = () => {
    if (!singleSelected) return;
    const w = parseFloat(dimW);
    const h = parseFloat(dimH);
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;
    if (Math.abs(w - singleSelected.widthCm) < 0.01 && Math.abs(h - singleSelected.heightCm) < 0.01) return;
    updateImage.mutate(
      { id: pliego.id, imageId: singleSelected.id, data: { widthCm: w, heightCm: h } },
      {
        onSuccess: () => {
          invalidateAll();
          toast.success(`Medidas: ${w.toFixed(1)} × ${h.toFixed(1)} cm`);
        },
        onError: () => toast.error("Error al guardar medidas"),
      }
    );
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoStatsQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoPriceQueryKey(pliego.id) });
  };

  const resetAll = () => {
    queryClient.resetQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoStatsQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoPriceQueryKey(pliego.id) });
  };

  /** Clean up an old upload from the server (safe: only if no other pliego uses it) */
  const cleanupOldUpload = async (oldUploadId: number) => {
    try {
      await fetch(`/api/uploads/${oldUploadId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    } catch {
      // non-critical
    }
  };

  const flashSuccess = () => {
    setAiSuccess(true);
    setTimeout(() => setAiSuccess(false), 1800);
  };

  const hasSelection = selectedIds.length > 0;

  // Group images by uploadId for folder view
  const imageGroups = useMemo(() => {
    const map = new Map<number, PliegoImage[]>();
    for (const img of images) {
      const g = map.get(img.uploadId) ?? [];
      g.push(img);
      map.set(img.uploadId, g);
    }
    return Array.from(map.values());
  }, [images]);

  const toggleGroup = (uploadId: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(uploadId)) next.delete(uploadId);
      else next.add(uploadId);
      return next;
    });
  };

  const scheduleAutoNest = () => {
    if (autoNestDebounce.current) clearTimeout(autoNestDebounce.current);
    autoNestDebounce.current = setTimeout(() => {
      autoNest.mutate({ id: pliego.id }, {
        onSuccess: () => {
          // Refetch pliego to get the accurate server-computed height
          queryClient.invalidateQueries({ queryKey: getGetPliegoQueryKey(pliego.id) });
          queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) });
          queryClient.invalidateQueries({ queryKey: getGetPliegoStatsQueryKey(pliego.id) });
          queryClient.invalidateQueries({ queryKey: getGetPliegoPriceQueryKey(pliego.id) });
        },
      });
    }, 600);
  };

  /** Add one physical copy of an image to the canvas (no auto-nest). */
  const addCopy = async (source: PliegoImage) => {
    const added = await addImage.mutateAsync({
      id: pliego.id,
      data: {
        uploadId: source.uploadId,
        xCm: source.xCm + 1,
        yCm: source.yCm + 1,
        widthCm: source.widthCm,
        heightCm: source.heightCm,
        quantity: source.quantity ?? 1,
      },
    });
    queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) });
    return added;
  };

  /** Remove one physical copy (last in group) from the canvas. */
  const removeCopy = async (imgId: number) => {
    await fetch(`/api/pliegos/${pliego.id}/images/${imgId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoPriceQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoStatsQueryKey(pliego.id) });
  };

  /**
   * Handle +/- on the group stepper:
   * +1 → add a physical copy (new canvas item)
   * -1 → remove last physical copy in the group (min 1)
   */
  const handleGroupQtyChange = async (group: PliegoImage[], delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (delta > 0) {
      try { await addCopy(group[group.length - 1]); }
      catch { toast.error("Error al agregar copia"); }
    } else if (delta < 0 && group.length > 1) {
      try { await removeCopy(group[group.length - 1].id); }
      catch { toast.error("Error al quitar copia"); }
    }
  };

  /**
   * Adjust group size to match targetCount by adding or removing physical copies.
   * Called from the input's onBlur.
   */
  const applyGroupQty = async (group: PliegoImage[], targetCount: number) => {
    const clamped = Math.max(1, Math.min(999, targetCount));
    const current = group.length;
    if (clamped === current) return;
    if (clamped > current) {
      for (let i = 0; i < clamped - current; i++) {
        try { await addCopy(group[group.length - 1]); }
        catch { break; }
      }
    } else {
      for (let i = 0; i < current - clamped; i++) {
        const updated = (queryClient.getQueryData(getListPliegoImagesQueryKey(pliego.id)) as PliegoImage[] | undefined)
          ?.filter((img) => img.uploadId === group[0].uploadId) ?? group;
        if (updated.length <= 1) break;
        try { await removeCopy(updated[updated.length - 1].id); }
        catch { break; }
      }
    }
  };

  /** Per-image quantity field (print-count multiplier for individual sub-items). */
  const applyQty = (img: PliegoImage, newQty: number) => {
    const qty = img.quantity ?? 1;
    const clamped = Math.max(1, Math.min(999, newQty));
    if (clamped === qty) return;
    queryClient.setQueryData(
      getListPliegoImagesQueryKey(pliego.id),
      (old: PliegoImage[] | undefined) => old ? old.map((i) => i.id === img.id ? { ...i, quantity: clamped } : i) : old,
    );
    updateImage.mutate(
      { id: pliego.id, imageId: img.id, data: { quantity: clamped } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPliegoPriceQueryKey(pliego.id) });
          queryClient.invalidateQueries({ queryKey: getGetPliegoStatsQueryKey(pliego.id) });
        },
        onError: () => {
          queryClient.setQueryData(
            getListPliegoImagesQueryKey(pliego.id),
            (old: PliegoImage[] | undefined) =>
              old ? old.map((i) => i.id === img.id ? { ...i, quantity: qty } : i) : old,
          );
          toast.error("Error al actualizar cantidad");
        },
      }
    );
  };

  const handleQtyChange = (img: PliegoImage, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    applyQty(img, (img.quantity ?? 1) + delta);
  };

  /** Call server-side background removal and replace image */
  const handleRemoveBg = async () => {
    if (aiProcessing) return;
    const selectedImgs = images.filter((img) => selectedIds.includes(img.id));
    if (selectedImgs.length === 0) {
      toast.error("Selecciona al menos una imagen primero");
      return;
    }
    const snapshot: { imgId: number; oldUploadId: number; newUploadId: number }[] =
      selectedImgs.map((img) => ({ imgId: img.id, oldUploadId: img.uploadId, newUploadId: 0 }));
    const pliegoId = pliego.id;
    setAiProcessing(true);
    setAiTask("fondo");
    onProcessingChange?.(selectedImgs.map((img) => img.id), "fondo");
    try {
      for (let i = 0; i < selectedImgs.length; i++) {
        const img = selectedImgs[i];

        const res = await fetch(`/api/uploads/${img.uploadId}/remove-bg`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ tolerance: removeBgTolerance }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "remove-bg failed");
        }
        const newUpload = await res.json();
        snapshot[i].newUploadId = newUpload.id;

        const newAspect = newUpload.widthPx && newUpload.heightPx
          ? newUpload.widthPx / newUpload.heightPx
          : null;
        const newHeightCm = newAspect ? img.widthCm / newAspect : img.heightCm;

        await new Promise<void>((resolve, reject) =>
          updateImage.mutate(
            { id: pliego.id, imageId: img.id, data: { uploadId: newUpload.id, heightCm: newHeightCm } },
            {
              onSuccess: () => {
                queryClient.setQueryData(
                  getListPliegoImagesQueryKey(pliego.id),
                  (old: PliegoImage[] | undefined) =>
                    old
                      ? old.map((item) =>
                          item.id === img.id
                            ? { ...item, uploadId: newUpload.id, imageUrl: `${newUpload.imageUrl}?t=${Date.now()}`, heightCm: newHeightCm }
                            : item
                        )
                      : old,
                );
                resolve();
              },
              onError: (err) => {
                // Image deleted mid-processing — treat as success
                if ((err as { status?: number }).status === 404) resolve();
                else reject(err);
              },
            }
          )
        );
        // Old upload is NOT deleted — kept alive so Ctrl+Z can restore it
      }

      resetAll();
      flashSuccess();
      pushHistory({
        label: "Quitar fondo",
        cleanup: () => {
          // Called only when this entry is discarded from the undo stack (overflow)
          for (const { oldUploadId } of snapshot) cleanupOldUpload(oldUploadId);
        },
        undo: async () => {
          for (const { imgId, oldUploadId, newUploadId } of snapshot) {
            await new Promise<void>((res) => updateImage.mutate(
              { id: pliegoId, imageId: imgId, data: { uploadId: oldUploadId } },
              { onSuccess: () => res(), onError: () => res() }
            ));
            // Clean up the new upload since we're going back to old one
            if (newUploadId) cleanupOldUpload(newUploadId);
          }
          queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
        },
      });
      toast.success(
        selectedImgs.length === 1
          ? "Fondo eliminado correctamente"
          : `Fondo eliminado en ${selectedImgs.length} imágenes`
      );
    } catch (err) {
      console.error(err);
      toast.error("Error al quitar el fondo. Intenta de nuevo.");
    } finally {
      setAiProcessing(false);
      setAiTask("");
      onProcessingChange?.([], "");
    }
  };

  /** Call server-side upscale and replace image in pliego */
  const handleUpscale = async (scale: 2 | 4) => {
    if (aiProcessing) return;
    const selectedImgs = images.filter((img) => selectedIds.includes(img.id));
    if (selectedImgs.length === 0) {
      toast.error("Selecciona al menos una imagen primero");
      return;
    }
    const snapshot: { imgId: number; oldUploadId: number; newUploadId: number }[] =
      selectedImgs.map((img) => ({ imgId: img.id, oldUploadId: img.uploadId, newUploadId: 0 }));
    const pliegoId = pliego.id;
    setAiProcessing(true);
    setAiTask(`${scale}x` as AiTask);
    onProcessingChange?.(selectedImgs.map((img) => img.id), `${scale}x`);
    try {
      for (let i = 0; i < selectedImgs.length; i++) {
        const img = selectedImgs[i];

        const res = await fetch(`/api/uploads/${img.uploadId}/upscale`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ scale }),
        });
        if (!res.ok) throw new Error("upscale failed");
        const newUpload = await res.json();
        snapshot[i].newUploadId = newUpload.id;

        // Replace the upload reference in the pliego image.
        // Physical widthCm/heightCm stay the same — upscaling improves
        // print resolution, not the physical layout size.
        await new Promise<void>((resolve, reject) =>
          updateImage.mutate(
            { id: pliego.id, imageId: img.id, data: { uploadId: newUpload.id } },
            {
              onSuccess: () => {
                // Optimistic update with cache-busting timestamp so the
                // browser loads the new file even if same-origin cache is warm.
                const freshUrl = `${newUpload.imageUrl}?t=${Date.now()}`;
                queryClient.setQueryData(
                  getListPliegoImagesQueryKey(pliego.id),
                  (old: PliegoImage[] | undefined) =>
                    old
                      ? old.map((item) =>
                          item.id === img.id
                            ? {
                                ...item,
                                uploadId: newUpload.id,
                                imageUrl: freshUrl,
                                originalWidthPx: newUpload.widthPx,
                                originalHeightPx: newUpload.heightPx,
                              }
                            : item
                        )
                      : old,
                );
                resolve();
              },
              onError: (err) => {
                if ((err as { status?: number }).status === 404) resolve();
                else reject(err);
              },
            }
          )
        );
        // Old upload is NOT deleted — kept alive so Ctrl+Z can restore it
      }

      // Hard-reset the query so next render fetches clean server data
      resetAll();
      flashSuccess();
      pushHistory({
        label: `Ampliar ${scale}×`,
        cleanup: () => {
          // Discard old uploads when this entry overflows from the undo stack
          for (const { oldUploadId } of snapshot) cleanupOldUpload(oldUploadId);
        },
        undo: async () => {
          for (const { imgId, oldUploadId, newUploadId } of snapshot) {
            await new Promise<void>((res) => updateImage.mutate(
              { id: pliegoId, imageId: imgId, data: { uploadId: oldUploadId } },
              { onSuccess: () => res(), onError: () => res() }
            ));
            if (newUploadId) cleanupOldUpload(newUploadId);
          }
          queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
        },
      });
      toast.success(
        selectedImgs.length === 1
          ? `Imagen ampliada ${scale}× (mayor resolución de impresión)`
          : `${selectedImgs.length} imágenes ampliadas ${scale}×`
      );
    } catch {
      toast.error(`Error al ampliar ${scale}×`);
    } finally {
      setAiProcessing(false);
      setAiTask("");
      onProcessingChange?.([], "");
    }
  };

  /** Apply DTF halftone to selected images (removes bg first) */
  const handleHalftone = async () => {
    if (aiProcessing) return;
    const selectedImgs = images.filter((img) => selectedIds.includes(img.id));
    if (selectedImgs.length === 0) {
      toast.error("Selecciona al menos una imagen primero");
      return;
    }
    const snapshot: { imgId: number; oldUploadId: number; bgUploadId: number; newUploadId: number }[] =
      selectedImgs.map((img) => ({ imgId: img.id, oldUploadId: img.uploadId, bgUploadId: 0, newUploadId: 0 }));
    const pliegoId = pliego.id;
    setAiProcessing(true);
    setAiTask("semitono");
    onProcessingChange?.(selectedImgs.map((img) => img.id), "semitono");
    try {
      for (let i = 0; i < selectedImgs.length; i++) {
        const img = selectedImgs[i];

        // Step 1: remove background first
        const bgRes = await fetch(`/api/uploads/${img.uploadId}/remove-bg`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ tolerance: removeBgTolerance }),
        });
        if (!bgRes.ok) {
          const err = await bgRes.json().catch(() => ({}));
          throw new Error(err.error ?? "remove-bg failed");
        }
        const bgUpload = await bgRes.json();
        snapshot[i].bgUploadId = bgUpload.id;

        // Step 2: apply halftone on the bg-removed image
        const res = await fetch(`/api/uploads/${bgUpload.id}/halftone`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ bgColor: semitoneColor, lpi: semitoneTramaLPI, angleDeg: semitoneAngleDeg, dotShape: semitoneDotShape, hardness: semitoneHardness, tolerance: semitoneTolerancia }),
        });
        if (!res.ok) throw new Error("halftone failed");
        const newUpload = await res.json();
        snapshot[i].newUploadId = newUpload.id;

        await new Promise<void>((resolve, reject) =>
          updateImage.mutate(
            { id: pliego.id, imageId: img.id, data: { uploadId: newUpload.id } },
            {
              onSuccess: () => {
                const freshUrl = `${newUpload.imageUrl}?t=${Date.now()}`;
                queryClient.setQueryData(
                  getListPliegoImagesQueryKey(pliego.id),
                  (old: PliegoImage[] | undefined) =>
                    old
                      ? old.map((item) =>
                          item.id === img.id
                            ? { ...item, uploadId: newUpload.id, imageUrl: freshUrl }
                            : item
                        )
                      : old,
                );
                resolve();
              },
              onError: (err) => {
                if ((err as { status?: number }).status === 404) resolve();
                else reject(err);
              },
            }
          )
        );
        // Delete intermediate bg-removed upload immediately — frees quota, undo only needs oldUploadId + newUploadId
        cleanupOldUpload(bgUpload.id);
      }
      resetAll();
      flashSuccess();
      pushHistory({
        label: "Semitono DTF",
        cleanup: () => {
          // Discard originals when this entry overflows from the undo stack
          for (const { oldUploadId } of snapshot) cleanupOldUpload(oldUploadId);
        },
        undo: async () => {
          for (const { imgId, oldUploadId, bgUploadId, newUploadId } of snapshot) {
            await new Promise<void>((res) => updateImage.mutate(
              { id: pliegoId, imageId: imgId, data: { uploadId: oldUploadId } },
              { onSuccess: () => res(), onError: () => res() }
            ));
            // Clean up the intermediate uploads created by the AI pipeline
            if (bgUploadId) cleanupOldUpload(bgUploadId);
            if (newUploadId) cleanupOldUpload(newUploadId);
          }
          queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
        },
      });
      toast.success(
        selectedImgs.length === 1
          ? "Fondo eliminado + Semitono DTF aplicado"
          : `Fondo eliminado + Semitono DTF aplicado a ${selectedImgs.length} imágenes`
      );
    } catch {
      toast.error("Error al aplicar semitono (verifica conexión AI)");
    } finally {
      setAiProcessing(false);
      setAiTask("");
      onProcessingChange?.([], "");
    }
  };

  return (
    <aside
      className={mobile ? "w-full flex-1 overflow-y-auto flex flex-col text-sm" : "w-64 h-full flex flex-col shrink-0 text-sm"}
      style={{
        backgroundColor: "#111115",
        borderLeft: '1px solid rgba(255,255,255,0.07)',
        background: 'linear-gradient(180deg, #131318 0%, #111115 100%)',
      }}
    >

      {/* ── Header with collapse toggle ── */}
      <button
        onClick={() => setListOpen((v) => !v)}
        className="px-4 py-3 shrink-0 flex items-center justify-between w-full transition-all group"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: listOpen ? 'linear-gradient(90deg, rgba(139,92,246,0.05) 0%, transparent 100%)' : 'transparent',
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-1 h-4 rounded-full transition-all"
            style={{ background: listOpen ? 'linear-gradient(to bottom, rgba(139,92,246,0.9), rgba(99,102,241,0.4))' : 'rgba(255,255,255,0.12)' }}
          />
          <span className="text-[9px] font-bold text-white/40 tracking-[0.2em] uppercase group-hover:text-white/60 transition-colors">Imágenes</span>
        </div>
        <div className="flex items-center gap-2">
          {images.length > 0 && (
            <span
              className="text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(139,92,246,0.15)', color: 'rgba(167,139,250,0.8)' }}
            >
              {images.length}
            </span>
          )}
          <div
            className="w-4 h-4 rounded flex items-center justify-center transition-all"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            {listOpen
              ? <ChevronUp className="h-2.5 w-2.5 text-white/70" />
              : <ChevronDown className="h-2.5 w-2.5 text-white/70" />}
          </div>
        </div>
      </button>

      {/* ── Image list (collapsible) ── */}
      {listOpen && (
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5 min-h-0 animate-panel-in outline-none"
          tabIndex={-1}
          onKeyDown={(e) => {
            const groups = imageGroups;
            if (!groups.length) return;
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;

            if (e.key === "ArrowDown") {
              e.preventDefault();
              const next = Math.min(focusedGroupIdx + 1, groups.length - 1);
              setFocusedGroupIdx(next);
              const elNext = listRef.current?.querySelectorAll<HTMLElement>("[data-group-row]")[next];
              elNext?.focus();
              elNext?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const prev = Math.max(focusedGroupIdx - 1, 0);
              setFocusedGroupIdx(prev);
              const elPrev = listRef.current?.querySelectorAll<HTMLElement>("[data-group-row]")[prev];
              elPrev?.focus();
              elPrev?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (focusedGroupIdx < 0 || focusedGroupIdx >= groups.length) return;
              const group = groups[focusedGroupIdx];
              const groupIds = group.map((i) => i.id);
              const allSel = groupIds.every((id) => selectedIds.includes(id));
              if (e.ctrlKey || e.metaKey || e.shiftKey) {
                const merged = allSel
                  ? selectedIds.filter((id) => !groupIds.includes(id))
                  : Array.from(new Set([...selectedIds, ...groupIds]));
                onSelectionChange(merged);
              } else {
                onSelectionChange(allSel ? [] : groupIds);
              }
            } else if (e.key === "Escape") {
              e.preventDefault();
              onSelectionChange([]);
              setFocusedGroupIdx(-1);
            } else if (e.key === "Delete" || e.key === "Backspace") {
              e.preventDefault();
              if (selectedIds.length > 0) {
                const toDeleteIds = selectedIds;
                onSelectionChange([]);
                (e.currentTarget as HTMLElement).blur();
                toDeleteIds.forEach(async (id) => {
                  try {
                    await fetch(`/api/pliegos/${pliego.id}/images/${id}`, { method: "DELETE" });
                  } catch { /* skip */ }
                });
              }
            }
          }}
        >
          {images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-white/20 text-xs text-center gap-1">
              <span>Sin imágenes</span>
              <span>Sube diseños desde el panel izquierdo</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <span className="text-[9px] text-white/30">
                  {imageGroups.length} diseño{imageGroups.length !== 1 ? "s" : ""} · {images.length} pz total
                </span>
                {selectedIds.length > 0 && (
                  <button
                    onClick={() => onSelectionChange([])}
                    className="text-[9px] text-white/30 hover:text-white/60 transition-colors"
                  >
                    limpiar
                  </button>
                )}
              </div>

              {imageGroups.map((group) => {
                const rep = group[0];
                const uploadId = rep.uploadId;
                const isExpanded = expandedGroups.has(uploadId);
                const totalQty = group.reduce((s, i) => s + (i.quantity ?? 1), 0);
                const groupSelectedIds = group.map((i) => i.id);
                const allSelected = groupSelectedIds.every((id) => selectedIds.includes(id));
                const someSelected = groupSelectedIds.some((id) => selectedIds.includes(id));
                const isGroupProcessing = aiProcessing && someSelected;
                const isSingle = group.length === 1 && totalQty <= 1;

                const handleGroupClick = (e: React.MouseEvent) => {
                  if (isSingle) {
                    // Single item: act like a normal row (select/deselect)
                    const id = group[0].id;
                    if (e.ctrlKey || e.metaKey) {
                      if (selectedIds.includes(id)) onSelectionChange(selectedIds.filter((x) => x !== id));
                      else onSelectionChange([...selectedIds, id]);
                    } else {
                      onSelectionChange(allSelected ? [] : [id]);
                    }
                  } else {
                    toggleGroup(uploadId);
                  }
                };

                const handleGroupSelect = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (allSelected) {
                    onSelectionChange(selectedIds.filter((id) => !groupSelectedIds.includes(id)));
                  } else {
                    const merged = Array.from(new Set([...selectedIds, ...groupSelectedIds]));
                    onSelectionChange(merged);
                  }
                };

                return (
                  <div key={uploadId} className="space-y-px">
                    {/* ── Folder header ── */}
                    <div
                      data-group-row
                      tabIndex={0}
                      onClick={handleGroupClick}
                      onFocus={() => setFocusedGroupIdx(imageGroups.indexOf(group))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault(); e.stopPropagation(); handleGroupClick(e as any);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer transition-all select-none outline-none ${
                        allSelected
                          ? "bg-primary/20 border border-primary/40"
                          : someSelected
                          ? "bg-primary/10 border border-primary/20"
                          : "hover:bg-white/5 border border-transparent"
                      }`}
                      style={{
                        ...(isGroupProcessing ? { animation: "ai-pulse 1.2s ease-in-out infinite" } : {}),
                        ...(focusedGroupIdx === imageGroups.indexOf(group) && !allSelected && !someSelected
                          ? { borderColor: "rgba(139,92,246,0.35)", background: "rgba(139,92,246,0.07)" }
                          : {}),
                      }}
                    >
                      {/* Chevron (only for groups with >1 copy) */}
                      <div className="w-3 shrink-0 flex items-center justify-center">
                        {!isSingle && (
                          isExpanded
                            ? <ChevronDown className="h-2.5 w-2.5 text-white/70" />
                            : <ChevronRight className="h-2.5 w-2.5 text-white/70" />
                        )}
                      </div>

                      {/* Thumbnail — tiny preview, use /thumb for fast load */}
                      <div className="relative w-6 h-6 rounded-sm shrink-0 overflow-hidden bg-white/5 flex items-center justify-center">
                        <img src={`${rep.imageUrl}/thumb?w=48`} alt="" decoding="async" loading="lazy" className="w-full h-full object-contain" />
                        {isGroupProcessing && <div className="absolute inset-0 bg-black/50"><div className="ai-scan-line" /></div>}
                      </div>

                      {/* Dims */}
                      <span className="flex-1 min-w-0 text-[10px] text-white/55 truncate leading-none">
                        {rep.widthCm.toFixed(1)}×{rep.heightCm.toFixed(1)}
                      </span>

                      {/* Qty badge / stepper */}
                      {isGroupProcessing ? (
                        <Loader2 className="h-3 w-3 text-violet-400 animate-spin shrink-0" />
                      ) : isSingle ? (
                        /* Single item: show qty stepper inline */
                        <div
                          className="flex items-center shrink-0 rounded overflow-hidden border border-white/8"
                          style={{ background: "rgba(255,255,255,0.04)" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button onClick={(e) => handleGroupQtyChange(group, -1, e)} className="w-4 h-5 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-[11px] leading-none">−</button>
                          <input
                            key={group.length}
                            type="number"
                            defaultValue={group.length}
                            min={1} max={999}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); (e.target as HTMLInputElement).blur(); } }}
                            onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) applyGroupQty(group, v); }}
                            className="w-8 h-5 text-[10px] text-white/70 tabular-nums text-center bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button onClick={(e) => handleGroupQtyChange(group, +1, e)} className="w-4 h-5 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-[11px] leading-none">+</button>
                        </div>
                      ) : (
                        /* Multi-copy folder: select + count + stepper */
                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {/* Select-all dot — now on the LEFT */}
                          <button
                            onClick={handleGroupSelect}
                            className="w-4 h-4 rounded-sm flex items-center justify-center transition-colors"
                            style={{
                              background: allSelected ? "rgba(139,92,246,0.6)" : someSelected ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(139,92,246,0.3)",
                            }}
                            title={allSelected ? "Deseleccionar grupo" : "Seleccionar grupo"}
                          >
                            {(allSelected || someSelected) && <Check className="h-2 w-2 text-white" />}
                          </button>
                          {/* ×N copies label */}
                          <span className="text-[9px] tabular-nums text-white/25 leading-none select-none">×{group.length}</span>
                          {/* Qty stepper — adds/removes physical copies on canvas */}
                          <div
                            className="flex items-center shrink-0 rounded overflow-hidden border border-white/8"
                            style={{ background: "rgba(255,255,255,0.04)" }}
                          >
                            <button
                              onClick={(e) => handleGroupQtyChange(group, -1, e)}
                              className="w-4 h-5 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-[11px] leading-none"
                              title="Quitar una copia del canvas"
                            >−</button>
                            <input
                              key={group.length}
                              type="number"
                              defaultValue={group.length}
                              min={1} max={999}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); (e.target as HTMLInputElement).blur(); } }}
                              onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) applyGroupQty(group, v); }}
                              className="w-7 h-5 text-[10px] text-white/60 tabular-nums text-center bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              onClick={(e) => handleGroupQtyChange(group, +1, e)}
                              className="w-4 h-5 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-[11px] leading-none"
                              title="Agregar una impresión"
                            >+</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Expanded copies ── */}
                    {!isSingle && isExpanded && (
                      <div className="ml-4 space-y-px">
                        {group.map((img, idx) => {
                          const isSelected = selectedIds.includes(img.id);
                          const isProcessing = aiProcessing && isSelected;
                          const qty = img.quantity ?? 1;
                          return (
                            <div
                              key={img.id}
                              onClick={(e) => {
                                if (e.ctrlKey || e.metaKey) {
                                  if (isSelected) onSelectionChange(selectedIds.filter((x) => x !== img.id));
                                  else onSelectionChange([...selectedIds, img.id]);
                                } else {
                                  onSelectionChange(isSelected && selectedIds.length === 1 ? [] : [img.id]);
                                }
                              }}
                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer transition-all select-none ${
                                isSelected
                                  ? "bg-primary/20 border border-primary/40"
                                  : "hover:bg-white/5 border border-transparent"
                              }`}
                              style={isProcessing ? { animation: "ai-pulse 1.2s ease-in-out infinite" } : undefined}
                            >
                              {/* Connector line indicator */}
                              <div className="w-2 border-l border-b border-white/10 h-3 mt-[-6px] shrink-0" />

                              {/* Index */}
                              <span className="text-[9px] text-white/25 w-4 shrink-0 tabular-nums text-right leading-none">
                                {idx + 1}
                              </span>

                              {/* Dims */}
                              <span className="flex-1 min-w-0 text-[10px] text-white/50 truncate leading-none">
                                {img.widthCm.toFixed(1)}×{img.heightCm.toFixed(1)}
                              </span>

                              {/* Qty pill */}
                              {isProcessing ? (
                                <Loader2 className="h-3 w-3 text-violet-400 animate-spin shrink-0" />
                              ) : (
                                <div
                                  className="flex items-center shrink-0 rounded overflow-hidden border border-white/8"
                                  style={{ background: "rgba(255,255,255,0.04)" }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button onClick={(e) => handleQtyChange(img, -1, e)} className="w-4 h-5 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-[11px] leading-none">−</button>
                                  <input
                                    key={qty}
                                    type="number"
                                    defaultValue={qty}
                                    min={1} max={999}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); (e.target as HTMLInputElement).blur(); } }}
                                    onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) applyQty(img, v); }}
                                    className="w-8 h-5 text-[10px] text-white/70 tabular-nums text-center bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <button onClick={(e) => handleQtyChange(img, +1, e)} className="w-4 h-5 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-[11px] leading-none">+</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── AI Tools panel ── */}
      {!hideAITools && hasSelection && (
        <div
          className="relative overflow-hidden shrink-0"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.07)',
            background: aiSuccess
              ? 'linear-gradient(135deg,rgba(34,197,94,0.08) 0%,rgba(16,185,129,0.04) 100%)'
              : 'linear-gradient(135deg,rgba(139,92,246,0.08) 0%,rgba(99,102,241,0.04) 100%)',
            ...(aiSuccess ? { animation: "ai-success-flash 1.8s ease-out forwards" } : {}),
          }}
        >
          {aiProcessing && <div className="ai-progress-bar" />}

          {/* Header */}
          <div className="px-3 pt-3 pb-1.5 flex items-center gap-2">
            <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.4),rgba(99,102,241,0.25))' }}>
              <Sparkles
                className="h-3 w-3 text-violet-300"
                style={aiProcessing ? { animation: "ai-sparkle 1s ease-in-out infinite" } : undefined}
              />
            </div>
            <span className="text-[10px] font-semibold text-white/70 tracking-wide uppercase">Herramientas IA</span>
            {aiProcessing && (
              <span className="ml-auto text-[9px] text-violet-400/80 animate-pulse flex items-center gap-1 shrink-0">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> procesando…
              </span>
            )}
            {aiSuccess && !aiProcessing && (
              <span className="ml-auto text-[9px] text-green-400 flex items-center gap-1 shrink-0">
                <Check className="h-3 w-3" /> listo
              </span>
            )}
          </div>

          {/* Quitar fondo section */}
          <div className="px-3 pb-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-white/70 shrink-0">Tolerancia</span>
              <input
                type="range" min={5} max={120} step={1} value={removeBgTolerance}
                onChange={(e) => setRemoveBgTolerance(Number(e.target.value))}
                className="flex-1 h-1.5 accent-violet-500 rounded-full" style={{ cursor: "pointer" }}
              />
              <span className="text-[9px] text-violet-300/80 w-6 text-right shrink-0 font-mono">{removeBgTolerance}</span>
            </div>
            <Button
              variant="ghost" size="sm"
              onClick={handleRemoveBg} disabled={aiProcessing}
              className="w-full h-9 text-[11px] gap-2 font-medium relative overflow-hidden rounded-lg disabled:opacity-40"
              style={{
                background: aiProcessing && aiTask === "fondo"
                  ? 'rgba(139,92,246,0.2)'
                  : 'linear-gradient(135deg,rgba(139,92,246,0.15),rgba(99,102,241,0.1))',
                border: '1px solid rgba(139,92,246,0.25)',
                color: 'rgba(196,181,253,0.9)',
              }}
            >
              {aiProcessing && aiTask === "fondo"
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><div className="ai-shimmer" /></>
                : <Scissors className="h-3.5 w-3.5" />}
              Quitar fondo
            </Button>
          </div>

          {/* Upscale section */}
          <div className="px-3 pb-3">
            <span className="text-[9px] text-white/70 block mb-1.5">Mejorar calidad</span>
            <div className="grid grid-cols-2 gap-2">
              {([2, 4] as const).map((scale) => (
                <Button
                  key={scale}
                  variant="ghost" size="sm"
                  onClick={() => handleUpscale(scale)} disabled={aiProcessing}
                  className="h-9 text-[11px] gap-1.5 font-medium relative overflow-hidden rounded-lg disabled:opacity-40"
                  style={{
                    background: aiProcessing && aiTask === `${scale}x`
                      ? 'rgba(139,92,246,0.2)'
                      : 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(196,181,253,0.85)',
                  }}
                >
                  {aiProcessing && aiTask === `${scale}x`
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><div className="ai-shimmer" /></>
                    : <ZoomIn className="h-3.5 w-3.5" />}
                  {scale}× Upscale
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Dimension editor (desktop only — mobile uses quick-edit bar) ── */}
      {!hideAITools && singleSelected && (
        <div className="px-3 pb-3 border-t border-white/10 pt-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Ruler className="h-3 w-3 text-white/50" />
            <span className="text-[10px] font-semibold text-white/50 tracking-widest uppercase">Dimensiones</span>
            {updateImage.isPending && <Loader2 className="h-3 w-3 animate-spin text-white/40 ml-auto" />}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-[9px] text-white/70 uppercase tracking-wider">Ancho</label>
              <div className="relative">
                <input
                  type="number" min="0.1" step="0.1" value={dimW}
                  onChange={(e) => handleWChange(e.target.value)}
                  onBlur={saveDimensions}
                  onKeyDown={(e) => e.key === "Enter" && saveDimensions()}
                  className="w-full h-8 rounded-md bg-white/5 border border-white/10 text-xs text-white px-2 pr-7 focus:outline-none focus:border-primary/60 focus:bg-white/8 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-white/30 pointer-events-none">cm</span>
              </div>
            </div>
            <button
              onClick={() => setLockAspect((v) => !v)}
              className="mt-5 w-7 h-7 rounded flex items-center justify-center shrink-0 transition-colors"
              style={{
                background: lockAspect ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.05)",
                border: lockAspect ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {lockAspect
                ? <Lock className="h-3 w-3 text-violet-400" />
                : <Unlock className="h-3 w-3 text-white/40" />}
            </button>
            <div className="flex-1 space-y-1">
              <label className="text-[9px] text-white/70 uppercase tracking-wider">Alto</label>
              <div className="relative">
                <input
                  type="number" min="0.1" step="0.1" value={dimH}
                  onChange={(e) => handleHChange(e.target.value)}
                  onBlur={saveDimensions}
                  onKeyDown={(e) => e.key === "Enter" && saveDimensions()}
                  className="w-full h-8 rounded-md bg-white/5 border border-white/10 text-xs text-white px-2 pr-7 focus:outline-none focus:border-primary/60 focus:bg-white/8 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-white/30 pointer-events-none">cm</span>
              </div>
            </div>
          </div>
          <p className="text-[9px] text-white/25 leading-tight">
            {lockAspect ? "Proporción bloqueada · " : "Proporción libre · "}Enter o clic fuera para guardar
          </p>
        </div>
      )}

      {/* ── Semitono DTF panel (desktop only) ── */}
      {!hideAITools && <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={() => setSemitoneOpen((v) => !v)}
          className="px-3 py-2.5 flex items-center justify-between w-full transition-all group"
          style={{
            background: semitoneOpen ? 'linear-gradient(90deg, rgba(139,92,246,0.07) 0%, transparent 100%)' : 'transparent',
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-1 h-4 rounded-full transition-all"
              style={{ background: semitoneOpen ? 'linear-gradient(to bottom, rgba(167,139,250,0.9), rgba(139,92,246,0.4))' : 'rgba(255,255,255,0.12)' }}
            />
            <span className="text-[9px] font-bold text-white/40 tracking-[0.2em] uppercase group-hover:text-white/60 transition-colors">Semitono DTF</span>
          </div>
          <div className="flex items-center gap-2">
            {aiProcessing && aiTask === "semitono" && (
              <span className="text-[8px] text-violet-400/70 animate-pulse tracking-wide">procesando…</span>
            )}
            <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
              {semitoneOpen
                ? <ChevronUp className="h-2.5 w-2.5 text-white/70" />
                : <ChevronDown className="h-2.5 w-2.5 text-white/70" />}
            </div>
          </div>
        </button>

        <div className={`dtf-collapsible ${semitoneOpen ? 'open' : 'closed'}`}>
          <div className="dtf-inner">
            <div className="px-3 pb-4 pt-2 space-y-3">

              {/* Color de prenda — 3 swatches en fila */}
              <div>
                <span className="text-[9px] text-white/40 uppercase tracking-wider">Color de prenda</span>
                <div className="flex gap-1.5 items-center mt-3">
                  {([
                    { hex: "#181818", label: "Negro" },
                    { hex: "#ffffff", label: "Blanco" },
                  ] as const).map(({ hex, label }) => (
                    <button
                      key={hex}
                      onClick={() => setSemitoneColor(hex)}
                      title={label}
                      className="flex-1 h-8 rounded-lg transition-all"
                      style={{
                        background: hex,
                        outline: semitoneColor === hex ? "2px solid rgba(139,92,246,0.9)" : "2px solid rgba(255,255,255,0.08)",
                        outlineOffset: "2px",
                      }}
                    />
                  ))}
                  <label
                    title="Otro color"
                    className={`w-8 h-8 rounded-lg cursor-pointer relative overflow-hidden shrink-0 flex items-center justify-center${!["#181818","#ffffff"].includes(semitoneColor) ? "" : " swatch-rainbow"}`}
                    style={{
                      ...(!["#181818", "#ffffff"].includes(semitoneColor) ? { background: semitoneColor } : {}),
                      outline: !["#181818", "#ffffff"].includes(semitoneColor) ? "2px solid rgba(139,92,246,0.9)" : "2px solid rgba(255,255,255,0.08)",
                      outlineOffset: "2px",
                    }}
                  >
                    <input
                      type="color"
                      value={semitoneColor}
                      onChange={(e) => setSemitoneColor(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Avanzado — sub-acordeón */}
              <details className="group/adv">
                <summary
                  className="flex items-center justify-between cursor-pointer select-none list-none text-[9px] text-white/30 hover:text-white/50 transition-colors py-0.5"
                >
                  <span className="uppercase tracking-wider">⚙ Avanzado</span>
                  <ChevronDown className="h-3 w-3 transition-transform group-open/adv:rotate-180" />
                </summary>
                <div className="mt-2 space-y-3 pl-1 border-l border-white/8">
                  {/* Densidad de trama */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-white/30">Densidad</span>
                      <span className="text-[10px] font-mono text-violet-300/70">{semitoneTramaLPI} LPI</span>
                    </div>
                    <input
                      type="range" min={5} max={80} step={1}
                      value={semitoneTramaLPI}
                      onChange={(e) => setSemitoneTramaLPI(Number(e.target.value))}
                      className="w-full h-1 appearance-none rounded-full cursor-pointer"
                      style={{ accentColor: "hsl(262 83% 65%)" }}
                    />
                    <div className="flex justify-between text-[8px] text-white/15">
                      <span>fino</span><span>grueso</span>
                    </div>
                  </div>

                  {/* Forma del punto */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-white/30">Forma del punto</span>
                    <div className="grid grid-cols-5 gap-1">
                      {([
                        { key: "round",   label: "●", title: "Rdo"   },
                        { key: "ellipse", label: "⬭", title: "Elíp"  },
                        { key: "diamond", label: "◆", title: "Diam"  },
                        { key: "square",  label: "■", title: "Cuad"  },
                        { key: "line",    label: "━", title: "Línea" },
                      ] as const).map(({ key, label, title }) => (
                        <button
                          key={key} title={title}
                          onClick={() => setSemitoneDotShape(key)}
                          className="h-8 flex flex-col items-center justify-center gap-0.5 rounded text-[12px] transition-all"
                          style={{
                            background: semitoneDotShape === key ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)",
                            border: semitoneDotShape === key ? "1px solid rgba(139,92,246,0.6)" : "1px solid rgba(255,255,255,0.1)",
                            color: semitoneDotShape === key ? "rgba(167,139,250,1)" : "rgba(255,255,255,0.35)",
                          }}
                        >
                          <span className="leading-none">{label}</span>
                          <span className="text-[6px] leading-none opacity-60">{title}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ángulo */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-white/30">Ángulo</span>
                      <span className="text-[10px] font-mono text-violet-300/70">{semitoneAngleDeg}°</span>
                    </div>
                    <input
                      type="range" min={0} max={90} step={1}
                      value={semitoneAngleDeg}
                      onChange={(e) => setSemitoneAngleDeg(Number(e.target.value))}
                      className="w-full h-1 appearance-none rounded-full cursor-pointer"
                      style={{ accentColor: "hsl(262 83% 65%)" }}
                    />
                    <div className="flex justify-between text-[8px] text-white/15"><span>0°</span><span>90°</span></div>
                  </div>
                  {/* Tolerancia */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-white/30">Tolerancia</span>
                      <span className="text-[10px] font-mono text-violet-300/70">{semitoneTolerancia}</span>
                    </div>
                    <input
                      type="range" min={0} max={100} step={1}
                      value={semitoneTolerancia}
                      onChange={(e) => setSemitoneTolerancia(Number(e.target.value))}
                      className="w-full h-1 appearance-none rounded-full cursor-pointer"
                      style={{ accentColor: "hsl(262 83% 65%)" }}
                    />
                    <div className="flex justify-between text-[8px] text-white/15"><span>exacto</span><span>amplio</span></div>
                  </div>
                  {/* Precisión */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-white/30">Precisión</span>
                      <span className="text-[10px] font-mono text-violet-300/70">{Math.round(semitoneHardness * 100)}%</span>
                    </div>
                    <input
                      type="range" min={0} max={1} step={0.05}
                      value={semitoneHardness}
                      onChange={(e) => setSemitoneHardness(Number(e.target.value))}
                      className="w-full h-1 appearance-none rounded-full cursor-pointer"
                      style={{ accentColor: "hsl(262 83% 65%)" }}
                    />
                    <div className="flex justify-between text-[8px] text-white/15"><span>agresivo</span><span>preciso</span></div>
                  </div>
                </div>
              </details>

              {/* ── Botón Aplicar ── */}
              <button
                onClick={handleHalftone}
                disabled={aiProcessing || !hasSelection}
                className="group relative w-full flex flex-col items-center justify-center gap-0.5 rounded-xl py-2.5 px-2 overflow-hidden transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed hover:scale-[1.03] active:scale-[0.97] btn-pulse-hover-purple"
                style={{
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.22) 0%, rgba(139,92,246,0.12) 100%)',
                  border: `1px solid ${hasSelection ? 'rgba(192,132,252,0.5)' : 'rgba(168,85,247,0.2)'}`,
                  boxShadow: aiProcessing && aiTask === "semitono"
                    ? '0 0 22px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.1)'
                    : '0 0 0 rgba(168,85,247,0), inset 0 1px 0 rgba(255,255,255,0.06)',
                }}
              >
                {aiProcessing && aiTask === "semitono" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-purple-300" />
                    <span className="text-[11px] font-bold text-purple-200 leading-none tracking-wide">Procesando…</span>
                    <span className="text-[9px] text-purple-400/60 leading-none font-medium">En un click</span>
                    <div className="dtf-shimmer absolute inset-0 opacity-60" />
                  </>
                ) : (
                  <>
                    <Layers className={`h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 ${hasSelection ? 'text-purple-300' : 'text-purple-500/40'}`} />
                    <span className={`text-[11px] font-bold leading-none tracking-wide ${hasSelection ? 'text-purple-200' : 'text-purple-500/40'}`}>
                      {hasSelection ? "Semitono" : "Sin selección"}
                    </span>
                    <span className={`text-[9px] leading-none font-medium ${hasSelection ? 'text-purple-400/60' : 'text-purple-600/30'}`}>En un click</span>
                  </>
                )}
              </button>

            </div>
          </div>
        </div>
      </div>}

      {/* Inline animations */}
      <style>{`
        @keyframes ai-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
          50% { box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.35); }
        }
        @keyframes ai-sparkle {
          0%, 100% { transform: scale(1) rotate(0deg); opacity: 1; }
          50% { transform: scale(1.3) rotate(20deg); opacity: 0.7; }
        }
        @keyframes ai-success-flash {
          0% { background-color: transparent; }
          15% { background-color: rgba(74, 222, 128, 0.08); }
          100% { background-color: transparent; }
        }
        @keyframes progress-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes scan {
          0% { top: -4px; }
          100% { top: 100%; }
        }
        .ai-progress-bar {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.8), transparent);
          animation: progress-slide 1.4s ease-in-out infinite;
          border-radius: 1px;
        }
        .ai-scan-line {
          position: absolute;
          left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.9), transparent);
          animation: scan 0.9s ease-in-out infinite;
          box-shadow: 0 0 4px rgba(139, 92, 246, 0.8);
        }
        .ai-shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.12) 50%, transparent 100%);
          animation: progress-slide 1.2s ease-in-out infinite;
          pointer-events: none;
        }
      `}</style>

    </aside>
  );
}
