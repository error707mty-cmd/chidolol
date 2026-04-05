const BASE = import.meta.env.BASE_URL ?? "/";

export function LogoMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`lp-logoblock lp-logoblock--${size}`}>
      <img
        src={`${BASE}logo-error707.png`}
        alt="ERROR707 ESTUDIO"
        className={`lp-logoblock-img lp-logoblock-img--${size}`}
        draggable={false}
      />
      <div className="lp-logoblock-bar" />
    </div>
  );
}
