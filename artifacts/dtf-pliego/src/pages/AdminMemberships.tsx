import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link } from "wouter";
import {
  Crown, Users, TrendingUp, CreditCard, RefreshCw, ChevronLeft,
  CheckCircle, XCircle, Clock, AlertCircle, ExternalLink, HardDrive, Trash2,
} from "lucide-react";

const API = "/api";

const TIERS = [
  { key: "month1", label: "1 mes",   amount: 169,  months: 1  },
  { key: "month3", label: "3 meses", amount: 389,  months: 3  },
  { key: "month6", label: "6 meses", amount: 699,  months: 6  },
  { key: "year",   label: "1 año",   amount: 1199, months: 12 },
];

interface MemberUser {
  id: number;
  username: string;
  email: string | null;
  displayName: string | null;
  plan: string;
  isActive: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
}

interface StripeSub {
  id: string;
  customer: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  price_id: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: string; interval_count: number } | null;
}

function statusColor(s: string) {
  if (s === "active" || s === "trialing") return "#22c55e";
  if (s === "past_due" || s === "unpaid") return "#f97316";
  if (s === "canceled" || s === "incomplete_expired") return "#ef4444";
  return "#94a3b8";
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    active: "Activa",
    trialing: "Prueba",
    past_due: "Vencida",
    unpaid: "Sin pagar",
    canceled: "Cancelada",
    incomplete: "Incompleta",
    incomplete_expired: "Expirada",
    paused: "Pausada",
  };
  return map[s] ?? s;
}

function fmtDate(ts: number | string) {
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
}

