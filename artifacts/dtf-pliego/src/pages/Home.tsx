import { useCallback, useEffect, useRef, useState } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useGetPliego,
  useListPliegoImages,
  useCreatePliego,
  useListPliegos,
  useGetPliegoPrice,
  getGetPliegoQueryKey,
  getListPliegoImagesQueryKey,
  getGetPliegoPriceQueryKey,
  PliegoImage,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { SidebarLeft } from "@/components/layout/SidebarLeft";
import { SidebarRight } from "@/components/layout/SidebarRight";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { CanvasArea } from "@/components/canvas/CanvasArea";
import { TextToolbar } from "@/components/canvas/TextToolbar";
import { HistoryProvider, useHistory } from "@/contexts/HistoryContext";
import { useMobile } from "@/hooks/useMobile";
import { Loader2, Undo2, Redo2 } from "lucide-react";
import { renderTextToBlob, saveTextParams, type TextParams } from "@/lib/textRender";
import { useThumbnailSave } from "@/hooks/useThumbnail";

export default function Home() {
  return (
    <HistoryProvider>
      <HomeInner />
    </HistoryProvider>
  );
}

function HomeInner() {
  const isMobile = useMobile();
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const pliegoIdParam = params.get("pliegoId");
  const queryClient = useQueryClient();

  const { data: pliegosList, isLoading: isLoadingList, isFetching: isFetchingList } = useListPliegos();
  const createPliego = useCreatePliego();
  const creatingRef = useRef(false);

  // Resolve which pliegoId to use — if the URL param doesn't belong to this
  // user (not in pliegosList), clear it so we fall back to a valid one.
  const pliegoIdIsValid = pliegoIdParam
    ? pliegosList?.some((p) => p.id === parseInt(pliegoIdParam, 10)) ?? true
    : true;

  useEffect(() => {
    if (isLoadingList || isFetchingList) return;

    // If the pliegoId in the URL doesn't belong to this user, clear it
    if (pliegoIdParam && pliegosList && !pliegosList.some((p) => p.id === parseInt(pliegoIdParam, 10))) {
      setLocation("/");
      return;
    }

    if (pliegoIdParam) return;

    if (pliegosList && pliegosList.length > 0) {
      setLocation(`/?pliegoId=${pliegosList[0].id}`);
    } else if (pliegosList && pliegosList.length === 0 && !creatingRef.current) {
      creatingRef.current = true;
      createPliego.mutate(
        { data: { name: `Pliego ${new Date().toLocaleDateString("es-CL")}`, widthCm: 58, heightCm: 100, dpi: 300, pricePerMeter: 3500 } },
        {
          onSuccess: (p) => { queryClient.invalidateQueries({ queryKey: ["/api/pliegos"] }); setLocation(`/?pliegoId=${p.id}`); },
          onError: () => { creatingRef.current = false; },
        }
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingList, pliegosList, pliegoIdParam]);

  const pliegoId = (pliegoIdParam && pliegoIdIsValid) ? parseInt(pliegoIdParam, 10) : 0;

  const { data: pliego, isLoading: isPliegoLoading } = useGetPliego(pliegoId, {
    query: { enabled: pliegoId > 0, queryKey: getGetPliegoQueryKey(pliegoId) },
  });
  const { data: images } = useListPliegoImages(pliegoId, {
    query: { enabled: pliegoId > 0, queryKey: getListPliegoImagesQueryKey(pliegoId) },
  });
  const { data: price } = useGetPliegoPrice(pliegoId, {
    query: {
      enabled: pliegoId > 0,
      queryKey: getGetPliegoPriceQueryKey(pliegoId),
      refetchInterval: 10_000,
    },
  });

  useThumbnailSave(pliego, images, token);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bgColor, setBgColor] = useState<string>("transparent");
  const [trimTransparency, setTrimTransparency] = useState(true);
  const [removeSemiTransparency, setRemoveSemiTransparency] = useState(true);
  const [fitVersion, setFitVersion] = useState(0);
  const [processingImageIds, setProcessingImageIds] = useState<number[]>([]);
  const [processingTask, setProcessingTask] = useState("");
  const [eraserMode, setEraserMode] = useState(false);
  const [eraserSize, setEraserSize] = useState(30);
  const [eraserOpacity, setEraserOpacity] = useState(100);
  const [inpaintMode, setInpaintMode] = useState(false);
  const [inpaintRadius, setInpaintRadius] = useState(5);
  const [undoToast, setUndoToast] = useState<string | null>(null);
  const undoToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextUpdate = useCallback(async (img: PliegoImage, newParams: TextParams) => {
    const { blob } = await renderTextToBlob(newParams);
    const form = new FormData();
    form.append("file", blob, "text.png");
    const res = await fetch(`/api/uploads/${img.uploadId}/replace`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error("replace failed");
    saveTextParams(img.uploadId, newParams);
    await queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
  }, [queryClient, pliegoId]);

  const { pop, redo: redoHistory, canUndo, canRedo, lastLabel, redoLabel, undoStack, redoStack } = useHistory();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [undoAnim, setUndoAnim] = useState(false);
  const [redoAnim, setRedoAnim] = useState(false);

  const triggerUndo = useCallback(async () => {
    const entry = pop();
    if (!entry) return;
    setUndoAnim(true);
    setTimeout(() => setUndoAnim(false), 400);
    try { await entry.undo(); } catch { /* non-critical */ }
    if (undoToastTimer.current) clearTimeout(undoToastTimer.current);
    setUndoToast(`↩ ${entry.label}`);
    undoToastTimer.current = setTimeout(() => setUndoToast(null), 2000);
  }, [pop]);

  const triggerRedo = useCallback(async () => {
    const entry = redoHistory();
    if (!entry) return;
    setRedoAnim(true);
    setTimeout(() => setRedoAnim(false), 400);
    try { await (entry.redo ?? entry.undo)(); } catch { /* non-critical */ }
    if (undoToastTimer.current) clearTimeout(undoToastTimer.current);
    setUndoToast(`↪ ${entry.label}`);
    undoToastTimer.current = setTimeout(() => setUndoToast(null), 2000);
  }, [redoHistory]);

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      const el = e.target as HTMLInputElement;
      const tag = el?.tagName;
      const type = el?.type ?? "";
      const isTextInput =
        tag === "TEXTAREA" || tag === "SELECT" ||
        (tag === "INPUT" && !["range", "checkbox", "radio", "color", "button", "submit", "reset"].includes(type));
      if (isTextInput) return;

      // Ctrl+Shift+Z or Ctrl+Y → redo
      if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        if (document.activeElement && document.activeElement !== document.body)
          (document.activeElement as HTMLElement).blur();
        await triggerRedo();
        return;
      }

      // Ctrl+Z → undo
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (document.activeElement && document.activeElement !== document.body)
          (document.activeElement as HTMLElement).blur();
        await triggerUndo();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [triggerUndo, triggerRedo]);

  if (isLoadingList || (pliegoId > 0 && isPliegoLoading) || !pliegoId) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Cargando... Prueba de flujo Railway ✓</p>
        </div>
      </div>
    );
  }

  if (!pliego) return null;

  if (isMobile) {
    return (
      <MobileLayout
        pliego={pliego}
        images={images || []}
        pliegoId={pliegoId}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        bgColor={bgColor}
        setBgColor={setBgColor}
        trimTransparency={trimTransparency}
        removeSemiTransparency={removeSemiTransparency}
        setTrimTransparency={setTrimTransparency}
        setRemoveSemiTransparency={setRemoveSemiTransparency}
        fitVersion={fitVersion}
        setFitVersion={setFitVersion}
        processingImageIds={processingImageIds}
        processingTask={processingTask}
        setProcessingImageIds={setProcessingImageIds}
        setProcessingTask={setProcessingTask}
        eraserMode={eraserMode}
        setEraserMode={setEraserMode}
        eraserSize={eraserSize}
        setEraserSize={setEraserSize}
        eraserOpacity={eraserOpacity}
        setEraserOpacity={setEraserOpacity}
        inpaintMode={inpaintMode}
        setInpaintMode={setInpaintMode}
        inpaintRadius={inpaintRadius}
        setInpaintRadius={setInpaintRadius}
        price={price}
        handleTextUpdate={handleTextUpdate}
        triggerUndo={triggerUndo}
        triggerRedo={triggerRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        undoAnim={undoAnim}
        redoAnim={redoAnim}
        undoToast={undoToast}
      />
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground relative">
      <SidebarLeft
        pliego={pliego}
        images={images || []}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bgColor={bgColor}
        onBgColorChange={setBgColor}
        trimTransparency={trimTransparency}
        removeSemiTransparency={removeSemiTransparency}
        onTrimChange={setTrimTransparency}
        onSemiChange={setRemoveSemiTransparency}
        metersUsed={price?.metersUsed}
        totalPrice={price?.totalPrice}
        pricePerMeter={price?.pricePerMeter}
        onFitRequest={() => setFitVersion((v) => v + 1)}
        eraserMode={eraserMode}
        eraserSize={eraserSize}
        eraserOpacity={eraserOpacity}
        onEraserToggle={() => setEraserMode((v) => !v)}
        onEraserSizeChange={setEraserSize}
        onEraserOpacityChange={setEraserOpacity}
        inpaintMode={inpaintMode}
        inpaintRadius={inpaintRadius}
        onInpaintModeChange={setInpaintMode}
        onInpaintRadiusChange={setInpaintRadius}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TextToolbar
          onImageUpdated={() => queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) })}
        />
        <CanvasArea
          pliego={pliego}
          images={images || []}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          bgColor={bgColor}
          fitVersion={fitVersion}
          processingImageIds={processingImageIds}
          processingTask={processingTask}
          onTextUpdate={handleTextUpdate}
          eraserMode={eraserMode}
          eraserSize={eraserSize}
          eraserOpacity={eraserOpacity}
          inpaintMode={inpaintMode}
          inpaintRadius={inpaintRadius}
          onEraserCommit={() => setEraserMode(false)}
        />
      </div>
      <SidebarRight
        pliego={pliego}
        images={images || []}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onProcessingChange={(ids, task) => {
          setProcessingImageIds(ids);
          setProcessingTask(task);
        }}
      />

      {/* ── Undo / Redo floating bar ── */}
      <div
        className="fixed z-50 flex items-center gap-1"
        style={{ bottom: 20, left: "50%", transform: "translateX(-50%)" }}
        onMouseEnter={() => setHistoryOpen(true)}
        onMouseLeave={() => setHistoryOpen(false)}
      >
        {/* Undo button */}
        <button
          onClick={triggerUndo}
          disabled={!canUndo}
          title={canUndo ? `Deshacer: ${lastLabel} (Ctrl+Z)` : "Sin acciones para deshacer"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-medium transition-all select-none"
          style={{
            background: canUndo
              ? "linear-gradient(135deg,rgba(30,18,58,0.96),rgba(20,12,42,0.96))"
              : "rgba(20,20,28,0.5)",
            border: canUndo ? "1px solid rgba(139,92,246,0.4)" : "1px solid rgba(255,255,255,0.06)",
            color: canUndo ? "rgba(196,181,253,0.9)" : "rgba(255,255,255,0.2)",
            backdropFilter: "blur(14px)",
            boxShadow: canUndo ? "0 4px 20px rgba(139,92,246,0.2)" : "none",
            cursor: canUndo ? "pointer" : "default",
          }}
        >
          <Undo2 className={`h-3 w-3 shrink-0 ${undoAnim ? "spin-once" : ""}`} />
          <span className="hidden sm:inline">Deshacer</span>
          <kbd className="text-[8px] opacity-40 font-mono">⌘Z</kbd>
        </button>

        {/* History popover — last 5 entries */}
        {historyOpen && (canUndo || canRedo) && (
          <div
            className="absolute bottom-full mb-2 left-1/2 min-w-48 rounded-xl overflow-hidden shadow-2xl animate-slide-up-in"
            style={{
              transform: "translateX(-50%)",
              background: "linear-gradient(135deg,rgba(20,14,40,0.98),rgba(14,10,30,0.98))",
              border: "1px solid rgba(139,92,246,0.3)",
              backdropFilter: "blur(20px)",
            }}
          >
            <div className="px-3 py-2 border-b border-white/8">
              <span className="text-[9px] text-white/40 uppercase tracking-wider">Historial (últimas acciones)</span>
            </div>
            {[...undoStack].reverse().slice(0, 5).map((e, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors">
                <Undo2 className="h-2.5 w-2.5 text-violet-400/60 shrink-0" />
                <span className="text-[10px] text-white/60 truncate">{e.label}</span>
                {i === 0 && <span className="ml-auto text-[8px] text-violet-400/50 shrink-0">siguiente</span>}
              </div>
            ))}
            {redoStack.length > 0 && (
              <div className="border-t border-white/8">
                {[...redoStack].reverse().slice(0, 2).map((e, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors opacity-50">
                    <Redo2 className="h-2.5 w-2.5 text-indigo-400/60 shrink-0" />
                    <span className="text-[10px] text-white/40 truncate">{e.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Redo button */}
        <button
          onClick={triggerRedo}
          disabled={!canRedo}
          title={canRedo ? `Rehacer: ${redoLabel} (Ctrl+Shift+Z)` : "Sin acciones para rehacer"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-medium transition-all select-none"
          style={{
            background: canRedo
              ? "linear-gradient(135deg,rgba(30,18,58,0.96),rgba(20,12,42,0.96))"
              : "rgba(20,20,28,0.5)",
            border: canRedo ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.06)",
            color: canRedo ? "rgba(165,180,252,0.9)" : "rgba(255,255,255,0.2)",
            backdropFilter: "blur(14px)",
            boxShadow: canRedo ? "0 4px 20px rgba(99,102,241,0.2)" : "none",
            cursor: canRedo ? "pointer" : "default",
          }}
        >
          <Redo2 className={`h-3 w-3 shrink-0 ${redoAnim ? "spin-once" : ""}`} />
          <span className="hidden sm:inline">Rehacer</span>
          <kbd className="text-[8px] opacity-40 font-mono">⌘⇧Z</kbd>
        </button>
      </div>

      {/* Action toast — slides up */}
      {undoToast && (
        <div
          className="fixed bottom-14 left-1/2 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs text-white/90 shadow-2xl z-50 pointer-events-none animate-slide-up-in"
          style={{
            background: "linear-gradient(135deg,rgba(30,18,58,0.97),rgba(20,12,40,0.97))",
            border: "1px solid rgba(139,92,246,0.4)",
            backdropFilter: "blur(16px)",
            transform: "translateX(-50%)",
          }}
        >
          <span className="text-violet-200 font-medium">{undoToast}</span>
        </div>
      )}
    </div>
  );
}
