import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link } from "wouter";
import { toast } from "sonner";

const API_BASE = "/api";

interface AiConfig {
  // Detection
  remove_bg_mode: number;
  bg_dark_threshold: number;
  // Luma-key
  luma_diff_threshold: number;
  luma_erode_px: number;
  luma_dilate_px: number;
  luma_feather_px: number;
  // IS-Net
  isnet_max_px: number;
  isnet_post_process_mask: number;
  isnet_alpha_matting: number;
  isnet_alpha_matting_fg: number;
  isnet_alpha_matting_bg: number;
  isnet_alpha_matting_ero: number;
  isnet_erode_px: number;
  isnet_feather_px: number;
  isnet_binary_threshold: number;
  // Denoise
  denoise_d: number;
  denoise_sigma: number;
  // Sharpening
  sharpen_amount_fine: number;
  sharpen_sigma_fine: number;
  sharpen_amount_mid: number;
  sharpen_sigma_mid: number;
  // Color
  chroma_boost: number;
  contrast_l: number;
  vibrance_amount: number;
  clahe_enabled: number;
  clahe_clip_limit: number;
  // Alpha
  alpha_clean_threshold: number;
  alpha_erode_size: number;
  alpha_feather_sigma: number;
}

const DEFAULTS: AiConfig = {
  remove_bg_mode: 0,
  bg_dark_threshold: 40,
  luma_diff_threshold: 30,
  luma_erode_px: 0,
  luma_dilate_px: 0,
  luma_feather_px: 0,
  isnet_max_px: 512,
  isnet_post_process_mask: 1,
  isnet_alpha_matting: 0,
  isnet_alpha_matting_fg: 240,
  isnet_alpha_matting_bg: 10,
  isnet_alpha_matting_ero: 10,
  isnet_erode_px: 0,
  isnet_feather_px: 0,
  isnet_binary_threshold: 128,
  denoise_d: 5,
  denoise_sigma: 20,
  sharpen_amount_fine: 0.60,
  sharpen_sigma_fine: 0.45,
  sharpen_amount_mid: 0.30,
  sharpen_sigma_mid: 1.20,
  chroma_boost: 0.10,
  contrast_l: 0.04,
  vibrance_amount: 0.0,
  clahe_enabled: 0,
  clahe_clip_limit: 3.5,
  alpha_clean_threshold: 10,
  alpha_erode_size: 3,
  alpha_feather_sigma: 0.8,
};

type K = keyof AiConfig;

interface ParamDef {
  key: K;
  label: string;
  desc: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  integer?: boolean;
  toggle?: boolean; // renders as on/off toggle instead of slider
}

interface SelectDef {
  key: K;
  label: string;
  desc: string;
  options: { value: number; label: string; sub: string }[];
}

interface Section {
  id: string;
  title: string;
  icon: string;
  accent: string;
  selects?: SelectDef[];
  params?: ParamDef[];
}

