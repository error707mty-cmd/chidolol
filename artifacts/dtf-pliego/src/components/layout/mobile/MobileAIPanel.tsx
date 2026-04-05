import { useState, useCallback } from "react";
import {
  Pliego, PliegoImage,
  useUpdatePliegoImage, getListPliegoImagesQueryKey, getGetPliegoStatsQueryKey, getGetPliegoPriceQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useHistory } from "@/contexts/HistoryContext";
import {
  Scissors, ZoomIn, Sparkles, Check, Loader2,
  ImageOff, ScanLine, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

interface Props {
  pliego: Pliego;
  images: PliegoImage[];
  selectedIds: number[];
  onProcessingChange?: (ids: number[], task: string) => void;
}

type AiTask = "" | "fondo" | "2x" | "4x";

export function MobileAIPanel({ pliego, images, selectedIds, onProcessingChange }: Props) {
  const queryClient = useQueryClient();
  const { push: pushHistory } = useHistory();
  const updateImage = useUpdatePliegoImage();
  const { token } = useAuth() as { token: string };
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [aiTask, setAiTask] = useState<AiTask>("");
  const [aiSuccess, setAiSuccess] = useState(false);
  const [removeBgTolerance, setRemoveBgTolerance] = useState(18);

  const isProcessing = aiTask !== "";
  const selectedImgs = images.filter((img) => selectedIds.includes(img.id));
  const hasSelection = selectedImgs.length > 0;

  const flashSuccess = () => {
    setAiSuccess(true);
    setTimeout(() => setAiSuccess(false), 2000);
  };

  const resetAll = useCallback(() => {
    queryClient.resetQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoStatsQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoPriceQueryKey(pliego.id) });
  }, [queryClient, pliego.id]);

  const cleanupOldUpload = async (id: number) => {
    try { await fetch(`/api/uploads/${id}`, { method: "DELETE" }); } catch { /* non-critical */ }
  };

  const handleRemoveBg = async () => {
    if (isProcessing || !hasSelection) return;
    const snapshot = selectedImgs.map((img) => ({ imgId: img.id, oldUploadId: img.uploadId, newUploadId: 0 }));
    const pliegoId = pliego.id;
    setAiTask("fondo");
    onProcessingChange?.(selectedImgs.map((i) => i.id), "fondo");
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
        const newAspect = newUpload.widthPx && newUpload.heightPx ? newUpload.widthPx / newUpload.heightPx : null;
        const newHeightCm = newAspect ? img.widthCm / newAspect : img.heightCm;
        await new Promise<void>((resolve, reject) =>
          updateImage.mutate(
            { id: pliego.id, imageId: img.id, data: { uploadId: newUpload.id, heightCm: newHeightCm } },
            {
              onSuccess: () => {
                queryClient.setQueryData(getListPliegoImagesQueryKey(pliego.id), (old: PliegoImage[] | undefined) =>
                  old?.map((item) => item.id === img.id
                    ? { ...item, uploadId: newUpload.id, imageUrl: `${newUpload.imageUrl}?t=${Date.now()}`, heightCm: newHeightCm }
                    : item
                  ) ?? old
                );
                resolve();
              },
              onError: (err) => {
                if ((err as { status?: number }).status === 404) resolve(); else reject(err);
              },
            }
          )
        );
      }
      resetAll();
      flashSuccess();
      pushHistory({
        label: "Quitar fondo",
        cleanup: () => { for (const { oldUploadId } of snapshot) cleanupOldUpload(oldUploadId); },
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
      toast.success(selectedImgs.length === 1 ? "Fondo eliminado" : `Fondo eliminado en ${selectedImgs.length} imágenes`);
    } catch {
      toast.error("Error al quitar el fondo. Intenta de nuevo.");
    } finally {
      setAiTask("");
      onProcessingChange?.([], "");
    }
  };

  const handleUpscale = async (scale: 2 | 4) => {
    if (isProcessing || !hasSelection) return;
    const snapshot = selectedImgs.map((img) => ({ imgId: img.id, oldUploadId: img.uploadId, newUploadId: 0 }));
    const pliegoId = pliego.id;
    setAiTask(`${scale}x` as AiTask);
    onProcessingChange?.(selectedImgs.map((i) => i.id), `${scale}x`);
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
        await new Promise<void>((resolve, reject) =>
          updateImage.mutate(
            { id: pliego.id, imageId: img.id, data: { uploadId: newUpload.id } },
            {
              onSuccess: () => {
                const freshUrl = `${newUpload.imageUrl}?t=${Date.now()}`;
                queryClient.setQueryData(getListPliegoImagesQueryKey(pliego.id), (old: PliegoImage[] | undefined) =>
                  old?.map((item) => item.id === img.id
                    ? { ...item, uploadId: newUpload.id, imageUrl: freshUrl, originalWidthPx: newUpload.widthPx, originalHeightPx: newUpload.heightPx }
                    : item
                  ) ?? old
                );
                resolve();
              },
              onError: (err) => {
                if ((err as { status?: number }).status === 404) resolve(); else reject(err);
              },
            }
          )
        );
      }
      resetAll();
      flashSuccess();
      pushHistory({
        label: `Ampliar ${scale}×`,
        cleanup: () => { for (const { oldUploadId } of snapshot) cleanupOldUpload(oldUploadId); },
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
      toast.success(selectedImgs.length === 1
        ? `Imagen ampliada ${scale}× — mayor resolución de impresión`
        : `${selectedImgs.length} imágenes ampliadas ${scale}×`);
    } catch {
      toast.error(`Error al ampliar ${scale}×`);
    } finally {
      setAiTask("");
      onProcessingChange?.([], "");
    }
  };

  return (
    <div style={{ padding: "16px 14px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Status / Selection indicator ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        borderRadius: 14, border: "1px solid rgba(139,92,246,0.2)",
        background: "linear-gradient(135deg,rgba(139,92,246,0.08),rgba(99,102,241,0.04))",
      }}>
        {/* AI icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg,rgba(139,92,246,0.3),rgba(99,102,241,0.2))",
          border: "1px solid rgba(139,92,246,0.4)",
          boxShadow: "0 0 16px rgba(139,92,246,0.2)",
        }}>
          {aiSuccess
            ? <Check style={{ width: 18, height: 18, color: "rgba(74,222,128,1)" }} />
            : isProcessing
              ? <Loader2 style={{ width: 18, height: 18, color: "rgba(192,168,255,1)", animation: "spin 1s linear infinite" }} />
              : <Sparkles style={{ width: 18, height: 18, color: "rgba(192,168,255,1)" }} />
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)", lineHeight: 1.2 }}>
            {isProcessing ? "Procesando con IA…" : aiSuccess ? "¡Completado!" : "Herramientas IA"}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
            {hasSelection
              ? `${selectedImgs.length} imagen${selectedImgs.length > 1 ? "es" : ""} seleccionada${selectedImgs.length > 1 ? "s" : ""}`
              : "Selecciona imágenes en el canvas"
            }
          </div>
        </div>

        {isProcessing && (
          <div style={{ fontSize: 9, color: "rgba(192,168,255,0.7)", fontWeight: 600, letterSpacing: "0.08em", animation: "pulse 1.5s infinite" }}>
            EN PROCESO
          </div>
        )}
      </div>

      {/* ── Quitar fondo ── */}
      <AICard
        icon={<Scissors style={{ width: 22, height: 22 }} />}
        iconBg="linear-gradient(135deg,rgba(139,92,246,0.5),rgba(99,102,241,0.3))"
        iconBorder="rgba(139,92,246,0.6)"
        title="Quitar fondo"
        description="Elimina el fondo automáticamente y deja solo el diseño"
        active={aiTask === "fondo"}
        disabled={isProcessing || !hasSelection}
        onClick={handleRemoveBg}
        extra={
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>Tolerancia</span>
            <input
              type="range" min={5} max={120} step={1} value={removeBgTolerance}
              onChange={(e) => setRemoveBgTolerance(Number(e.target.value))}
              style={{ flex: 1, height: 4, accentColor: "rgba(139,92,246,1)", cursor: "pointer" }}
            />
            <span style={{ fontSize: 10, color: "rgba(167,139,250,0.9)", fontFamily: "monospace", fontWeight: 700, width: 24, textAlign: "right" }}>{removeBgTolerance}</span>
          </div>
        }
      />

      {/* ── Upscale section ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: "0.15em", textTransform: "uppercase", paddingLeft: 2 }}>
          Mejorar resolución de impresión
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <AICard
            icon={<ZoomIn style={{ width: 20, height: 20 }} />}
            iconBg="linear-gradient(135deg,rgba(99,102,241,0.5),rgba(79,70,229,0.3))"
            iconBorder="rgba(99,102,241,0.6)"
            title="2× Upscale"
            description="Duplica resolución para impresión nítida"
            active={aiTask === "2x"}
            disabled={isProcessing || !hasSelection}
            onClick={() => handleUpscale(2)}
            compact
          />
          <AICard
            icon={<ScanLine style={{ width: 20, height: 20 }} />}
            iconBg="linear-gradient(135deg,rgba(168,85,247,0.5),rgba(139,92,246,0.3))"
            iconBorder="rgba(168,85,247,0.6)"
            title="4× Upscale"
            description="Máxima calidad para diseños grandes"
            active={aiTask === "4x"}
            disabled={isProcessing || !hasSelection}
            onClick={() => handleUpscale(4)}
            compact
          />
        </div>
      </div>

      {/* ── Empty state ── */}
      {!hasSelection && (
        <div style={{
          marginTop: 4, padding: "20px 16px",
          borderRadius: 16, border: "1px dashed rgba(255,255,255,0.1)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          background: "rgba(255,255,255,0.02)",
          animation: "sheet-fade-in 0.3s ease",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)",
          }}>
            <ImageOff style={{ width: 20, height: 20, color: "rgba(255,255,255,0.2)" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.3)" }}>Sin selección</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", marginTop: 3, lineHeight: 1.5 }}>
              Toca una imagen en el canvas para seleccionarla y luego aplica las herramientas IA
            </div>
          </div>
        </div>
      )}

      {/* ── AI tip ── */}
      <div style={{
        padding: "10px 12px", borderRadius: 12,
        background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.12)",
        display: "flex", gap: 8, alignItems: "flex-start",
      }}>
        <Wand2 style={{ width: 13, height: 13, color: "rgba(167,139,250,0.6)", flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.6, margin: 0 }}>
          Puedes usar el botón ↺ (deshacer) después de aplicar cualquier herramienta para revertir los cambios.
        </p>
      </div>
    </div>
  );
}

