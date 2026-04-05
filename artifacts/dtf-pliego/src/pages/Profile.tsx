import { useState, useRef, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";

function AvatarDisplay({ url, name, size = 80 }: { url?: string; name?: string; size?: number }) {
  const initials = (name ?? "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  if (url) {
    return <img src={url} alt={name ?? "Avatar"} className="pf-avatar-img" style={{ width: size, height: size }} />;
  }
  return (
    <div className="pf-avatar-placeholder" style={{ width: size, height: size, fontSize: size * 0.35 }}>
      {initials}
    </div>
  );
}

export default function Profile() {
  const { user, updateProfile, updatePassword, updateAvatar, logout } = useAuth();
  const [, navigate] = useLocation();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passMsg, setPassMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [passLoading, setPassLoading] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [avatarInput, setAvatarInput] = useState("");
  const [avatarMsg, setAvatarMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileLoading(true);
    try {
      await updateProfile({ displayName: displayName.trim() || undefined, email: email.trim() || undefined });
      setProfileMsg({ type: "ok", text: "Perfil actualizado correctamente" });
    } catch (err) {
      setProfileMsg({ type: "err", text: err instanceof Error ? err.message : "Error al guardar" });
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePassSave = async (e: FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (newPass !== confirmPass) { setPassMsg({ type: "err", text: "Las contraseñas no coinciden" }); return; }
    if (newPass.length < 6) { setPassMsg({ type: "err", text: "La contraseña debe tener al menos 6 caracteres" }); return; }
    setPassLoading(true);
    try {
      await updatePassword(currentPass, newPass);
      setPassMsg({ type: "ok", text: "Contraseña actualizada correctamente" });
      setCurrentPass(""); setNewPass(""); setConfirmPass("");
    } catch (err) {
      setPassMsg({ type: "err", text: err instanceof Error ? err.message : "Error al cambiar contraseña" });
    } finally {
      setPassLoading(false);
    }
  };

  const handleAvatarUrl = async () => {
    if (!avatarInput.trim()) return;
    setAvatarMsg(null);
    try {
      await updateAvatar(avatarInput.trim());
      setAvatarUrl(avatarInput.trim());
      setAvatarInput("");
      setAvatarMsg({ type: "ok", text: "Foto de perfil actualizada" });
    } catch {
      setAvatarMsg({ type: "err", text: "Error al actualizar la foto" });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      try {
        await updateAvatar(dataUrl);
        setAvatarUrl(dataUrl);
        setAvatarMsg({ type: "ok", text: "Foto de perfil actualizada" });
      } catch {
        setAvatarMsg({ type: "err", text: "Error al actualizar la foto" });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="pf-root">
      {/* Background */}
      <div className="pf-bg-orb pf-bg-orb1" />
      <div className="pf-bg-orb pf-bg-orb2" />

      {/* Topbar */}
      <div className="pf-topbar">
        <button className="pf-back-btn" onClick={() => navigate("/")} type="button">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M11 14L6 9l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Volver al estudio
        </button>
        <span className="pf-topbar-title">Mi perfil</span>
        <button className="pf-logout-btn" onClick={logout} type="button">Cerrar sesión</button>
      </div>

      <div className="pf-content">

        {/* Avatar section */}
        <section className="pf-section pf-section--avatar">
          <div className="pf-avatar-wrap">
            <div className="pf-avatar-ring">
              <AvatarDisplay url={avatarUrl || user?.avatarUrl} name={user?.displayName ?? user?.username} size={88} />
            </div>
            <div className="pf-avatar-info">
              <p className="pf-avatar-name">{user?.displayName ?? user?.username}</p>
              <p className="pf-avatar-user">@{user?.username}</p>
              {user?.emailVerified === false && (
                <span className="pf-badge pf-badge--warn">Correo sin verificar</span>
              )}
              {user?.isAdmin && (
                <span className="pf-badge pf-badge--admin">Administrador</span>
              )}
            </div>
          </div>

          <div className="pf-avatar-actions">
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileSelect} />
            <button className="pf-btn pf-btn--secondary" type="button" onClick={() => fileRef.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 12l3-3 2.5 2.5L10 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="5" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              Subir foto
            </button>
            <div className="pf-avatar-url-row">
              <input
                className="pf-input pf-input--sm"
                type="url"
                placeholder="o pega una URL de imagen"
                value={avatarInput}
                onChange={(e) => setAvatarInput(e.target.value)}
              />
              <button className="pf-btn pf-btn--ghost" type="button" onClick={handleAvatarUrl} disabled={!avatarInput.trim()}>
                Usar URL
              </button>
            </div>
            {avatarMsg && <Msg type={avatarMsg.type} text={avatarMsg.text} />}
          </div>
        </section>

        {/* Profile info */}
        <section className="pf-section">
          <h2 className="pf-section-title">Información personal</h2>
          <form className="pf-form" onSubmit={handleProfileSave}>
            <div className="pf-field">
              <label className="pf-label">Nombre para mostrar</label>
              <input
                className="pf-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tu nombre completo"
                disabled={profileLoading}
              />
            </div>
            <div className="pf-field">
              <label className="pf-label">Nombre de usuario</label>
              <input className="pf-input pf-input--disabled" type="text" value={user?.username ?? ""} disabled readOnly />
              <p className="pf-hint">El nombre de usuario no se puede cambiar</p>
            </div>
            <div className="pf-field">
              <label className="pf-label">Correo electrónico</label>
              <input
                className="pf-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                disabled={profileLoading}
              />
            </div>
            {profileMsg && <Msg type={profileMsg.type} text={profileMsg.text} />}
            <button className="pf-btn pf-btn--primary" type="submit" disabled={profileLoading}>
              {profileLoading ? <span className="pf-spinner" /> : "Guardar cambios"}
            </button>
          </form>
        </section>

        {/* Password */}
        <section className="pf-section">
          <h2 className="pf-section-title">Cambiar contraseña</h2>
          <form className="pf-form" onSubmit={handlePassSave}>
            <div className="pf-field">
              <label className="pf-label">Contraseña actual</label>
              <input className="pf-input" type="password" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} placeholder="••••••••" required disabled={passLoading} />
            </div>
            <div className="pf-field">
              <label className="pf-label">Nueva contraseña</label>
              <input className="pf-input" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="mín. 6 caracteres" required disabled={passLoading} />
            </div>
            <div className="pf-field">
              <label className="pf-label">Confirmar nueva contraseña</label>
              <input className="pf-input" type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} placeholder="repite la contraseña" required disabled={passLoading} />
            </div>
            {passMsg && <Msg type={passMsg.type} text={passMsg.text} />}
            <button className="pf-btn pf-btn--primary" type="submit" disabled={passLoading || !currentPass || !newPass || !confirmPass}>
              {passLoading ? <span className="pf-spinner" /> : "Cambiar contraseña"}
            </button>
          </form>
        </section>

        {/* Danger zone */}
        <section className="pf-section pf-section--danger">
          <h2 className="pf-section-title pf-section-title--danger">Sesión</h2>
          <p className="pf-hint" style={{ marginBottom: 16 }}>Cerrar sesión en este dispositivo.</p>
          <button className="pf-btn pf-btn--danger" type="button" onClick={logout}>
            Cerrar sesión
          </button>
        </section>

      </div>
    </div>
  );
}

function Msg({ type, text }: { type: "ok" | "err"; text: string }) {
  return (
    <div className={`pf-msg pf-msg--${type}`}>
      {type === "ok" ? "✓" : "✕"} {text}
    </div>
  );
}