const SECTIONS: Section[] = [
  {
    id: "detection",
    title: "Detección — Modo de remoción",
    icon: "🎯",
    accent: "#a855f7",
    selects: [
      {
        key: "remove_bg_mode",
        label: "Modo de remoción",
        desc: "Elige el algoritmo que se usará para eliminar el fondo. Automático es la opción recomendada para la mayoría de casos.",
        options: [
          { value: 0, label: "Automático", sub: "Detecta el tipo de fondo y elige el mejor método" },
          { value: 1, label: "Forzar Luma-key", sub: "Siempre usar keying por luminancia (ideal para fondos sólidos oscuros)" },
          { value: 2, label: "Forzar IS-Net", sub: "Siempre usar segmentación neuronal (más lento pero más preciso)" },
        ],
      },
    ],
    params: [
      {
        key: "bg_dark_threshold",
        label: "Umbral de brillo para fondo oscuro",
        desc: "Si el brillo máximo del borde es menor a este valor, se usa Luma-key automáticamente. Aumentar para clasificar más imágenes como 'fondo oscuro'.",
        min: 0, max: 150, step: 1, integer: true,
      },
    ],
  },
  {
    id: "luma",
    title: "Luma-key — Fondos sólidos/oscuros",
    icon: "🔑",
    accent: "#06b6d4",
    params: [
      {
        key: "luma_diff_threshold",
        label: "Umbral de diferencia de color",
        desc: "Diferencia mínima de cada canal (R, G o B) respecto al fondo para que el pixel sea opaco. Bajo = conserva más detalle. Alto = corte más agresivo.",
        min: 0, max: 120, step: 1, integer: true,
      },
      {
        key: "luma_erode_px",
        label: "Erosión de máscara (px)",
        desc: "Reduce la máscara en los bordes para eliminar píxeles sueltos. 0 = desactivado. Aumentar si quedan 'suciedad' en los bordes.",
        min: 0, max: 20, step: 1, integer: true, unit: "px",
      },
      {
        key: "luma_dilate_px",
        label: "Dilatación de máscara (px)",
        desc: "Expande la máscara hacia afuera. 0 = desactivado. Útil si el corte se come bordes de la imagen. Aplicar después de erosión si se combinan.",
        min: 0, max: 20, step: 1, integer: true, unit: "px",
      },
      {
        key: "luma_feather_px",
        label: "Desvanecimiento de borde (px)",
        desc: "Radio de desenfoque Gaussiano sobre el canal alpha antes de la binarización. Suaviza los bordes duros. 0 = borde duro (recomendado para DTF).",
        min: 0, max: 15, step: 1, integer: true, unit: "px",
      },
    ],
  },
  {
    id: "isnet",
    title: "IS-Net — Segmentación neuronal",
    icon: "🧠",
    accent: "#f59e0b",
    params: [
      {
        key: "isnet_max_px",
        label: "Resolución máxima de inferencia",
        desc: "Lado máximo en píxeles para la inferencia IS-Net. Mayor = mejor máscara pero más RAM y tiempo. Recomendado: 512 con waifu2x activo.",
        min: 128, max: 1024, step: 64, integer: true, unit: "px",
      },
      {
        key: "isnet_post_process_mask",
        label: "Post-procesado de máscara (rembg)",
        desc: "Activa la limpieza morfológica interna de rembg después de la inferencia. Normalmente mejora la calidad de bordes.",
        min: 0, max: 1, step: 1, toggle: true,
      },
      {
        key: "isnet_alpha_matting",
        label: "Alpha Matting (cabellos / pelo fino)",
        desc: "Activa alpha matting para preservar cabellos, pelaje y bordes muy finos. Aumenta el tiempo de procesado. Desactivado por defecto.",
        min: 0, max: 1, step: 1, toggle: true,
      },
      {
        key: "isnet_alpha_matting_fg",
        label: "Matting — Umbral de primer plano",
        desc: "Pixels con alpha > este valor se tratan como primer plano seguro en el trimap. Solo activo si Alpha Matting está activado.",
        min: 150, max: 255, step: 1, integer: true,
      },
      {
        key: "isnet_alpha_matting_bg",
        label: "Matting — Umbral de fondo",
        desc: "Pixels con alpha < este valor se tratan como fondo seguro en el trimap. Solo activo si Alpha Matting está activado.",
        min: 0, max: 50, step: 1, integer: true,
      },
      {
        key: "isnet_alpha_matting_ero",
        label: "Matting — Erosión del trimap (px)",
        desc: "Tamaño de erosión para generar la zona incierta del trimap. Valores más altos amplían la zona de transición.",
        min: 0, max: 40, step: 1, integer: true, unit: "px",
      },
      {
        key: "isnet_erode_px",
        label: "Erosión post-máscara (px)",
        desc: "Reduce la máscara IS-Net en los bordes. Elimina el halo semitransparente típico de segmentación neuronal. 0 = desactivado.",
        min: 0, max: 20, step: 1, integer: true, unit: "px",
      },
      {
        key: "isnet_feather_px",
        label: "Desvanecimiento post-máscara (px)",
        desc: "Suaviza el borde de la máscara IS-Net con desenfoque Gaussiano. 0 = borde binario duro (recomendado para DTF).",
        min: 0, max: 15, step: 1, integer: true, unit: "px",
      },
      {
        key: "isnet_binary_threshold",
        label: "Umbral de alpha binario",
        desc: "Pixels con alpha > este valor → 255 (opaco). Resto → 0 (transparente). Controla cuánto del borde semitransparente se conserva antes de binarizar.",
        min: 0, max: 255, step: 1, integer: true,
      },
    ],
  },
  {
    id: "denoise",
    title: "Upscaling — Pre-denoise bilateral",
    icon: "🌊",
    accent: "#10b981",
    params: [
      {
        key: "denoise_d",
        label: "Diámetro de vecindad (d)",
        desc: "Tamaño del área de muestreo del filtro bilateral. Valores impares: 3, 5, 7, 9. Mayor = más suavizado pero más lento.",
        min: 1, max: 15, step: 2, integer: true, unit: "px",
      },
      {
        key: "denoise_sigma",
        label: "Sigma (color y espacio)",
        desc: "Intensidad del filtro bilateral. Bajo (10–25): preserva texturas. Alto (>50): suavizado agresivo. waifu2x cunet ya aplica denoise propio.",
        min: 0, max: 100, step: 1, integer: true,
      },
    ],
  },
  {
    id: "sharpen",
    title: "Upscaling — Nitidez LAB (dos pasadas)",
    icon: "✨",
    accent: "#ef4444",
    params: [
      {
        key: "sharpen_amount_fine",
        label: "Pasada fina — Intensidad",
        desc: "Refuerzo de detalles de alta frecuencia (bordes finos, texturas). 0 = sin efecto. Valores altos pueden crear artefactos.",
        min: 0, max: 2.5, step: 0.01,
      },
      {
        key: "sharpen_sigma_fine",
        label: "Pasada fina — Sigma Gaussiano",
        desc: "Radio del desenfoque base para unsharp mask fino. Menor sigma = detalla pixels más pequeños. Recomendado: 0.35–0.55.",
        min: 0.1, max: 1.5, step: 0.01,
      },
      {
        key: "sharpen_amount_mid",
        label: "Pasada media — Intensidad",
        desc: "Refuerzo de frecuencias medias (silueta visible, contornos). Combina con la pasada fina para look impreso nítido.",
        min: 0, max: 2.5, step: 0.01,
      },
      {
        key: "sharpen_sigma_mid",
        label: "Pasada media — Sigma Gaussiano",
        desc: "Radio del desenfoque base para unsharp mask medio. Mayor sigma = afecta estructuras más grandes. Recomendado: 0.9–1.5.",
        min: 0.5, max: 3.0, step: 0.01,
      },
    ],
  },
  {
    id: "color",
    title: "Upscaling — Color y contraste",
    icon: "🎨",
    accent: "#f97316",
    params: [
      {
        key: "chroma_boost",
        label: "Saturación / Chroma (LAB)",
        desc: "Realce de saturación en espacio LAB. 0 = sin cambio. 0.10 = +10%. Opera en a*/b* — estable perceptualmente (no cambia el tono/hue).",
        min: 0, max: 0.8, step: 0.01,
      },
      {
        key: "contrast_l",
        label: "Contraste de luminancia (LAB)",
        desc: "Realce de contraste tonal en el canal L*. Valores altos pueden aplanar zonas lisas. Recomendado: 0.02–0.08.",
        min: 0, max: 0.3, step: 0.01,
      },
      {
        key: "vibrance_amount",
        label: "Vibrance (HSV)",
        desc: "Boost adicional de saturación en espacio HSV. 0 = desactivado. Se aplica después del boost de chroma. Útil para imágenes desaturadas.",
        min: 0, max: 0.6, step: 0.01,
      },
      {
        key: "clahe_enabled",
        label: "CLAHE — Contraste local adaptativo",
        desc: "Activa CLAHE sobre el canal L*. Mejora contraste en imágenes planas pero puede crear bandas en zonas sólidas DTF. Desactivado por defecto.",
        min: 0, max: 1, step: 1, toggle: true,
      },
      {
        key: "clahe_clip_limit",
        label: "CLAHE — Clip limit",
        desc: "Límite de amplificación de contraste local. Mayor = más agresivo. Rango típico: 1.5–5.0. Solo activo si CLAHE está activado.",
        min: 1.0, max: 8.0, step: 0.1,
      },
    ],
  },
  {
    id: "alpha",
    title: "Upscaling — Canal Alpha",
    icon: "🔲",
    accent: "#8b5cf6",
    params: [
      {
        key: "alpha_clean_threshold",
        label: "Umbral de binarización inicial",
        desc: "Threshold para separar alpha opaco/transparente antes de aplicar erosión y feather. Pixels > umbral = opacos.",
        min: 0, max: 50, step: 1, integer: true,
      },
      {
        key: "alpha_erode_size",
        label: "Tamaño de erosión (px)",
        desc: "Kernel de erosión elíptica sobre el canal alpha upscaleado. Elimina el halo de píxeles semi-transparentes que deja el upscale.",
        min: 1, max: 9, step: 2, integer: true, unit: "px",
      },
      {
        key: "alpha_feather_sigma",
        label: "Sigma de feathering",
        desc: "Desenfoque Gaussiano sobre el alpha erosionado para suavizar el borde final. Mayor = borde más suave.",
        min: 0.1, max: 3.0, step: 0.1,
      },
    ],
  },
];

