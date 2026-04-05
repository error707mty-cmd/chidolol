import { useCallback, useEffect, useRef, useState } from "react";
import { Pliego, PliegoImage, useUpdatePliegoImage, useRemovePliegoImage, getListPliegoImagesQueryKey, getGetPliegoPriceQueryKey, getGetPliegoStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { useHistory } from "@/contexts/HistoryContext";
import { loadTextParams, renderTextToBlob, type TextParams } from "@/lib/textRender";
import { textParamsStore } from "@/lib/textParamsStore";
import { useMobile } from "@/hooks/useMobile";

const CM_TO_PX = 10;

// Axis-Aligned Bounding Box of a rotated rectangle
function aabb(w: number, h: number, rotDeg: number): { w: number; h: number } {
  if (!rotDeg) return { w, h };
  const θ = (rotDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(θ));
  const s = Math.abs(Math.sin(θ));
  return { w: w * c + h * s, h: w * s + h * c };
}

type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Props {
  pliego: Pliego;
  images: PliegoImage[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  bgColor: string;
  fitVersion?: number;
  processingImageIds?: number[];
  processingTask?: string;
  onTextUpdate?: (img: PliegoImage, newParams: TextParams) => Promise<void>;
  eraserMode?: boolean;
  eraserSize?: number;
  eraserOpacity?: number;
  inpaintMode?: boolean;
  inpaintRadius?: number;
  onEraserCommit?: () => void;
  suppressHandles?: boolean;
}

interface EraserSession {
  imageId: number;
  uploadId: number;
  origW: number;
  origH: number;
  loaded: boolean;
  pendingPts: Array<[number, number, number, number]>;
  prevPt?: [number, number, number, number];
  rect: DOMRect;
  canvasEl: HTMLCanvasElement;
  containerEl: HTMLElement;
  imageUrl: string;
  loadPromise: Promise<void>;
}

interface InlineEdit {
  img: PliegoImage;
  params: TextParams;
  editText: string;
  updating: boolean;
}

interface LocalState {
  xCm: number; yCm: number; widthCm: number; heightCm: number; rotation: number;
}

type DragMode =
  | {
      kind: "move";
      draggedId: number;
      selectedIds: number[];
      startMx: number;
      startMy: number;
      startPositions: Record<number, { xCm: number; yCm: number }>;
    }
  | {
      kind: "resize";
      imageId: number;
      handle: HandleDir;
      startMx: number;
      startMy: number;
      startX: number;
      startY: number;
      startW: number;
      startH: number;
      aspectRatio: number;
    }
  | {
      kind: "rotate";
      imageId: number;
      startMx: number;
      startMy: number;
      centerX: number;
      centerY: number;
      startRotation: number;
      startAngle: number;
    }
  | {
      kind: "select";
      startMx: number;
      startMy: number;
    };

const HANDLE_DIRS: HandleDir[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const HANDLE_CURSORS: Record<HandleDir, string> = {
  nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize", e: "ew-resize",
  se: "nwse-resize", s: "ns-resize", sw: "nesw-resize", w: "ew-resize",
};

const HS = 14; // handle size px (larger for touch)

function handlePos(dir: HandleDir): React.CSSProperties {
  const half = HS / 2;
  const map: Record<HandleDir, { left: string; top: string }> = {
    nw: { left: `-${half}px`,                  top: `-${half}px` },
    n:  { left: `calc(50% - ${half}px)`,        top: `-${half}px` },
    ne: { left: `calc(100% - ${half}px)`,       top: `-${half}px` },
    e:  { left: `calc(100% - ${half}px)`,       top: `calc(50% - ${half}px)` },
    se: { left: `calc(100% - ${half}px)`,       top: `calc(100% - ${half}px)` },
    s:  { left: `calc(50% - ${half}px)`,        top: `calc(100% - ${half}px)` },
    sw: { left: `-${half}px`,                   top: `calc(100% - ${half}px)` },
    w:  { left: `-${half}px`,                   top: `calc(50% - ${half}px)` },
  };
  return map[dir];
}

function handleStyle(dir: HandleDir): React.CSSProperties {
  return {
    position: "absolute",
    ...handlePos(dir),
    width: HS,
    height: HS,
    background: "#ffffff",
    border: "2px solid #818cf8",
    borderRadius: "50%",
    cursor: HANDLE_CURSORS[dir],
    zIndex: 30,
    boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
  };
}

// Handles drawn directly on a bounding box container (screen px)
function GroupHandle({ dir, onDown }: { dir: HandleDir; onDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      style={{
        position: "absolute",
        ...handlePos(dir),
        width: HS,
        height: HS,
        background: "#ffffff",
        border: "2px solid #818cf8",
        borderRadius: "50%",
        cursor: HANDLE_CURSORS[dir],
        zIndex: 200,
        boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
      }}
      onMouseDown={onDown}
    />
  );
}

export function CanvasArea({ pliego, images, selectedIds, onSelectionChange, bgColor, fitVersion, processingImageIds, processingTask, onTextUpdate, eraserMode = false, eraserSize = 30, eraserOpacity = 100, inpaintMode = false, inpaintRadius = 5, onEraserCommit, suppressHandles = false }: Props) {
  const isMobile = useMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [userZoom, setUserZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [localStates, setLocalStates] = useState<Record<number, LocalState>>({});
  const dragRef = useRef<DragMode | null>(null);
  const wasRubberBandRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const { push: pushHistory } = useHistory();
  const localStatesRef = useRef<Record<number, LocalState>>({});
  const selectedIdsRef = useRef<number[]>([]);
  const onSelectionChangeRef = useRef(onSelectionChange);
  // Scrollbar drag (vertical Y and horizontal X)
  const scrollDragRef = useRef<{ startY: number; startPanY: number } | null>(null);
  const scrollDragRefX = useRef<{ startX: number; startPanX: number } | null>(null);
  // Live geometry refs (updated each render, used in event closures)
  const geoRef = useRef({ scale: 1, offsetX: 0, offsetY: 0, maxPanX: 80, maxPanY: 80, fitScale: 1, pliegoW: 0, pliegoH: 0, containerW: 800, containerH: 600 });
  // Touch gesture refs
  const touchPanRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const touchPinchRef = useRef<{ startDist: number; startZoom: number; midX: number; midY: number } | null>(null);
  const userZoomRef = useRef(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);

  // ── Eraser ───────────────────────────────────────────────────────
  const eraserSessionRef = useRef<EraserSession | null>(null);
  const eraserCanvasRef  = useRef<HTMLCanvasElement | null>(null);
  const eraserIsDrawingRef = useRef(false);
  const eraserSizeRef    = useRef(eraserSize);
  const eraserOpacityRef = useRef(eraserOpacity);
  const inpaintModeRef   = useRef(inpaintMode);
  const inpaintRadiusRef = useRef(inpaintRadius);
  const commitEraseRef   = useRef<(() => void) | null>(null);
  const [eraserCursorPos, setEraserCursorPos]       = useState<{ x: number; y: number } | null>(null);
  // blob URL preview while the erased image is being uploaded (prevents flicker)
  const [pendingErasedUrls, setPendingErasedUrls]   = useState<Record<number, string>>({});
  // image IDs currently being uploaded after erasing
  const [uploadingErasedIds, setUploadingErasedIds] = useState<Set<number>>(new Set());
  useEffect(() => { eraserSizeRef.current    = eraserSize; },    [eraserSize]);
  useEffect(() => { eraserOpacityRef.current = eraserOpacity; }, [eraserOpacity]);
  useEffect(() => { inpaintModeRef.current   = inpaintMode; },   [inpaintMode]);
  useEffect(() => { inpaintRadiusRef.current = inpaintRadius; }, [inpaintRadius]);

  // ── Inline text editor ───────────────────────────────────────────
  const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null);

  const handleImageDoubleClick = useCallback((e: React.MouseEvent, img: PliegoImage) => {
    e.stopPropagation();
    if (!onTextUpdate) return;
    const params = loadTextParams(img.uploadId);
    // Only open inline editor for text images (must have saved params or be identified as text)
    if (!params) return;
    onSelectionChange([img.id]);
    // Also sync the store so TextToolbar stays in sync after editing
    textParamsStore.set(img.uploadId, params);
    setInlineEdit({ img, params, editText: params.text, updating: false });
  }, [onTextUpdate, onSelectionChange]);

  const handleInlineConfirm = useCallback(async () => {
    if (!inlineEdit || !onTextUpdate) return;
    const newParams = { ...inlineEdit.params, text: inlineEdit.editText };
    const uploadId = inlineEdit.img.uploadId;
    setInlineEdit((s) => s ? { ...s, updating: true } : null);
    try {
      await onTextUpdate(inlineEdit.img, newParams);
      // Sync the toolbar so it reflects the confirmed text
      textParamsStore.set(uploadId, newParams);
    } finally {
      setInlineEdit(null);
    }
  }, [inlineEdit, onTextUpdate]);

  // Live preview: re-render blob on every keystroke (debounced 80ms)
  const inlineLiveBlobRef = useRef<string | null>(null);
  useEffect(() => {
    if (!inlineEdit) {
      // Editor closed — clear the inline preview so canvas goes back to server URL
      if (inlineLiveBlobRef.current) {
        URL.revokeObjectURL(inlineLiveBlobRef.current);
        inlineLiveBlobRef.current = null;
      }
      return;
    }
    const timer = setTimeout(async () => {
      const newParams = { ...inlineEdit.params, text: inlineEdit.editText };
      try {
        const { blob } = await renderTextToBlob(newParams);
        const url = URL.createObjectURL(blob);
        if (inlineLiveBlobRef.current) URL.revokeObjectURL(inlineLiveBlobRef.current);
        inlineLiveBlobRef.current = url;
        textParamsStore.setPreview(inlineEdit.img.uploadId, url);
      } catch { /* ignore render errors mid-type */ }
    }, 80);
    return () => clearTimeout(timer);
  }, [inlineEdit?.editText, inlineEdit?.img.uploadId]);

  // ── Live text preview URLs (blob URLs from textParamsStore) ─────
  const [livePreviewMap, setLivePreviewMap] = useState<Record<number, string>>({});
  useEffect(() => {
    const unsub = textParamsStore.subscribePreview((uploadId, url) => {
      setLivePreviewMap(prev => {
        if (url) return { ...prev, [uploadId]: url };
        const next = { ...prev };
        delete next[uploadId];
        return next;
      });
    });
    return unsub;
  }, []);

  // Helper: get the effective image URL (live preview if available, else server URL)
  const getImgUrl = useCallback((img: PliegoImage) =>
    livePreviewMap[img.uploadId] ?? img.imageUrl,
  [livePreviewMap]);

  // ── Magnifier lupa ──────────────────────────────────────────────
  const MAG_RADIUS = 96;
  const MAG_ZOOM   = 3.5;
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [magPos, setMagPos]     = useState<{ x: number; y: number } | null>(null);
  const magCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgCacheRef  = useRef<Map<string, HTMLImageElement>>(new Map());
  // Rubber band selection box in screen coords
  const [selectBox, setSelectBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const queryClient = useQueryClient();
  const updateImage = useUpdatePliegoImage();
  const removeImage = useRemovePliegoImage();

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoPriceQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoStatsQueryKey(pliego.id) });
  }, [queryClient, pliego.id]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setContainerSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (dragRef.current) return;
    const next: Record<number, LocalState> = {};
    for (const img of images) {
      next[img.id] = { xCm: img.xCm, yCm: img.yCm, widthCm: img.widthCm, heightCm: img.heightCm, rotation: img.rotation ?? 0 };
    }
    setLocalStates(next);
  }, [images]);

  // Keep refs in sync for use in keyboard handler closures
  useEffect(() => { localStatesRef.current = localStates; }, [localStates]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; }, [onSelectionChange]);
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);
  useEffect(() => { userZoomRef.current = userZoom; }, [userZoom]);
  useEffect(() => { panXRef.current = panX; }, [panX]);
  useEffect(() => { panYRef.current = panY; }, [panY]);

  // Reset zoom + pan when triggered externally (e.g. after auto-nest expands height)
  useEffect(() => {
    if (fitVersion === undefined || fitVersion === 0) return;
    setUserZoom(1);
    setPanX(0);
    setPanY(0);
  }, [fitVersion]);

  // Mouse wheel: plain = scroll vertical, Ctrl+wheel = zoom toward cursor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const geo = geoRef.current;
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        // Point under cursor in pliego-content units
        const px = (mx - geo.offsetX) / geo.scale;
        const py = (my - geo.offsetY) / geo.scale;
        setUserZoom((oldZ) => {
          const newZ = Math.min(Math.max(oldZ * factor, 0.05), 8);
          const newScale = Math.max(geo.fitScale * newZ, 0.05);
          const newDisplayW = geo.pliegoW * newScale;
          const newDisplayH = geo.pliegoH * newScale;
          const newBaseOffX = (geo.containerW - newDisplayW) / 2;
          const newBaseOffY = (geo.containerH - newDisplayH) / 2;
          const newMaxPanX = Math.max((newDisplayW - geo.containerW) / 2 + 80, 80);
          const newMaxPanY = Math.max((newDisplayH - geo.containerH) / 2 + 80, 80);
          const rawPanX = mx - px * newScale - newBaseOffX;
          const rawPanY = my - py * newScale - newBaseOffY;
          setPanX(Math.max(-newMaxPanX, Math.min(newMaxPanX, rawPanX)));
          setPanY(Math.max(-newMaxPanY, Math.min(newMaxPanY, rawPanY)));
          return newZ;
        });
      } else {
        const step = e.deltaY;
        setPanY((py) => Math.max(-geo.maxPanY, Math.min(geo.maxPanY, py - step)));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Touch events (pan, pinch-zoom, move images) ──────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        dragRef.current = null;
        touchPanRef.current = null;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const rect = el.getBoundingClientRect();
        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
        touchPinchRef.current = { startDist: dist, startZoom: userZoomRef.current, midX, midY };
      } else if (e.touches.length === 1) {
        touchPinchRef.current = null;
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);

        // Resize handles take priority (they sit inside image divs)
        const resizeEl = target?.closest?.("[data-resize-dir]") as HTMLElement | null;
        if (resizeEl) {
          e.preventDefault();
          resizeEl.dispatchEvent(new MouseEvent("mousedown", {
            clientX: touch.clientX, clientY: touch.clientY,
            bubbles: true, cancelable: true,
          }));
          return;
        }

        const imgDiv = target?.closest?.("[data-image-id]") as HTMLElement | null;
        if (imgDiv) {
          e.preventDefault();
          imgDiv.dispatchEvent(new MouseEvent("mousedown", {
            clientX: touch.clientX, clientY: touch.clientY,
            bubbles: true, cancelable: true,
          }));
        } else {
          e.preventDefault();
          touchPanRef.current = {
            startX: touch.clientX, startY: touch.clientY,
            startPanX: panXRef.current, startPanY: panYRef.current,
          };
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2 && touchPinchRef.current) {
        const pinch = touchPinchRef.current;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const factor = dist / pinch.startDist;
        const geo = geoRef.current;
        const mx = pinch.midX;
        const my = pinch.midY;
        const px = (mx - geo.offsetX) / geo.scale;
        const py = (my - geo.offsetY) / geo.scale;
        const newZ = Math.min(Math.max(pinch.startZoom * factor, 0.05), 8);
        const newScale = Math.max(geo.fitScale * newZ, 0.05);
        const newDisplayW = geo.pliegoW * newScale;
        const newDisplayH = geo.pliegoH * newScale;
        const newBaseOffX = (geo.containerW - newDisplayW) / 2;
        const newBaseOffY = (geo.containerH - newDisplayH) / 2;
        const newMaxPanX = Math.max((newDisplayW - geo.containerW) / 2 + 80, 80);
        const newMaxPanY = Math.max((newDisplayH - geo.containerH) / 2 + 80, 80);
        setUserZoom(newZ);
        setPanX(Math.max(-newMaxPanX, Math.min(newMaxPanX, mx - px * newScale - newBaseOffX)));
        setPanY(Math.max(-newMaxPanY, Math.min(newMaxPanY, my - py * newScale - newBaseOffY)));
      } else if (e.touches.length === 1) {
        const touch = e.touches[0];
        if (touchPanRef.current) {
          const pan = touchPanRef.current;
          const dx = touch.clientX - pan.startX;
          const dy = touch.clientY - pan.startY;
          const geo = geoRef.current;
          setPanX(Math.max(-geo.maxPanX, Math.min(geo.maxPanX, pan.startPanX + dx)));
          setPanY(Math.max(-geo.maxPanY, Math.min(geo.maxPanY, pan.startPanY + dy)));
        } else if (dragRef.current) {
          document.dispatchEvent(new MouseEvent("mousemove", {
            clientX: touch.clientX, clientY: touch.clientY, bubbles: true,
          }));
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        const hadDrag = dragRef.current !== null;
        const wasPan = touchPanRef.current !== null;
        const changedTouch = e.changedTouches[0];
        const panDist = touchPanRef.current && changedTouch
          ? Math.hypot(changedTouch.clientX - touchPanRef.current.startX, changedTouch.clientY - touchPanRef.current.startY)
          : 999;
        touchPanRef.current = null;
        touchPinchRef.current = null;
        if (hadDrag) {
          document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        } else if (wasPan && panDist < 12) {
          onSelectionChangeRef.current([]);
        }
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: false });
    el.addEventListener("touchcancel", handleTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scrollbar thumb drag (global listeners — vertical Y + horizontal X)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const dragY = scrollDragRef.current;
      if (dragY) {
        const dy = e.clientY - dragY.startY;
        const geo = geoRef.current;
        const trackH = Math.min(geo.containerH - 120, 300) - 48;
        const panDelta = -(dy / trackH) * (geo.maxPanY * 2);
        setPanY(Math.max(-geo.maxPanY, Math.min(geo.maxPanY, dragY.startPanY + panDelta)));
      }
      const dragX = scrollDragRefX.current;
      if (dragX) {
        const dx = e.clientX - dragX.startX;
        const geo = geoRef.current;
        const trackW = Math.min(geo.containerW - 120, 400) - 48;
        const panDelta = -(dx / trackW) * (geo.maxPanX * 2);
        setPanX(Math.max(-geo.maxPanX, Math.min(geo.maxPanX, dragX.startPanX + panDelta)));
      }
    };
    const onUp = () => {
      scrollDragRef.current = null;
      scrollDragRefX.current = null;
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const pliegoW = pliego.widthCm * CM_TO_PX;
  const pliegoH = pliego.heightCm * CM_TO_PX;
  const padding = 48;
  const fitScale = Math.min(
    (containerSize.w - padding * 2) / pliegoW,
    (containerSize.h - padding * 2) / pliegoH,
  );
  const scale = Math.max(fitScale * userZoom, 0.05);
  const displayW = pliegoW * scale;
  const displayH = pliegoH * scale;

  // Max pan
  const maxPanX = Math.max((displayW - containerSize.w) / 2 + 80, 80);
  const maxPanY = Math.max((displayH - containerSize.h) / 2 + 80, 80);
  const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, panX));
  const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, panY));

  const offsetX = (containerSize.w - displayW) / 2 + clampedPanX;
  const offsetY = (containerSize.h - displayH) / 2 + clampedPanY;

  // Keep geoRef in sync for event closures
  geoRef.current = { scale, offsetX, offsetY, maxPanX, maxPanY, fitScale, pliegoW, pliegoH, containerW: containerSize.w, containerH: containerSize.h };

  const screenToCm = (px: number) => px / (CM_TO_PX * scale);

  // Track mouse position for keyboard zoom-toward-cursor
  const mousePosRef = useRef({ x: 0, y: 0 });

  // Zoom by factor toward the current mouse position (or container center if cursor outside)
  const zoomTowardMouse = useCallback((factor: number) => {
    const geo = geoRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    const rawMx = mousePosRef.current.x;
    const rawMy = mousePosRef.current.y;
    // If cursor is outside the container, use center
    const mx = rect && rawMx >= rect.left && rawMx <= rect.right ? rawMx - rect.left : geo.containerW / 2;
    const my = rect && rawMy >= rect.top && rawMy <= rect.bottom ? rawMy - rect.top : geo.containerH / 2;
    const px = (mx - geo.offsetX) / geo.scale;
    const py = (my - geo.offsetY) / geo.scale;
    setUserZoom((oldZ) => {
      const newZ = Math.min(Math.max(oldZ * factor, 0.05), 8);
      const newScale = Math.max(geo.fitScale * newZ, 0.05);
      const newDisplayW = geo.pliegoW * newScale;
      const newDisplayH = geo.pliegoH * newScale;
      const newBaseOffX = (geo.containerW - newDisplayW) / 2;
      const newBaseOffY = (geo.containerH - newDisplayH) / 2;
      const newMaxPanX = Math.max((newDisplayW - geo.containerW) / 2 + 80, 80);
      const newMaxPanY = Math.max((newDisplayH - geo.containerH) / 2 + 80, 80);
      setPanX(Math.max(-newMaxPanX, Math.min(newMaxPanX, mx - px * newScale - newBaseOffX)));
      setPanY(Math.max(-newMaxPanY, Math.min(newMaxPanY, my - py * newScale - newBaseOffY)));
      return newZ;
    });
  }, []);

  const commitUpdate = useCallback((imageId: number, data: Partial<LocalState>) => {
    updateImage.mutate(
      { id: pliego.id, imageId, data },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) }) }
    );
  }, [pliego.id, queryClient, updateImage]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in text inputs (allow range, checkbox, color etc.)
      const el = e.target as HTMLInputElement;
      const tag = el?.tagName;
      const type = el?.type ?? "";
      const isTextInput =
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (tag === "INPUT" && !["range", "checkbox", "radio", "color", "button", "submit", "reset"].includes(type));
      if (isTextInput) return;

      // Delete / Supr — eliminar imágenes seleccionadas
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault(); // Always prevent browser "go back" on Backspace
        const ids = selectedIdsRef.current;
        if (ids.length === 0) return;
        // Snapshot for undo: capture full image data before deleting
        const toDelete = images.filter((img) => ids.includes(img.id));
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
        onSelectionChange([]);
        (async () => {
          for (const sid of ids) {
            try { await removeImage.mutateAsync({ id: pliego.id, imageId: sid }); } catch { /* skip */ }
          }
          invalidateAll();
        })();
        return;
      }

      // Escape — commit eraser first, then deselect
      if (e.key === "Escape") {
        if (eraserSessionRef.current) {
          e.preventDefault();
          commitEraseRef.current?.();
          return;
        }
        const ids = selectedIdsRef.current;
        if (ids.length > 0) { e.preventDefault(); onSelectionChange([]); }
        return;
      }

      // Ctrl+= / Ctrl++ — zoom in toward mouse
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+" || e.key === "Add")) {
        e.preventDefault();
        zoomTowardMouse(1.25);
        return;
      }

      // Ctrl+- — zoom out toward mouse
      if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "Subtract")) {
        e.preventDefault();
        zoomTowardMouse(1 / 1.25);
        return;
      }

      // Ctrl+0 — reset zoom + pan to fit
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        setUserZoom(1);
        setPanX(0);
        setPanY(0);
        return;
      }

      // Arrow keys — nudge selected images (0.1 cm normal, 1 cm with Shift)
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        const ids = selectedIdsRef.current;
        if (ids.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const pliegoId = pliego.id;
        const pliegoW = pliego.widthCm;
        const pliegoH = pliego.heightCm;
        const snapBefore: Record<number, { xCm: number; yCm: number }> = {};
        setLocalStates((prev) => {
          const next = { ...prev };
          for (const id of ids) {
            const ls = prev[id];
            if (!ls) continue;
            snapBefore[id] = { xCm: ls.xCm, yCm: ls.yCm };
            const { w: aw, h: ah } = aabb(ls.widthCm, ls.heightCm, ls.rotation ?? 0);
            const xMin = (aw - ls.widthCm) / 2;
            const xMax = pliegoW - (ls.widthCm + aw) / 2;
            const yMin = (ah - ls.heightCm) / 2;
            const yMax = pliegoH - (ls.heightCm + ah) / 2;
            next[id] = {
              ...ls,
              xCm: Math.max(xMin, Math.min(ls.xCm + dx, xMax)),
              yCm: Math.max(yMin, Math.min(ls.yCm + dy, yMax)),
            };
          }
          return next;
        });
        // Debounce: commit to server after a short pause
        if ((window as any)._arrowDebounce) clearTimeout((window as any)._arrowDebounce);
        (window as any)._arrowDebounce = setTimeout(() => {
          const current = localStatesRef.current;
          let anyMoved = false;
          for (const id of ids) {
            const ls = current[id];
            const sp = snapBefore[id];
            if (!ls || !sp) continue;
            if (Math.abs(ls.xCm - sp.xCm) > 0.01 || Math.abs(ls.yCm - sp.yCm) > 0.01) anyMoved = true;
            commitUpdate(id, { xCm: ls.xCm, yCm: ls.yCm });
          }
          if (anyMoved) {
            pushHistory({
              label: "Mover imagen",
              undo: async () => {
                for (const [idStr, sp] of Object.entries(snapBefore)) {
                  const id = Number(idStr);
                  await new Promise<void>((res) => updateImage.mutate(
                    { id: pliegoId, imageId: id, data: { xCm: sp.xCm, yCm: sp.yCm } },
                    { onSuccess: () => res(), onError: () => res() }
                  ));
                }
                queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
              },
            });
          }
          queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
        }, 400);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [commitUpdate, images, invalidateAll, onSelectionChange, pliego.id, pliego.widthCm, pliego.heightCm, pushHistory, queryClient, removeImage, updateImage, zoomTowardMouse]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // ── Eraser drawing ──────────────────────────────────────────
      if (eraserIsDrawingRef.current) {
        doErasePoint(e.clientX, e.clientY);
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      setIsDragging(true);
      const dx = screenToCm(e.clientX - drag.startMx);
      const dy = screenToCm(e.clientY - drag.startMy);
      const MIN = 0.5;

      if (drag.kind === "select") {
        const r = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 800, height: 600 };
        const relX = e.clientX - r.left;
        const relY = e.clientY - r.top;
        setSelectBox({
          x1: drag.startMx - r.left,
          y1: drag.startMy - r.top,
          x2: relX,
          y2: relY,
        });

        // ── Auto-pan when cursor is near an edge ───────────────────
        const EDGE = 55;    // px zone near border
        const SPEED = 10;   // max px to pan per mousemove
        const geo = geoRef.current;
        let dpx = 0, dpy = 0;
        if (relX < EDGE)                dpx =  ((EDGE - relX) / EDGE) * SPEED;
        else if (relX > r.width - EDGE) dpx = -((relX - (r.width - EDGE)) / EDGE) * SPEED;
        if (relY < EDGE)                dpy =  ((EDGE - relY) / EDGE) * SPEED;
        else if (relY > r.height - EDGE) dpy = -((relY - (r.height - EDGE)) / EDGE) * SPEED;
        if (dpx !== 0) setPanX((px) => Math.max(-geo.maxPanX, Math.min(geo.maxPanX, px + dpx)));
        if (dpy !== 0) setPanY((py) => Math.max(-geo.maxPanY, Math.min(geo.maxPanY, py + dpy)));
        return;
      }

      if (drag.kind === "rotate") {
        const currentAngle = Math.atan2(e.clientY - drag.centerY, e.clientX - drag.centerX) * (180 / Math.PI);
        let newRotation = drag.startRotation + (currentAngle - drag.startAngle);
        newRotation = ((newRotation % 360) + 360) % 360;
        // Snap to nearest 15° when within 4°
        const snapped = Math.round(newRotation / 15) * 15 % 360;
        if (Math.abs(snapped - newRotation) < 4) newRotation = snapped;
        setLocalStates((prev) => ({
          ...prev,
          [drag.imageId]: { ...prev[drag.imageId], rotation: Math.round(newRotation * 10) / 10 },
        }));
        return;
      }

      if (drag.kind === "move") {
        setLocalStates((prev) => {
          const next = { ...prev };
          const ids = Array.isArray(drag.selectedIds) ? drag.selectedIds : [];
          for (const id of ids) {
            const sp = drag.startPositions[id];
            if (!sp) continue;
            const ls = prev[id];
            const img = images.find((i) => i.id === id);
            const w = ls?.widthCm ?? (img?.widthCm ?? 1);
            const h = ls?.heightCm ?? (img?.heightCm ?? 1);
            const rot = ls?.rotation ?? 0;
            const { w: aw, h: ah } = aabb(w, h, rot);
            // Clamp so the AABB (visual footprint) stays within the pliego
            const xMin = (aw - w) / 2;
            const xMax = pliego.widthCm - (w + aw) / 2;
            const yMin = (ah - h) / 2;
            const yMax = pliego.heightCm - (h + ah) / 2;
            next[id] = {
              ...ls,
              xCm: Math.max(xMin, Math.min(sp.xCm + dx, xMax)),
              yCm: Math.max(yMin, Math.min(sp.yCm + dy, yMax)),
            };
          }
          return next;
        });
      } else {
        const { startX, startY, startW, startH, handle: hd, aspectRatio: ratio } = drag;
        let x = startX, y = startY, w = startW, h = startH;

        // Proportional resize: corners driven by dx, edges by their natural axis
        if (hd === "se") {
          w = Math.max(MIN, startW + dx);
          h = w / ratio;
        } else if (hd === "sw") {
          w = Math.max(MIN, startW - dx);
          h = w / ratio;
          x = startX + startW - w;
        } else if (hd === "ne") {
          w = Math.max(MIN, startW + dx);
          h = w / ratio;
          y = startY + startH - h;
        } else if (hd === "nw") {
          w = Math.max(MIN, startW - dx);
          h = w / ratio;
          x = startX + startW - w;
          y = startY + startH - h;
        } else if (hd === "e") {
          w = Math.max(MIN, startW + dx);
          h = w / ratio;
        } else if (hd === "w") {
          w = Math.max(MIN, startW - dx);
          h = w / ratio;
          x = startX + startW - w;
        } else if (hd === "s") {
          h = Math.max(MIN, startH + dy);
          w = h * ratio;
        } else if (hd === "n") {
          h = Math.max(MIN, startH - dy);
          w = h * ratio;
          y = startY + startH - h;
        }

        setLocalStates((prev) => ({ ...prev, [drag.imageId]: { ...prev[drag.imageId], xCm: x, yCm: y, widthCm: w, heightCm: h } }));
      }
    };

    const onUp = (e: MouseEvent) => {
      // ── Eraser: stop stroke on mouseup, but keep session alive until ESC ──
      if (eraserIsDrawingRef.current) {
        eraserIsDrawingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      setIsDragging(false);
      setSelectBox(null);

      if (drag.kind === "select") {
        // Only activate if there was meaningful movement (>4px)
        const moved = Math.abs(e.clientX - drag.startMx) > 4 || Math.abs(e.clientY - drag.startMy) > 4;
        if (moved) {
          wasRubberBandRef.current = true;
          // Convert to container-relative coords (same system as image positions)
          const r = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
          const selX1 = Math.min(drag.startMx, e.clientX) - r.left;
          const selY1 = Math.min(drag.startMy, e.clientY) - r.top;
          const selX2 = Math.max(drag.startMx, e.clientX) - r.left;
          const selY2 = Math.max(drag.startMy, e.clientY) - r.top;
          const ids: number[] = [];
          for (const img of images) {
            const ls = localStates[img.id];
            if (!ls) continue;
            // Image positions are also container-relative
            const imgX1 = offsetX + ls.xCm * CM_TO_PX * scale;
            const imgY1 = offsetY + ls.yCm * CM_TO_PX * scale;
            const imgX2 = imgX1 + ls.widthCm * CM_TO_PX * scale;
            const imgY2 = imgY1 + ls.heightCm * CM_TO_PX * scale;
            // Intersect (any overlap)
            if (imgX2 > selX1 && imgX1 < selX2 && imgY2 > selY1 && imgY1 < selY2) {
              ids.push(img.id);
            }
          }
          onSelectionChange(ids);
        } else {
          onSelectionChange([]);
        }
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        return;
      }

      if (drag.kind === "move") {
        const ids = Array.isArray(drag.selectedIds) ? drag.selectedIds : [];
        const pliegoId = pliego.id;
        // Detect which images actually moved (threshold: 0.5mm = 0.05cm)
        const movedSnap: Record<number, { xCm: number; yCm: number }> = {};
        let anyMoved = false;
        for (const id of ids) {
          const ls = localStates[id];
          const sp = drag.startPositions[id];
          if (!ls || !sp) continue;
          commitUpdate(id, { xCm: ls.xCm, yCm: ls.yCm });
          if (Math.abs(ls.xCm - sp.xCm) > 0.05 || Math.abs(ls.yCm - sp.yCm) > 0.05) {
            movedSnap[id] = sp;
            anyMoved = true;
          }
        }
        if (anyMoved) {
          pushHistory({
            label: "Mover imagen",
            undo: async () => {
              for (const [idStr, sp] of Object.entries(movedSnap)) {
                const id = Number(idStr);
                await new Promise<void>((res) => updateImage.mutate(
                  { id: pliegoId, imageId: id, data: { xCm: sp.xCm, yCm: sp.yCm } },
                  { onSuccess: () => res(), onError: () => res() }
                ));
              }
              queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
            },
          });
        }
      } else if (drag.kind === "rotate") {
        const ls = localStates[drag.imageId];
        if (!ls) { /* skip */ } else {
          const pliegoId = pliego.id;
          const imgId = drag.imageId;
          const snapRotation = drag.startRotation;
          commitUpdate(drag.imageId, { rotation: ls.rotation });
          if (Math.abs(ls.rotation - snapRotation) > 0.1) {
            pushHistory({
              label: "Rotar imagen",
              undo: async () => {
                await new Promise<void>((res) => updateImage.mutate(
                  { id: pliegoId, imageId: imgId, data: { rotation: snapRotation } },
                  { onSuccess: () => res(), onError: () => res() }
                ));
                queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
              },
            });
          }
        }
      } else if (drag.kind === "resize") {
        const ls = localStates[drag.imageId];
        if (!ls) { /* skip */ } else {
          const pliegoId = pliego.id;
          const imgId = drag.imageId;
          const { startX, startY, startW, startH } = drag;
          commitUpdate(drag.imageId, ls);
          const sizeChanged = Math.abs(ls.widthCm - startW) > 0.05 || Math.abs(ls.heightCm - startH) > 0.05;
          if (sizeChanged) {
            pushHistory({
              label: "Redimensionar imagen",
              undo: async () => {
                await new Promise<void>((res) => updateImage.mutate(
                  { id: pliegoId, imageId: imgId, data: { xCm: startX, yCm: startY, widthCm: startW, heightCm: startH } },
                  { onSuccess: () => res(), onError: () => res() }
                ));
                queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
              },
            });
          }
        }
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStates, commitUpdate, pushHistory, updateImage, queryClient, scale, pliego.id, pliego.widthCm, pliego.heightCm, images, offsetX, offsetY, onSelectionChange]);

  // ── Eraser helpers ───────────────────────────────────────────────
  // Draw smooth stroke between prevPt and each point using lineTo (no gaps when moving fast)
  const applyEraseStroke = useCallback((
    ctx: CanvasRenderingContext2D,
    pts: Array<[number, number, number, number]>,
    fromPt?: [number, number, number, number],
  ) => {
    if (pts.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let prev = fromPt;
    for (const pt of pts) {
      const [x, y, r, op] = pt;
      ctx.globalAlpha = op;
      ctx.lineWidth = r * 2;
      ctx.beginPath();
      if (prev) {
        ctx.moveTo(prev[0], prev[1]);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else {
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      prev = pt;
    }
    ctx.restore();
  }, []);

  // Convert a normalized pending point to canvas pixels given actual dims
  const normToCanvasPt = useCallback((
    norm: [number, number, number, number], // [relX(0-1), relY(0-1), sizeRatio, opacity]
    w: number, h: number,
  ): [number, number, number, number] => {
    return [norm[0] * w, norm[1] * h, Math.max(1, norm[2] * w), norm[3]];
  }, []);

  const doErasePoint = useCallback((clientX: number, clientY: number) => {
    const session = eraserSessionRef.current;
    if (!session) return;
    const { rect } = session;
    const canvas = eraserCanvasRef.current;
    // Normalized coords (0..1) — resolution-independent, safe to queue before load
    const relX  = (clientX - rect.left) / rect.width;
    const relY  = (clientY - rect.top)  / rect.height;
    const sizeR = eraserSizeRef.current / 2 / rect.width; // ratio of brush radius to container width
    const opacity = eraserOpacityRef.current / 100;
    const normPt: [number, number, number, number] = [relX, relY, sizeR, opacity];

    if (session.loaded && canvas && canvas.width > 1) {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        const px = normToCanvasPt(normPt, canvas.width, canvas.height);
        const prevPx = session.prevPt; // prevPt is already in canvas pixels when loaded
        applyEraseStroke(ctx, [px], prevPx);
        session.prevPt = px;
      }
    } else {
      // Queue as normalized coords — converted after image loads
      session.pendingPts.push(normPt);
      session.prevPt = undefined; // will be recalculated after load
    }
  }, [applyEraseStroke, normToCanvasPt]);

  const startErase = useCallback((e: React.MouseEvent, img: PliegoImage) => {
    e.preventDefault();
    e.stopPropagation();
    if (eraserIsDrawingRef.current) return;

    // ── If there's an active session on the SAME image, just resume drawing ──
    const existingSession = eraserSessionRef.current;
    if (existingSession && existingSession.imageId === img.id) {
      // Update rect in case layout shifted, reset prevPt so new stroke starts fresh
      existingSession.rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      existingSession.prevPt = undefined;
      eraserIsDrawingRef.current = true;
      document.body.style.cursor = "none";
      document.body.style.userSelect = "none";
      return;
    }

    // ── If there's an active session on a DIFFERENT image, commit it first ──
    if (existingSession) {
      commitEraseRef.current?.();
    }

    // ── Capture everything synchronously before any async work ──
    const containerEl = e.currentTarget as HTMLElement;
    const rect = containerEl.getBoundingClientRect();
    const clientX0 = e.clientX;
    const clientY0 = e.clientY;
    const imageUrl  = img.imageUrl;

    // ── Seed the canvas with a temporary size (will resize once image loads) ──
    const canvas = document.createElement("canvas");
    canvas.width  = 1;
    canvas.height = 1;
    // Hidden initially — shown once the image is drawn onto it (avoids blank flicker)
    canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;opacity:0;";

    const imgEl = containerEl.querySelector("img") as HTMLImageElement | null;
    containerEl.appendChild(canvas);
    eraserCanvasRef.current = canvas;

    // ── Mark drawing as active immediately ──
    eraserIsDrawingRef.current = true;
    document.body.style.cursor = "none";
    document.body.style.userSelect = "none";

    // ── Queue of pending normalized points (applied once the image is drawn) ──
    // Format: [relX(0-1), relY(0-1), sizeRatio, opacity]
    const pendingPtsArr: Array<[number, number, number, number]> = [];

    // Add first click as normalized point
    const firstRelX  = (clientX0 - rect.left) / rect.width;
    const firstRelY  = (clientY0 - rect.top)  / rect.height;
    const firstSizeR = eraserSizeRef.current / 2 / rect.width;
    pendingPtsArr.push([firstRelX, firstRelY, firstSizeR, eraserOpacityRef.current / 100]);

    let resolveLoad!: () => void;
    const loadPromise = new Promise<void>((res) => { resolveLoad = res; });

    const session: EraserSession = {
      imageId: img.id, uploadId: img.uploadId,
      origW: 1, origH: 1,
      rect, loaded: false, pendingPts: pendingPtsArr,
      canvasEl: canvas, containerEl, imageUrl, loadPromise,
    };
    eraserSessionRef.current = session;

    // ── Load image via fetch + createImageBitmap (no CORS canvas-taint issues) ──
    (async () => {
      try {
        const resp   = await fetch(imageUrl);
        const blob   = await resp.blob();
        const bitmap = await createImageBitmap(blob);

        const origW = bitmap.width;
        const origH = bitmap.height;

        // Resize canvas to actual image resolution and draw
        canvas.width  = origW;
        canvas.height = origH;

        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(bitmap, 0, 0, origW, origH);
        bitmap.close();

        // ── Eliminar semi-transparencias: todo píxel con alpha < 255 → alpha 0 ──
        const imgData = ctx.getImageData(0, 0, origW, origH);
        const d = imgData.data;
        for (let i = 3; i < d.length; i += 4) {
          if (d[i] < 255) d[i] = 0;
        }
        ctx.putImageData(imgData, 0, 0);

        // Update session dimensions
        session.origW = origW;
        session.origH = origH;

        // Convert and apply all queued normalized points
        if (pendingPtsArr.length > 0) {
          const pxPts = pendingPtsArr.map(
            (n) => [n[0] * origW, n[1] * origH, Math.max(1, n[2] * origW), n[3]] as [number, number, number, number]
          );
          pendingPtsArr.length = 0;
          applyEraseStroke(ctx, pxPts);
          session.prevPt = pxPts[pxPts.length - 1];
        }

        // ── Swap: show canvas (with erased area), hide underlying img ──
        canvas.style.opacity = "1";
        if (imgEl) { imgEl.style.opacity = "0"; imgEl.dataset.erasing = "1"; }

        session.loaded = true;
      } catch {
        // Fetch/decode failed — restore the img visibility so user isn't stuck with blank
        if (imgEl) { imgEl.style.opacity = ""; delete imgEl.dataset.erasing; }
        canvas.remove();
      }
      resolveLoad();
    })();
  }, [applyEraseStroke]);

  // Commit erased image to server
  const commitErase = useCallback(() => {
    const session = eraserSessionRef.current;
    if (!session) return;
    eraserIsDrawingRef.current = false;
    eraserSessionRef.current = null;
    eraserCanvasRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    const { imageId: imgId, uploadId: oldUploadId, canvasEl: canvas, containerEl, loadPromise } = session;
    const pliegoId = pliego.id;

    const doCommit = async () => {
      // Wait for the image to be fully loaded onto the canvas
      await loadPromise;

      // If image failed to load, canvas is still 1×1 — bail out cleanly
      if (canvas.width <= 1 || canvas.height <= 1) {
        canvas.remove();
        const imgEl0 = containerEl.querySelector("img") as HTMLImageElement | null;
        if (imgEl0) { imgEl0.style.opacity = ""; delete imgEl0.dataset.erasing; }
        return;
      }

      // Snapshot the canvas to a blob
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) {
        canvas.remove();
        const imgEl = containerEl.querySelector("img") as HTMLImageElement | null;
        if (imgEl) { imgEl.style.opacity = ""; delete imgEl.dataset.erasing; }
        return;
      }

      // Replace the <img> with a blob-URL preview immediately (no flicker)
      const blobUrl = URL.createObjectURL(blob);
      const imgEl = containerEl.querySelector("img") as HTMLImageElement | null;
      if (imgEl) {
        imgEl.src = blobUrl;
        imgEl.style.opacity = "";
        delete imgEl.dataset.erasing;
      }
      canvas.remove();

      // Track in React state: blob URL for primary + copies, and uploading badge
      setPendingErasedUrls((prev) => ({ ...prev, [imgId]: blobUrl }));
      setUploadingErasedIds((prev) => new Set(prev).add(imgId));

      // ── Inpaint path (Relleno inteligente) ──────────────────────────
      if (inpaintModeRef.current) {
        // Build a white-on-black mask from the erased (alpha=0) pixels
        const ctx2 = canvas.getContext("2d")!;
        const imgDataRaw = ctx2.getImageData(0, 0, canvas.width, canvas.height);
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width  = canvas.width;
        maskCanvas.height = canvas.height;
        const mctx = maskCanvas.getContext("2d")!;
        const maskData = mctx.createImageData(canvas.width, canvas.height);
        for (let i = 0; i < imgDataRaw.data.length; i += 4) {
          const v = imgDataRaw.data[i + 3] < 128 ? 255 : 0; // white = region to inpaint
          maskData.data[i]     = v;
          maskData.data[i + 1] = v;
          maskData.data[i + 2] = v;
          maskData.data[i + 3] = 255;
        }
        mctx.putImageData(maskData, 0, 0);

        const maskBlob = await new Promise<Blob | null>((res) => maskCanvas.toBlob(res, "image/png"));
        if (!maskBlob) {
          // No erased pixels → clean up and bail
          canvas.remove();
          const imgEl2 = containerEl.querySelector("img") as HTMLImageElement | null;
          if (imgEl2) { imgEl2.style.opacity = ""; delete imgEl2.dataset.erasing; }
          setUploadingErasedIds((prev) => { const s = new Set(prev); s.delete(imgId); return s; });
          setPendingErasedUrls((prev) => { const n = { ...prev }; delete n[imgId]; URL.revokeObjectURL(blobUrl); return n; });
          return;
        }

        const fd2 = new FormData();
        fd2.append("mask", maskBlob, "mask.png");
        fd2.append("radius", String(inpaintRadiusRef.current));
        fd2.append("method", "telea");

        try {
          const inpRes = await fetch(`/api/uploads/${oldUploadId}/inpaint`, { method: "POST", body: fd2 });
          if (!inpRes.ok) throw new Error("inpaint failed");
          const newUpload = await inpRes.json();
          await new Promise<void>((resolve, reject) =>
            updateImage.mutate(
              { id: pliegoId, imageId: imgId, data: { uploadId: newUpload.id } },
              { onSuccess: () => resolve(), onError: () => reject(new Error("update failed")) }
            )
          );
          await queryClient.refetchQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
          setPendingErasedUrls((prev) => { const n = { ...prev }; delete n[imgId]; URL.revokeObjectURL(blobUrl); return n; });
          setUploadingErasedIds((prev) => { const s = new Set(prev); s.delete(imgId); return s; });
          pushHistory({
            label: "Relleno inteligente",
            undo: async () => {
              await new Promise<void>((res) =>
                updateImage.mutate(
                  { id: pliegoId, imageId: imgId, data: { uploadId: oldUploadId } },
                  { onSuccess: () => res(), onError: () => res() }
                )
              );
              queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
            },
          });
          onEraserCommit?.();
        } catch {
          setPendingErasedUrls((prev) => { const n = { ...prev }; delete n[imgId]; URL.revokeObjectURL(blobUrl); return n; });
          setUploadingErasedIds((prev) => { const s = new Set(prev); s.delete(imgId); return s; });
          queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
        }
        return;
      }

      // ── Normal erase path ────────────────────────────────────────────
      const fd = new FormData();
      fd.append("file", blob, "borrador.png");
      try {
        const upRes = await fetch("/api/uploads", { method: "POST", body: fd });
        if (!upRes.ok) throw new Error("upload failed");
        const newUpload = await upRes.json();
        await new Promise<void>((resolve, reject) =>
          updateImage.mutate(
            { id: pliegoId, imageId: imgId, data: { uploadId: newUpload.id } },
            { onSuccess: () => resolve(), onError: () => reject(new Error("update failed")) }
          )
        );
        // Refetch and wait for the new uploadId before dropping the blob preview
        await queryClient.refetchQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
        // Drop blob preview and uploading badge now that server has the new image
        setPendingErasedUrls((prev) => {
          const next = { ...prev };
          delete next[imgId];
          URL.revokeObjectURL(blobUrl);
          return next;
        });
        setUploadingErasedIds((prev) => {
          const next = new Set(prev);
          next.delete(imgId);
          return next;
        });
        pushHistory({
          label: "Borrador",
          undo: async () => {
            await new Promise<void>((res) =>
              updateImage.mutate(
                { id: pliegoId, imageId: imgId, data: { uploadId: oldUploadId } },
                { onSuccess: () => res(), onError: () => res() }
              )
            );
            queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
          },
        });
        onEraserCommit?.();
      } catch {
        setPendingErasedUrls((prev) => {
          const next = { ...prev };
          delete next[imgId];
          URL.revokeObjectURL(blobUrl);
          return next;
        });
        setUploadingErasedIds((prev) => {
          const next = new Set(prev);
          next.delete(imgId);
          return next;
        });
        queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) });
      }
    };

    doCommit();
  }, [pliego.id, updateImage, queryClient, pushHistory, onEraserCommit]);

  // Keep commitEraseRef current so the event-listener closure can call it
  useEffect(() => { commitEraseRef.current = commitErase; }, [commitErase]);

  const handleImageClick = (e: React.MouseEvent, img: PliegoImage) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      // Toggle in multi-select
      if (selectedIds.includes(img.id)) {
        onSelectionChange(selectedIds.filter((id) => id !== img.id));
      } else {
        onSelectionChange([...selectedIds, img.id]);
      }
    } else {
      onSelectionChange([img.id]);
    }
  };

  const startMove = (e: React.MouseEvent, img: PliegoImage) => {
    e.preventDefault();
    e.stopPropagation();
    // History is pushed in onUp (mouseup) only if the image actually moved
    // If clicking unselected image without shift → select just this one
    const idsToMove = selectedIds.includes(img.id) ? selectedIds : [img.id];
    if (!selectedIds.includes(img.id)) {
      onSelectionChange([img.id]);
    }
    const startPositions: Record<number, { xCm: number; yCm: number }> = {};
    for (const id of idsToMove) {
      const ls = localStates[id];
      startPositions[id] = { xCm: ls?.xCm ?? 0, yCm: ls?.yCm ?? 0 };
    }
    dragRef.current = {
      kind: "move",
      draggedId: img.id,
      selectedIds: idsToMove,
      startMx: e.clientX,
      startMy: e.clientY,
      startPositions,
    };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  };

  const startResize = (e: React.MouseEvent, img: PliegoImage, handle: HandleDir) => {
    e.preventDefault();
    e.stopPropagation();
    // History is pushed in onUp only if size actually changed
    const ls = localStates[img.id] ?? { xCm: img.xCm, yCm: img.yCm, widthCm: img.widthCm, heightCm: img.heightCm, rotation: 0 };
    const ratio = ls.heightCm > 0 ? ls.widthCm / ls.heightCm : 1;
    dragRef.current = {
      kind: "resize", imageId: img.id, handle,
      startMx: e.clientX, startMy: e.clientY,
      startX: ls.xCm, startY: ls.yCm, startW: ls.widthCm, startH: ls.heightCm,
      aspectRatio: ratio,
    };
    document.body.style.cursor = HANDLE_CURSORS[handle];
    document.body.style.userSelect = "none";
  };

  const startRotate = (e: React.MouseEvent, img: PliegoImage) => {
    e.preventDefault();
    e.stopPropagation();
    // History is pushed in onUp only if rotation actually changed
    const r = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const ls = localStates[img.id] ?? { xCm: img.xCm, yCm: img.yCm, widthCm: img.widthCm, heightCm: img.heightCm, rotation: 0 };
    const centerX = r.left + offsetX + (ls.xCm + ls.widthCm / 2) * CM_TO_PX * scale;
    const centerY = r.top + offsetY + (ls.yCm + ls.heightCm / 2) * CM_TO_PX * scale;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    dragRef.current = {
      kind: "rotate",
      imageId: img.id,
      startMx: e.clientX,
      startMy: e.clientY,
      centerX,
      centerY,
      startRotation: ls.rotation,
      startAngle,
    };
    document.body.style.cursor = "crosshair";
    document.body.style.userSelect = "none";
  };

  // ── Magnifier: Ctrl key listener ────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === "Control") setCtrlHeld(true); };
    const onUp   = (e: KeyboardEvent) => { if (e.key === "Control") { setCtrlHeld(false); setMagPos(null); } };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);

  // ── Magnifier: preload images (also preloads live preview URLs) ──
  useEffect(() => {
    for (const img of images) {
      const url = getImgUrl(img);
      if (!imgCacheRef.current.has(url)) {
        const el = new Image();
        el.src = url;
        imgCacheRef.current.set(url, el);
      }
    }
  }, [images, getImgUrl]);

  // ── Magnifier: draw onto canvas ──────────────────────────────────
  const drawMagnifier = useCallback((mx: number, my: number, ls: Record<number, LocalState>, imgs: PliegoImage[], sheetBg: string) => {
    const canvas = magCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const D = MAG_RADIUS * 2;
    const geo = geoRef.current;

    ctx.clearRect(0, 0, D, D);
    ctx.save();
    // Circular clip
    ctx.beginPath();
    ctx.arc(MAG_RADIUS, MAG_RADIUS, MAG_RADIUS, 0, Math.PI * 2);
    ctx.clip();

    // Source area centre = cursor, half-size = R / Z
    const halfSrc = MAG_RADIUS / MAG_ZOOM;
    const srcLeft = mx - halfSrc;
    const srcTop  = my - halfSrc;

    // Draw outer checker (dark area outside pliego)
    const checker = (x: number, y: number, w: number, h: number, a: string, b: string) => {
      const sz = 8 * MAG_ZOOM;
      for (let row = 0; row * sz < h; row++) {
        for (let col = 0; col * sz < w; col++) {
          ctx.fillStyle = (row + col) % 2 === 0 ? a : b;
          ctx.fillRect(x + col * sz, y + row * sz, Math.min(sz, w - col * sz), Math.min(sz, h - row * sz));
        }
      }
    };
    checker(0, 0, D, D, "#1e1e1e", "#2a2a2a");

    // Pliego sheet rect in container coords
    const sheetL = geo.offsetX;
    const sheetT = geo.offsetY;
    const sheetW = geo.pliegoW * geo.scale;
    const sheetH = geo.pliegoH * geo.scale;

    // Transform to magnifier canvas coords: destX = (srcX - srcLeft) * Z
    const tx = (v: number) => (v - srcLeft) * MAG_ZOOM;
    const ty = (v: number) => (v - srcTop)  * MAG_ZOOM;

    // Sheet background
    if (sheetBg === "transparent") {
      checker(tx(sheetL), ty(sheetT), sheetW * MAG_ZOOM, sheetH * MAG_ZOOM, "#f0f0f0", "#d0d0d0");
    } else {
      ctx.fillStyle = sheetBg === "white" ? "#ffffff" : sheetBg === "black" ? "#000000" : sheetBg;
      ctx.fillRect(tx(sheetL), ty(sheetT), sheetW * MAG_ZOOM, sheetH * MAG_ZOOM);
    }

    // Images
    const sorted = [...imgs].sort((a, b) => a.zIndex - b.zIndex);
    for (const img of sorted) {
      const state = ls[img.id];
      if (!state) continue;
      const htmlImg = imgCacheRef.current.get(getImgUrl(img));
      if (!htmlImg?.complete || !htmlImg.naturalWidth) continue;

      const iL = geo.offsetX + state.xCm * CM_TO_PX * geo.scale;
      const iT = geo.offsetY + state.yCm * CM_TO_PX * geo.scale;
      const iW = state.widthCm * CM_TO_PX * geo.scale * MAG_ZOOM;
      const iH = state.heightCm * CM_TO_PX * geo.scale * MAG_ZOOM;
      const dX = tx(iL);
      const dY = ty(iT);

      if (state.rotation) {
        ctx.save();
        ctx.translate(dX + iW / 2, dY + iH / 2);
        ctx.rotate((state.rotation * Math.PI) / 180);
        ctx.drawImage(htmlImg, -iW / 2, -iH / 2, iW, iH);
        ctx.restore();
      } else {
        ctx.drawImage(htmlImg, dX, dY, iW, iH);
      }
    }

    ctx.restore();

    // Crosshair
    ctx.save();
    ctx.strokeStyle = "rgba(167,139,250,0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(MAG_RADIUS, MAG_RADIUS - 10);
    ctx.lineTo(MAG_RADIUS, MAG_RADIUS + 10);
    ctx.moveTo(MAG_RADIUS - 10, MAG_RADIUS);
    ctx.lineTo(MAG_RADIUS + 10, MAG_RADIUS);
    ctx.stroke();
    ctx.restore();
  }, []);

  // Background for the surrounding area (always checkerboard in dark)
  const outerBgStyle: React.CSSProperties = {
    backgroundImage: "linear-gradient(45deg,#2a2a2a 25%,transparent 25%),linear-gradient(-45deg,#2a2a2a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2a2a 75%),linear-gradient(-45deg,transparent 75%,#2a2a2a 75%)",
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0,0 10px,10px -10px,-10px 0",
    backgroundColor: "#1e1e1e",
  };

  // Background for the pliego sheet itself
  const sheetBgColor =
    bgColor === "transparent" ? "transparent" :
    bgColor === "white" ? "#ffffff" :
    bgColor === "black" ? "#000000" : bgColor;

  // For transparent pliego: show checkerboard INSIDE the sheet too
  const sheetStyle: React.CSSProperties = bgColor === "transparent"
    ? {
        backgroundImage: "linear-gradient(45deg,#d0d0d0 25%,transparent 25%),linear-gradient(-45deg,#d0d0d0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d0d0d0 75%),linear-gradient(-45deg,transparent 75%,#d0d0d0 75%)",
        backgroundSize: "16px 16px",
        backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
        backgroundColor: "#f0f0f0",
      }
    : { backgroundColor: sheetBgColor };

  // Compute group bounding box in screen coords for multi-select
  const groupBox = (() => {
    if (selectedIds.length < 2) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let totalW = 0, totalH = 0, count = 0;
    for (const id of selectedIds) {
      const ls = localStates[id];
      if (!ls) continue;
      const sx = offsetX + ls.xCm * CM_TO_PX * scale;
      const sy = offsetY + ls.yCm * CM_TO_PX * scale;
      const sw = ls.widthCm * CM_TO_PX * scale;
      const sh = ls.heightCm * CM_TO_PX * scale;
      minX = Math.min(minX, sx); minY = Math.min(minY, sy);
      maxX = Math.max(maxX, sx + sw); maxY = Math.max(maxY, sy + sh);
      totalW += ls.widthCm; totalH += ls.heightCm; count++;
    }
    if (!isFinite(minX) || count === 0) return null;
    const avgW = totalW / count;
    const avgH = totalH / count;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, avgW, avgH };
  })();

  // Primary image for single-select tooltip
  const primaryId = selectedIds.length === 1 ? selectedIds[0] : null;
  const primaryLs = primaryId !== null ? localStates[primaryId] : null;

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full min-h-0 relative overflow-hidden select-none canvas-cursor"
      style={{ ...outerBgStyle, cursor: eraserMode ? "none" : (ctrlHeld ? "zoom-in" : undefined), touchAction: "none" }}
      onMouseMove={(e) => {
        mousePosRef.current = { x: e.clientX, y: e.clientY };
        if (eraserMode) setEraserCursorPos({ x: e.clientX, y: e.clientY });
        if (ctrlHeld && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          setMagPos({ x: mx, y: my });
          drawMagnifier(mx, my, localStates, images, sheetBgColor);
        }
      }}
      onMouseLeave={() => {
        if (ctrlHeld) setMagPos(null);
        if (eraserMode) setEraserCursorPos(null);
      }}
      onClick={() => {
        if (wasRubberBandRef.current) { wasRubberBandRef.current = false; return; }
        onSelectionChange([]);
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        dragRef.current = { kind: "select", startMx: e.clientX, startMy: e.clientY };
        document.body.style.userSelect = "none";
      }}
    >
      {/* Pliego sheet */}
      <div
        style={{
          position: "absolute",
          left: offsetX,
          top: offsetY,
          width: displayW,
          height: displayH,
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          overflow: "visible",
          cursor: "crosshair",
          ...sheetStyle,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          e.stopPropagation(); // Prevent outer container from also starting rubber band
          // Start rubber band only on direct click on pliego background (not propagated from image)
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          dragRef.current = { kind: "select", startMx: e.clientX, startMy: e.clientY };
          document.body.style.userSelect = "none";
        }}
      >
        {images
          .slice()
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((img) => {
            const ls = localStates[img.id];
            if (!ls) return null;
            const isSelected = selectedIds.includes(img.id);
            const isPrimary = selectedIds.length === 1 && selectedIds[0] === img.id;
            return (
              <div
                key={img.id}
                data-image-id={img.id}
                style={{
                  position: "absolute",
                  left: ls.xCm * CM_TO_PX * scale,
                  top: ls.yCm * CM_TO_PX * scale,
                  width: ls.widthCm * CM_TO_PX * scale,
                  height: ls.heightCm * CM_TO_PX * scale,
                  transform: ls.rotation ? `rotate(${ls.rotation}deg)` : undefined,
                  transformOrigin: "center center",
                  outline: isSelected && selectedIds.length === 1 && !eraserMode ? "2px solid #818cf8" : "none",
                  outlineOffset: "1px",
                  cursor: eraserMode ? "none" : "grab",
                  zIndex: isSelected ? 100 : img.zIndex + 1,
                  boxSizing: "border-box",
                  willChange: "transform",
                }}
                onMouseDown={(e) => eraserMode ? startErase(e, img) : startMove(e, img)}
                onClick={(e) => { if (!eraserMode) handleImageClick(e, img); }}
                onDoubleClick={(e) => { if (!eraserMode) handleImageDoubleClick(e, img); }}
              >
                <img
                  src={pendingErasedUrls[img.id] ?? getImgUrl(img)}
                  alt=""
                  crossOrigin="anonymous"
                  decoding="async"
                  style={{ width: "100%", height: "100%", display: "block", objectFit: "fill", pointerEvents: "none" }}
                  draggable={false}
                />

                {/* ── Eraser upload badge ── */}
                {uploadingErasedIds.has(img.id) && (
                  <div style={{
                    position: "absolute",
                    bottom: 4,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "rgba(17,17,21,0.88)",
                    border: "1px solid rgba(139,92,246,0.55)",
                    borderRadius: 5,
                    padding: "2px 7px",
                    fontSize: 9,
                    fontWeight: 700,
                    color: "rgba(167,139,250,0.95)",
                    letterSpacing: "0.06em",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    backdropFilter: "blur(6px)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}>
                    <span style={{
                      display: "inline-block",
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "rgba(139,92,246,1)",
                      animation: "eraserSpin 0.7s linear infinite",
                    }} />
                    GUARDANDO
                  </div>
                )}

                {/* ── AI processing overlay ── */}
                {processingImageIds?.includes(img.id) && (() => {
                  const isFondo = processingTask === "fondo";
                  const isSemitono = processingTask === "semitono";
                  const labelText = isFondo ? "Quitando fondo" : isSemitono ? "Semitono DTF" : `Escalando ${processingTask}`;
                  const tint     = isFondo ? "rgba(109,40,217,0.28)"  : isSemitono ? "rgba(79,70,229,0.28)"  : "rgba(37,99,235,0.28)";
                  const beamGrad = isFondo
                    ? "linear-gradient(to bottom, transparent 0%, rgba(216,180,254,0.65) 50%, transparent 100%)"
                    : isSemitono
                    ? "linear-gradient(to bottom, transparent 0%, rgba(167,139,250,0.65) 50%, transparent 100%)"
                    : "linear-gradient(to bottom, transparent 0%, rgba(147,197,253,0.65) 50%, transparent 100%)";
                  const accent   = isFondo ? "rgba(192,132,252,0.85)" : isSemitono ? "rgba(167,139,250,0.85)" : "rgba(147,197,253,0.85)";
                  const gridClr  = "rgba(147,197,253,0.18)";
                  return (
                    <div className="ai-overlay-wrap">
                      {/* breathing tint */}
                      <div className="ai-overlay-tint" style={{ background: tint }} />
                      {/* glowing sweep beam */}
                      <div className="ai-overlay-beam" style={{ background: beamGrad }} />
                      {/* upscale: drifting pixel grid */}
                      {!isFondo && !isSemitono && (
                        <div className="ai-overlay-grid" style={{
                          backgroundImage: `linear-gradient(${gridClr} 1px, transparent 1px), linear-gradient(90deg, ${gridClr} 1px, transparent 1px)`,
                          backgroundSize: "10px 10px",
                        }} />
                      )}
                      {/* expanding ring pulse */}
                      <div className="ai-overlay-ring" style={{ width: 28, height: 28, border: `1.5px solid ${accent}` }} />
                      {/* corner targeting brackets */}
                      {([ ["top","left"],["top","right"],["bottom","left"],["bottom","right"] ] as const).map(([v,h]) => (
                        <div key={`${v}${h}`} style={{
                          position: "absolute",
                          [v]: 5, [h]: 5,
                          width: 9, height: 9,
                          borderTop:    v === "top"    ? `1.5px solid ${accent}` : "none",
                          borderBottom: v === "bottom" ? `1.5px solid ${accent}` : "none",
                          borderLeft:   h === "left"   ? `1.5px solid ${accent}` : "none",
                          borderRight:  h === "right"  ? `1.5px solid ${accent}` : "none",
                        }} />
                      ))}
                      {/* label with animated dots */}
                      <div className="ai-overlay-label">
                        <span style={{
                          fontSize: "9px", color: "rgba(255,255,255,0.95)",
                          background: "rgba(0,0,0,0.65)",
                          padding: "2px 8px 2px 7px", borderRadius: "4px",
                          letterSpacing: "0.04em", fontWeight: 600,
                          backdropFilter: "blur(6px)", whiteSpace: "nowrap",
                          display: "inline-flex", alignItems: "center", gap: "3px",
                          border: `1px solid ${accent.replace("0.85","0.35")}`,
                        }}>
                          {labelText}
                          <span style={{ display: "inline-flex", gap: "2px", marginLeft: "2px" }}>
                            <span className="ai-dot-1" style={{ width: 3, height: 3, borderRadius: "50%", background: accent, display: "inline-block" }} />
                            <span className="ai-dot-2" style={{ width: 3, height: 3, borderRadius: "50%", background: accent, display: "inline-block" }} />
                            <span className="ai-dot-3" style={{ width: 3, height: 3, borderRadius: "50%", background: accent, display: "inline-block" }} />
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Blue drag overlay on all selected images while dragging */}
                {isSelected && isDragging && (
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "rgba(99,102,241,0.25)",
                    pointerEvents: "none",
                  }} />
                )}

                {/* Rotation handle — circle above the image center */}
                {isPrimary && !suppressHandles && (
                  <div
                    style={{
                      position: "absolute",
                      left: "calc(50% - 11px)",
                      top: -34,
                      width: 22,
                      height: 22,
                      background: "#4f46e5",
                      border: "2px solid #818cf8",
                      borderRadius: "50%",
                      cursor: "crosshair",
                      zIndex: 40,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
                    }}
                    onMouseDown={(e) => startRotate(e, img)}
                  >
                    <RotateCw size={12} color="white" strokeWidth={2.5} />
                  </div>
                )}

                {/* Connector line from rotation handle to image top */}
                {isPrimary && !suppressHandles && (
                  <div style={{
                    position: "absolute",
                    left: "calc(50% - 0.5px)",
                    top: -12,
                    width: 1,
                    height: 12,
                    background: "#818cf8",
                    pointerEvents: "none",
                    zIndex: 39,
                  }} />
                )}

                {/* 8 circle resize handles — only when rotation is 0 */}
                {isPrimary && !suppressHandles && ls.rotation === 0 && HANDLE_DIRS.map((dir) => (
                  <div
                    key={dir}
                    style={handleStyle(dir)}
                    onMouseDown={(e) => startResize(e, img, dir)}
                    data-resize-dir={dir}
                    data-resize-img={img.id}
                  />
                ))}
              </div>
            );
          })}

        {/* ── Inline text editor — floating input, canvas updates live ── */}
        {inlineEdit && (() => {
          const ls = localStates[inlineEdit.img.id];
          if (!ls) return null;
          const sw = ls.widthCm * CM_TO_PX * scale;
          const imgScreenX = ls.xCm * CM_TO_PX * scale;
          const imgScreenY = ls.yCm * CM_TO_PX * scale;
          return (
            <div
              style={{
                position: "absolute",
                left: imgScreenX,
                top: imgScreenY - 52,   // float ABOVE the image
                width: Math.max(sw, 260),
                zIndex: 600,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                pointerEvents: "auto",
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Input row */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(14,14,30,0.92)",
                border: "1.5px solid rgba(99,102,241,0.55)",
                borderRadius: 8,
                backdropFilter: "blur(14px)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.12)",
                padding: "3px 6px 3px 10px",
              }}>
                <span style={{ fontSize: 10, color: "rgba(165,180,252,0.6)", whiteSpace: "nowrap", userSelect: "none" }}>✏</span>
                <input
                  autoFocus
                  type="text"
                  value={inlineEdit.editText}
                  onChange={(e) => setInlineEdit((s) => s ? { ...s, editText: e.target.value } : null)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { e.stopPropagation(); setInlineEdit(null); }
                    if (e.key === "Enter") { e.stopPropagation(); handleInlineConfirm(); }
                  }}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#e0e7ff",
                    fontSize: 13,
                    fontFamily: `"${inlineEdit.params.fontFamily}", sans-serif`,
                    fontWeight: inlineEdit.params.bold ? 700 : 400,
                    fontStyle: inlineEdit.params.italic ? "italic" : "normal",
                    padding: "4px 0",
                    minWidth: 0,
                  }}
                  placeholder="Escribe aquí…"
                />
                {/* Confirm */}
                <button
                  onClick={handleInlineConfirm}
                  disabled={inlineEdit.updating}
                  title="Aplicar (Enter)"
                  style={{
                    flexShrink: 0,
                    padding: "3px 10px",
                    borderRadius: 6,
                    background: inlineEdit.updating ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.6)",
                    border: "1px solid rgba(99,102,241,0.5)",
                    color: "#e0e7ff",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: inlineEdit.updating ? "default" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >{inlineEdit.updating ? "…" : "✓"}</button>
                {/* Cancel */}
                <button
                  onClick={() => setInlineEdit(null)}
                  title="Cancelar (Esc)"
                  style={{
                    flexShrink: 0,
                    padding: "3px 7px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#6b7280",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >✕</button>
              </div>
              {/* Hint */}
              <div style={{
                fontSize: 9, color: "rgba(165,180,252,0.4)", paddingLeft: 2, userSelect: "none",
              }}>El canvas se actualiza en tiempo real · Enter para guardar · Esc cancela</div>
            </div>
          );
        })()}
      </div>

      {/* Rubber band selection rectangle */}
      {selectBox && (() => {
        const x = Math.min(selectBox.x1, selectBox.x2);
        const y = Math.min(selectBox.y1, selectBox.y2);
        const w = Math.abs(selectBox.x2 - selectBox.x1);
        const h = Math.abs(selectBox.y2 - selectBox.y1);
        return (
          <div style={{
            position: "absolute",
            left: x, top: y, width: w, height: h,
            border: "1.5px solid #818cf8",
            background: "rgba(99,102,241,0.12)",
            borderRadius: 2,
            pointerEvents: "none",
            zIndex: 500,
          }} />
        );
      })()}

      {/* Dimension pill — single selected image, positioned above it in screen coords */}
      {primaryLs && !suppressHandles && (() => {
        const sx = offsetX + primaryLs.xCm * CM_TO_PX * scale;
        const sy = offsetY + primaryLs.yCm * CM_TO_PX * scale;
        const sw = primaryLs.widthCm * CM_TO_PX * scale;
        const sh = primaryLs.heightCm * CM_TO_PX * scale;
        return (
          <div style={{
            position: "absolute",
            left: sx + sw / 2,
            top: sy + sh + 4,
            transform: "translate(-50%, 0%)",
            background: "rgba(25,25,40,0.92)",
            color: "#818cf8",
            padding: "3px 9px",
            borderRadius: 20,
            fontSize: 11,
            fontFamily: "monospace",
            fontWeight: 700,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            border: "1px solid rgba(129,140,248,0.45)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
            zIndex: 300,
          }}>
            {primaryLs.widthCm.toFixed(1)} × {primaryLs.heightCm.toFixed(1)} cm{primaryLs.rotation !== 0 ? ` · ${Math.round(primaryLs.rotation)}°` : ""}
          </div>
        );
      })()}

      {/* Group bounding box — multiple images selected */}
      {groupBox && !suppressHandles && (() => {
        const { x, y, w, h, avgW, avgH } = groupBox;
        return (
          <div
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: w,
              height: h,
              border: "2px solid #818cf8",
              borderRadius: 2,
              pointerEvents: "auto",
              zIndex: 150,
              cursor: "grab",
              boxSizing: "border-box",
            }}
            onMouseDown={(e) => {
              // Move all selected images when the group box is dragged
              e.stopPropagation();
              const firstId = selectedIds[0];
              const firstImg = images.find((i) => i.id === firstId);
              if (firstImg) startMove(e, firstImg);
            }}
          >
            {/* Group size label */}
            <div style={{
              position: "absolute",
              top: -28,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(25,25,40,0.92)",
              color: "#818cf8",
              padding: "3px 9px",
              borderRadius: 20,
              fontSize: 11,
              fontFamily: "monospace",
              fontWeight: 700,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              border: "1px solid rgba(129,140,248,0.45)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
            }}>
              {selectedIds.length} imágenes · {avgW.toFixed(1)} × {avgH.toFixed(1)} cm promedio
            </div>
            {/* 8 handles on the group box */}
            {HANDLE_DIRS.map((dir) => (
              <GroupHandle key={dir} dir={dir} onDown={(e) => {
                e.stopPropagation();
                const firstId = selectedIds[0];
                const firstImg = images.find((i) => i.id === firstId);
                if (firstImg) startMove(e, firstImg);
              }} />
            ))}
          </div>
        );
      })()}

      {/* Multi-select hint */}
      {selectedIds.length > 1 && (
        <div style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          fontSize: 11, color: "#818cf8", fontWeight: 600,
          background: "rgba(20,20,30,0.8)", padding: "3px 10px", borderRadius: 20,
          border: "1px solid #818cf840", pointerEvents: "none",
        }}>
          {selectedIds.length} seleccionadas{!isMobile ? " · Ctrl+clic para agregar/quitar" : ""}
        </div>
      )}

      {/* Vertical scroll bar — right edge (custom draggable thumb, desktop only) */}
      {!isMobile && (() => {
        const barH = Math.min(containerSize.h - 120, 300);
        const btnSz = 20;
        const trackH = barH - btnSz * 2 - 12; // minus buttons + padding
        const coverage = Math.min(containerSize.h / Math.max(displayH, containerSize.h + 1), 1);
        const thumbH = Math.max(24, trackH * coverage);
        // 0 = top (panY = maxPanY), 1 = bottom (panY = -maxPanY)
        const thumbPct = maxPanY <= 0 ? 0 : (maxPanY - clampedPanY) / (2 * maxPanY);
        const thumbTop = thumbPct * (trackH - thumbH);
        return (
          <div style={{
            position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
            zIndex: 25, display: "flex", flexDirection: "column", alignItems: "center",
            height: barH,
          }}>
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              background: "rgba(18,18,18,0.88)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, padding: "6px 4px",
              backdropFilter: "blur(6px)",
              boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
              height: "100%", gap: 0,
            }}>
              {/* Up button */}
              <button
                title="Subir"
                onClick={() => setPanY((py) => Math.min(maxPanY, py + 40))}
                style={{
                  width: btnSz, height: btnSz, flexShrink: 0,
                  background: "transparent", border: "none",
                  color: "#9ca3af", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11,
                }}
              >▲</button>

              {/* Track */}
              <div
                style={{ flex: 1, width: 10, position: "relative", cursor: "pointer" }}
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const clickY = e.clientY - rect.top;
                  const pct = Math.max(0, Math.min(1, clickY / trackH));
                  setPanY(maxPanY - pct * 2 * maxPanY);
                }}
              >
                <div style={{
                  position: "absolute", left: "50%", top: 0, bottom: 0,
                  width: 4, transform: "translateX(-50%)",
                  background: "rgba(255,255,255,0.08)", borderRadius: 2,
                }} />
                {/* Thumb */}
                <div
                  style={{
                    position: "absolute", left: "50%", transform: "translateX(-50%)",
                    top: thumbTop, height: thumbH, width: 8,
                    background: "rgba(139,92,246,0.75)",
                    borderRadius: 4, cursor: "grab", transition: "background 0.15s",
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    scrollDragRef.current = { startY: e.clientY, startPanY: clampedPanY };
                    document.body.style.cursor = "grabbing";
                  }}
                />
              </div>

              {/* Down button */}
              <button
                title="Bajar"
                onClick={() => setPanY((py) => Math.max(-maxPanY, py - 40))}
                style={{
                  width: btnSz, height: btnSz, flexShrink: 0,
                  background: "transparent", border: "none",
                  color: "#9ca3af", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11,
                }}
              >▼</button>
            </div>
          </div>
        );
      })()}

      {/* Horizontal scroll bar — bottom edge (custom draggable thumb, desktop only) */}
      {!isMobile && (() => {
        const barW = Math.min(containerSize.w / 2 - 60, 260);
        const btnSz = 20;
        const trackW = barW - btnSz * 2 - 12;
        const coverage = Math.min(containerSize.w / Math.max(displayW, containerSize.w + 1), 1);
        const thumbW = Math.max(24, trackW * coverage);
        // 0 = left (panX = maxPanX), 1 = right (panX = -maxPanX)
        const thumbPct = maxPanX <= 0 ? 0 : (maxPanX - clampedPanX) / (2 * maxPanX);
        const thumbLeft = thumbPct * (trackW - thumbW);
        return (
          <div style={{
            position: "absolute", bottom: 6, left: 8,
            zIndex: 25, display: "flex", flexDirection: "row", alignItems: "center",
            width: barW,
          }}>
            <div style={{
              display: "flex", flexDirection: "row", alignItems: "center",
              background: "rgba(18,18,18,0.88)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, padding: "4px 6px",
              backdropFilter: "blur(6px)",
              boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
              width: "100%", gap: 0,
            }}>
              {/* Left button */}
              <button
                title="Izquierda"
                onClick={() => setPanX((px) => Math.min(maxPanX, px + 40))}
                style={{
                  width: btnSz, height: btnSz, flexShrink: 0,
                  background: "transparent", border: "none",
                  color: "#9ca3af", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11,
                }}
              >◀</button>

              {/* Track */}
              <div
                style={{ flex: 1, height: 10, position: "relative", cursor: "pointer" }}
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const pct = Math.max(0, Math.min(1, clickX / trackW));
                  setPanX(maxPanX - pct * 2 * maxPanX);
                }}
              >
                <div style={{
                  position: "absolute", top: "50%", left: 0, right: 0,
                  height: 4, transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.08)", borderRadius: 2,
                }} />
                {/* Thumb */}
                <div
                  style={{
                    position: "absolute", top: "50%", transform: "translateY(-50%)",
                    left: thumbLeft, width: thumbW, height: 8,
                    background: "rgba(139,92,246,0.75)",
                    borderRadius: 4, cursor: "grab", transition: "background 0.15s",
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    scrollDragRefX.current = { startX: e.clientX, startPanX: clampedPanX };
                    document.body.style.cursor = "grabbing";
                  }}
                />
              </div>

              {/* Right button */}
              <button
                title="Derecha"
                onClick={() => setPanX((px) => Math.max(-maxPanX, px - 40))}
                style={{
                  width: btnSz, height: btnSz, flexShrink: 0,
                  background: "transparent", border: "none",
                  color: "#9ca3af", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11,
                }}
              >▶</button>
            </div>
          </div>
        );
      })()}

      {/* Zoom controls — pill with slider (desktop only) */}
      {!isMobile && <div
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute", right: 44, bottom: 16, zIndex: 20,
          display: "flex", flexDirection: "row", alignItems: "center", gap: 0,
          background: "rgba(18,18,18,0.92)",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 10, overflow: "hidden",
          backdropFilter: "blur(6px)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.55)",
        }}>
        {/* Zoom out */}
        <button
          title="Alejar (Ctrl −)"
          onClick={() => setUserZoom((z) => Math.max(z / 1.25, 0.05))}
          style={{
            width: 32, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", color: "#d1d5db", cursor: "pointer",
            fontSize: 18, fontWeight: 300, lineHeight: 1, flexShrink: 0,
          }}
        >−</button>

        {/* Slider */}
        <div style={{ display: "flex", alignItems: "center", borderLeft: "1px solid rgba(255,255,255,0.1)", borderRight: "1px solid rgba(255,255,255,0.1)", padding: "0 8px", height: 34 }}>
          <input
            type="range"
            min={-2.996}
            max={2.079}
            step={0.01}
            value={Math.log(userZoom)}
            onChange={(e) => setUserZoom(Math.exp(parseFloat(e.target.value)))}
            title="Zoom"
            style={{
              width: 80, height: 4, cursor: "pointer",
              accentColor: "#818cf8",
              background: "transparent",
            }}
          />
        </div>

        {/* Percentage — click to reset to fit */}
        <button
          title="Ajustar al lienzo (Ctrl+0)"
          onClick={() => setUserZoom(1)}
          style={{
            minWidth: 50, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.06)", border: "none",
            borderLeft: "1px solid rgba(255,255,255,0.1)", borderRight: "1px solid rgba(255,255,255,0.1)",
            color: "#e5e7eb", cursor: "pointer",
            fontSize: 11, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.03em",
          }}
        >
          {Math.round(scale * 100)}%
        </button>

        {/* Zoom in */}
        <button
          title="Acercar (Ctrl +)"
          onClick={() => setUserZoom((z) => Math.min(z * 1.25, 8))}
          style={{
            width: 32, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", color: "#d1d5db", cursor: "pointer",
            fontSize: 18, fontWeight: 300, lineHeight: 1, flexShrink: 0,
          }}
        >+</button>
      </div>}

      {/* Info label — desktop only */}
      {!isMobile && <div style={{
        position: "absolute", left: 16, bottom: 16,
        fontSize: 10, color: "rgba(156,163,175,0.6)",
        pointerEvents: "none", fontFamily: "monospace",
      }}>
        {pliego.widthCm} × {pliego.heightCm} cm · {pliego.dpi} DPI · {Math.round(scale * 100)}%
      </div>}

      {/* ── Eraser cursor: outer ring + crosshair dot ── */}
      {eraserMode && eraserCursorPos && (
        <>
          {/* outer ring */}
          <div
            style={{
              position: "fixed",
              left: eraserCursorPos.x - eraserSize / 2,
              top:  eraserCursorPos.y - eraserSize / 2,
              width: eraserSize,
              height: eraserSize,
              border: "1.5px solid rgba(167,139,250,0.85)",
              borderRadius: "50%",
              pointerEvents: "none",
              zIndex: 9999,
              boxShadow: "0 0 6px rgba(139,92,246,0.5)",
            }}
          />
          {/* center dot */}
          <div
            style={{
              position: "fixed",
              left: eraserCursorPos.x - 3,
              top:  eraserCursorPos.y - 3,
              width: 6,
              height: 6,
              background: "rgba(167,139,250,0.95)",
              borderRadius: "50%",
              pointerEvents: "none",
              zIndex: 9999,
              boxShadow: "0 0 4px rgba(139,92,246,0.8)",
            }}
          />
          {/* size label */}
          <div
            style={{
              position: "fixed",
              left: eraserCursorPos.x + eraserSize / 2 + 6,
              top:  eraserCursorPos.y + eraserSize / 2 + 2,
              pointerEvents: "none",
              zIndex: 9999,
              fontSize: 9,
              fontWeight: 700,
              color: "rgba(167,139,250,0.7)",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
            }}
          >
            {eraserSize}px
          </div>
        </>
      )}

      {/* ── Magnifier Lupa ── */}
      {ctrlHeld && !magPos && (
        <div style={{
          position: "absolute", bottom: 44, left: "50%", transform: "translateX(-50%)",
          background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.35)",
          borderRadius: 8, padding: "4px 10px",
          fontSize: 10, color: "rgba(167,139,250,0.8)", fontWeight: 600,
          letterSpacing: "0.05em", pointerEvents: "none",
          backdropFilter: "blur(8px)",
        }}>
          Mueve el cursor para usar la lupa
        </div>
      )}
      {ctrlHeld && magPos && (() => {
        const D = MAG_RADIUS * 2;
        const clampX = Math.max(MAG_RADIUS + 4, Math.min(magPos.x, (containerRef.current?.clientWidth ?? 800) - MAG_RADIUS - 4));
        const clampY = Math.max(MAG_RADIUS + 4, Math.min(magPos.y, (containerRef.current?.clientHeight ?? 600) - MAG_RADIUS - 4));
        const offsetCursor = 28; // offset from cursor so lupa doesn't cover cursor
        return (
          <div
            style={{
              position: "absolute",
              left: clampX - MAG_RADIUS + offsetCursor,
              top:  clampY - MAG_RADIUS - offsetCursor,
              width: D, height: D,
              borderRadius: "50%",
              pointerEvents: "none",
              zIndex: 9999,
              // Multi-layer glow ring
              boxShadow: [
                "0 0 0 2px rgba(139,92,246,0.9)",
                "0 0 0 3px rgba(167,139,250,0.4)",
                "0 0 18px 4px rgba(139,92,246,0.5)",
                "0 8px 32px rgba(0,0,0,0.7)",
              ].join(", "),
              // Animate in
              animation: "mag-appear 0.15s cubic-bezier(0.34,1.56,0.64,1) both",
            }}
          >
            {/* Inner glow overlay */}
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.06) 0%, transparent 60%)",
              zIndex: 2, pointerEvents: "none",
            }} />
            {/* Canvas content */}
            <canvas
              ref={magCanvasRef}
              width={D}
              height={D}
              style={{ display: "block", borderRadius: "50%", width: D, height: D }}
            />
            {/* Zoom label */}
            <div style={{
              position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.55)", borderRadius: 4, padding: "1px 6px",
              fontSize: 9, color: "rgba(167,139,250,0.9)", fontWeight: 700,
              letterSpacing: "0.08em", whiteSpace: "nowrap", zIndex: 3,
            }}>
              {MAG_ZOOM}×
            </div>
          </div>
        );
      })()}
    </div>
  );
}