// ── AI Card component ─────────────────────────────────────────────────────
interface AICardProps {
  icon: React.ReactNode;
  iconBg: string;
  iconBorder: string;
  title: string;
  description: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  extra?: React.ReactNode;
  compact?: boolean;
}

function AICard({ icon, iconBg, iconBorder, title, description, active, disabled, onClick, extra, compact }: AICardProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        width: "100%", padding: compact ? "12px 12px" : "14px 14px",
        borderRadius: 16, textAlign: "left", cursor: disabled ? "default" : "pointer",
        display: "flex", flexDirection: compact ? "column" : "row",
        alignItems: compact ? "flex-start" : "flex-start", gap: compact ? 8 : 12,
        border: active
          ? `1px solid ${iconBorder}`
          : pressed
            ? "1px solid rgba(139,92,246,0.35)"
            : "1px solid rgba(255,255,255,0.08)",
        background: active
          ? "linear-gradient(135deg,rgba(139,92,246,0.18),rgba(99,102,241,0.1))"
          : pressed
            ? "rgba(139,92,246,0.1)"
            : "rgba(255,255,255,0.04)",
        opacity: disabled && !active ? 0.45 : 1,
        boxShadow: active ? `0 0 20px rgba(139,92,246,0.15), inset 0 1px 0 rgba(255,255,255,0.05)` : "none",
        transform: pressed && !disabled ? "scale(0.98)" : "scale(1)",
        transition: "all 0.15s cubic-bezier(0.22,1,0.36,1)",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Shimmer while active */}
      {active && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "linear-gradient(90deg,transparent 0%,rgba(139,92,246,0.12) 50%,transparent 100%)",
          backgroundSize: "200% 100%",
          animation: "ai-sweep 1.5s ease-in-out infinite",
        }} />
      )}

      {/* Icon */}
      <div style={{
        width: compact ? 34 : 42, height: compact ? 34 : 42, borderRadius: compact ? 10 : 12, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: iconBg, border: `1px solid ${iconBorder}`,
        color: "rgba(255,255,255,0.95)",
        boxShadow: active ? `0 0 16px ${iconBorder}80` : "none",
        transition: "box-shadow 0.3s ease",
      }}>
        {active
          ? <Loader2 style={{ width: compact ? 16 : 20, height: compact ? 16 : 20, animation: "spin 1s linear infinite" }} />
          : icon
        }
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", lineHeight: 1.2 }}>
          {active ? "Procesando…" : title}
        </div>
        {!compact && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 3, lineHeight: 1.5 }}>
            {description}
          </div>
        )}
        {extra && <div style={{ marginTop: 8, width: "100%" }}>{extra}</div>}
      </div>
    </button>
  );
}
