import { useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  useUpdatePliego, useAutoNestPliego,
  getListPliegoImagesQueryKey, getGetPliegoStatsQueryKey,
  getGetPliegoPriceQueryKey, getGetPliegoQueryKey,
  Pliego, PliegoImage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useHistory } from "@/contexts/HistoryContext";
import {
  LayoutGrid, Download, Loader2, RefreshCw, FileImage, FileText,
  DollarSign, Ruler, Droplets, Lock, Unlock,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  pliego: Pliego;
  images: PliegoImage[];
  bgColor: string;
  onBgColorChange: (c: string) => void;
  metersUsed?: number;
  totalPrice?: number;
  pricePerMeter?: number;
  onFitRequest: () => void;
}

export function MobilePliegoPanel({
  pliego, images, bgColor, onBgColorChange,
  metersUsed, totalPrice, pricePerMeter, onFitRequest,
}: Props) {
  const { user, token } = useAuth();
  const isPro = user?.plan === "pro";
  const queryClient = useQueryClient();
  const colorPickerRef = useRef<HTMLInputElement>(null);
  const updatePliego = useUpdatePliego();
  const autoNest = useAutoNestPliego();
  const { push: pushHistory } = useHistory();

  const [widthInput, setWidthInput]   = useState(pliego.widthCm.toString());
  const [heightInput, setHeightInput] = useState(pliego.heightCm.toString());
  const [dimensionLocked, setDimensionLocked] = useState(() => {
    try { return localStorage.getItem(`dim-lock-${pliego.id}`) === "1"; } catch { return false; }
  });
  const [exportingRgb,  setExportingRgb]  = useState(false);
  const [exportingCmyk, setExportingCmyk] = useState(false);
  const [nesting, setNesting] = useState(false);

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
    toast(next ? "Medidas bloqueadas" : "Medidas desbloqueadas");
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoStatsQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoPriceQueryKey(pliego.id) });
    queryClient.invalidateQueries({ queryKey: getGetPliegoQueryKey(pliego.id) });
  };

  const handleAutoNest = () => {
    setNesting(true);
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
        invalidate();
        if (r.newHeightCm !== undefined) setHeightInput(r.newHeightCm.toFixed(1));
        onFitRequest?.();
        if (r.unplacedCount > 0) {
          toast.warning(`${r.placedCount} acomodadas · ${r.unplacedCount} no caben`);
        } else {
          toast.success(`${r.placedCount} imágenes acomodadas`);
        }
        setNesting(false);
      },
      onError: () => { toast.error("Error al acomodar"); setNesting(false); },
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
      if (!res.ok) throw new Error();
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
      if (!res.ok) throw new Error();
      const result = await res.json();
      triggerDownload(result.downloadUrl, result.filename || `pliego-${pliego.id}-CMYK.pdf`);
      toast.success("PDF CMYK descargado · FOGRA39 · 300 DPI");
    } catch {
      toast.error("Error al exportar PDF CMYK");
    } finally {
      setExportingCmyk(false);
    }
  };

  const V  = "rgba(139,92,246,1)";
  const VL = "rgba(139,92,246,0.15)";
  const VB = "rgba(139,92,246,0.3)";

  const bgPresets: { label: string; color: string; check: boolean }[] = [
    { label: "Transp.", color: "transparent", check: bgColor === "transparent" },
    { label: "Blanco",  color: "white",       check: bgColor === "white"       },
    { label: "Negro",   color: "black",       check: bgColor === "black"       },
    { label: "Custom",  color: bgColor,        check: !["transparent","white","black"].includes(bgColor) },
  ];

  return (
    <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Dimensions ── */}
      <Section label="Medidas" icon={<Ruler style={{ width: 13, height: 13 }} />}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px" }}>
          <DimInput
            label="Ancho cm"
            value={widthInput}
            onChange={(v) => !dimensionLocked && setWidthInput(v)}
            onBlur={handleDimensionSave}
            disabled={dimensionLocked}
          />
          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 18, fontWeight: 300 }}>×</span>
          <DimInput
            label="Alto cm"
            value={heightInput}
            onChange={(v) => !dimensionLocked && setHeightInput(v)}
            onBlur={handleDimensionSave}
            disabled={dimensionLocked}
          />
          {/* Lock */}
          <button
            onClick={toggleDimensionLock}
            style={{
              width: 36, height: 44, borderRadius: 10, flexShrink: 0,
              background: dimensionLocked ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${dimensionLocked ? "rgba(167,139,250,0.4)" : "rgba(255,255,255,0.1)"}`,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              marginTop: 18,
            }}
            title={dimensionLocked ? "Desbloquear medidas" : "Bloquear medidas"}
          >
            {dimensionLocked
              ? <Lock style={{ width: 13, height: 13, color: "#a78bfa" }} />
              : <Unlock style={{ width: 13, height: 13, color: "rgba(255,255,255,0.4)" }} />}
          </button>
          {/* Reset (hidden when locked) */}
          {!dimensionLocked && (
            <button
              onClick={() => {
                setWidthInput("58"); setHeightInput("100");
                updatePliego.mutate(
                  { id: pliego.id, data: { widthCm: 58, heightCm: 100 } },
                  { onSuccess: (u) => queryClient.setQueryData(getGetPliegoQueryKey(pliego.id), u) }
                );
              }}
              style={{
                width: 36, height: 44, borderRadius: 10, flexShrink: 0,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                marginTop: 18,
              }}
              title="Restablecer 58×100"
            >
              <RefreshCw style={{ width: 13, height: 13, color: "rgba(255,255,255,0.4)" }} />
            </button>
          )}
        </div>
      </Section>

      {/* ── Background ── */}
      <Section label="Color de fondo" icon={<Droplets style={{ width: 13, height: 13 }} />}>
        <div style={{ display: "flex", gap: 8, padding: "12px 14px", alignItems: "center" }}>
          {bgPresets.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                if (p.label === "Custom") { colorPickerRef.current?.click(); return; }
                onBgColorChange(p.color);
              }}
              style={{
                flex: 1, minWidth: 0, height: 52, borderRadius: 10, cursor: "pointer",
                position: "relative", overflow: "hidden",
                border: p.check ? `2px solid ${V}` : "2px solid rgba(255,255,255,0.1)",
                boxShadow: p.check ? `0 0 12px rgba(139,92,246,0.3)` : "none",
                transition: "all 0.15s",
              }}
            >
              {p.color === "transparent" ? (
                <div style={{ position: "absolute", inset: 0 }}>
                  <svg width="100%" height="100%">
                    <pattern id="chk" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                      <rect width="5" height="5" fill="#aaa" />
                      <rect x="5" y="5" width="5" height="5" fill="#aaa" />
                      <rect x="5" width="5" height="5" fill="#ddd" />
                      <rect y="5" width="5" height="5" fill="#ddd" />
                    </pattern>
                    <rect width="100%" height="100%" fill="url(#chk)" />
                  </svg>
                </div>
              ) : (
                <div style={{ position: "absolute", inset: 0, background: p.label === "Custom" ? p.color : p.color }} />
              )}
              {p.check && (
                <div style={{
                  position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{
                    background: "rgba(139,92,246,0.9)", borderRadius: 99,
                    width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              )}
              <div style={{
                position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center",
                fontSize: 9, fontWeight: 600, letterSpacing: "0.05em",
                color: p.color === "black" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)",
                textShadow: p.color === "black" ? "none" : "0 1px 2px rgba(0,0,0,0.2)",
              }}>
                {p.label}
              </div>
            </button>
          ))}
          <input
            ref={colorPickerRef}
            type="color"
            style={{ display: "none" }}
            onChange={(e) => onBgColorChange(e.target.value)}
          />
        </div>
      </Section>

      {/* ── Auto-acomodar ── */}
      <button
        onClick={handleAutoNest}
        disabled={nesting || images.length === 0}
        style={{
          width: "100%", padding: "15px 20px", borderRadius: 14, cursor: nesting || images.length === 0 ? "default" : "pointer",
          background: nesting || images.length === 0
            ? "rgba(255,255,255,0.05)"
            : "linear-gradient(135deg,rgba(139,92,246,0.22),rgba(99,102,241,0.15))",
          border: nesting || images.length === 0
            ? "1px solid rgba(255,255,255,0.08)"
            : `1px solid ${VB}`,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          opacity: images.length === 0 ? 0.4 : 1,
          transition: "all 0.2s",
        }}
      >
        {nesting
          ? <Loader2 style={{ width: 18, height: 18, color: "rgba(167,139,250,0.9)", animation: "spin 1s linear infinite" }} />
          : <LayoutGrid style={{ width: 18, height: 18, color: nesting || images.length === 0 ? "rgba(255,255,255,0.3)" : "rgba(167,139,250,0.9)" }} />
        }
        <span style={{ fontSize: 14, fontWeight: 600, color: nesting || images.length === 0 ? "rgba(255,255,255,0.3)" : "rgba(167,139,250,0.9)" }}>
          {nesting ? "Acomodando..." : "Auto-acomodar imágenes"}
        </span>
      </button>

      {/* ── Cost card ── */}
      {(metersUsed !== undefined || totalPrice !== undefined) && (
        <div style={{
          borderRadius: 14,
          background: "linear-gradient(135deg,rgba(139,92,246,0.1),rgba(99,102,241,0.06))",
          border: `1px solid ${VB}`,
          padding: "14px 16px",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {isPro && (
            <p style={{ fontSize: 10, fontWeight: 600, color: "rgba(167,139,250,0.65)", marginBottom: 2, lineHeight: 1.4 }}>
              Este sería el costo comprando con nosotros:
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <DollarSign style={{ width: 13, height: 13, color: "rgba(167,139,250,0.7)" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(167,139,250,0.7)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
              Costo de material
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Largo usado</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}>
              {metersUsed?.toFixed(2)} m
            </span>
          </div>
          {pricePerMeter !== undefined && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Precio/metro</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}>
                ${pricePerMeter}
              </span>
            </div>
          )}
          <div style={{
            height: 1, background: "rgba(139,92,246,0.2)", margin: "2px 0",
          }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: "rgba(167,139,250,1)", fontFamily: "monospace" }}>
              ${totalPrice?.toFixed(0)}
            </span>
          </div>
        </div>
      )}

      {/* ── Export ── */}
      <Section label="Exportar" icon={<Download style={{ width: 13, height: 13 }} />}>
        {isPro && (
          <div style={{ display: "flex", gap: 10, padding: "12px 14px" }}>
            <ExportBtn
              label="RGB"
              sublabel="PNG · Adobe RGB · 300 DPI"
              icon={<FileImage style={{ width: 18, height: 18 }} />}
              loading={exportingRgb}
              onClick={handleExportRgb}
              color="rgba(99,102,241,1)"
              bg="linear-gradient(135deg,rgba(99,102,241,0.2),rgba(79,82,221,0.12))"
              border="rgba(99,102,241,0.4)"
            />
            <ExportBtn
              label="CMYK"
              sublabel="PDF · FOGRA39 · 300 DPI"
              icon={<FileText style={{ width: 18, height: 18 }} />}
              loading={exportingCmyk}
              onClick={handleExportCmyk}
              color="rgba(16,185,129,1)"
              bg="linear-gradient(135deg,rgba(16,185,129,0.18),rgba(5,150,105,0.1))"
              border="rgba(16,185,129,0.35)"
            />
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 14,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 14px 6px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 6,
        background: "rgba(255,255,255,0.02)",
      }}>
        <span style={{ color: "rgba(167,139,250,0.6)" }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function DimInput({ label, value, onChange, onBlur, disabled }: { label: string; value: string; onChange: (v: string) => void; onBlur: () => void; disabled?: boolean }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        readOnly={disabled}
        style={{
          padding: "10px 10px", borderRadius: 10, fontSize: 16, fontWeight: 700, fontFamily: "monospace",
          background: disabled ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
          border: `1px solid ${disabled ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.12)"}`,
          color: disabled ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.9)",
          outline: "none", width: "100%",
          textAlign: "center",
          cursor: disabled ? "not-allowed" : undefined,
        }}
      />
    </div>
  );
}

function ExportBtn({
  label, sublabel, icon, loading, onClick, color, bg, border,
}: {
  label: string; sublabel: string; icon: React.ReactNode; loading: boolean; onClick: () => void;
  color: string; bg: string; border: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        flex: 1, padding: "14px 10px", borderRadius: 12, cursor: loading ? "default" : "pointer",
        background: bg, border: `1px solid ${border}`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        opacity: loading ? 0.7 : 1, transition: "all 0.2s",
      }}
    >
      <div style={{ color, opacity: loading ? 0.6 : 1 }}>
        {loading
          ? <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
          : icon
        }
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color, letterSpacing: "0.05em" }}>{label}</div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{sublabel}</div>
      </div>
    </button>
  );
}
