import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import {
  Bot, Brain, CreditCard, LayoutDashboard, LogOut, Users,
  Send, Paperclip, X, Loader2, CheckCircle, Clock, AlertCircle,
  Zap, MessageCircle, Menu
} from "lucide-react";

const API_BASE = "/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
  toolCalls?: { name: string; input: unknown }[];
  isThinking?: boolean;
}

interface ContentBlock {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

interface Job {
  id: string;
  status: "pending" | "running" | "done" | "error";
  result: string;
  toolCalls: { name: string; input: unknown }[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTextContent(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  return content.filter(b => b.type === "text").map(b => b.text ?? "").join("");
}

function toApiMessages(msgs: Message[]) {
  return msgs.map(m => ({
    role: m.role,
    content: m.content,
  }));
}

// ─── Markdown renderer (simple) ──────────────────────────────────────────────

function renderMarkdown(text: string): string {
  // Proteger bloques de código primero
  const codeBlocks: string[] = [];
  let result = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="lang-${lang}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`);
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Código inline
  const inlineCodes: string[] = [];
  result = result.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`);
    return `%%INLINE_${idx}%%`;
  });

  // Headers
  result = result.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  result = result.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  result = result.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold e italic
  result = result.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

  // Listas — agrupar líneas consecutivas con "-"
  result = result.replace(/(^- .+\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map(l => `<li>${l.replace(/^- /, '').trim()}</li>`).join('');
    return `<ul>${items}</ul>\n`;
  });

  // Tablas markdown simples
  result = result.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((\|.+\|\n?)+)/gm, (_m, header, _sep, body) => {
    const headers = header.split('|').filter((c: string) => c.trim()).map((c: string) => `<th>${c.trim()}</th>`).join('');
    const rows = body.trim().split('\n').map((row: string) => {
      const cells = row.split('|').filter((c: string) => c.trim()).map((c: string) => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>\n`;
  });

  // Párrafos — separar por doble salto de línea
  result = result.split(/\n\n+/).map(block => {
    block = block.trim();
    if (!block) return '';
    // Si ya es un bloque HTML, no envolver
    if (/^<(h[1-3]|ul|ol|pre|table|%%)/i.test(block)) return block;
    // Saltos simples dentro del bloque → <br>
    return `<p>${block.replace(/\n/g, '<br/>')}</p>`;
  }).join('\n');

  // Restaurar bloques de código
  codeBlocks.forEach((block, idx) => {
    result = result.replace(`%%CODEBLOCK_${idx}%%`, block);
  });
  inlineCodes.forEach((code, idx) => {
    result = result.replace(`%%INLINE_${idx}%%`, code);
  });

