import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Pliego, PliegoImage,
  getListPliegoImagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CanvasArea } from "@/components/canvas/CanvasArea";
import { TextToolbar } from "@/components/canvas/TextToolbar";
import { MobileUploadPanel } from "@/components/layout/mobile/MobileUploadPanel";
import { MobilePliegoPanel } from "@/components/layout/mobile/MobilePliegoPanel";
import { MobileImageActionSheet } from "@/components/layout/mobile/MobileImageActionSheet";
import { SidebarRight } from "@/components/layout/SidebarRight";
import { UploadCloud, Layers, Image as ImageIcon, Undo2, Redo2, X, LogOut, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { TextParams } from "@/lib/textRender";

interface Props {
  pliego: Pliego;
  images: PliegoImage[];
  pliegoId: number;
  selectedIds: number[];
  setSelectedIds: (ids: number[]) => void;
  bgColor: string;
  setBgColor: (c: string) => void;
  trimTransparency: boolean;
  removeSemiTransparency: boolean;
  setTrimTransparency: (v: boolean) => void;
  setRemoveSemiTransparency: (v: boolean) => void;
  fitVersion: number;
  setFitVersion: React.Dispatch<React.SetStateAction<number>>;
  processingImageIds: number[];
  processingTask: string;
  setProcessingImageIds: (ids: number[]) => void;
  setProcessingTask: (t: string) => void;
  eraserMode: boolean;
  setEraserMode: React.Dispatch<React.SetStateAction<boolean>>;
  eraserSize: number;
  setEraserSize: (v: number) => void;
  eraserOpacity: number;
  setEraserOpacity: (v: number) => void;
  inpaintMode: boolean;
  setInpaintMode: (v: boolean) => void;
  inpaintRadius: number;
  setInpaintRadius: (v: number) => void;
  price?: { metersUsed?: number; totalPrice?: number; pricePerMeter?: number };
  handleTextUpdate: (img: PliegoImage, params: TextParams) => Promise<void>;
  triggerUndo: () => void;
  triggerRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoAnim: boolean;
  redoAnim: boolean;
  undoToast: string | null;
}

type TabId = "upload" | "pliego" | "images" | "dtf";

const BASE_TABS: { id: TabId; label: string; Icon: React.ComponentType<{ style?: React.CSSProperties }> }[] = [
  { id: "upload",  label: "Subir",    Icon: UploadCloud },
  { id: "pliego",  label: "Pliego",   Icon: Layers      },
  { id: "images",  label: "Imágenes", Icon: ImageIcon   },
];

const DTF_TAB = { id: "dtf" as TabId, label: "Semitono", Icon: Sparkles };

export function MobileLayout({
  pliego, images, pliegoId, selectedIds, setSelectedIds,
  bgColor, setBgColor, trimTransparency, removeSemiTransparency,
  setTrimTransparency, setRemoveSemiTransparency, fitVersion, setFitVersion,
  processingImageIds, processingTask, setProcessingImageIds, setProcessingTask,
  eraserMode, setEraserMode, eraserSize, setEraserSize,
  eraserOpacity, setEraserOpacity, inpaintMode, setInpaintMode,
  inpaintRadius, setInpaintRadius, price, handleTextUpdate,
  triggerUndo, triggerRedo, canUndo, canRedo, undoAnim, redoAnim, undoToast,
}: Props) {
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  // DTF: solo cuando el pliego fue creado con el formato "dtf58"
  const isDTF = pliego.tipoPapel === "dtf58";
  const TABS = isDTF ? [...BASE_TABS, DTF_TAB] : BASE_TABS;

  const closeSheet = useCallback(() => setActiveTab(null), []);
  const handleTabPress = (tab: TabId) => {
    // Selecting images tab while images are selected → keep selection
    setActiveTab((prev) => (prev === tab ? null : tab));
  };

  // ── Sheet content per tab ─────────────────────────────────────────────
  const sheetContent = (() => {
    if (activeTab === "upload") {
      return (
        <MobileUploadPanel
          pliego={pliego}
          images={images}
          trimTransparency={trimTransparency}
          removeSemiTransparency={removeSemiTransparency}
          onTrimChange={setTrimTransparency}
          onSemiChange={setRemoveSemiTransparency}
          onSelectionChange={setSelectedIds}
          onClose={closeSheet}
        />
      );
    }
    if (activeTab === "pliego") {
      return (
        <MobilePliegoPanel
          pliego={pliego}
          images={images}
          bgColor={bgColor}
          onBgColorChange={setBgColor}
          metersUsed={price?.metersUsed}
          totalPrice={price?.totalPrice}
          pricePerMeter={price?.pricePerMeter}
          onFitRequest={() => setFitVersion((v) => v + 1)}
        />
      );
    }
    if (activeTab === "images") {
      return (
        <SidebarRight
          mobile
          hideAITools
          pliego={pliego}
          images={images}
          selectedIds={selectedIds}
          onSelectionChange={(ids) => { setSelectedIds(ids); if (ids.length > 0) closeSheet(); }}
          onProcessingChange={(ids, task) => { setProcessingImageIds(ids); setProcessingTask(task); }}
        />
      );
    }
    if (activeTab === "dtf" && isDTF) {
      const SEMITONO_URL = `https://${location.hostname}/artifacts/dtf-semitono`;
      return (
        <div style={{
          display: "flex", flexDirection: "column", height: "100%",
          background: "#04020C",
        }}>
          <div style={{
            padding: "12px 16px 10px",
            borderBottom: "1px solid rgba(139,92,246,0.2)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "#a78bfa", boxShadow: "0 0 6px rgba(167,139,250,0.7)",
            }} />
            <span style={{
              fontSize: 9, fontWeight: 900, letterSpacing: "0.16em",
              textTransform: "uppercase", color: "#c4b5fd",
            }}>Semitono</span>
          </div>
          <iframe
            src={SEMITONO_URL}
            title="Semitono"
            style={{ flex: 1, border: "none", background: "#04020C" }}
            allow="same-origin"
          />
        </div>
      );
    }
    return null;
  })();

  const tabLabels: Record<TabId, string> = {
    upload: "Subir", pliego: "Pliego", images: "Imágenes", dtf: "Semitono",
  };

  // ── Tab sheet portal ──────────────────────────────────────────────────
  const tabSheetPortal = activeTab !== null
    ? createPortal(
        <>
          <div
            onClick={closeSheet}
            style={{
              position: "fixed", inset: 0, zIndex: 40,
              background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)",
              WebkitBackdropFilter: "blur(3px)",
              animation: "sheet-fade-in 0.2s ease",
            }}
          />
          <div
            style={{
              position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50,
              maxHeight: "84dvh", display: "flex", flexDirection: "column",
              background: "linear-gradient(180deg,#1a1525 0%,#111115 60%)",
              borderRadius: "22px 22px 0 0",
              borderTop: "1px solid rgba(139,92,246,0.2)",
              paddingBottom: "env(safe-area-inset-bottom,0px)",
              animation: "sheet-slide-up 0.3s cubic-bezier(0.22,1,0.36,1)",
              boxShadow: "0 -20px 60px rgba(0,0,0,0.7), 0 -1px 0 rgba(139,92,246,0.15)",
              overflow: "hidden",
            }}
          >
            {/* Drag handle */}
            <div style={{ flexShrink: 0, padding: "10px 0 0" }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.15)", margin: "0 auto" }} />
            </div>

            {/* Header */}
            <div style={{
              flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 16, borderRadius: 99, background: "linear-gradient(to bottom,rgba(139,92,246,1),rgba(99,102,241,0.4))" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(167,139,250,0.95)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  {tabLabels[activeTab]}
                </span>
              </div>
              <button
                onClick={closeSheet}
                style={{
                  width: 30, height: 30, borderRadius: 99, cursor: "pointer",
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X style={{ width: 15, height: 15, color: "rgba(255,255,255,0.5)" }} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
              {sheetContent}
            </div>
          </div>
        </>,
        document.body
      )
    : null;

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-background text-foreground">

      {/* ── Top bar ── */}
      <div
        className="shrink-0 flex items-center gap-2 px-3"
        style={{
          height: 48,
          background: "linear-gradient(180deg,rgba(18,12,32,0.99) 0%,rgba(14,10,24,0.97) 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* DTF pill */}
        <div
          className="flex items-center gap-1.5 shrink-0"
          style={{
            background: "linear-gradient(135deg,rgba(139,92,246,0.22),rgba(99,102,241,0.14))",
            border: "1px solid rgba(139,92,246,0.35)", borderRadius: 9, padding: "4px 10px",
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 900, color: "rgba(192,168,255,1)", letterSpacing: "0.2em", textTransform: "uppercase" }}>DTF</span>
        </div>
        <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 10, flexShrink: 0 }}>·</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
          {pliego.name}
        </span>

        {/* Undo */}
        <button
          onClick={triggerUndo} disabled={!canUndo}
          className={`flex items-center justify-center rounded-xl transition-all ${undoAnim ? "spin-once" : ""}`}
          style={{
            width: 36, height: 36,
            background: canUndo ? "rgba(139,92,246,0.16)" : "rgba(255,255,255,0.04)",
            border: canUndo ? "1px solid rgba(139,92,246,0.35)" : "1px solid rgba(255,255,255,0.08)",
            opacity: canUndo ? 1 : 0.3, cursor: canUndo ? "pointer" : "default",
          }}
        >
          <Undo2 style={{ width: 16, height: 16, color: canUndo ? "rgba(192,168,255,1)" : "rgba(255,255,255,0.4)" }} />
        </button>
        {/* Redo */}
        <button
          onClick={triggerRedo} disabled={!canRedo}
          className={`flex items-center justify-center rounded-xl transition-all ${redoAnim ? "spin-once" : ""}`}
          style={{
            width: 36, height: 36,
            background: canRedo ? "rgba(99,102,241,0.16)" : "rgba(255,255,255,0.04)",
            border: canRedo ? "1px solid rgba(99,102,241,0.35)" : "1px solid rgba(255,255,255,0.08)",
            opacity: canRedo ? 1 : 0.3, cursor: canRedo ? "pointer" : "default",
          }}
        >
          <Redo2 style={{ width: 16, height: 16, color: canRedo ? "rgba(148,163,250,1)" : "rgba(255,255,255,0.4)" }} />
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          className="flex items-center justify-center rounded-xl transition-all"
          style={{
            width: 36, height: 36,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            opacity: 0.6,
          }}
        >
          <LogOut style={{ width: 14, height: 14, color: "rgba(255,255,255,0.6)" }} />
        </button>
      </div>

      {/* ── Text toolbar ── */}
      <TextToolbar
        onImageUpdated={() => queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliegoId) })}
      />

      {/* ── Canvas (flex-1, always full height) ── */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col relative">
        <CanvasArea
          pliego={pliego}
          images={images}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          bgColor={bgColor}
          fitVersion={fitVersion}
          processingImageIds={processingImageIds}
          processingTask={processingTask}
          onTextUpdate={handleTextUpdate}
          suppressHandles={selectedIds.length > 0}
          eraserMode={eraserMode}
          eraserSize={eraserSize}
          eraserOpacity={eraserOpacity}
          inpaintMode={inpaintMode}
          inpaintRadius={inpaintRadius}
          onEraserCommit={() => setEraserMode(false)}
        />

        {/* Undo toast */}
        {undoToast && (
          <div
            className="absolute bottom-4 left-1/2 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs text-white/90 pointer-events-none"
            style={{
              background: "linear-gradient(135deg,rgba(30,18,58,0.97),rgba(20,12,40,0.97))",
              border: "1px solid rgba(139,92,246,0.4)", backdropFilter: "blur(16px)",
              transform: "translateX(-50%)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
              animation: "sheet-fade-in 0.2s ease",
            }}
          >
            <span style={{ color: "rgba(192,168,255,0.95)", fontWeight: 600 }}>{undoToast}</span>
          </div>
        )}
      </div>

      {/* ── Bottom tab bar ── */}
      <div
        className="shrink-0 flex items-stretch"
        style={{
          height: 60,
          background: "linear-gradient(0deg,rgba(10,6,20,0.99) 0%,rgba(16,10,28,0.98) 100%)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          paddingBottom: "env(safe-area-inset-bottom,0px)",
        }}
      >
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => handleTabPress(id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 select-none relative"
              style={{ color: isActive ? "rgba(192,168,255,1)" : "rgba(255,255,255,0.35)" }}
            >
              {/* Top line */}
              <div style={{
                position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                width: isActive ? 28 : 0, height: 2, borderRadius: 99,
                background: "linear-gradient(90deg,rgba(139,92,246,0.9),rgba(99,102,241,0.7))",
                transition: "width 0.25s cubic-bezier(0.22,1,0.36,1)",
              }} />

              {/* Icon pill */}
              <div style={{
                width: 44, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 10, transition: "all 0.2s",
                background: isActive
                  ? "linear-gradient(135deg,rgba(139,92,246,0.3),rgba(99,102,241,0.18))"
                  : "transparent",
                border: isActive ? "1px solid rgba(139,92,246,0.3)" : "1px solid transparent",
              }}>
                <Icon style={{ width: 18, height: 18 }} />
              </div>

              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", lineHeight: 1 }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab sheet (portal) ── */}
      {tabSheetPortal}

      {/* ── Image action sheet — shown when image selected and no tab sheet open ── */}
      {selectedIds.length > 0 && activeTab === null && (
        <MobileImageActionSheet
          pliego={pliego}
          images={images}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onProcessingChange={(ids, task) => { setProcessingImageIds(ids); setProcessingTask(task); }}
        />
      )}
    </div>
  );
}