function fmtMoney(cents: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export default function AdminMemberships() {
  const { user, token, logout } = useAuth();
  const [users, setUsers] = useState<MemberUser[]>([]);
  const [subs, setSubs] = useState<StripeSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<number | null>(null);
  const [planFilter, setPlanFilter] = useState<"all" | "pro" | "client">("all");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [storage, setStorage] = useState<{ dbRecords: number; dbBytes: number; diskFiles: number; diskBytes: number } | null>(null);
  const [purging, setPurging] = useState(false);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`${API}/admin/memberships`, { headers })
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users ?? []);
        setSubs(data.subscriptions ?? []);
      })
      .catch(() => showToast("Error al cargar datos", false))
      .finally(() => setLoading(false));
    fetch(`${API}/admin/storage`, { headers })
      .then((r) => r.json())
      .then(setStorage)
      .catch(() => {});
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const purgeStorage = async () => {
    setPurging(true);
    try {
      const r = await fetch(`${API}/admin/storage/purge`, { method: "POST", headers });
      const d = await r.json();
      showToast(`Limpieza: ${d.removedFiles} archivos disco, ${d.removedDbRecords} registros DB eliminados`);
      const s = await fetch(`${API}/admin/storage`, { headers });
      setStorage(await s.json());
    } catch {
      showToast("Error al purgar almacenamiento", false);
    } finally {
      setPurging(false);
    }
  };

  function fmtBytes(b: number) {
    if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
    if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    return `${(b / 1e3).toFixed(0)} KB`;
  }

  const changePlan = async (id: number, plan: string) => {
    setPending(id);
    try {
      const r = await fetch(`${API}/admin/users/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ plan }),
      });
      if (!r.ok) { const d = await r.json(); showToast(d.error ?? "Error", false); return; }
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, plan } : u)));
      showToast(`Plan actualizado a ${plan === "pro" ? "PRO" : "Client"}`);
    } finally {
      setPending(null);
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

  const proUsers = users.filter((u) => u.plan === "pro");
  const clientUsers = users.filter((u) => u.plan === "client");
  const activeStripe = subs.filter((s) => s.status === "active" || s.status === "trialing");
  const monthlyRevEst = activeStripe.reduce((acc, s) => {
    const amt = s.unit_amount ?? 0;
    const interval = s.recurring?.interval ?? "month";
    const count = s.recurring?.interval_count ?? 1;
    const months = interval === "year" ? 12 * count : count;
    return acc + amt / months;
  }, 0);

  const filtered = users.filter((u) => planFilter === "all" || u.plan === planFilter);

  return (
    <div className="adm-root">
      <div className="adm-orb adm-orb1" />
      <div className="adm-orb adm-orb2" />

      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
          border: `1px solid ${toast.ok ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
          color: toast.ok ? "#86efac" : "#fca5a5",
          padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600,
          backdropFilter: "blur(12px)", display: "flex", alignItems: "center", gap: 8,
        }}>
          {toast.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header — estilo pill igual que PliegosList */}
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
          <span className="jl-admin-link" style={{ cursor: "default", color: "#fff", background: "rgba(124,58,237,0.25)", borderColor: "rgba(167,139,250,0.5)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            Membresías
          </span>
          <Link href="/admin/usuarios" className="jl-admin-link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>
            Usuarios
          </Link>
          <Link href="/admin/ia" className="jl-admin-link jl-admin-link--ai">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            IA
          </Link>
          <Link href="/admin/asistente" className="jl-admin-link">
            🤖 Asistente
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

      <main className="adm-main">

        <div className="adm-page-head" style={{ marginBottom: 28 }}>
          <div>
            <h1 className="adm-title">Membresías</h1>
            <p className="adm-sub">Planes, cobros y suscripciones activas</p>
          </div>
          <button
            onClick={fetchData}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 18px",
              borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)",
              fontSize: 13, cursor: "pointer",
            }}
          >
            <RefreshCw size={14} className={loading ? "adm-spinner-inline" : ""} />
            Actualizar
          </button>
        </div>

        {/* ── STATS ── */}
        <div className="mb-stats-grid">
          <div className="mb-stat-card mb-stat--purple">
            <Crown size={20} />
            <div className="mb-stat-val">{proUsers.length}</div>
            <div className="mb-stat-label">Usuarios PRO</div>
          </div>
          <div className="mb-stat-card mb-stat--blue">
            <Users size={20} />
            <div className="mb-stat-val">{clientUsers.length}</div>
            <div className="mb-stat-label">Usuarios Client</div>
          </div>
          <div className="mb-stat-card mb-stat--green">
            <TrendingUp size={20} />
            <div className="mb-stat-val">{activeStripe.length}</div>
            <div className="mb-stat-label">Suscripciones activas (Stripe)</div>
          </div>
          <div className="mb-stat-card mb-stat--gold">
            <CreditCard size={20} />
            <div className="mb-stat-val">
              {monthlyRevEst > 0
                ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(monthlyRevEst / 100)
                : "—"}
            </div>
            <div className="mb-stat-label">Ingreso mensual estimado</div>
          </div>
        </div>

        {/* ── STORAGE WIDGET ── */}
        {storage && (
          <section className="mb-section" style={{ marginBottom: 24 }}>
            <div className="mb-section-head">
              <h2 className="mb-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <HardDrive size={16} style={{ color: "#a78bfa" }} />
                Almacenamiento del servidor
              </h2>
              <button
                onClick={purgeStorage}
                disabled={purging}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 8,
                  border: "1px solid rgba(239,68,68,0.35)",
                  background: purging ? "rgba(239,68,68,0.05)" : "rgba(239,68,68,0.1)",
                  color: purging ? "rgba(239,68,68,0.4)" : "#fca5a5",
                  fontSize: 12, fontWeight: 700, cursor: purging ? "not-allowed" : "pointer",
                  letterSpacing: "0.05em",
                }}
              >
                <Trash2 size={13} className={purging ? "adm-spinner-inline" : ""} />
                {purging ? "Limpiando…" : "Purgar huérfanos"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                { label: "Registros en BD", val: storage.dbRecords.toLocaleString(), sub: fmtBytes(storage.dbBytes), color: "#a78bfa" },
                { label: "Archivos en disco", val: storage.diskFiles.toLocaleString(), sub: fmtBytes(storage.diskBytes), color: "#60a5fa" },
                { label: "Posibles huérfanos", val: Math.abs(storage.diskFiles - storage.dbRecords).toLocaleString(), sub: "disco vs BD", color: storage.diskFiles !== storage.dbRecords ? "#f97316" : "#22c55e" },
              ].map((s) => (
                <div key={s.label} style={{
                  flex: 1, minWidth: 140,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 12, padding: "14px 16px",
                }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── PRICING TIERS ── */}
        <section className="mb-section">
          <div className="mb-section-head">
            <h2 className="mb-section-title">Planes actuales</h2>
            <span className="mb-section-note">Precios de referencia (configurar en Stripe)</span>
          </div>
          <div className="mb-tiers-row">
            {TIERS.map((t) => (
              <div key={t.key} className="mb-tier">
                <div className="mb-tier-label">{t.label}</div>
                <div className="mb-tier-price">
                  ${t.amount.toLocaleString("es-MX")}
                  <span className="mb-tier-currency">MXN</span>
                </div>
                {t.months > 1 && (
                  <div className="mb-tier-per">
                    ${Math.round(t.amount / t.months)}/mes
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── STRIPE SUBSCRIPTIONS ── */}
        {subs.length > 0 && (
          <section className="mb-section">
            <div className="mb-section-head">
              <h2 className="mb-section-title">Suscripciones Stripe</h2>
              <span className="mb-section-note">{subs.length} registros</span>
            </div>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>ID Suscripción</th>
                    <th>Estado</th>
                    <th>Monto</th>
                    <th>Próximo cobro</th>
                    <th>Cancelar al vencer</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id} className="adm-row">
                      <td style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                        {s.id}
                      </td>
                      <td>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                          background: `${statusColor(s.status)}22`,
                          color: statusColor(s.status),
                          border: `1px solid ${statusColor(s.status)}44`,
                        }}>
                          {s.status === "active" ? <CheckCircle size={11} /> : s.status === "past_due" ? <AlertCircle size={11} /> : <Clock size={11} />}
                          {statusLabel(s.status)}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: "#a78bfa" }}>
                        {s.unit_amount ? fmtMoney(s.unit_amount, s.currency) : "—"}
                      </td>
                      <td style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                        {s.current_period_end ? fmtDate(s.current_period_end) : "—"}
                      </td>
                      <td>
                        {s.cancel_at_period_end
                          ? <span style={{ color: "#f97316", fontSize: 12 }}>Sí — no renueva</span>
                          : <span style={{ color: "#22c55e", fontSize: 12 }}>No — activa</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── USERS + PLAN ── */}
        <section className="mb-section">
          <div className="mb-section-head">
            <h2 className="mb-section-title">Usuarios y planes</h2>
            <div style={{ display: "flex", gap: 8 }}>
              {(["all", "pro", "client"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setPlanFilter(f)}
                  style={{
                    padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${planFilter === f ? "rgba(139,92,246,0.6)" : "rgba(255,255,255,0.1)"}`,
                    background: planFilter === f ? "rgba(139,92,246,0.15)" : "transparent",
                    color: planFilter === f ? "#c4b5fd" : "rgba(255,255,255,0.45)",
                  }}
                >
                  {f === "all" ? "Todos" : f === "pro" ? "PRO" : "Client"}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="adm-loading">
              <span className="adm-spinner" />
              Cargando...
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Correo</th>
                    <th>Stripe ID</th>
                    <th>Plan actual</th>
                    <th>Cambiar plan</th>
                    <th>Registro</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const isBusy = pending === u.id;
                    return (
                      <tr key={u.id} className={`adm-row${!u.isActive ? " adm-row--inactive" : ""}`}>
                        <td className="adm-cell-user">
                          <div
                            className="adm-avatar"
                            style={{
                              background: u.plan === "pro"
                                ? "linear-gradient(135deg,#7c3aed,#a855f7)"
                                : "linear-gradient(135deg,#374151,#4b5563)",
                            }}
                          >
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
                        <td style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                          {u.stripeCustomerId
                            ? <span title={u.stripeCustomerId} style={{ cursor: "default" }}>{u.stripeCustomerId.slice(0, 18)}…</span>
                            : <span className="adm-empty">Sin Stripe</span>}
                        </td>
                        <td>
                          <span className={`adm-pill ${u.plan === "pro" ? "adm-pill--admin" : "adm-pill--user"}`}>
                            {u.plan === "pro" ? "PRO" : "Client"}
                          </span>
                        </td>
                        <td>
                          {u.plan === "pro" ? (
                            <button
                              onClick={() => changePlan(u.id, "client")}
                              disabled={isBusy}
                              className="mb-plan-btn mb-plan-btn--downgrade"
                            >
                              {isBusy ? <span className="adm-spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : "→ Client"}
                            </button>
                          ) : (
                            <button
                              onClick={() => changePlan(u.id, "pro")}
                              disabled={isBusy}
                              className="mb-plan-btn mb-plan-btn--upgrade"
                            >
                              {isBusy ? <span className="adm-spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : "→ PRO"}
                            </button>
                          )}
                        </td>
                        <td className="adm-cell-date">
                          {new Date(u.createdAt).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
                  No hay usuarios con ese filtro
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── STRIPE LINK ── */}
        <section className="mb-section mb-stripe-cta">
          <CreditCard size={22} style={{ color: "#a78bfa" }} />
          <div>
            <div style={{ fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>
              Dashboard de Stripe
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
              Para cobros, reembolsos, facturas y configuración avanzada de precios, ve directamente a Stripe.
            </div>
          </div>
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.35)",
              color: "#c4b5fd", textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Ir a Stripe <ExternalLink size={13} />
          </a>
        </section>

      </main>
    </div>
  );
}