  return result;
}

// ─── Auto-resize textarea hook ────────────────────────────────────────────────

function useAutoResize(ref: React.RefObject<HTMLTextAreaElement>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = el.scrollHeight;
    const maxHeight = 180;
    el.style.height = Math.min(newHeight, maxHeight) + "px";
    el.style.overflowY = newHeight > maxHeight ? "auto" : "hidden";
  }, [value, ref]);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminAsistente() {
  const [, setLocation] = useLocation();
  const { logout, user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<"trabajo" | "casual">("trabajo");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);

  // ── Trabajo tab state ──
  const [trabajoMessages, setTrabajMsg] = useState<Message[]>([]);
  const [trabajoInput, setTrabajInput] = useState("");
  const [trabajoLoading, setTrabajLoading] = useState(false);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const jobPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trabajoEndRef = useRef<HTMLDivElement>(null);
  const trabajoInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Casual tab state ──
  const [casualMessages, setCasualMessages] = useState<Message[]>([]);
  const [casualInput, setCasualInput] = useState("");
  const [casualLoading, setCasualLoading] = useState(false);
  const casualEndRef = useRef<HTMLDivElement>(null);
  const casualInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Image upload (Trabajo) ──
  const [pendingImages, setPendingImages] = useState<{ url: string; name: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Image upload (Casual) ──
  const [casualPendingImages, setCasualPendingImages] = useState<{ url: string; name: string }[]>([]);
  const casualFileInputRef = useRef<HTMLInputElement>(null);

  // ── Refs para cancelación de streaming ──
  const casualAbortRef = useRef<AbortController | null>(null);

  // ── Auto-resize ──
  useAutoResize(trabajoInputRef, trabajoInput);
  useAutoResize(casualInputRef, casualInput);

  // ── Scroll to bottom ──
  useEffect(() => {
    trabajoEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [trabajoMessages]);

  useEffect(() => {
    casualEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [casualMessages]);

  // ── Cleanup al desmontar ──
  useEffect(() => {
    return () => {
      if (jobPollingRef.current) clearInterval(jobPollingRef.current);
      if (casualAbortRef.current) casualAbortRef.current.abort();
    };
  }, []);

  // ─── Image handling ───────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const url = ev.target?.result as string;
        setPendingImages(prev => [...prev, { url, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingImage = (idx: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCasualFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const url = ev.target?.result as string;
        setCasualPendingImages(prev => [...prev, { url, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    if (casualFileInputRef.current) casualFileInputRef.current.value = "";
  };

  const removeCasualPendingImage = (idx: number) => {
    setCasualPendingImages(prev => prev.filter((_, i) => i !== idx));
  };

  // ─── TRABAJO: Background job system ──────────────────────────────────────

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/chat-job/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return; // network hiccup — keep polling

      const job: Job = await res.json();
      setCurrentJob(job);

      if (job.status === "done" || job.status === "error") {
        if (jobPollingRef.current) {
          clearInterval(jobPollingRef.current);
          jobPollingRef.current = null;
        }
        setTrabajLoading(false);

        if (job.status === "done" && job.result) {
          setTrabajMsg(prev => {
            const filtered = prev.filter(m => !m.isThinking);
            return [...filtered, {
              role: "assistant",
              content: job.result,
              toolCalls: job.toolCalls,
            }];
          });
        } else if (job.status === "error") {
          setTrabajMsg(prev => {
            const filtered = prev.filter(m => !m.isThinking);
            return [...filtered, {
              role: "assistant",
              content: `⚠️ Error en el job: ${job.error}`,
            }];
          });
        }
      }
    } catch {
      // Error de red — seguimos intentando
    }
  }, [token]);

  const sendTrabajo = async () => {
    const text = trabajoInput.trim();
    if (!text && pendingImages.length === 0) return;
    if (trabajoLoading) return;

    // Build content (text + images)
    let content: string | ContentBlock[];
    if (pendingImages.length > 0) {
      content = [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...pendingImages.map(img => ({
          type: "image_url" as const,
          image_url: { url: img.url },
        })),
      ];
    } else {
      content = text;
    }

    const userMsg: Message = { role: "user", content };
    const newMessages = [...trabajoMessages, userMsg];
    setTrabajMsg([...newMessages, { role: "assistant", content: "", isThinking: true }]);
    setTrabajInput("");
    setPendingImages([]);
    setTrabajLoading(true);

    try {
      const res = await fetch(`${API_BASE}/admin/chat-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: toApiMessages(newMessages) }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const { jobId } = await res.json();
      setCurrentJob({
        id: jobId,
        status: "pending",
        result: "",
        toolCalls: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Limpiar polling anterior si existe
      if (jobPollingRef.current) clearInterval(jobPollingRef.current);

      // Primer poll inmediato, luego cada 2s
      pollJob(jobId);
      jobPollingRef.current = setInterval(() => pollJob(jobId), 2000);

    } catch (err) {
      setTrabajLoading(false);
      setTrabajMsg(prev => {
        const filtered = prev.filter(m => !m.isThinking);
        return [...filtered, {
          role: "assistant",
          content: `⚠️ Error de conexión: ${err}`,
        }];
      });
    }
  };

  // ─── CASUAL: Streaming chat ───────────────────────────────────────────────

  // Ref de generación: evita que un finally de un request viejo pise el estado del nuevo
  const casualGenRef = useRef(0);

  const sendCasual = async () => {
    const text = casualInput.trim();
    if (!text && casualPendingImages.length === 0) return;
    if (casualLoading) return;

    // Cancelar streaming anterior si hubiera uno colgado
    if (casualAbortRef.current) {
      casualAbortRef.current.abort();
    }
    const abortController = new AbortController();
    casualAbortRef.current = abortController;

    // Incrementar generación — cualquier finally de requests viejos se ignora
    casualGenRef.current += 1;
    const myGen = casualGenRef.current;

    // Build content (text + images)
    let userContent: string | ContentBlock[];
    if (casualPendingImages.length > 0) {
      userContent = [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...casualPendingImages.map(img => ({
          type: "image_url" as const,
          image_url: { url: img.url },
        })),
      ];
    } else {
      userContent = text;
    }

    const userMsg: Message = { role: "user", content: userContent };
    const newMessages = [...casualMessages, userMsg];
    setCasualMessages([...newMessages, { role: "assistant", content: "" }]);
    setCasualInput("");
    setCasualPendingImages([]);
    setCasualLoading(true);

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      const res = await fetch(`${API_BASE}/admin/chat-casual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: abortController.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        // Verificar abort ANTES de leer para salir rápido
        if (abortController.signal.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) break; // stream terminado limpiamente
            if (data.content) {
              setCasualMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: getTextContent(last.content) + data.content,
                  };
                }
                return updated;
              });
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err: any) {
      // Si fue abortado intencionalmente, no mostramos error
      if (err?.name === "AbortError") {
        // Solo liberar loading si somos la generación actual
        if (myGen === casualGenRef.current) setCasualLoading(false);
        return;
      }

      // Error real — mostrar en el chat
      setCasualMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && getTextContent(last.content) === "") {
          updated[updated.length - 1] = {
            ...last,
            content: `⚠️ Error de conexión: ${String(err)}`,
          };
        }
        return updated;
      });
    } finally {
      // Cancelar el reader si sigue abierto
      try { reader?.cancel(); } catch { /* ignore */ }

      // Solo liberar loading si somos la generación actual (evita race condition)
      if (myGen === casualGenRef.current) {
        setCasualLoading(false);
      }
    }
  };

  // ─── Keyboard handlers ────────────────────────────────────────────────────

  const handleTrabajKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTrabajo();
    }
  };

  const handleCasualKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCasual();
    }
  };

  // ─── Job status badge ─────────────────────────────────────────────────────

  const JobBadge = () => {
    if (!currentJob) return null;
    const icons = {
      pending: <Clock size={12} />,
      running: <Loader2 size={12} className="spinning" />,
      done: <CheckCircle size={12} />,
      error: <AlertCircle size={12} />,
    };
    const labels = { pending: "En cola", running: "Procesando", done: "Completado", error: "Error" };
    return (
      <div className={`aia-job-badge aia-job-badge--${currentJob.status}`}>
        {icons[currentJob.status]}
        <span>{labels[currentJob.status]}</span>
        {currentJob.toolCalls?.length > 0 && (
          <span className="aia-job-tools">{currentJob.toolCalls.length} tools</span>
        )}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="aia-root">
      {/* Header */}
      <header className="jl-header">
        <div className="jl-logo" onClick={() => setLocation("/admin")} style={{ cursor: "pointer" }}>
          <span className="jl-logo-icon">🖨️</span>
          <span className="jl-logo-text">ERROR707</span>
        </div>
        <nav className="jl-nav">
          <button className="jl-admin-link" onClick={() => setLocation("/admin")}>
            <LayoutDashboard size={14} /> Panel
          </button>
          <button className="jl-admin-link" onClick={() => setLocation("/admin/memberships")}>
            <CreditCard size={14} /> Membresías
          </button>
          <button className="jl-admin-link" onClick={() => setLocation("/admin/users")}>
            <Users size={14} /> Usuarios
          </button>
          <button className="jl-admin-link" onClick={() => setLocation("/admin/ai")}>
            <Brain size={14} /> IA
          </button>
          <button className="jl-admin-link jl-admin-link--active" onClick={() => setLocation("/admin/asistente")}>
            <Bot size={14} /> Asistente
          </button>
          {user && (
            <div className="jl-user-badge">
              <span className="jl-user-dot" />
              {user.username}
            </div>
          )}
          <button className="jl-logout-btn" onClick={() => { logout(); setLocation("/login"); }}>
            <LogOut size={14} /> Salir
          </button>
        </nav>
      </header>

      {/* Main layout */}
      <div className="aia-main">
        {/* Sidebar */}
        {/* Overlay móvil */}
        <div className={`aia-sidebar-overlay${sidebarOpen ? " active" : ""}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`aia-sidebar${sidebarOpen ? " aia-sidebar--open" : ""}`}>
          <div className="aia-sidebar-header">
            <div className="aia-avatar" style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)" }}>
              <span style={{ fontSize: "18px" }}>雪</span>
            </div>
            <div>
              <div className="aia-name">Yuki</div>
              <div className="aia-status">
                <span className="aia-status-dot" />
                DeepSeek Coder
              </div>
            </div>
          </div>

          <div className="aia-sidebar-section">
            <div className="aia-sidebar-label">Modos</div>
            <button
              className={`aia-mode-btn ${activeTab === "trabajo" ? "aia-mode-btn--active" : ""}`}
              onClick={() => { setActiveTab("trabajo"); setSidebarOpen(false); }}
            >
              <Zap size={15} />
              <div>
                <div className="aia-mode-name">Trabajo</div>
                <div className="aia-mode-desc">Con herramientas y acceso completo</div>
              </div>
            </button>
            <button
              className={`aia-mode-btn ${activeTab === "casual" ? "aia-mode-btn--active" : ""}`}
              onClick={() => { setActiveTab("casual"); setSidebarOpen(false); }}
            >
              <MessageCircle size={15} />
              <div>
                <div className="aia-mode-name">Casual</div>
                <div className="aia-mode-desc">Conversación libre sin tools</div>
              </div>
            </button>
          </div>

          {activeTab === "trabajo" && (
            <div className="aia-sidebar-section">
              <div className="aia-sidebar-label">Job activo</div>
              {currentJob ? (
                <div className="aia-job-detail">
                  <JobBadge />
                  <div className="aia-job-id">{currentJob.id.slice(0, 20)}...</div>
                  <div className="aia-job-note">
                    {currentJob.status === "running"
                      ? "Puedes cerrar la pestaña — el trabajo continúa en background."
                      : currentJob.status === "done"
                      ? "Tarea completada."
                      : currentJob.status === "error"
                      ? currentJob.error
                      : "En espera..."}
                  </div>
                </div>
              ) : (
                <div className="aia-job-empty">
                  <Clock size={14} />
                  <span>Sin tareas activas</span>
                </div>
              )}
            </div>
          )}

          <div className="aia-sidebar-section">
            <div
              className="aia-sidebar-label aia-sidebar-label--toggle"
              onClick={() => setInfoExpanded(!infoExpanded)}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
              <span>Info del sistema</span>
              <span style={{ fontSize: "10px", opacity: 0.6, transition: "transform 0.2s", transform: infoExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
            </div>
            {infoExpanded && (
              <div className="aia-info-card">
                <div className="aia-info-row">
                  <span>Modelo</span>
                  <span>deepseek-coder</span>
                </div>
                <div className="aia-info-row">
                  <span>Memoria</span>
                  <span>pgvector activo</span>
                </div>
                <div className="aia-info-row">
                  <span>Background</span>
                  <span>Jobs activos</span>
                </div>
              </div>
            )}
          </div>

          <div className="aia-sidebar-section" style={{ marginTop: "auto", paddingTop: "12px" }}>
            <a
              href="/yuki"
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "10px 12px", borderRadius: "10px",
                background: "linear-gradient(135deg, #7c3aed22, #ec489922)",
                border: "1px solid #7c3aed44",
                color: "#a855f7", fontSize: "13px", fontWeight: 600,
                textDecoration: "none", cursor: "pointer",
                transition: "all 0.15s",
              }}
              title="Abrir Yuki en página independiente"
            >
              <span style={{ fontSize: "16px" }}>雪</span>
              <div>
                <div>Abrir Yuki independiente</div>
                <div style={{ fontSize: "10px", color: "#7c3aed", fontWeight: 400 }}>Página exclusiva con control total</div>
              </div>
            </a>
          </div>
        </aside>

        {/* Right panel */}
        <div className="aia-right-panel">
          {/* ── TRABAJO TAB ── */}
          {activeTab === "trabajo" && (
            <div className="aia-chat">
              <div className="aia-chat-header">
                <button className="aia-menu-btn" onClick={() => setSidebarOpen(true)} title="Menú">
                  <Menu size={18} />
                </button>
                <Zap size={16} />
                <span>Modo Trabajo</span>
                <span className="aia-chat-header-sub">Background processing — puedes salir y regresar</span>
                {trabajoLoading && (
                  <button
                    className="aia-reset-btn"
                    title="El job se colgó? Resetear estado"
                    onClick={() => {
                      if (jobPollingRef.current) { clearInterval(jobPollingRef.current); jobPollingRef.current = null; }
                      setTrabajLoading(false);
                      setTrabajMsg(prev => prev.filter(m => !m.isThinking));
                    }}
                  >
                    ✕ Cancelar
                  </button>
                )}
              </div>

              <div className="aia-messages">
                {messages.length === 0 && (
                  <div className="aia-empty">
                    <div style={{ width: "60px", height: "60px", background: "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", marginBottom: "12px", boxShadow: "0 4px 20px rgba(139, 92, 246, 0.3)" }}>雪</div>
                    <h3>Yuki lista para trabajar 🌸</h3>
                    <p>Tengo acceso completo a código, base de datos, shell y configuración. Los jobs corren en background — puedes salir de la página sin interrumpir el trabajo.</p>
                  </div>
                )}
                {trabajoMessages.map((msg, i) => (
                  <div key={i} className={`aia-message aia-message--${msg.role} ${msg.isThinking ? "aia-message--thinking" : ""}`}>
                    {msg.isThinking ? (
                      <div className="aia-thinking">
                        <Loader2 size={14} className="spinning" />
                        <span>Procesando en background...</span>
                        <JobBadge />
                      </div>
                    ) : (
                      <>
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="aia-tool-calls">
                            {msg.toolCalls.map((tc, j) => (
                              <div key={j} className="aia-tool-call">
                                <span className="aia-tool-name">{tc.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div
                          className="aia-message-content"
                          dangerouslySetInnerHTML={{ __html: msg.role === "assistant"
                            ? renderMarkdown(getTextContent(msg.content))
                            : getTextContent(msg.content).replace(/\n/g, "<br/>")
                          }}
                        />
                        {/* Images in message */}
                        {Array.isArray(msg.content) && msg.content.filter(b => b.type === "image_url").map((b, j) => (
                          <img key={j} src={b.image_url?.url} alt="adjunto" className="aia-message-image" />
                        ))}
                      </>
                    )}
                  </div>
                ))}
                <div ref={trabajoEndRef} />
              </div>

              {/* Input — NO deshabilitado mientras hay job (es background) */}
              <div className="aia-input-area">
                {pendingImages.length > 0 && (
                  <div className="aia-pending-images">
                    {pendingImages.map((img, i) => (
                      <div key={i} className="aia-pending-img">
                        <img src={img.url} alt={img.name} />
                        <button onClick={() => removePendingImage(i)}><X size={10} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="aia-input-row">
                  <button
                    className="aia-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Adjuntar imagen"
                    disabled={trabajoLoading}
                  >
                    <Paperclip size={16} />
                  </button>
                  <textarea
                    ref={trabajoInputRef}
                    className="aia-input"
                    placeholder={trabajoLoading
                      ? "Job corriendo en background... puedes enviar otra tarea"
                      : "Escribe una tarea... (Enter para enviar, Shift+Enter para salto de línea)"
                    }
                    value={trabajoInput}
                    onChange={e => setTrabajInput(e.target.value)}
                    onKeyDown={handleTrabajKeyDown}
                    rows={1}
                                  />
                  <button
                    className="aia-send-btn"
                    onClick={sendTrabajo}
                    disabled={trabajoLoading || (!trabajoInput.trim() && pendingImages.length === 0)}
                    title={trabajoLoading ? "Esperando respuesta..." : "Enviar"}
                  >
                    {trabajoLoading ? <Loader2 size={16} className="spinning" /> : <Send size={16} />}
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
              </div>
            </div>
          )}

          {/* ── CASUAL TAB ── */}
          {activeTab === "casual" && (
            <div className="aia-chat">
              <div className="aia-chat-header">
                <button className="aia-menu-btn" onClick={() => setSidebarOpen(true)} title="Menú">
                  <Menu size={18} />
                </button>
                <MessageCircle size={16} />
                <span>Modo Casual</span>
                <span className="aia-chat-header-sub">Conversación libre — sin herramientas</span>
                {casualLoading && (
                  <button
                    className="aia-reset-btn"
                    title="Se trabó el stream? Cancelar"
                    onClick={() => {
                      if (casualAbortRef.current) { casualAbortRef.current.abort(); casualAbortRef.current = null; }
                      setCasualLoading(false);
                    }}
                  >
                    ✕ Cancelar
                  </button>
                )}
              </div>

              <div className="aia-messages">
                {casualMessages.length === 0 && (
                  <div className="aia-empty">
                    <div style={{ width: "60px", height: "60px", background: "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", marginBottom: "12px", boxShadow: "0 4px 20px rgba(139, 92, 246, 0.3)" }}>雪</div>
                    <h3>Hablemos de lo que quieras ✨</h3>
                    <p>Ideas, negocios, tecnología, hosting, lo que sea. Sin el modo trabajo, sin herramientas — solo conversación con Yuki.</p>
                  </div>
                )}
                {casualMessages.map((msg, i) => (
                  <div key={i} className={`aia-message aia-message--${msg.role}`}>
                    {/* Mostrar cursor parpadeante mientras carga el último mensaje del assistant */}
                    {msg.role === "assistant" && casualLoading && i === casualMessages.length - 1 && getTextContent(msg.content) === "" ? (
                      <div className="aia-thinking">
                        <Loader2 size={14} className="spinning" />
                        <span>Escribiendo...</span>
                      </div>
                    ) : (
                      <>
                        <div
                          className="aia-message-content"
                          dangerouslySetInnerHTML={{ __html: msg.role === "assistant"
                            ? renderMarkdown(getTextContent(msg.content))
                            : getTextContent(msg.content).replace(/\n/g, "<br/>")
                          }}
                        />
                        {Array.isArray(msg.content) && msg.content.filter(b => b.type === "image_url").map((b, j) => (
                          <img key={j} src={b.image_url?.url} alt="adjunto" className="aia-message-image" />
                        ))}
                      </>
                    )}
                  </div>
                ))}
                <div ref={casualEndRef} />
              </div>

              <div className="aia-input-area">
                {casualPendingImages.length > 0 && (
                  <div className="aia-pending-images">
                    {casualPendingImages.map((img, i) => (
                      <div key={i} className="aia-pending-img">
                        <img src={img.url} alt={img.name} />
                        <button onClick={() => removeCasualPendingImage(i)}><X size={10} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="aia-input-row">
                  <button
                    className="aia-attach-btn"
                    onClick={() => casualFileInputRef.current?.click()}
                    title="Adjuntar imagen"
                    disabled={casualLoading}
                  >
                    <Paperclip size={16} />
                  </button>
                  <textarea
                    ref={casualInputRef}
                    className="aia-input"
                    placeholder="Escribe algo... (Enter para enviar, Shift+Enter para salto de línea)"
                    value={casualInput}
                    onChange={e => setCasualInput(e.target.value)}
                    onKeyDown={handleCasualKeyDown}
                    rows={1}
                  />
                  <button
                    className="aia-send-btn"
                    onClick={sendCasual}
                    disabled={casualLoading || (!casualInput.trim() && casualPendingImages.length === 0)}
                    title={casualLoading ? "Esperando respuesta..." : "Enviar"}
                  >
                    {casualLoading ? <Loader2 size={16} className="spinning" /> : <Send size={16} />}
                  </button>
                </div>
                <input
                  ref={casualFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={handleCasualFileChange}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