function Toggle({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const on = value >= 1;
  return (
    <button
      className={`aicfg-toggle ${on ? "aicfg-toggle--on" : ""}`}
      onClick={() => onChange(on ? 0 : 1)}
      type="button"
    >
      <span className="aicfg-toggle-thumb" />
      <span className="aicfg-toggle-label">{on ? "ON" : "OFF"}</span>
    </button>
  );
}

function ModeSelect({ def, value, onChange }: { def: SelectDef; value: number; onChange: (k: K, v: number) => void }) {
  return (
    <div className="aicfg-param">
      <span className="aicfg-param-label">{def.label}</span>
      <div className="aicfg-mode-options">
        {def.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`aicfg-mode-btn ${value === opt.value ? "aicfg-mode-btn--active" : ""}`}
            onClick={() => onChange(def.key, opt.value)}
          >
            <span className="aicfg-mode-name">{opt.label}</span>
            <span className="aicfg-mode-sub">{opt.sub}</span>
          </button>
        ))}
      </div>
      <p className="aicfg-param-desc">{def.desc}</p>
    </div>
  );
}

function ParamRow({ def, value, onChange }: { def: ParamDef; value: number; onChange: (k: K, v: number) => void }) {
  const fmt = (v: number) => def.integer ? String(Math.round(v)) : v.toFixed(2);

  if (def.toggle) {
    return (
      <div className="aicfg-param">
        <div className="aicfg-param-header">
          <span className="aicfg-param-label">{def.label}</span>
          <Toggle value={value} onChange={(v) => onChange(def.key, v)} />
        </div>
        <p className="aicfg-param-desc">{def.desc}</p>
      </div>
    );
  }

  return (
    <div className="aicfg-param">
      <div className="aicfg-param-header">
        <span className="aicfg-param-label">{def.label}</span>
        <div className="aicfg-param-value-wrap">
          <input
            type="number"
            className="aicfg-param-input"
            value={fmt(value)}
            min={def.min}
            max={def.max}
            step={def.step}
            onChange={(e) => {
              const v = def.integer ? Math.round(parseFloat(e.target.value)) : parseFloat(e.target.value);
              if (!isNaN(v)) onChange(def.key, Math.min(def.max, Math.max(def.min, v)));
            }}
          />
          {def.unit && <span className="aicfg-param-unit">{def.unit}</span>}
        </div>
      </div>
      <input
        type="range"
        className="aicfg-slider"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => {
          const v = def.integer ? Math.round(parseFloat(e.target.value)) : parseFloat(e.target.value);
          onChange(def.key, v);
        }}
      />
      <p className="aicfg-param-desc">{def.desc}</p>
    </div>
  );
}

