import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";
import { LogoMark } from "@/components/LogoMark";
import {
  Users, ChevronLeft, Trash2, Edit2, Check, X, Shield, ShieldOff,
  ToggleLeft, ToggleRight, Crown, User, Search, KeyRound,
} from "lucide-react";

interface UserEntry {
  id: number;
  username: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  isActive: boolean;
  plan: string;
  emailVerified: boolean;
  createdAt: string;
}

const API_BASE = "/api";

function useAdminFetch(token: string | null) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const get = (path: string) => fetch(`${API_BASE}${path}`, { headers }).then(r => {
    if (!r.ok) return r.json().then(d => Promise.reject(d));
    return r.json();
  });

  const patch = (path: string, body: object) => fetch(`${API_BASE}${path}`, {
    method: "PATCH", headers, body: JSON.stringify(body),
  }).then(r => {
    if (!r.ok) return r.json().then(d => Promise.reject(d));
    return r.json();
  });

  const del = (path: string) => fetch(`${API_BASE}${path}`, {
    method: "DELETE", headers,
  }).then(r => {
    if (!r.ok) return r.json().then(d => Promise.reject(d));
    return r.json();
  });

  return { get, patch, del };
}

function EditUserModal({
  user: u,
  onSave,
  onClose,
  loading,
  error,
}: {
  user: UserEntry;
  onSave: (data: Partial<UserEntry> & { password?: string }) => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [displayName, setDisplayName] = useState(u.displayName ?? "");
  const [email, setEmail] = useState(u.email ?? "");
  const [password, setPassword] = useState("");

  return (
    <div className="au-overlay" onClick={onClose}>
      <div className="au-modal" onClick={e => e.stopPropagation()}>
        <div className="au-modal-accent" />
        <div className="au-modal-header">
          <div className="au-modal-icon"><Edit2 size={18} /></div>
          <div>
            <p className="au-modal-title">Editar usuario</p>
            <p className="au-modal-sub">@{u.username}</p>
          </div>
        </div>

        <div className="au-fields">
          <div className="au-field">
            <label className="au-label">Nombre visible</label>
            <input
              className="au-input"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Nombre completo"
            />
          </div>
          <div className="au-field">
            <label className="au-label">Correo electrónico</label>
            <input
              className="au-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
            />
          </div>
          <div className="au-field">
            <label className="au-label">Nueva contraseña <span className="au-optional">(opcional)</span></label>
            <div className="au-input-wrap">
              <KeyRound size={14} className="au-input-icon" />
              <input
                className="au-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
          </div>
        </div>

        {error && <p className="au-error">{error}</p>}

        <div className="au-modal-actions">
          <button className="au-btn-cancel" onClick={onClose} disabled={loading}>Cancelar</button>
          <button
            className="au-btn-save"
            disabled={loading}
            onClick={() => onSave({
              displayName: displayName.trim() || undefined,
              email: email.trim() || undefined,
              ...(password.length >= 6 ? { password } : {}),
            })}
          >
            {loading ? <span className="jl-spinner" /> : <><Check size={14} />Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const [, setLocation] = useLocation();
  const { user, token, logout } = useAuth();
  const { get, patch, del } = useAdminFetch(token);

  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [editingUser, setEditingUser] = useState<UserEntry | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isAdmin = !!user?.isAdmin;

  const fetchUsers = () => {
    setLoading(true);
    get("/admin/users")
      .then(setUsers)
      .catch(() => setError("Error al cargar usuarios"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isAdmin) { setLocation("/"); return; }
    fetchUsers();
  }, [isAdmin]);

  const update = async (id: number, body: object) => {
    setPending(id);
    try {
      const updated = await patch(`/admin/users/${id}`, body);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updated } : u));
    } catch (e: any) {
      alert(e?.error ?? "Error al actualizar usuario");
    } finally {
      setPending(null);
    }
  };

  const handleDelete = async (id: number) => {
    setPending(id);
    try {
      await del(`/admin/users/${id}`);
      setUsers(prev => prev.filter(u => u.id !== id));
      setDeleteConfirm(null);
    } catch (e: any) {
      alert(e?.error ?? "Error al eliminar usuario");
    } finally {
      setPending(null);
    }
  };

  const handleEdit = async (data: Partial<UserEntry> & { password?: string }) => {
    if (!editingUser) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const updated = await patch(`/admin/users/${editingUser.id}`, data);
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...updated } : u));
      setEditingUser(null);
    } catch (e: any) {
      setEditError(e?.error ?? "Error al guardar cambios");
    } finally {
      setEditLoading(false);
    }
  };

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.displayName?.toLowerCase().includes(search.toLowerCase())) ||
    (u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="au-root">
      <div className="jl-orb jl-orb1" />
      <div className="jl-orb jl-orb2" />

      <header className="jl-header">
        <LogoMark size="sm" />
        <div className="jl-header-actions">
          <button className="jl-admin-link" onClick={() => setLocation("/admin")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Panel
          </button>
          <button className="jl-admin-link" onClick={() => setLocation("/admin/membresias")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            Membresías
          </button>
          <span className="jl-admin-link" style={{ cursor: "default", color: "#fff", background: "rgba(124,58,237,0.25)", borderColor: "rgba(167,139,250,0.5)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>
            Usuarios
          </span>
          <button className="jl-admin-link jl-admin-link--ai" onClick={() => setLocation("/admin/ia")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            IA
          </button>
          <button className="jl-admin-link" onClick={() => setLocation("/admin/asistente")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
            Asistente
          </button>
          <button className="jl-user-badge" onClick={() => setLocation("/pliegos")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Mis trabajos
          </button>
          <button className="jl-logout-btn" onClick={logout}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Salir
          </button>
        </div>
      </header>

      <main className="au-main">
        <div className="au-page-head">
          <div className="au-page-title-wrap">
            <div className="au-page-icon"><Users size={22} /></div>
            <div>
              <h1 className="au-page-title">Administrar Usuarios</h1>
              <p className="au-page-sub">Control total sobre las cuentas del sistema</p>
            </div>
          </div>

          <div className="au-search-wrap">
            <Search size={14} className="au-search-icon" />
            <input
              ref={searchRef}
              className="au-search"
              placeholder="Buscar usuario..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="au-stats">
          <div className="au-stat"><span className="au-stat-num">{users.length}</span><span className="au-stat-lbl">total</span></div>
          <div className="au-stat-sep" />
          <div className="au-stat"><span className="au-stat-num">{users.filter(u => u.plan === "pro").length}</span><span className="au-stat-lbl">pro</span></div>
          <div className="au-stat-sep" />
          <div className="au-stat"><span className="au-stat-num">{users.filter(u => u.isAdmin).length}</span><span className="au-stat-lbl">admins</span></div>
          <div className="au-stat-sep" />
          <div className="au-stat"><span className="au-stat-num">{users.filter(u => !u.isActive).length}</span><span className="au-stat-lbl">inactivos</span></div>
        </div>

        {loading ? (
          <div className="au-loading"><span className="jl-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /></div>
        ) : error ? (
          <div className="au-error-banner">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="au-empty">
            <Users size={36} className="au-empty-icon" />
            <p>No se encontraron usuarios</p>
          </div>
        ) : (
          <div className="au-table-wrap">
            <table className="au-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Plan</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Registro</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const isSelf = u.id === user.id;
                  const busy = pending === u.id;
                  return (
                    <tr key={u.id} className={`au-row ${!u.isActive ? "au-row--inactive" : ""} ${isSelf ? "au-row--self" : ""}`}>
                      <td className="au-cell-user">
                        <div className="au-avatar">{(u.displayName || u.username).charAt(0).toUpperCase()}</div>
                        <div className="au-cell-names">
                          <span className="au-cell-display">{u.displayName || u.username}</span>
                          <span className="au-cell-username">@{u.username}</span>
                          {u.email && <span className="au-cell-email">{u.email}</span>}
                        </div>
                        {isSelf && <span className="au-self-badge">Tú</span>}
                      </td>

                      <td>
                        <button
                          className={`au-plan-btn ${u.plan === "pro" ? "au-plan-btn--pro" : "au-plan-btn--client"}`}
                          disabled={busy}
                          onClick={() => update(u.id, { plan: u.plan === "pro" ? "client" : "pro" })}
                          title={`Cambiar a ${u.plan === "pro" ? "Client" : "Pro"}`}
                        >
                          {u.plan === "pro" ? <Crown size={12} /> : <User size={12} />}
                          {u.plan === "pro" ? "Pro" : "Gratis"}
                        </button>
                      </td>

                      <td>
                        <button
                          className={`au-role-btn ${u.isAdmin ? "au-role-btn--admin" : "au-role-btn--user"}`}
                          disabled={busy || isSelf}
                          onClick={() => update(u.id, { isAdmin: !u.isAdmin })}
                          title={u.isAdmin ? "Quitar administrador" : "Hacer administrador"}
                        >
                          {u.isAdmin ? <Shield size={12} /> : <ShieldOff size={12} />}
                          {u.isAdmin ? "Admin" : "Usuario"}
                        </button>
                      </td>

                      <td>
                        <button
                          className={`au-status-btn ${u.isActive ? "au-status-btn--active" : "au-status-btn--inactive"}`}
                          disabled={busy || isSelf}
                          onClick={() => update(u.id, { isActive: !u.isActive })}
                          title={u.isActive ? "Desactivar cuenta" : "Activar cuenta"}
                        >
                          {u.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                          {u.isActive ? "Activo" : "Inactivo"}
                        </button>
                      </td>

                      <td className="au-cell-date">
                        {new Date(u.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>

                      <td className="au-cell-actions">
                        <button
                          className="au-action-btn au-action-btn--edit"
                          disabled={busy}
                          onClick={() => { setEditingUser(u); setEditError(null); }}
                          title="Editar usuario"
                        >
                          <Edit2 size={13} />
                        </button>

                        {deleteConfirm === u.id ? (
                          <div className="au-delete-confirm">
                            <span>¿Eliminar?</span>
                            <button className="au-del-yes" disabled={busy} onClick={() => handleDelete(u.id)}>
                              {busy ? <span className="jl-spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> : <Check size={12} />}
                            </button>
                            <button className="au-del-no" onClick={() => setDeleteConfirm(null)}><X size={12} /></button>
                          </div>
                        ) : (
                          <button
                            className="au-action-btn au-action-btn--delete"
                            disabled={busy || isSelf}
                            onClick={() => setDeleteConfirm(u.id)}
                            title="Eliminar usuario"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onSave={handleEdit}
          onClose={() => setEditingUser(null)}
          loading={editLoading}
          error={editError}
        />
      )}
    </div>
  );
}
