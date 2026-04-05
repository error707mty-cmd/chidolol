import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";

export interface AuthUser {
  userId: number;
  username: string;
  isAdmin: boolean;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  emailVerified?: boolean;
  plan?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email?: string, displayName?: string, plan?: string) => Promise<{ requiresVerification?: boolean; token?: string } | void>;
  logout: () => void;
  updateProfile: (data: { displayName?: string; email?: string }) => Promise<void>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateAvatar: (avatarUrl: string) => Promise<void>;
  updatePlan: (plan: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "dtf_auth_token";
const API_BASE = "/api";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMe = async (t: string): Promise<AuthUser> => {
    const r = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${t}` },
      signal: AbortSignal.timeout(8000), // timeout de 8s para no colgar indefinido
    });
    if (!r.ok) {
      const err = new Error("Token inválido") as Error & { status?: number };
      err.status = r.status;
      throw err;
    }
    return r.json();
  };

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    // Limpia cualquier retry pendiente
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    setIsLoading(true);

    fetchMe(token)
      .then((userData) => {
        setUser(userData);
        setIsLoading(false);
      })
      .catch((err: Error & { status?: number }) => {
        if (err.status === 401 || err.status === 403) {
          // Token inválido — cerrar sesión
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
          setIsLoading(false);
        } else {
          // Error de red o servidor reiniciando — NO cerrar sesión todavía
          // Mantener isLoading=true para que la app no redirija al login
          console.warn("[AuthContext] Servidor no disponible, reintentando en 4s...", err.message);

          retryTimerRef.current = setTimeout(() => {
            fetchMe(token)
              .then((userData) => {
                setUser(userData);
                setIsLoading(false);
              })
              .catch((err2: Error & { status?: number }) => {
                if (err2.status === 401 || err2.status === 403) {
                  // Segundo intento — token inválido confirmado
                  localStorage.removeItem(TOKEN_KEY);
                  setToken(null);
                  setUser(null);
                } else {
                  // Segundo fallo de red — tercer y último intento en 6s más
                  console.warn("[AuthContext] Segundo fallo, último intento en 6s...");
                  retryTimerRef.current = setTimeout(() => {
                    fetchMe(token)
                      .then((userData) => {
                        setUser(userData);
                      })
                      .catch(() => {
                        // Tres fallos — ahora sí, algo está muy mal
                        localStorage.removeItem(TOKEN_KEY);
                        setToken(null);
                        setUser(null);
                      })
                      .finally(() => setIsLoading(false));
                  }, 6000);
                }
              });
          }, 4000);
        }
      });

    // Cleanup al desmontar
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [token]);

  const login = async (username: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Error de conexión" }));
      throw new Error((err as { error?: string }).error ?? "Error al iniciar sesión");
    }
    const data = await res.json() as { token: string } & AuthUser;
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser({
      userId: data.userId || 0,
      username: data.username,
      isAdmin: data.isAdmin,
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
      emailVerified: data.emailVerified,
      plan: data.plan ?? "client",
    });
  };

  const register = async (username: string, password: string, email?: string, displayName?: string, _plan?: string) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, email, displayName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Error de conexión" }));
      throw new Error((err as { error?: string }).error ?? "Error al crear cuenta");
    }
    const data = await res.json() as { token?: string; requiresVerification?: boolean } & Partial<AuthUser>;
    if (data.requiresVerification) return { requiresVerification: true };

    if (data.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser({
        userId: data.userId || 0,
        username: data.username!,
        isAdmin: data.isAdmin ?? false,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
        emailVerified: data.emailVerified,
        plan: "client",
      });
    }
    return { token: data.token };
  };

  const logout = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (!token) return;
    const updated = await fetchMe(token);
    setUser(updated);
  };

  const updateProfile = async (data: { displayName?: string; email?: string }) => {
    if (!token) throw new Error("No autenticado");
    const res = await fetch(`${API_BASE}/auth/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Error" }));
      throw new Error((err as { error?: string }).error ?? "Error al actualizar perfil");
    }
    const updated = await res.json() as AuthUser;
    setUser((prev) => prev ? { ...prev, ...updated } : prev);
  };

  const updatePassword = async (currentPassword: string, newPassword: string) => {
    if (!token) throw new Error("No autenticado");
    const res = await fetch(`${API_BASE}/auth/me/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Error" }));
      throw new Error((err as { error?: string }).error ?? "Error al cambiar contraseña");
    }
  };

  const updateAvatar = async (avatarUrl: string) => {
    if (!token) throw new Error("No autenticado");
    const res = await fetch(`${API_BASE}/auth/me/avatar`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ avatarUrl }),
    });
    if (!res.ok) throw new Error("Error al actualizar avatar");
    const data = await res.json() as { avatarUrl: string };
    setUser((prev) => prev ? { ...prev, avatarUrl: data.avatarUrl } : prev);
  };

  const updatePlan = async (plan: string) => {
    if (!token) throw new Error("No autenticado");
    const res = await fetch(`${API_BASE}/auth/me/plan`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan }),
    });
    if (!res.ok) throw new Error("Error al actualizar plan");
    const data = await res.json() as { plan: string };
    setUser((prev) => prev ? { ...prev, plan: data.plan } : prev);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, updateProfile, updatePassword, updateAvatar, updatePlan, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