export default function AdminAI() {
  const { user, token, logout } = useAuth();
  const [cfg, setCfg] = useState<AiConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const fetchCfg = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/admin/ai-config`, { headers })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { setCfg({ ...DEFAULTS, ...data }); setDirty(false); })
      .catch((e) => setError("No se pudo conectar con el servidor AI. " + e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { fetchCfg(); }, [fetchCfg]);

  const update = (key: K, val: number) => {
    setCfg((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/admin/ai-config`, {
        method: "PATCH", headers, body: JSON.stringify(cfg),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setCfg({ ...DEFAULTS, ...data.config });
      setDirty(false);
      toast.success("Configuración de IA guardada");
    } catch (e) {
      toast.error("Error al guardar: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!user?.isAdmin) {
    return (
      <div className="adm-gate">
        <p>Acceso denegado.</p>
        <Link href="/">Volver</Link>
      </div>
    );
  }

  const activeS = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0];

  return (
    <div className="adm-root">
      <div className="adm-orb adm-orb1" />
      <div className="adm-orb adm-orb2" />

      <header className="jl-header">
        <div className="jl-header-brand">
          <div className="jl-header-pill">E707</div>
          <span className="jl-header-name">ERROR707 Studio</span>
        </div>
        <div className="jl-header-actions">
          <Link href="/admin" className="jl-admin-link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Panel
          </Link>
          <Link href="/admin/membresias" className="jl-admin-link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            Membresías
          </Link>
          <Link href="/admin/usuarios" className="jl-admin-link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>
            Usuarios
          </Link>
          <span className="jl-admin-link" style={{ cursor: "default", color: "#fff", background: "rgba(6,182,212,0.2)", borderColor: "rgba(6,182,212,0.5)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            IA
          </span>
          <Link href="/admin/asistente" className="jl-admin-link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><line x1="12" y1="2" x2="12" y2="4"/></svg>
            Asistente
          </Link>
          <Link href="/pliegos" className="jl-user-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Mis trabajos
          </Link>
          <button className="jl-logout-btn" onClick={logout}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Salir
          </button>
        </div>
      </header>

      <main className="adm-main" style={{ padding: "0 24px 48px" }}>
        {/* Page title */}
        <div className="adm-page-head" style={{ padding: "28px 0 20px" }}>
          <div>
            <h1 className="adm-title">Parámetros de IA</h1>
            <p className="adm-sub">
              Controla en tiempo real el comportamiento de la IA — los cambios aplican al instante sin reiniciar el servidor
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {dirty && <span className="aicfg-unsaved-badge">● Cambios sin guardar</span>}
            <button className="adm-btn-secondary" onClick={() => { setCfg(DEFAULTS); setDirty(true); }} disabled={saving}>
              Restablecer defaults
            </button>
            <button className="adm-btn-primary" onClick={save} disabled={saving || !dirty}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>

        {error && (
          <div className="adm-error" style={{ marginBottom: 20 }}>
            {error}
            <button onClick={fetchCfg} style={{ marginLeft: 12, textDecoration: "underline", background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 13 }}>
              Reintentar
            </button>
          </div>
        )}

        {loading ? (
          <div className="adm-loading"><span className="adm-spinner" />Conectando con servidor AI…</div>
        ) : (
          <div className="aicfg-layout">
            {/* Sidebar nav */}
            <nav className="aicfg-nav">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`aicfg-nav-item ${activeSection === s.id ? "aicfg-nav-item--active" : ""}`}
                  style={activeSection === s.id ? { borderLeftColor: s.accent, color: s.accent } as React.CSSProperties : {}}
                  onClick={() => setActiveSection(s.id)}
                >
                  <span className="aicfg-nav-icon">{s.icon}</span>
                  <span className="aicfg-nav-label">{s.title}</span>
                </button>
              ))}
            </nav>

            {/* Section content */}
            <div className="aicfg-content">
              <div className="aicfg-section-head">
                <span className="aicfg-section-icon-lg">{activeS.icon}</span>
                <div>
                  <h2 className="aicfg-section-title" style={{ color: activeS.accent }}>{activeS.title}</h2>
                </div>
              </div>

              <div className="aicfg-params-list">
                {activeS.selects?.map((sel) => (
                  <ModeSelect key={sel.key} def={sel} value={cfg[sel.key]} onChange={update} />
                ))}
                {activeS.params?.map((p) => (
                  <ParamRow key={p.key} def={p} value={cfg[p.key]} onChange={update} />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        /* ── Layout ──────────────────────────────────────────────────────── */
        .aicfg-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 768px) {
          .aicfg-layout { grid-template-columns: 1fr; }
        }

        /* ── Sidebar nav ─────────────────────────────────────────────────── */
        .aicfg-nav {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          position: sticky;
          top: 20px;
        }
        .aicfg-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 9px;
          background: none;
          border: none;
          border-left: 2px solid transparent;
          color: rgba(255,255,255,0.45);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
          width: 100%;
        }
        .aicfg-nav-item:hover {
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.8);
        }
        .aicfg-nav-item--active {
          background: rgba(255,255,255,0.07);
          font-weight: 700;
        }
        .aicfg-nav-icon { font-size: 16px; flex-shrink: 0; }
        .aicfg-nav-label { line-height: 1.3; }

        /* ── Content panel ───────────────────────────────────────────────── */
        .aicfg-content {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 28px 30px;
        }
        .aicfg-section-head {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 28px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .aicfg-section-icon-lg { font-size: 28px; }
        .aicfg-section-title {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: 0.01em;
          margin: 0;
        }

        /* ── Params ──────────────────────────────────────────────────────── */
        .aicfg-params-list {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .aicfg-param {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-bottom: 24px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .aicfg-param:last-child { border-bottom: none; padding-bottom: 0; }

        .aicfg-param-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .aicfg-param-label {
          font-size: 14px;
          font-weight: 700;
          color: #e5e7eb;
        }
        .aicfg-param-value-wrap {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
        }
        .aicfg-param-input {
          width: 78px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          color: #f9fafb;
          font-size: 13px;
          font-weight: 700;
          padding: 5px 9px;
          text-align: right;
          outline: none;
        }
        .aicfg-param-input:focus {
          border-color: rgba(168,85,247,0.6);
          box-shadow: 0 0 0 2px rgba(168,85,247,0.12);
        }
        .aicfg-param-unit { font-size: 12px; color: #6b7280; min-width: 20px; }
        .aicfg-param-desc { font-size: 12px; color: #6b7280; line-height: 1.55; margin: 0; }

        /* ── Slider ──────────────────────────────────────────────────────── */
        .aicfg-slider {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 5px; border-radius: 3px;
          background: rgba(255,255,255,0.12); outline: none; cursor: pointer;
        }
        .aicfg-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 18px; height: 18px; border-radius: 50%;
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          cursor: pointer; border: 2px solid #0f0c1a;
          box-shadow: 0 0 8px rgba(168,85,247,0.4);
          transition: transform 0.15s;
        }
        .aicfg-slider::-webkit-slider-thumb:hover { transform: scale(1.25); }
        .aicfg-slider::-moz-range-thumb {
          width: 18px; height: 18px; border-radius: 50%;
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          cursor: pointer; border: 2px solid #0f0c1a;
        }

        /* ── Toggle ──────────────────────────────────────────────────────── */
        .aicfg-toggle {
          display: flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 999px; padding: 4px 12px 4px 4px;
          cursor: pointer; transition: background 0.2s, border-color 0.2s;
          flex-shrink: 0;
        }
        .aicfg-toggle--on {
          background: rgba(34,197,94,0.15);
          border-color: rgba(34,197,94,0.35);
        }
        .aicfg-toggle-thumb {
          width: 20px; height: 20px; border-radius: 50%;
          background: rgba(255,255,255,0.25);
          transition: background 0.2s;
        }
        .aicfg-toggle--on .aicfg-toggle-thumb {
          background: #22c55e;
          box-shadow: 0 0 8px rgba(34,197,94,0.5);
        }
        .aicfg-toggle-label { font-size: 12px; font-weight: 700; color: #9ca3af; }
        .aicfg-toggle--on .aicfg-toggle-label { color: #86efac; }

        /* ── Mode selector ───────────────────────────────────────────────── */
        .aicfg-mode-options { display: flex; flex-direction: column; gap: 8px; }
        .aicfg-mode-btn {
          display: flex; flex-direction: column; gap: 2px;
          padding: 12px 16px; border-radius: 10px;
          background: rgba(255,255,255,0.04);
          border: 1.5px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.6); text-align: left; cursor: pointer;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .aicfg-mode-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.85); }
        .aicfg-mode-btn--active {
          background: rgba(168,85,247,0.15);
          border-color: rgba(168,85,247,0.45);
          color: #e9d5ff;
        }
        .aicfg-mode-name { font-size: 13.5px; font-weight: 700; }
        .aicfg-mode-sub { font-size: 12px; opacity: 0.65; }

        /* ── Badges & buttons ────────────────────────────────────────────── */
        .aicfg-unsaved-badge {
          font-size: 12px; color: #f59e0b;
          background: rgba(245,158,11,0.12);
          border: 1px solid rgba(245,158,11,0.3);
          border-radius: 20px; padding: 5px 13px; font-weight: 700;
        }
        .adm-btn-primary {
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          color: #fff; border: none; border-radius: 9px;
          padding: 9px 22px; font-size: 13.5px; font-weight: 700;
          cursor: pointer; transition: opacity 0.15s;
        }
        .adm-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .adm-btn-secondary {
          background: rgba(255,255,255,0.07); color: #d1d5db;
          border: 1px solid rgba(255,255,255,0.12); border-radius: 9px;
          padding: 9px 16px; font-size: 13.5px; font-weight: 600;
          cursor: pointer; transition: background 0.15s;
        }
        .adm-btn-secondary:hover { background: rgba(255,255,255,0.12); }
        .adm-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }

        @media (max-width: 640px) {
          .adm-page-head { flex-direction: column; align-items: flex-start; gap: 14px; }
          .aicfg-content { padding: 20px 18px; }
        }
      `}</style>
    </div>
  );
}
