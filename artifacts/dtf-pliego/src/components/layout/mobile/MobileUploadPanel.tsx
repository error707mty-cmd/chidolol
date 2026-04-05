import { useRef, useState } from "react";
import {
  useUploadImage, useAddImageToPliego, getListPliegoImagesQueryKey,
  getGetPliegoStatsQueryKey, getGetPliegoPriceQueryKey, Pliego, PliegoImage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useHistory } from "@/contexts/HistoryContext";
import { renderTextToBlob, saveTextParams, DEFAULT_PARAMS } from "@/lib/textRender";
import { textParamsStore } from "@/lib/textParamsStore";
import { UploadCloud, Type, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

interface Props {
  pliego: Pliego;
  images: PliegoImage[];
  trimTransparency: boolean;
  removeSemiTransparency: boolean;
  onTrimChange: (v: boolean) => void;
  onSemiChange: (v: boolean) => void;
  onSelectionChange: (ids: number[]) => void;
  onClose?: () => void;
}

export function MobileUploadPanel({
  pliego, images, trimTransparency, removeSemiTransparency,
  onTrimChange, onSemiChange, onSelectionChange, onClose,
}: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [addingText, setAddingText] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadImage = useUploadImage();
  const addImageToPliego = useAddImageToPliego();
  const { push: pushHistory } = useHistory();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoStatsQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoPriceQueryKey(pliego.id) });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    const newIds: number[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const uploaded = await uploadImage.mutateAsync({ data: { file, trimTransparency, removeSemiTransparency } });
        const added = await addImageToPliego.mutateAsync({ id: pliego.id, data: { uploadId: uploaded.id } });
        newIds.push(added.id);
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      } catch {
        toast.error(`Error al subir ${file.name}`);
      }
    }
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
      invalidate();
      toast.success(`${newIds.length} imagen${newIds.length > 1 ? "es" : ""} añadida${newIds.length > 1 ? "s" : ""}`);
      onClose?.();
    }
  };

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
      invalidate();
      onSelectionChange([newImage.id]);
      toast.success("Texto añadido");
      onClose?.();
    } catch {
      toast.error("Error al agregar texto");
    } finally {
      setAddingText(false);
    }
  };

  const V = "rgba(139,92,246,1)";
  const VL = "rgba(139,92,246,0.15)";
  const VB = "rgba(139,92,246,0.3)";

  return (
    <div style={{ padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Upload zone */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        style={{
          borderRadius: 16,
          border: `2px dashed ${dragOver ? V : VB}`,
          background: dragOver
            ? "linear-gradient(135deg,rgba(139,92,246,0.18),rgba(99,102,241,0.12))"
            : "linear-gradient(135deg,rgba(139,92,246,0.08),rgba(99,102,241,0.04))",
          padding: "32px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          cursor: uploading ? "default" : "pointer",
          transition: "all 0.2s",
        }}
      >
        {uploading ? (
          <>
            <div style={{ position: "relative", width: 56, height: 56 }}>
              <svg width="56" height="56" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(139,92,246,0.15)" strokeWidth="4" />
                <circle
                  cx="28" cy="28" r="22" fill="none" stroke={V} strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 22}`}
                  strokeDashoffset={`${2 * Math.PI * 22 * (1 - uploadProgress / 100)}`}
                  style={{ transition: "stroke-dashoffset 0.3s" }}
                />
              </svg>
              <span style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: "rgba(167,139,250,0.9)",
              }}>
                {uploadProgress}%
              </span>
            </div>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Subiendo...</span>
          </>
        ) : (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: "linear-gradient(135deg,rgba(139,92,246,0.2),rgba(99,102,241,0.12))",
              border: `1px solid ${VB}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <UploadCloud style={{ width: 26, height: 26, color: "rgba(167,139,250,0.9)" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>
                Subir diseños
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                PNG · JPG · SVG · Toca para seleccionar
              </div>
            </div>
          </>
        )}
      </div>


      {/* Add text button */}
      <button
        onClick={handleAddText}
        disabled={addingText}
        style={{
          width: "100%",
          padding: "14px 20px",
          borderRadius: 14,
          background: "linear-gradient(135deg,rgba(139,92,246,0.18),rgba(99,102,241,0.12))",
          border: `1px solid ${VB}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          cursor: addingText ? "default" : "pointer",
          opacity: addingText ? 0.7 : 1,
          transition: "all 0.2s",
        }}
      >
        {addingText
          ? <Loader2 style={{ width: 17, height: 17, color: "rgba(167,139,250,0.9)", animation: "spin 1s linear infinite" }} />
          : <Type style={{ width: 17, height: 17, color: "rgba(167,139,250,0.9)" }} />
        }
        <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(167,139,250,0.9)" }}>
          {addingText ? "Añadiendo..." : "Añadir texto"}
        </span>
      </button>
    </div>
  );
}

function ToggleRow({
  icon, label, description, value, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: "100%", padding: "12px 14px",
        display: "flex", alignItems: "center", gap: 12,
        cursor: "pointer", textAlign: "left",
        background: value ? "rgba(139,92,246,0.06)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: value ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${value ? "rgba(139,92,246,0.35)" : "rgba(255,255,255,0.1)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: value ? "rgba(167,139,250,0.9)" : "rgba(255,255,255,0.4)",
        transition: "all 0.15s",
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: value ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)" }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
          {description}
        </div>
      </div>
      <div style={{
        width: 40, height: 22, borderRadius: 99, position: "relative", flexShrink: 0,
        background: value ? "linear-gradient(135deg,rgba(139,92,246,0.9),rgba(99,102,241,0.8))" : "rgba(255,255,255,0.1)",
        border: `1px solid ${value ? "rgba(139,92,246,0.6)" : "rgba(255,255,255,0.15)"}`,
        transition: "all 0.2s",
      }}>
        <div style={{
          position: "absolute", top: 2, width: 16, height: 16, borderRadius: 99,
          background: "white",
          left: value ? 20 : 2,
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
          transition: "left 0.2s",
        }} />
      </div>
    </button>
  );
}
