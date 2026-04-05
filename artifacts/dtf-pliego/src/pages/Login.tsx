import { useState, useEffect, useRef, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";

type Plan = "client" | "pro";

const HERO_PHRASES = [
  "Impresión perfecta en segundos. Sin curvas de aprendizaje, solo resultados.",
  "Libera tu creatividad sin pelear con el software. Diseñar nunca fue tan fácil.",
  "Simplifica tu producción textil. El control total de tus impresiones, ahora más fácil que nunca.",
  "Diseña, ajusta e imprime. Sin vueltas, sin complicaciones, solo resultados profesionales en segundos.",
];

function RotatingSubline() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const INTERVAL_MS = 60_000;
    const FADE_MS = 600;

    const cycle = () => {
      setVisible(false);
      timerRef.current = setTimeout(() => {
        setIdx(prev => (prev + 1) % HERO_PHRASES.length);
        setVisible(true);
      }, FADE_MS);
    };

    const interval = setInterval(cycle, INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <p
      className="lp-subline lp-subline--rotating"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-6px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
      }}
    >
      {HERO_PHRASES[idx]}
    </p>
  );
}

type Tab = "login" | "register";

function LogoMark() {
  return (
    <div className="lp-logoblock">
      <img
        src="/logo-error707.png"
        alt="ERROR707 ESTUDIO"
        className="lp-logoblock-img lp-logoblock-img--lg"
        draggable={false}
      />
      <div className="lp-logoblock-bar" />
    </div>
  );
}

function PanelHeader({ tab }: { tab: Tab }) {
  return (
    <div className="lp-panel-header">
      {tab === "login" ? (
        <>
          <div className="lp-panel-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="#a78bfa" strokeWidth="1.8"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="1.5" fill="#a78bfa"/>
            </svg>
          </div>
          <div>
            <p className="lp-panel-title">Bienvenido de vuelta</p>
            <p className="lp-panel-sub">Accede a tu espacio de diseño</p>
          </div>
        </>
      ) : (
        <>
          <div className="lp-panel-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="#ec4899" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="lp-panel-title">Crea tu cuenta</p>
            <p className="lp-panel-sub">Únete a ERROR707 Studio hoy</p>
          </div>
        </>
      )}
    </div>
  );
}

