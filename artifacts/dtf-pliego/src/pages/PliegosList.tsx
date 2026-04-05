import { useListPliegos, useCreatePliego, useDeletePliego, useUpdatePliego, getListPliegosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Trash2, FolderOpen, LogOut, Layers, Pencil, Check, X, Printer, Users, Crown, ChevronDown, Brain } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LogoMark } from "@/components/LogoMark";

/* ── Size presets ────────────────────────────────────────────────────────── */
const SIZE_PRESETS = [
  { id: "dtf58", label: "DTF 58 cm", w: 58, h: 100 },
  { id: "carta", label: "Carta (Letter)", w: 21.59, h: 27.94 },
  { id: "tabloide", label: "Tabloide (11×17)", w: 27.94, h: 43.18 },
  { id: "a4", label: "A4", w: 21, h: 29.7 },
  { id: "personalizado", label: "Personalizado", w: null, h: null },
] as const;

const DPI_OPTS = [72, 150, 300, 600];

/* ── New-trabajo modal ── */
function NewTrabajoModal({ onConfirm, onCancel, loading }: {
  onConfirm: (name: string, w: number, h: number, dpi: number, tipoPapel: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<typeof SIZE_PRESETS[number]["id"]>("dtf58");
  const [customW, setCustomW] = useState("58");
  const [customH, setCustomH] = useState("100");
  const [dpi, setDpi] = useState(300);
  const [customDpi, setCustomDpi] = useState("300");
  const [showCustomDpi, setShowCustomDpi] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const selectedPreset = SIZE_PRESETS.find(p => p.id === preset)!;
  const isCustom = preset === "personalizado";
  const finalW = isCustom ? parseFloat(customW) || 58 : selectedPreset.w!;
  const finalH = isCustom ? parseFloat(customH) || 100 : selectedPreset.h!;
  const finalDpi = showCustomDpi ? parseInt(customDpi) || 300 : dpi;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(
      name.trim() || `Trabajo ${new Date().toLocaleDateString("es-MX")}`,
      finalW, finalH, finalDpi, preset
    );
  };

  return (
    <div className="jl-overlay" onClick={onCancel}>
      <div className="jl-modal jl-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="jl-modal-accent" />
        <div className="jl-modal-logo">
          <span className="jl-modal-pro">Nuevo trabajo</span>
        </div>
        <h2 className="jl-modal-title">Configurar trabajo</h2>
        <p className="jl-modal-sub">Elige el tamaño y resolución del pliego.</p>

        <form className="jl-modal-form" onSubmit={handleSubmit}>
          {/* Name */}
          <div className="jl-field">
            <label className="jl-label">Nombre del trabajo</label>
            <div className="jl-input-wrap">
              <Printer className="jl-input-icon" size={16} />
              <input
                ref={inputRef}
                className="jl-input"
                placeholder={`Trabajo ${new Date().toLocaleDateString("es-MX")}`}
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Size presets */}
          <div className="jl-field">
            <label className="jl-label">Tamaño del pliego</label>
            <div className="jl-size-grid">
              {SIZE_PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`jl-size-btn ${preset === p.id ? "active" : ""}`}
                  onClick={() => setPreset(p.id)}
                  disabled={loading}
                >
                  <span className="jl-size-name">{p.label}</span>
                  {p.w !== null && (
                    <span className="jl-size-dims">{p.w}×{p.h} cm</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Custom size inputs */}
          {isCustom && (
            <div className="jl-field">
              <label className="jl-label">Dimensiones (cm)</label>
              <div className="jl-dims-row">
                <div className="jl-input-wrap jl-dims-input">
                  <input
                    className="jl-input"
                    type="number"
                    min="1"
                    max="200"
                    step="0.1"
                    placeholder="Ancho"
                    value={customW}
                    onChange={e => setCustomW(e.target.value)}
                    disabled={loading}
                  />
                  <span className="jl-dims-unit">cm</span>
                </div>
                <span className="jl-dims-x">×</span>
                <div className="jl-input-wrap jl-dims-input">
                  <input
                    className="jl-input"
                    type="number"
                    min="1"
                    max="300"
                    step="0.1"
                    placeholder="Alto"
                    value={customH}
                    onChange={e => setCustomH(e.target.value)}
                    disabled={loading}
                  />
                  <span className="jl-dims-unit">cm</span>
                </div>
              </div>
            </div>
          )}

          {/* DPI */}
          <div className="jl-field">
            <label className="jl-label">Resolución (DPI)</label>
            <div className="jl-dpi-row">
              {DPI_OPTS.map(d => (
                <button
                  key={d}
                  type="button"
                  className={`jl-dpi-btn ${!showCustomDpi && dpi === d ? "active" : ""}`}
                  onClick={() => { setDpi(d); setShowCustomDpi(false); }}
                  disabled={loading}
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                className={`jl-dpi-btn ${showCustomDpi ? "active" : ""}`}
                onClick={() => setShowCustomDpi(!showCustomDpi)}
                disabled={loading}
              >
                Otro
              </button>
            </div>
            {showCustomDpi && (
              <div className="jl-input-wrap" style={{ marginTop: 8 }}>
                <input
                  className="jl-input"
                  type="number"
                  min="72"
                  max="1200"
                  step="1"
                  placeholder="Ej. 400"
                  value={customDpi}
                  onChange={e => setCustomDpi(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="jl-size-preview">
            <span className="jl-size-preview-label">Configuración:</span>
            <span className="jl-size-preview-val">{finalW}×{finalH} cm · {finalDpi} DPI</span>
          </div>

          <div className="jl-modal-actions">
            <button type="button" className="jl-btn-cancel" onClick={onCancel} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="jl-btn-create" disabled={loading}>
              {loading
                ? <span className="jl-spinner" />
                : <><Plus size={16} />Crear trabajo</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Inline rename for a card ── */
function InlineRename({ name, onSave, onCancel }: {
  name: string;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div className="jl-rename-row">
      <input
        ref={ref}
        className="jl-rename-input"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") onSave(val.trim() || name);
          if (e.key === "Escape") onCancel();
        }}
      />
      <button className="jl-rename-btn ok" onClick={() => onSave(val.trim() || name)} title="Guardar"><Check size={14} /></button>
      <button className="jl-rename-btn cancel" onClick={onCancel} title="Cancelar"><X size={14} /></button>
    </div>
  );
}

/* ── Thumbnail preview ── */
function CardThumb({ thumbnailDataUrl, dims }: { thumbnailDataUrl?: string | null; dims: string }) {
  if (thumbnailDataUrl) {
    return (
      <div className="jl-card-preview">
        <img src={thumbnailDataUrl} alt="Vista previa" className="jl-card-preview-img" />
      </div>
    );
  }
  return (
    <div className="jl-card-preview jl-card-preview--empty">
      <Printer size={28} className="jl-card-preview-icon" />
      <span className="jl-card-preview-dims">{dims}</span>
    </div>
  );
}

export default function PliegosList() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const { data: pliegos, isLoading } = useListPliegos();
  const createPliego = useCreatePliego();
  const deletePliego = useDeletePliego();
  const updatePliego = useUpdatePliego();

  const [showModal, setShowModal] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);

  // Show success toast if redirected from Stripe
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("subscribed") === "1") {
      // Clear param
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [search]);

  const handleCreate = (name: string, w: number, h: number, dpi: number, tipoPapel?: string) => {
    createPliego.mutate(
      {
        data: {
          name,
          tipoPapel,
          widthCm: w,
          heightCm: h,
          dpi,
          pricePerMeter: 3500,
        },
      },
      {
        onSuccess: (newPliego) => {
          // Optimistically add to cache so Home.tsx validity check passes immediately
          queryClient.setQueryData(
            getListPliegosQueryKey(),
            (old: any[] | undefined) => (old ? [...old, newPliego] : [newPliego])
          );
          queryClient.invalidateQueries({ queryKey: getListPliegosQueryKey() });
          setShowModal(false);
          setLocation(`/?pliegoId=${newPliego.id}`);
        },
      }
    );
  };

  const handleDelete = (id: number, name: string) => {
    if (confirm(`¿Eliminar el trabajo "${name}"? Esta acción no se puede deshacer.`)) {
      deletePliego.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPliegosQueryKey() }),
      });
    }
  };

  const handleRename = (id: number, newName: string) => {
    updatePliego.mutate(
      { id, data: { name: newName } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPliegosQueryKey() }) }
    );
    setRenamingId(null);
  };

  const isPro = user?.plan === "pro";

  return (
    <div className="jl-root">
      {/* Orbs */}
      <div className="jl-orb jl-orb1" />
      <div className="jl-orb jl-orb2" />

      {/* Header */}
      <header className="jl-header">
        <LogoMark size="sm" />
        <div className="jl-header-actions">
          {user?.isAdmin && (
            <button className="jl-admin-link" onClick={() => setLocation("/admin/usuarios")} title="Administrar usuarios">
              <Users size={13} />
              <span>Administrar usuarios</span>
            </button>
          )}
          {user?.isAdmin && (
            <button className="jl-admin-link jl-admin-link--ai" onClick={() => setLocation("/admin/ia")} title="Parámetros de IA">
              <Brain size={13} />
              <span>IA</span>
            </button>
          )}
          {!isPro && (
            <button className="jl-pro-link" onClick={() => setLocation("/pro")} title="Ver plan Pro">
              <Crown size={13} />
              <span>Ir a Pro</span>
            </button>
          )}
          {isPro && (
            <span className="jl-pro-badge">
              <Crown size={11} />Pro
            </span>
          )}
          <button className="jl-user-badge" onClick={() => setLocation("/perfil")} title="Ver mi perfil">
            <span className="jl-user-dot" />
            {user?.displayName || user?.username}
          </button>
          <button className="jl-logout-btn" onClick={logout} title="Cerrar sesión">
            <LogOut size={14} />
            <span>Salir</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="jl-main">
        {/* Page headline */}
        <div className="jl-page-head">
          <div className="jl-page-title-wrap">
            <div className="jl-page-icon-wrap">
              <FolderOpen size={22} />
            </div>
            <div>
              <h1 className="jl-page-title">Mis Trabajos</h1>
              <p className="jl-page-sub">Diseña, maqueta y exporta tus archivos DTF.</p>
            </div>
          </div>
          <button className="jl-new-btn" onClick={() => setShowModal(true)}>
            <Plus size={18} />
            Nuevo trabajo
          </button>
        </div>

        {/* Stats bar */}
        {!!pliegos?.length && (
          <div className="jl-stats">
            <div className="jl-stat">
              <span className="jl-stat-num">{pliegos.length}</span>
              <span className="jl-stat-lbl">trabajos</span>
            </div>
            <div className="jl-stat-sep" />
            <div className="jl-stat">
              <span className="jl-stat-num">{isPro ? "Pro" : "Gratis"}</span>
              <span className="jl-stat-lbl">plan</span>
            </div>
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="jl-grid">
            {[1, 2, 3].map(i => (
              <div key={i} className="jl-card jl-card-skeleton" />
            ))}
          </div>
        ) : !pliegos?.length ? (
          <div className="jl-empty">
            <div className="jl-empty-icon-wrap">
              <Layers size={36} />
            </div>
            <h3 className="jl-empty-title">Todavía no hay trabajos</h3>
            <p className="jl-empty-sub">Crea tu primer trabajo para comenzar a maquetar.</p>
            <button className="jl-new-btn" onClick={() => setShowModal(true)}>
              <Plus size={16} />
              Crear primer trabajo
            </button>
          </div>
        ) : (
          <div className="jl-grid">
            {pliegos.map((pliego, idx) => (
              <div key={pliego.id} className="jl-card" style={{ animationDelay: `${idx * 0.06}s` }}>
                <CardThumb
                  thumbnailDataUrl={(pliego as any).thumbnailDataUrl}
                  dims={`${pliego.widthCm}×${pliego.heightCm} cm`}
                />
                <div className="jl-card-meta-row">
                  <span className="jl-card-dims">{pliego.widthCm}×{pliego.heightCm} cm</span>
                  <span className="jl-card-dpi">{pliego.dpi} DPI</span>
                </div>

                <div className="jl-card-body">
                  {renamingId === pliego.id ? (
                    <InlineRename
                      name={pliego.name}
                      onSave={v => handleRename(pliego.id, v)}
                      onCancel={() => setRenamingId(null)}
                    />
                  ) : (
                    <div className="jl-card-name-row">
                      <span className="jl-card-name">{pliego.name}</span>
                      <button
                        className="jl-icon-btn rename"
                        onClick={() => setRenamingId(pliego.id)}
                        title="Renombrar"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  )}
                  <span className="jl-card-date">
                    {format(new Date(pliego.createdAt), "d MMM yyyy · HH:mm", { locale: es })}
                  </span>
                </div>

                <div className="jl-card-footer">
                  <button
                    className="jl-open-btn"
                    onClick={() => setLocation(`/?pliegoId=${pliego.id}`)}
                  >
                    <FolderOpen size={14} />
                    Abrir
                  </button>
                  <button
                    className="jl-icon-btn delete"
                    onClick={() => handleDelete(pliego.id, pliego.name)}
                    title="Eliminar trabajo"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New-trabajo modal */}
      {showModal && (
        <NewTrabajoModal
          loading={createPliego.isPending}
          onConfirm={handleCreate}
          onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
