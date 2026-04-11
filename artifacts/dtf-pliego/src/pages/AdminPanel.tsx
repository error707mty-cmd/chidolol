import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link } from "wouter";
import { LogoMark } from "@/components/LogoMark";
import { LayoutDashboard, CreditCard, Users, Brain, Bot, ChevronLeft, LogOut, ShoppingCart } from "lucide-react";

interface UserEntry {
  id: number;
  username: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  isActive: boolean;
  createdAt: string;
}

const API_BASE = "/api";

export default function AdminPanel() {
  const { user, token, logout } = useAuth();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const fetchUsers = () => {
    setLoading(true);
    fetch(`${API_BASE}/admin/users`, { headers })
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => setError("Error al cargar usuarios"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const patch = async (id: number, body: Partial<{ isAdmin: boolean; isActive: boolean }>) => {
    setPending(id);
    await fetch(`${API_BASE}/admin/users/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    setPending(null);
    fetchUsers();
  };

  const deleteUser = async (id: number) => {
    setPending(id);
    await fetch(`${API_BASE}/admin/users/${id}`, { method: "DELETE", headers });
    setPending(null);
    setDeleteConfirm(null);
    fetchUsers();
  };

  if (!user?.isAdmin) {
    return (
      <div className="adm-gate">
        <p>Acceso denegado.</p>
        <Link href="/">Volver</Link>
      </div>
    );
  }

  return (
    <div className="adm-root">
      <div className="adm-orb adm-orb1" />
      <div className="adm-orb adm-orb2" />

      <header className="jl-header">
        <LogoMark size="sm" />
        <div className="jl-header-actions">
          <span className="jl-admin-link" style={{ cursor: "default", color: "#fff", background: "rgba(124,58,237,0.25)", borderColor: "rgba(167,139,250,0.5)" }}>
            <LayoutDashboard size={13} />
            Panel
          </span>
          <Link href="/admin/membresias" className="jl-admin-link">
            <CreditCard size={13} />
            Membresías
          </Link>
          <Link href="/admin/usuarios" className="jl-admin-link">
            <Users size={13} />
            Usuarios
          </Link>
          <Link href="/admin/pos" className="jl-admin-link" style={{ background: "rgba(34,197,94,0.15)", borderColor: "rgba(74,222,128,0.4)" }}>
            <ShoppingCart size={13} />
            POS
          </Link>
          <Link href="/admin/ia" className="jl-admin-link jl-admin-link--ai">
            <Brain size={13} />
            IA
          </Link>
          <Link href="/admin/asistente" className="jl-admin-link">
            <Bot size={13} />
            Asistente
          </Link>
          <Link href="/pliegos" className="jl-user-badge">
            <ChevronLeft size={13} />
            Mis trabajos
          </Link>
          <button className="jl-logout-btn" onClick={logout}>
            <LogOut size={14} />
            <span>Salir</span>
          </button>
        </div>
      </header>

      <main className="adm-main">
        <div className="adm-page-head">
          <div>
            <h1 className="adm-title">Gestión de usuarios</h1>
            <p className="adm-sub">Administra acceso, roles y privacidad de todos los usuarios</p>
          </div>
          <div className="adm-badge">
            <span className="adm-badge-dot" />
            {users.length} usuarios
          </div>
        </div>

        {error && (
          <div className="adm-error">{error}</div>
        )}

        {loading ? (
          <div className="adm-loading">
            <span className="adm-spinner" />
            Cargando usuarios...
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Correo</th>
                  <th>Creado</th>
                  <th>Estado</th>
                  <th>Rol</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === 0 || u.username === user.username;
                  const isBusy = pending === u.id;
                  return (
                    <tr key={u.id} className={`adm-row${!u.isActive ? " adm-row--inactive" : ""}`}>
                      <td className="adm-cell-user">
                        <div className="adm-avatar" style={{ background: u.isAdmin ? "linear-gradient(135deg,#7c3aed,#a855f7)" : "linear-gradient(135deg,#374151,#4b5563)" }}>
                          {(u.displayName || u.username).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="adm-uname">{u.username}</div>
                          {u.displayName && u.displayName !== u.username && (
                            <div className="adm-dname">{u.displayName}</div>
                          )}
                        </div>
                      </td>
                      <td className="adm-cell-email">{u.email ?? <span className="adm-empty">—</span>}</td>
                      <td className="adm-cell-date">
                        {new Date(u.createdAt).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" })}
                      </td>
                      <td>
                        <span className={`adm-pill ${u.isActive ? "adm-pill--active" : "adm-pill--inactive"}`}>
                          {u.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        <span className={`adm-pill ${u.isAdmin ? "adm-pill--admin" : "adm-pill--user"}`}>
                          {u.isAdmin ? "Admin" : "Usuario"}
                        </span>
                      </td>
                      <td>
                        {isSelf ? (
                          <span className="adm-self-label">Tu cuenta</span>
                        ) : (
                          <div className="adm-actions">
                            <button
                              className={`adm-action-btn ${u.isActive ? "adm-action-btn--warn" : "adm-action-btn--ok"}`}
                              onClick={() => patch(u.id, { isActive: !u.isActive })}
                              disabled={isBusy}
                              title={u.isActive ? "Desactivar cuenta" : "Activar cuenta"}
                            >
                              {isBusy ? "..." : u.isActive ? "Desactivar" : "Activar"}
                            </button>
                            {!u.isAdmin && (
                              <button
                                className="adm-action-btn adm-action-btn--promote"
                                onClick={() => patch(u.id, { isAdmin: true })}
                                disabled={isBusy}
                                title="Promover a administrador"
                              >
                                Promover
                              </button>
                            )}
                            {u.isAdmin && !isSelf && (
                              <button
                                className="adm-action-btn adm-action-btn--demote"
                                onClick={() => patch(u.id, { isAdmin: false })}
                                disabled={isBusy}
                                title="Quitar rol admin"
                              >
                                Quitar admin
                              </button>
                            )}
                            {deleteConfirm === u.id ? (
                              <>
                                <button
                                  className="adm-action-btn adm-action-btn--danger"
                                  onClick={() => deleteUser(u.id)}
                                  disabled={isBusy}
                                >
                                  ¿Confirmar?
                                </button>
                                <button
                                  className="adm-action-btn adm-action-btn--cancel"
                                  onClick={() => setDeleteConfirm(null)}
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <button
                                className="adm-action-btn adm-action-btn--delete"
                                onClick={() => setDeleteConfirm(u.id)}
                                title="Eliminar usuario"
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="adm-privacy-note">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L1.5 3.5v4C1.5 10.5 4 12.5 7 13c3-0.5 5.5-2.5 5.5-5.5v-4L7 1z" stroke="#a78bfa" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M5 7l1.5 1.5L9 5.5" stroke="#a78bfa" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Los datos de cada usuario son privados. Solo puedes gestionar el acceso y roles, nunca ver su contenido.
        </div>
      </main>
    </div>
  );
}