export default function Login() {
  const { login, register, updatePlan } = useAuth();
  const [tab, setTab] = useState<Tab>("login");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPass, setShowPass] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [pendingData, setPendingData] = useState<{username:string;password:string;email:string;displayName:string}|null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("oauthError");
    const verified = params.get("verified");
    if (oauthError) {
      setError(oauthError);
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (verified === "1") {
      setSuccess("¡Correo verificado! Ya puedes iniciar sesión.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const switchTab = (t: Tab) => {
    setTab(t);
    setError(null);
    setSuccess(null);
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setEmail("");
    setDisplayName("");
    setShowPass(false);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) { setError("Las contraseñas no coinciden"); return; }
    if (!username.trim() || !email.trim() || !password) { setError("Completa todos los campos"); return; }
    setPendingData({ username: username.trim(), password, email: email.trim(), displayName: displayName.trim() });
    setShowPlanModal(true);
  };

  const handlePlanSelect = async (plan: Plan) => {
    if (!pendingData) return;
    setShowPlanModal(false);
    setLoading(true);
    try {
      const result = await register(pendingData.username, pendingData.password, pendingData.email, pendingData.displayName || undefined);
      if (result?.requiresVerification) {
        setVerifyPending(true);
        return;
      }

      if (plan === "pro") {
        const token = (result as any)?.token ?? localStorage.getItem("dtf_auth_token");
        const plansRes = await fetch("/api/stripe/plans");
        const { plans } = await plansRes.json() as { plans: Array<{ id: string; name: string; prices: Array<{ id: string; unitAmount: number; currency: string; recurring: any }> }> };
        const proPrice = plans.flatMap(p => p.prices).sort((a, b) => a.unitAmount - b.unitAmount)[0];
        if (!proPrice) {
          setError("No se encontró el plan PRO. Contacta soporte.");
          return;
        }
        const checkRes = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ priceId: proPrice.id }),
        });
        if (!checkRes.ok) {
          const e = await checkRes.json().catch(() => ({})) as { error?: string };
          setError(e.error ?? "Error al iniciar pago. Intenta de nuevo.");
          return;
        }
        const { url } = await checkRes.json() as { url: string };
        window.location.href = url;
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear cuenta");
    } finally {
      setLoading(false);
    }
  };

  if (verifyPending) {
    return (
      <div className="lp-root">
        <div className="lp-orb lp-orb1" /><div className="lp-orb lp-orb2" /><div className="lp-orb lp-orb3" />
        <div className="lp-verify-screen">
          <div className="lp-verify-card">
            <div className="lp-verify-icon">✉️</div>
            <h2>Verifica tu correo</h2>
            <p>Enviamos un enlace de verificación a <strong>{email}</strong>.<br />Revisa tu bandeja de entrada y haz clic en el enlace para activar tu cuenta.</p>
            <button className="lp-btn" style={{ marginTop: 24 }} onClick={() => { setVerifyPending(false); switchTab("login"); }}>
              Volver al inicio de sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-root">
      <div className="lp-orb lp-orb1" />
      <div className="lp-orb lp-orb2" />
      <div className="lp-orb lp-orb3" />

      <div className="lp-hero">

        {/* ── Left column — Hero text ── */}
        <div className="lp-hero-left">
          <div className="lp-left-top">
          <div className="lp-logo">
            <LogoMark />
          </div>

          <div className="lp-headline-wrap">
            <div className="lp-eyebrow">
              <span className="lp-eyebrow-dot" />
              Diseño para impresión profesional
            </div>

            <h1 className="lp-headline">
              <span className="lp-hl-normal">Tu app de diseño</span>
              <span className="lp-hl-accent">sin complicaciones.</span>
              <span className="lp-hl-sub">Potenciada para impresión DTF.</span>
            </h1>

            <RotatingSubline />
          </div>
          </div>{/* end lp-left-top */}

          <div className="lp-hero-bottom">
            <div className="lp-tags">
              {[
                { icon: "🎨", text: "Serigrafía" },
                { icon: "🌈", text: "Sublimación" },
                { icon: "🖨️", text: "DTF Directo" },
                { icon: "✨", text: "Fácil de usar" },
              ].map((t) => (
                <div key={t.text} className="lp-tag">
                  <span className="lp-tag-icon">{t.icon}</span>
                  <span>{t.text}</span>
                </div>
              ))}
            </div>

            <div className="lp-quote-row">
              <div className="lp-quote-avatars">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="lp-quote-avatar lp-avatar-cycle" style={{ marginLeft: i ? -8 : 0, animationDelay: `${i * 0.6}s` }} />
                ))}
              </div>
              <div className="lp-quote-text">
                <span className="lp-quote-stars lp-stars-cycle">★★★★★</span>
                <span className="lp-quote-copy">Usado por negocios de impresión en México</span>
              </div>
            </div>

            <div className="lp-preview-strip">
              <p className="lp-preview-label">Trabajos recientes</p>
              <div className="lp-preview-cards">
                <div className="lp-preview-card">
                  <span className="lp-preview-card-icon">📐</span>
                  <div className="lp-preview-card-info">
                    <span className="lp-preview-card-name">Pliego A4 · 96 diseños</span>
                    <span className="lp-preview-card-meta">DTF Directo · 2 hojas</span>
                  </div>
                  <span className="lp-preview-card-status lp-preview-card-status--ok">✓</span>
                </div>
                <div className="lp-preview-card">
                  <span className="lp-preview-card-icon">🎨</span>
                  <div className="lp-preview-card-info">
                    <span className="lp-preview-card-name">Camisetas · Serigrafía</span>
                    <span className="lp-preview-card-meta">Sublimación · 1 hoja</span>
                  </div>
                  <span className="lp-preview-card-status lp-preview-card-status--new">★</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Center column — Login panel ── */}
        <div className="lp-panel">
          <div className="lp-card">
            <div className="lp-card-accent" />

            <PanelHeader tab={tab} />

            <div className="lp-tabs">
              <button className={`lp-tab${tab === "login" ? " lp-tab--active" : ""}`} onClick={() => switchTab("login")} type="button">
                Iniciar sesión
              </button>
              <button className={`lp-tab${tab === "register" ? " lp-tab--active" : ""}`} onClick={() => switchTab("register")} type="button">
                Crear cuenta
              </button>
            </div>

            {tab === "login" && (
              <form onSubmit={handleLogin} className="lp-form lp-form-anim" key="login">
                <div className="lp-field">
                  <label className="lp-label" htmlFor="lp-user">Usuario</label>
                  <div className="lp-input-wrap">
                    <svg className="lp-input-icon" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <input id="lp-user" className="lp-input" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="nombre de usuario" required disabled={loading} />
                  </div>
                </div>

                <div className="lp-field">
                  <label className="lp-label" htmlFor="lp-pass">Contraseña</label>
                  <div className="lp-input-wrap">
                    <svg className="lp-input-icon" viewBox="0 0 20 20" fill="none">
                      <rect x="3.5" y="8.5" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="10" cy="13.5" r="1.5" fill="currentColor"/>
                    </svg>
                    <input id="lp-pass" className="lp-input" type={showPass ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required disabled={loading} />
                    <button type="button" className="lp-pass-toggle" onClick={() => setShowPass(!showPass)} tabIndex={-1}>
                      {showPass ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>

                {error && <ErrorBox msg={error} />}
                {success && <SuccessBox msg={success} />}

                <button type="submit" className="lp-btn" disabled={loading || !username || !password}>
                  {loading ? <span className="lp-spinner" /> : (<><span>Entrar al estudio</span><ArrowIcon /></>)}
                </button>

                <button type="button" className="lp-switch-link" onClick={() => switchTab("register")}>
                  ¿No tienes cuenta? <strong>Crear una ahora</strong>
                </button>
              </form>
            )}

            {tab === "register" && (
              <form onSubmit={handleRegister} className="lp-form lp-form-anim" key="register">
                <div className="lp-field">
                  <label className="lp-label" htmlFor="lp-reg-name">Nombre completo <span className="lp-optional">(opcional)</span></label>
                  <div className="lp-input-wrap">
                    <svg className="lp-input-icon" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <input id="lp-reg-name" className="lp-input" type="text" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Tu nombre" disabled={loading} />
                  </div>
                </div>

                <div className="lp-field">
                  <label className="lp-label" htmlFor="lp-reg-user">Usuario</label>
                  <div className="lp-input-wrap">
                    <svg className="lp-input-icon" viewBox="0 0 20 20" fill="none">
                      <path d="M3 5h14M3 10h14M3 15h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <input id="lp-reg-user" className="lp-input" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="nombre_usuario" required disabled={loading} />
                  </div>
                </div>

                <div className="lp-field">
                  <label className="lp-label" htmlFor="lp-reg-email">Correo electrónico</label>
                  <div className="lp-input-wrap">
                    <svg className="lp-input-icon" viewBox="0 0 20 20" fill="none">
                      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M2.5 7l7.5 5 7.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <input id="lp-reg-email" className="lp-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" required disabled={loading} />
                  </div>
                </div>

                <div className="lp-field">
                  <label className="lp-label" htmlFor="lp-reg-pass">Contraseña</label>
                  <div className="lp-input-wrap">
                    <svg className="lp-input-icon" viewBox="0 0 20 20" fill="none">
                      <rect x="3.5" y="8.5" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="10" cy="13.5" r="1.5" fill="currentColor"/>
                    </svg>
                    <input id="lp-reg-pass" className="lp-input" type={showPass ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mín. 6 caracteres" required disabled={loading} />
                    <button type="button" className="lp-pass-toggle" onClick={() => setShowPass(!showPass)} tabIndex={-1}>{showPass ? "🙈" : "👁"}</button>
                  </div>
                </div>

                <div className="lp-field">
                  <label className="lp-label" htmlFor="lp-reg-confirm">Confirmar contraseña</label>
                  <div className="lp-input-wrap">
                    <svg className="lp-input-icon" viewBox="0 0 20 20" fill="none">
                      <path d="M5 10l4 4 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <input id="lp-reg-confirm" className="lp-input" type={showPass ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="repite la contraseña" required disabled={loading} />
                  </div>
                </div>

                {error && <ErrorBox msg={error} />}
                {success && <SuccessBox msg={success} />}

                <button type="submit" className="lp-btn" disabled={loading || !username || !password || !confirmPassword || !email}>
                  {loading ? <span className="lp-spinner" /> : (<><span>Crear mi cuenta</span><ArrowIcon /></>)}
                </button>

                <button type="button" className="lp-switch-link" onClick={() => switchTab("login")}>
                  ¿Ya tienes cuenta? <strong>Inicia sesión</strong>
                </button>
              </form>
            )}

            <p className="lp-card-footer">ERROR707 Studio · Plataforma de diseño para impresión</p>
          </div>
        </div>

        {/* ── Right column — Marketing ── */}
        <div className="lp-hero-right">
          <div className="lp-mkt">

            {/* Header */}
            <div className="lp-mkt-header">
              <div className="lp-mkt-eyebrow">
                <span className="lp-mkt-eyebrow-dot" />
                ¿Por qué elegirnos?
              </div>
              <h2 className="lp-mkt-title">
                Diseña más.<br />
                <span className="lp-mkt-title-accent">Preocúpate menos.</span>
              </h2>
              <p className="lp-mkt-subtitle">
                La plataforma que entiende el mundo de la impresión.
              </p>
            </div>

            {/* Stats row */}
            <div className="lp-mkt-stats">
              {[
                { value: "500+", label: "Usuarios activos" },
                { value: "10K+", label: "Diseños creados" },
                { value: "99%", label: "Satisfacción" },
              ].map((s, i) => (
                <div key={s.label} className="lp-mkt-stat" style={{ animationDelay: `${i * 0.1}s` }}>
                  <span className="lp-mkt-stat-value">{s.value}</span>
                  <span className="lp-mkt-stat-label">{s.label}</span>
                </div>
              ))}
            </div>

            {/* Features */}
            <div className="lp-mkt-feats">
              {[
                { icon: "📐", title: "Maquetado profesional", desc: "Hojas listas para imprimir al instante" },
                { icon: "⚡", title: "Descarga instantánea", desc: "Sin esperas, sin complicaciones" },
              ].map((f, i) => (
                <div key={f.title} className="lp-mkt-feat" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                  <div className="lp-mkt-feat-icon">{f.icon}</div>
                  <div>
                    <p className="lp-mkt-feat-title">{f.title}</p>
                    <p className="lp-mkt-feat-desc">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Animated chips marquee */}
            <div className="lp-mkt-chips">
              <div className="lp-mkt-chips-row">
                <div className="lp-mkt-chips-track lp-mkt-chips-track--left">
                  {[
                    { label: "📄 A4", c: "purple" }, { label: "📐 Letter", c: "blue" },
                    { label: "🖨️ DTF Directo", c: "orange" }, { label: "✅ CMYK", c: "green" },
                    { label: "🎨 Sublimación", c: "pink" }, { label: "📦 11×17", c: "purple" },
                    { label: "📄 A4", c: "purple" }, { label: "📐 Letter", c: "blue" },
                    { label: "🖨️ DTF Directo", c: "orange" }, { label: "✅ CMYK", c: "green" },
                    { label: "🎨 Sublimación", c: "pink" }, { label: "📦 11×17", c: "purple" },
                  ].map((ch, i) => (
                    <span key={i} className={`lp-mkt-chip lp-mkt-chip--${ch.c}`}>{ch.label}</span>
                  ))}
                </div>
              </div>
              <div className="lp-mkt-chips-row">
                <div className="lp-mkt-chips-track lp-mkt-chips-track--right">
                  {[
                    { label: "🔲 PNG sin fondo", c: "blue" }, { label: "⚡ Stickers", c: "orange" },
                    { label: "✏️ Vector SVG", c: "purple" }, { label: "🌈 Serigrafía", c: "pink" },
                    { label: "📏 A3", c: "green" }, { label: "🏷️ Etiquetas", c: "orange" },
                    { label: "🔲 PNG sin fondo", c: "blue" }, { label: "⚡ Stickers", c: "orange" },
                    { label: "✏️ Vector SVG", c: "purple" }, { label: "🌈 Serigrafía", c: "pink" },
                    { label: "📏 A3", c: "green" }, { label: "🏷️ Etiquetas", c: "orange" },
                  ].map((ch, i) => (
                    <span key={i} className={`lp-mkt-chip lp-mkt-chip--${ch.c}`}>{ch.label}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="lp-mkt-sep" />

            {/* Pricing cards */}
            <div className="lp-mkt-cards">
              {/* Free card */}
              <div className="lp-mkt-card lp-mkt-card--free lp-mkt-card-anim" style={{ animationDelay: "0.25s" }}>
                <div className="lp-mkt-card-glow lp-mkt-card-glow--free" />
                <div className="lp-mkt-card-top">
                  <div className="lp-mkt-badge lp-mkt-badge--free">
                    <span>✓</span> GRATIS
                  </div>
                  <p className="lp-mkt-card-tag">Para clientes</p>
                </div>
                <h3 className="lp-mkt-card-title">¿Imprimes con nosotros?</h3>
                <p className="lp-mkt-card-body">
                  Acceso total a <strong>todas las funciones</strong> sin costo adicional mientras trabajes con nosotros.
                </p>
                <button className="lp-mkt-cta lp-mkt-cta--free" type="button" onClick={() => switchTab("register")}>
                  Regístrate gratis →
                </button>
              </div>

              {/* Pro card */}
              <div className="lp-mkt-card lp-mkt-card--pro lp-mkt-card-anim" style={{ animationDelay: "0.35s" }}>
                <div className="lp-mkt-card-glow lp-mkt-card-glow--pro" />
                <div className="lp-mkt-card-top">
                  <div className="lp-mkt-badge lp-mkt-badge--pro">
                    <span className="lp-pro-bolt">⚡</span> PRO
                  </div>
                  <div className="lp-mkt-price">
                    <span className="lp-mkt-price-amount">$169</span>
                    <span className="lp-mkt-price-period">/mes</span>
                  </div>
                </div>
                <h3 className="lp-mkt-card-title">Independiente total</h3>
                <p className="lp-mkt-card-body">
                  <strong>Descargas ilimitadas</strong> sin necesidad de imprimir con nosotros. Lleva tus proyectos a donde quieras.
                </p>
                <button className="lp-mkt-cta lp-mkt-cta--pro" type="button" onClick={() => switchTab("register")}>
                  Comenzar ahora →
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {showPlanModal && (
        <PlanModal onSelect={handlePlanSelect} onClose={() => setShowPlanModal(false)} />
      )}
    </div>
  );
}

function PlanModal({ onSelect, onClose }: { onSelect: (plan: Plan) => void; onClose: () => void }) {
  return (
    <div className="lp-plan-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lp-plan-modal">
        <button className="lp-plan-close" onClick={onClose} aria-label="Cerrar">✕</button>

        <div className="lp-plan-top">
          <div className="lp-plan-badge">⚡ Elige tu experiencia</div>
          <h2 className="lp-plan-title">¿Cómo vas a usar la plataforma?</h2>
          <p className="lp-plan-sub">Selecciona el plan que mejor se adapte a tu negocio. Puedes cambiar en cualquier momento.</p>
        </div>

        <div className="lp-plan-cards">
          <div className="lp-plan-card lp-plan-card--client" onClick={() => onSelect("client")}>
            <div className="lp-plan-card-pill">Gratis</div>
            <div className="lp-plan-card-icon">🤝</div>
            <h3 className="lp-plan-card-name">Soy cliente de ERROR707</h3>
            <p className="lp-plan-card-desc">Imprime con nosotros y accede a todas las herramientas sin costo adicional.</p>
            <div className="lp-plan-card-price">
              <span className="lp-plan-price-amount">Gratis</span>
              <span className="lp-plan-price-period">para clientes</span>
            </div>
            <ul className="lp-plan-card-features">
              <li>Maquetado de pliegos ilimitado</li>
              <li>Descarga directa para impresión</li>
              <li>Formatos A4, Letter, A3</li>
              <li>Soporte prioritario</li>
            </ul>
            <button className="lp-plan-card-cta" type="button">Entrar como cliente →</button>
          </div>

          <div className="lp-plan-card lp-plan-card--pro" onClick={() => onSelect("pro")}>
            <div className="lp-plan-card-pill">Pro</div>
            <div className="lp-plan-card-icon">⚡</div>
            <h3 className="lp-plan-card-name">Versión PRO independiente</h3>
            <p className="lp-plan-card-desc">Total independencia. Descarga sin límites sin necesidad de imprimir con nosotros.</p>
            <div className="lp-plan-card-price">
              <span className="lp-plan-price-amount">$169</span>
              <span className="lp-plan-price-period">/mes MXN</span>
            </div>
            <ul className="lp-plan-card-features">
              <li>Descargas ilimitadas sin condiciones</li>
              <li>Todos los formatos y técnicas</li>
              <li>PNG transparente, SVG, CMYK</li>
              <li>Próximamente: más funciones Pro</li>
            </ul>
            <button className="lp-plan-card-cta lp-plan-card-cta--stripe" type="button">
              Pagar $169/mes → Stripe
            </button>
            <p className="lp-plan-card-note">Pago seguro. Activa tu acceso Pro de inmediato.</p>
          </div>
        </div>

        <p className="lp-plan-footer">ERROR707 Studio · Tu plan se puede cambiar desde tu perfil en cualquier momento</p>
      </div>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="lp-error">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="#f87171" strokeWidth="1.4"/>
        <path d="M7 4v4" stroke="#f87171" strokeWidth="1.4" strokeLinecap="round"/>
        <circle cx="7" cy="10" r="0.7" fill="#f87171"/>
      </svg>
      {msg}
    </div>
  );
}

function SuccessBox({ msg }: { msg: string }) {
  return (
    <div className="lp-success">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="#4ade80" strokeWidth="1.4"/>
        <path d="M4 7l2.5 2.5 4-4" stroke="#4ade80" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {msg}
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
