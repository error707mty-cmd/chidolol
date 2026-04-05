import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { LogoMark } from "@/components/LogoMark";
import { ChevronLeft, Crown, Zap, Check, X, Loader2, ExternalLink, Shield, Star } from "lucide-react";

const API = "/api";

interface Price { id: string; unitAmount: number; currency: string; recurring: { interval: string; interval_count?: number }; }
interface Plan { id: string; name: string; description: string; prices: Price[]; }

const STATIC_TIERS = [
  { key: "month1",  label: "1 mes",    amount: 169,   months: 1,  savings: null,           popular: false },
  { key: "month3",  label: "3 meses",  amount: 389,   months: 3,  savings: "Ahorra $118",  popular: false },
  { key: "month6",  label: "6 meses",  amount: 699,   months: 6,  savings: "Ahorra $315",  popular: false },
  { key: "year",    label: "1 año",    amount: 1199,  months: 12, savings: "Ahorra $829",  popular: true  },
];

export default function Billing() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { token } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [checkoutPending, setCheckoutPending] = useState<string | null>(null);
  const [portalPending, setPortalPending] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    const h = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API}/stripe/plans`).then(r => r.json()).catch(() => ({ plans: [] })),
      fetch(`${API}/stripe/subscription`, { headers: h }).then(r => r.json()).catch(() => ({})),
    ]).then(([p, s]) => {
      setPlans(p.plans ?? []);
      setSubscription(s.subscription ?? null);
    });
  }, [token]);

  const findPriceId = (months: number): string | null => {
    for (const plan of plans) {
      for (const price of plan.prices) {
        const count = price.recurring?.interval_count ?? 1;
        const interval = price.recurring?.interval;
        const totalMonths = interval === "year" ? 12 * count : count;
        if (totalMonths === months) return price.id;
      }
    }
    return null;
  };

  const handleCheckout = async (tierKey: string, months: number) => {
    const priceId = findPriceId(months);
    if (!priceId) {
      alert("Este plan aún no está disponible para pago en línea. Contáctanos por WhatsApp.");
      return;
    }
    setCheckoutPending(tierKey);
    try {
      const r = await fetch(`${API}/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ priceId }),
      });
      const { url, error } = await r.json();
      if (url) window.location.href = url;
      else alert(error ?? "Error al iniciar pago");
    } catch { alert("Error de conexión"); }
    finally { setCheckoutPending(null); }
  };

  const handlePortal = async () => {
    setPortalPending(true);
    try {
      const r = await fetch(`${API}/stripe/portal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const { url, error } = await r.json();
      if (url) window.location.href = url;
      else alert(error ?? "Error al abrir portal");
    } catch { alert("Error de conexión"); }
    finally { setPortalPending(false); }
  };

  const isPro = user?.plan === "pro";
  const isActive = subscription && ["active", "trialing"].includes(subscription.status);

  return (
    <div className="bil-root">
      <div className="jl-orb jl-orb1" />
      <div className="jl-orb jl-orb2" />

      <header className="au-header">
        <LogoMark size="sm" />
        <nav className="au-nav">
          <button className="au-nav-back" onClick={() => setLocation("/pliegos")}>
            <ChevronLeft size={15} />Mis Trabajos
          </button>
          <span className="au-nav-sep" />
          <span className="au-nav-current"><Crown size={14} />Suscripción Pro</span>
        </nav>
      </header>

      <main className="bil-main">
        {isPro && isActive ? (
          <div className="bil-active-card">
            <div className="bil-active-glow" />
            <div className="bil-active-icon"><Crown size={28} /></div>
            <div>
              <p className="bil-active-title">Plan Pro activo</p>
              <p className="bil-active-sub">
                Activo hasta{" "}
                {subscription?.current_period_end
                  ? new Date((subscription.current_period_end as number) * 1000).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })
                  : "próximo período"}
              </p>
            </div>
            <button className="bil-portal-btn" onClick={handlePortal} disabled={portalPending}>
              {portalPending ? <Loader2 size={14} className="spin" /> : <ExternalLink size={14} />}
              Administrar suscripción
            </button>
          </div>
        ) : (
          <>
            <div className="bil-hero">
              <div className="bil-hero-badge"><Zap size={14} />ERROR707 Pro</div>
              <h1 className="bil-hero-title">Lleva tu negocio<br /><span className="bil-hero-accent">al siguiente nivel.</span></h1>
              <p className="bil-hero-sub">Sin límites. Sin marcas de agua. Sin complicaciones.</p>
            </div>

            <div className="bil-tiers-grid">
              {STATIC_TIERS.map(tier => (
                <div key={tier.key} className={`bil-tier-card${tier.popular ? " bil-tier-card--popular" : ""}`}>
                  {tier.popular && <div className="bil-tier-popular-bar"><Star size={11} />Más popular</div>}
                  <div className="bil-tier-header">
                    <span className="bil-tier-label">{tier.label}</span>
                    {tier.savings && <span className="bil-tier-savings">{tier.savings}</span>}
                  </div>
                  <div className="bil-tier-price">
                    <span className="bil-tier-currency">$</span>
                    <span className="bil-tier-amount">{tier.amount.toLocaleString("es-MX")}</span>
                    <span className="bil-tier-mxn">MXN</span>
                  </div>
                  {tier.months > 1 && (
                    <span className="bil-tier-per-month">
                      ${Math.round(tier.amount / tier.months)}/mes
                    </span>
                  )}
                  <button
                    className={`bil-tier-btn${tier.popular ? " bil-tier-btn--popular" : ""}`}
                    disabled={!!checkoutPending}
                    onClick={() => handleCheckout(tier.key, tier.months)}
                  >
                    {checkoutPending === tier.key
                      ? <Loader2 size={15} className="spin" />
                      : <><Crown size={14} />Suscribirme</>}
                  </button>
                </div>
              ))}
            </div>

            <div className="bil-features-section">
              <h3 className="bil-features-title">Todo lo que incluye Pro</h3>
              <div className="bil-features-grid">
                {[
                  { ok: true,  text: "Descargas sin marca de agua" },
                  { ok: true,  text: "Sin límite de imágenes por hoja" },
                  { ok: true,  text: "Exportación CMYK profesional" },
                  { ok: true,  text: "Acceso prioritario a soporte" },
                  { ok: true,  text: "Funciones en acceso anticipado" },
                  { ok: true,  text: "1 GB de almacenamiento personal" },
                  { ok: false, text: "Requiere imprimir con nosotros" },
                  { ok: false, text: "Contrato de permanencia" },
                ].map(({ ok, text }) => (
                  <div key={text} className={`bil-feat-item ${ok ? "ok" : "no"}`}>
                    {ok ? <Check size={14} /> : <X size={14} />}
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="bil-faq">
          <h3 className="bil-faq-title">Preguntas frecuentes</h3>
          <div className="bil-faq-grid">
            {[
              { q: "¿Puedo cancelar cuando quiera?", a: "Sí. Cancelas desde el portal de suscripción y sigues con acceso hasta el final del período pagado." },
              { q: "¿Cómo se procesa el pago?", a: "A través de Stripe con cifrado de extremo a extremo. No almacenamos datos de tarjeta." },
              { q: "¿El plan mensual se renueva automáticamente?", a: "Sí, todos los planes se renuevan automáticamente. Puedes cancelar antes de la fecha de renovación." },
              { q: "¿Hay alguna diferencia en funciones entre los planes?", a: "No. Todos los planes Pro incluyen exactamente las mismas funcionalidades, solo varía la duración y el costo." },
            ].map(({ q, a }) => (
              <div key={q} className="bil-faq-item">
                <p className="bil-faq-q">{q}</p>
                <p className="bil-faq-a">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
